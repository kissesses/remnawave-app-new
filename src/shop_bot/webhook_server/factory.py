from __future__ import annotations

import base64
import io
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import qrcode
from flask import Flask, flash, jsonify, redirect, request, session, url_for
from flask_wtf.csrf import CSRFProtect, CSRFError, generate_csrf

from shop_bot.data_manager import panel_access
from shop_bot.data_manager import panel_audit
from shop_bot.data_manager import dev_support_client
from shop_bot.data_manager import panel_presence
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.data_manager.panel_rbac import (
    ENDPOINT_ANY_PERMISSIONS,
    ENDPOINT_PERMISSIONS,
    PANEL_GLOBAL_READ_ENDPOINTS,
    SETTINGS_TAB_PERMISSIONS,
    allows_permission,
    normalize_permission_levels,
    resolve_landing_route,
)
from shop_bot.data_manager.remnawave_repository import get_setting
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.modules.gemini import register_gemini_routes
from shop_bot.webhook_server.modules.node import register_node_routes
from shop_bot.webhook_server.modules.update import register_update_routes
from shop_bot.webhook_server.modules import security
from shop_bot.webhook_server.services.auth import (
    SECURITY_SETUP_ENDPOINTS,
    is_setup_complete,
    make_login_required,
    needs_mandatory_totp_setup,
    needs_security_setup,
    settings_api_wants_json,
    totp_flow_redirect,
)
from shop_bot.webhook_server.services.payments import handle_promo_after_payment
from shop_bot.webhook_server.services.template_data import get_common_template_data
from shop_bot.webhook_server.security_config import require_stable_secret_key
from shop_bot.webhook_server.panel_http import client_ip_from_request, safe_redirect_target

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger('werkzeug').setLevel(logging.WARNING)

AUDIT_ENDPOINTS = frozenset({
    'settings_audit_list',
    'settings_audit_stats',
    'settings_audit_entry',
    'settings_audit_export',
    'settings_audit_catalog',
    'settings_access_audit_list',
    'settings_access_audit_export',
})

ANTI_FRAUD_ENDPOINTS = frozenset({
    'settings_anti_fraud_signals',
    'settings_anti_fraud_signal',
})

# Force MSK (UTC+3)
os.environ['TZ'] = 'Etc/GMT-3'
if hasattr(time, 'tzset'):
    time.tzset()


def create_webhook_app(bot_controller_instance):
    panel_ctx.bot_controller = bot_controller_instance

    app_file_path = os.path.abspath(__file__)
    app_dir = os.path.dirname(app_file_path)
    template_dir = os.path.join(app_dir, 'templates')
    template_file = os.path.join(template_dir, 'login.html')

    logger.debug("--- ДИАГНОСТИЧЕСКАЯ ИНФОРМАЦИЯ ---")
    logger.debug(f"Текущая рабочая директория: {os.getcwd()}")
    logger.debug(f"Путь к исполняемому factory.py: {app_file_path}")
    logger.debug(f"Директория factory.py: {app_dir}")
    logger.debug(f"Ожидаемая директория шаблонов: {template_dir}")
    logger.debug(f"Ожидаемый путь к login.html: {template_file}")
    logger.debug(f"Директория шаблонов существует? -> {os.path.isdir(template_dir)}")
    logger.debug(f"Файл login.html существует? -> {os.path.isfile(template_file)}")

    webapp_dir = os.path.join(os.path.dirname(app_dir), 'webapp')
    panel_ctx.webapp_exists = os.path.isdir(webapp_dir)

    logger.debug(f"Директория WebApp: {webapp_dir} (существует: {panel_ctx.webapp_exists})")
    logger.debug("--- КОНЕЦ ДИАГНОСТИКИ ---")

    flask_app = Flask(
        __name__,
        template_folder='templates',
        static_folder='static',
    )

    flask_app.config['SECRET_KEY'] = require_stable_secret_key()
    flask_app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
    flask_app.config['SESSION_COOKIE_HTTPONLY'] = True
    flask_app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    flask_app.config['SESSION_COOKIE_SECURE'] = os.getenv('SHOPBOT_SESSION_SECURE', '1') == '1'
    cookie_domain = (os.getenv('SHOPBOT_SESSION_COOKIE_DOMAIN') or '').strip()
    if cookie_domain:
        flask_app.config['SESSION_COOKIE_DOMAIN'] = cookie_domain
    flask_app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024
    flask_app.config['TEMPLATES_AUTO_RELOAD'] = True
    # CSRF живёт столько же, сколько сессия (по умолчанию Flask-WTF — 1 час).
    flask_app.config['WTF_CSRF_TIME_LIMIT'] = None

    csrf = CSRFProtect()
    csrf.init_app(flask_app)
    panel_ctx.flask_app = flask_app
    panel_ctx.csrf = csrf

    from shop_bot.security.rate_store import _get_redis
    _get_redis()

    def is_workspace_embed_request():
        if request.args.get('embed') == '1':
            return True
        # In-app navigation inside macOS v2 windows may drop ?embed=1 from the URL.
        if request.headers.get('Sec-Fetch-Dest') == 'iframe':
            return True
        return False

    @flask_app.after_request
    def preserve_workspace_embed_redirect(response):
        if response.status_code in (301, 302, 303, 307, 308):
            if is_workspace_embed_request():
                from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
                loc = response.headers.get('Location')
                if loc and 'embed=1' not in loc:
                    parsed = urlparse(loc)
                    if not parsed.netloc or parsed.netloc == request.host:
                        qs = parse_qs(parsed.query)
                        qs['embed'] = ['1']
                        new_query = urlencode(qs, doseq=True)
                        response.headers['Location'] = urlunparse(parsed._replace(query=new_query))
        return response

    @flask_app.after_request
    def add_security_headers(response):
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        if request.is_secure or os.getenv('SHOPBOT_SESSION_SECURE', '1') == '1':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    def _client_ip() -> str:
        return client_ip_from_request(request)

    def _safe_redirect(referrer: str | None, fallback_endpoint: str, **fallback_values):
        return redirect(safe_redirect_target(request, referrer, fallback_endpoint, **fallback_values))

    def _audit(action: str, details=None, admin_id=None, admin_login=None):
        panel_audit.log_action(
            action,
            admin_id=admin_id if admin_id is not None else session.get('panel_admin_id'),
            admin_login=admin_login or session.get('panel_login'),
            details=details,
            ip=_client_ip(),
        )

    def _complete_panel_login(admin: dict, *, remember: bool = False):
        session['logged_in'] = True
        session.permanent = remember
        session.update(panel_access.session_payload(admin))
        session.pop('pending_totp_admin_id', None)
        session.pop('pending_totp_remember', None)

    def _qr_data_uri(text: str) -> str:
        img = qrcode.make(text)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')

    def _static_css(relative_path: str) -> str:
        path = os.path.join(flask_app.static_folder, relative_path)
        try:
            with open(path, encoding='utf-8') as css_file:
                return css_file.read()
        except OSError as exc:
            logger.warning("Failed to read static css %s: %s", relative_path, exc)
            return ""

    def _get_time_remaining_str(expiry_ms):
        if not expiry_ms:
            return "∞"
        now = get_msk_time()
        expiry_dt = datetime.fromtimestamp(expiry_ms / 1000, tz=timezone(timedelta(hours=3)))
        diff = expiry_dt - now
        total_seconds = int(diff.total_seconds())
        if total_seconds <= 0:
            return "истёк"

        years = total_seconds // (365 * 24 * 3600)
        total_seconds %= (365 * 24 * 3600)
        months = total_seconds // (30 * 24 * 3600)
        total_seconds %= (30 * 24 * 3600)
        days = total_seconds // (24 * 3600)
        total_seconds %= (24 * 3600)
        hours = total_seconds // 3600
        total_seconds %= 3600
        minutes = total_seconds // 60

        parts = []
        if years:
            parts.append(f"{years}г.")
        if months:
            parts.append(f"{months}м.")
        if days:
            parts.append(f"{days}д.")
        if hours:
            parts.append(f"{hours}ч.")
        if minutes or not parts:
            parts.append(f"{minutes}мин")
        return " ".join(parts)

    def _finalize_login(admin: dict, info: dict, *, remember: bool, ip: str):
        bot = panel_ctx.bot_controller.get_bot_instance()
        loop = flask_app.config.get('EVENT_LOOP')
        admin_id = get_setting("admin_telegram_id")
        _audit('login.success', {'login': admin.get('login')}, admin_id=admin.get('id'), admin_login=admin.get('login'))
        security.clear_failed_logins(ip)
        if bot and admin_id:
            security.notify_admin(
                bot, loop, admin_id,
                "🟢 <b>Успешный вход Web Aadmin</b>",
                {
                    **info,
                    'msg': '<b>Выполнен вход в панель управления</b>',
                    'footer': '<blockquote>⚠️ <b>ВНИМАНИЕ:</b> Если это были не вы, немедленно отключите бота и смените пароль.</blockquote>'
                }
            )

    login_required = make_login_required()

    panel_ctx.login_required = login_required
    panel_ctx.get_common_template_data = get_common_template_data
    panel_ctx.audit = _audit
    panel_ctx.client_ip = _client_ip
    panel_ctx.is_setup_complete = is_setup_complete
    panel_ctx.needs_mandatory_totp_setup = needs_mandatory_totp_setup
    panel_ctx.totp_flow_redirect = totp_flow_redirect
    panel_ctx.handle_promo_after_payment = handle_promo_after_payment
    panel_ctx.get_time_remaining_str = _get_time_remaining_str
    panel_ctx.qr_data_uri = _qr_data_uri
    panel_ctx.static_css = _static_css
    panel_ctx.complete_panel_login = _complete_panel_login
    panel_ctx.finalize_login = _finalize_login
    panel_ctx.safe_redirect = _safe_redirect

    @flask_app.context_processor
    def inject_current_year():
        def _session_levels():
            levels = session.get('panel_permission_levels')
            if isinstance(levels, dict) and levels:
                return levels
            return normalize_permission_levels(session.get('panel_permissions') or [])

        def can(permission: str) -> bool:
            if 'logged_in' not in session:
                return False
            if session.get('panel_is_superadmin'):
                return True
            return allows_permission(_session_levels(), permission, require_edit=False)

        def can_edit(permission: str) -> bool:
            if 'logged_in' not in session:
                return False
            if session.get('panel_is_superadmin'):
                return True
            return allows_permission(_session_levels(), permission, require_edit=True)

        def _workspace_dock_registry():
            specs = [
                ('home', 'Главная', 'home', 'dashboard_page', 'dashboard', []),
                ('monitor', 'Мониторинг', 'monitoring', 'monitor_page', 'dashboard', []),
                ('trials', 'Пробный период', 'card_giftcard', 'trials_page', 'dashboard', []),
                ('users', 'Пользователи', 'group', 'users_page', 'users', []),
                ('keys', 'Ключи', 'vpn_key', 'admin_keys_page', 'keys', []),
                ('support', 'Поддержка', 'support_agent', 'support_list_page', 'support', ['support_ticket_page']),
                ('buttons', 'Кнопки', 'build', 'button_constructor_page', 'button_constructor', []),
                ('nodes', 'Ноды', 'dns', 'node_page', 'node', []),
                ('backups', 'Бэкапы', 'database', 'backups_page', 'db_manage', []),
                ('devsupport', 'Поддержка разработчика', 'developer_mode', 'developer_support_page', 'dev_support', []),
                ('settings', 'Настройки', 'settings', 'settings_tab_page', 'settings', ['settings_tab_page']),
            ]
            items = []
            for spec in specs:
                dock_id, label, icon, endpoint, perm = spec[:5]
                active_group = spec[5] if len(spec) > 5 else []
                if endpoint == 'developer_support_page' and not dev_support_client.is_enabled():
                    continue
                if not can(perm):
                    continue
                try:
                    if endpoint == 'settings_tab_page':
                        route = url_for(endpoint, tab='panel')
                    else:
                        route = url_for(endpoint)
                except Exception:
                    continue
                items.append({
                    'id': dock_id,
                    'label': label,
                    'icon': icon,
                    'route': route,
                    'endpoint': endpoint,
                    'active_group': active_group,
                })
            return items

        workspace_embed = is_workspace_embed_request()
        workspace_host = (
            request.endpoint in ('dashboard_page', 'monitor_page', 'trials_page')
            and not workspace_embed
        )

        return {
            'current_year': get_msk_time().year,
            'csrf_token': generate_csrf,
            'webapp_exists': panel_ctx.webapp_exists,
            'dev_support_enabled': dev_support_client.is_enabled(),
            'can': can,
            'can_edit': can_edit,
            'panel_admin_login': session.get('panel_login'),
            'panel_role_name': session.get('panel_role_name'),
            'panel_is_superadmin': bool(session.get('panel_is_superadmin')),
            'workspace_embed': workspace_embed,
            'workspace_host': workspace_host,
            'workspace_dock_items': _workspace_dock_registry(),
            'static_css': _static_css,
        }

    @flask_app.template_filter('strip_bom')
    def strip_bom_filter(s):
        return s.lstrip('\ufeff') if s else s

    @flask_app.template_filter('relative_time')
    def format_relative_time(date_value, is_future=False):
        if not date_value:
            return ""
        try:
            if isinstance(date_value, str):
                try:
                    dt = datetime.fromisoformat(date_value)
                except ValueError:
                    dt = datetime.strptime(date_value, '%Y-%m-%d %H:%M:%S')
            else:
                dt = date_value

            if dt.tzinfo:
                dt = dt.astimezone(timezone(timedelta(hours=3))).replace(tzinfo=None)

            now = get_msk_time().replace(tzinfo=None)

            if is_future:
                diff = dt - now
                if diff.total_seconds() < 0:
                    return "(истёк)"
            else:
                diff = now - dt

            total_seconds = abs(diff.total_seconds())
            days = int(total_seconds // 86400)
            hours = int((total_seconds % 86400) // 3600)

            if days > 0:
                last_digit = days % 10
                last_two = days % 100
                if 11 <= last_two <= 19:
                    suffix = "дней"
                elif last_digit == 1:
                    suffix = "день"
                elif 2 <= last_digit <= 4:
                    suffix = "дня"
                else:
                    suffix = "дней"
                return f"{days} {suffix}"
            else:
                last_digit = hours % 10
                last_two = hours % 100
                if 11 <= last_two <= 19:
                    suffix = "часов"
                elif last_digit == 1:
                    suffix = "час"
                elif 2 <= last_digit <= 4:
                    suffix = "часа"
                else:
                    suffix = "часов"
                return f"{hours} {suffix}"
        except Exception:
            return ""

    @flask_app.before_request
    def track_panel_presence():
        if 'logged_in' not in session:
            return None
        admin_id = session.get('panel_admin_id')
        if not admin_id:
            return None
        endpoint = request.endpoint or ''
        if endpoint in ('static',) or (endpoint or '').startswith('static'):
            return None
        if request.path.startswith('/static/'):
            return None
        try:
            panel_presence.touch(
                int(admin_id),
                login=session.get('panel_login') or '',
                role_name=session.get('panel_role_name'),
                endpoint=endpoint,
                path=(request.path or '')[:200],
                user_agent=(request.headers.get('User-Agent') or '')[:200],
            )
        except Exception:
            pass
        return None

    @flask_app.before_request
    def enforce_setup_flow():
        if is_setup_complete():
            return None
        endpoint = request.endpoint or ""
        if endpoint in ("setup_page", "setup_complete_page", "static") or endpoint.startswith("static"):
            return None
        if request.path.startswith("/static/"):
            return None
        return redirect(url_for("setup_page"))

    @flask_app.before_request
    def upgrade_legacy_panel_session():
        if 'logged_in' not in session:
            return None
        panel_access.ensure_panel_access_migrated()
        admin = None
        admin_id = session.get('panel_admin_id')
        if admin_id is not None:
            try:
                admin = panel_access.get_admin(int(admin_id))
            except (TypeError, ValueError):
                admin = None
        if admin is None:
            login = session.get('panel_login') or get_setting('panel_login') or ''
            if login:
                admin = panel_access.get_admin_by_login(login)
        if admin:
            if not admin.get('is_active', True):
                for key in list(session.keys()):
                    session.pop(key, None)
                flash('Учётная запись деактивирована', 'warning')
                return redirect(url_for('login_page'))
            payload = panel_access.session_payload(admin)
            for key in (
                'panel_admin_id',
                'panel_login',
                'panel_role_name',
                'panel_is_superadmin',
                'panel_permissions',
                'panel_permission_levels',
            ):
                session[key] = payload[key]
            return None
        if session.get('panel_permissions') is not None:
            if session.get('panel_permission_levels') is None:
                session['panel_permission_levels'] = normalize_permission_levels(
                    session.get('panel_permissions') or []
                )
            return None
        for key in list(session.keys()):
            session.pop(key, None)
        return redirect(url_for('login_page'))

    @flask_app.before_request
    def enforce_panel_permissions():
        if 'logged_in' not in session:
            return None
        if session.get('panel_is_superadmin'):
            return None

        endpoint = request.endpoint or ""

        if needs_security_setup():
            if endpoint in SECURITY_SETUP_ENDPOINTS:
                return None
            if settings_api_wants_json():
                return jsonify({
                    'ok': False,
                    'error': 'security_setup_required',
                    'message': 'Завершите настройку защиты аккаунта',
                }), 403
            flash('Завершите настройку защиты аккаунта для доступа к панели.', 'warning')
            return redirect(url_for('totp_setup_page'))

        if (
            endpoint in PANEL_GLOBAL_READ_ENDPOINTS
            and request.method in ('GET', 'HEAD', 'OPTIONS')
        ):
            return None

        required = ENDPOINT_PERMISSIONS.get(endpoint)
        any_required = ENDPOINT_ANY_PERMISSIONS.get(endpoint)
        if required or any_required:
            need_edit = request.method not in ('GET', 'HEAD', 'OPTIONS')
            levels = session.get('panel_permission_levels') or normalize_permission_levels(
                session.get('panel_permissions') or []
            )
            audit_ok = (
                endpoint in AUDIT_ENDPOINTS
                and (
                    allows_permission(levels, 'settings_audit', require_edit=False)
                    or allows_permission(levels, 'settings_access', require_edit=False)
                )
            )
            anti_fraud_ok = (
                endpoint in ANTI_FRAUD_ENDPOINTS
                and (
                    allows_permission(levels, 'settings_anti_fraud', require_edit=False)
                    or allows_permission(levels, 'settings_access', require_edit=False)
                )
            )
            perm_ok = False
            if any_required:
                perm_ok = any(
                    allows_permission(levels, perm, require_edit=need_edit)
                    for perm in any_required
                )
            elif required:
                perm_ok = allows_permission(levels, required, require_edit=need_edit)
            if not audit_ok and not anti_fraud_ok and not perm_ok:
                if request.path.startswith('/api/') or request.is_json or settings_api_wants_json():
                    return jsonify({'ok': False, 'error': 'forbidden', 'message': 'Недостаточно прав'}), 403
                flash('Недостаточно прав для этого раздела', 'danger')
                landing_ep, landing_kw = resolve_landing_route(levels)
                if landing_ep == endpoint and (request.view_args or {}) == landing_kw:
                    landing_ep, landing_kw = 'login_page', {}
                return redirect(url_for(landing_ep, **landing_kw))

        if endpoint in ('settings_page', 'settings_tab_page') and request.method == 'GET':
            tab = (request.view_args or {}).get('tab') if endpoint == 'settings_tab_page' else (request.args.get('tab') or 'panel').strip()
            levels = session.get('panel_permission_levels') or normalize_permission_levels(
                session.get('panel_permissions') or []
            )
            if tab == 'audit':
                if not (
                    allows_permission(levels, 'settings_audit', require_edit=False)
                    or allows_permission(levels, 'settings_access', require_edit=False)
                ):
                    flash('Недостаточно прав для этого раздела настроек', 'danger')
                    landing_ep, landing_kw = resolve_landing_route(levels)
                    return redirect(url_for(landing_ep, **landing_kw))
            elif tab == 'anti-fraud':
                if not (
                    allows_permission(levels, 'settings_anti_fraud', require_edit=False)
                    or allows_permission(levels, 'settings_access', require_edit=False)
                ):
                    flash('Недостаточно прав для этого раздела настроек', 'danger')
                    landing_ep, landing_kw = resolve_landing_route(levels)
                    return redirect(url_for(landing_ep, **landing_kw))
            elif tab == 'content':
                if not (
                    allows_permission(levels, 'settings_content', require_edit=False)
                    or allows_permission(levels, 'settings_mail_templates', require_edit=False)
                ):
                    flash('Недостаточно прав для этого раздела настроек', 'danger')
                    landing_ep, landing_kw = resolve_landing_route(levels)
                    return redirect(url_for(landing_ep, **landing_kw))
            else:
                tab_perm = SETTINGS_TAB_PERMISSIONS.get(tab)
                if tab_perm and not allows_permission(levels, tab_perm, require_edit=False):
                    flash('Недостаточно прав для этого раздела настроек', 'danger')
                    landing_ep, landing_kw = resolve_landing_route(levels)
                    return redirect(url_for(landing_ep, **landing_kw))

        if endpoint == 'settings_tab_page' and request.method == 'POST':
            tab = (request.view_args or {}).get('tab') or 'panel'
            tab_perm = SETTINGS_TAB_PERMISSIONS.get(tab)
            levels = session.get('panel_permission_levels') or normalize_permission_levels(
                session.get('panel_permissions') or []
            )
            if tab_perm and not allows_permission(levels, tab_perm, require_edit=True):
                flash('Недостаточно прав для сохранения этого раздела', 'danger')
                landing_ep, landing_kw = resolve_landing_route(levels)
                return redirect(url_for(landing_ep, **landing_kw))

        return None

    # Blueprint modules use panel_ctx decorators; import after context is bound.
    from shop_bot.webhook_server.blueprints import register_blueprints

    register_blueprints(flask_app)

    @flask_app.errorhandler(CSRFError)
    def handle_csrf_error(_exc):
        wants_json = (
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
            or request.is_json
            or 'application/json' in (request.headers.get('Accept') or '')
        )
        if wants_json:
            return jsonify({
                'ok': False,
                'error': 'csrf_expired',
                'message': 'CSRF-токен устарел. Обновите страницу или повторите действие.',
            }), 400
        flash('Сессия формы устарела. Обновите страницу и повторите.', 'warning')
        return redirect(request.referrer or url_for('dashboard_page'))

    register_update_routes(flask_app, login_required)
    register_gemini_routes(flask_app, login_required)
    register_node_routes(flask_app, login_required, get_common_template_data)

    return flask_app
