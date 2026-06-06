import asyncio
import logging
import os
import re
import secrets
from hmac import compare_digest

from flask import (
    current_app,
    flash,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from flask_wtf.csrf import generate_csrf

from shop_bot.data_manager import panel_access
from shop_bot.data_manager import panel_security
from shop_bot.data_manager import panel_telegram_auth
from shop_bot.data_manager import panel_totp
from shop_bot.data_manager import panel_webauthn
from shop_bot.data_manager.remnawave_repository import get_all_settings, get_setting, update_setting
from shop_bot.data_manager.secrets_vault import ensure_master_key, generate_panel_password, verify_panel_password
from shop_bot.modules import remnawave_api
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.modules import login_accounts
from shop_bot.webhook_server.modules import security
from shop_bot.webhook_server.modules import stealth_login
from shop_bot.webhook_server.services.auth import panel_landing_url, capture_login_next, resolve_post_login_target

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('auth', __name__)


def _login_page_context(**extra):
    settings = get_all_settings()
    bot_username = (settings.get('telegram_bot_username') or '').strip().lstrip('@')
    ctx = {
        **panel_ctx.get_common_template_data(),
        'telegram_login_enabled': panel_telegram_auth.is_login_enabled() and bool(bot_username),
        'passkey_login_enabled': panel_webauthn.is_login_enabled() and panel_webauthn.is_available(),
        'telegram_bot_username': bot_username,
        'login_accounts': login_accounts.list_public_login_accounts(),
        'is_blocked': False,
        'totp_step': False,
        **extra,
    }
    return ctx


def _client_auth_info():
    ip = panel_ctx.client_ip()
    ua = request.headers.get('User-Agent', 'Unknown')
    real_ip = request.headers.get('X-Forwarded-For')
    return ip, ua, real_ip


def _handle_admin_authenticated(admin: dict, *, remember: bool = False, method: str = 'password'):
    ip, ua, real_ip = _client_auth_info()
    info = {
        'ip': ip,
        'ua': ua,
        'method': method,
        'user': admin.get('login'),
        'real_ip': real_ip,
    }
    if method == 'password':
        blocked, block_message = panel_security.blocks_password_login(admin['id'])
        if blocked:
            panel_ctx.audit('login.blocked', {'method': 'password', 'reason': 'strong_auth_required', 'user': admin.get('login')})
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({'ok': False, 'error': block_message}), 403
            flash(block_message, 'warning')
            return render_template('login.html', **_login_page_context())
    if panel_security.requires_totp_on_login(admin['id'], method):
        session['pending_totp_admin_id'] = admin['id']
        session['pending_totp_remember'] = remember
        if request.is_json or request.headers.get('Accept') == 'application/json':
            return jsonify({'ok': True, 'totp_required': True, 'redirect': url_for('login_page', step='totp')})
        return render_template(
            'login.html',
            **_login_page_context(totp_step=True, pending_login=admin.get('login')),
        )
    panel_ctx.complete_panel_login(admin, remember=remember)
    panel_ctx.finalize_login(admin, info, remember=remember, ip=ip)
    if panel_security.needs_security_setup(admin['id']):
        target = url_for('totp_setup_page')
    else:
        target = resolve_post_login_target(admin=admin)
    if request.is_json or request.headers.get('Accept') == 'application/json':
        return jsonify({'ok': True, 'redirect': target})
    return redirect(target)


@bp.route("/setup", methods=["GET", "POST"])
def setup_page():
    if panel_ctx.is_setup_complete():
        return redirect(url_for("login_page"))

    def render_setup(form, password=None):
        pwd = password if password and len(password) >= 16 else generate_panel_password()
        return render_template("setup.html", form=form, generated_password=pwd)

    form = {}
    if request.method == "POST":
        form = {
            "remnawave_base_url": (request.form.get("remnawave_base_url") or "").strip(),
            "panel_login": (request.form.get("panel_login") or "").strip(),
        }
        base_url = remnawave_api._normalize_remnawave_base_url(form["remnawave_base_url"])
        form["remnawave_base_url"] = base_url
        api_token = remnawave_api._normalize_remnawave_token(request.form.get("remnawave_api_token") or "")
        password = request.form.get("panel_password") or ""
        confirm = request.form.get("panel_password_confirm") or ""
        login = form["panel_login"]

        if len(login) < 3 or not re.fullmatch(r"[A-Za-z0-9._-]+", login):
            flash("Логин: минимум 3 символа (латиница, цифры, ._-)", "danger")
            return render_setup(form, password)
        if len(password) < 16:
            flash("Пароль должен содержать минимум 16 символов", "danger")
            return render_setup(form, password)
        if password != confirm:
            flash("Пароли не совпадают", "danger")
            return render_setup(form, password)
        if not base_url or not api_token:
            flash("Укажите URL и API token Remnawave", "danger")
            return render_setup(form, password)

        ok, message = asyncio.run(remnawave_api.test_connection(base_url, api_token))
        if not ok:
            flash(message, "danger")
            return render_setup(form, password)

        ensure_master_key()
        update_setting("remnawave_base_url", base_url)
        update_setting("remnawave_api_token", api_token)
        update_setting("panel_login", login)
        update_setting("panel_password", password)
        update_setting("setup_complete", "1")
        panel_access.create_initial_admin(login, password)
        setup_view_token = secrets.token_urlsafe(32)
        session["_setup_view_token"] = setup_view_token
        session["_setup_credentials"] = {
            "panel_login": login,
            "panel_password": password,
        }
        return redirect(url_for("setup_complete_page", t=setup_view_token))

    return render_setup(form)

@bp.route("/setup/complete")
def setup_complete_page():
    if not panel_ctx.is_setup_complete():
        return redirect(url_for("setup_page"))

    token = (request.args.get('t') or '').strip()
    expected = session.get("_setup_view_token") or ''
    if not expected or not token or not compare_digest(token, expected):
        flash('Ссылка на страницу установки недействительна или устарела.', 'warning')
        return redirect(url_for("login_page"))

    session.pop("_setup_view_token", None)
    creds = session.pop("_setup_credentials", None)
    if not creds:
        return redirect(url_for("login_page"))

    return render_template("setup_complete.html", **creds)

@bp.route('/login', methods=['GET', 'POST'])
def login_page():
    real_ip = request.headers.get('X-Forwarded-For')
    ip = panel_ctx.client_ip()
    ua = request.headers.get('User-Agent', 'Unknown')
    totp_step = request.args.get('step') == 'totp' or bool(session.get('pending_totp_admin_id'))

    if request.method == 'GET':
        capture_login_next()

    if security.is_blocked(ip, ua) or security.is_login_locked(ip):
        return render_template('login.html', **_login_page_context(is_blocked=True))

    settings = get_all_settings()
    stealth_enabled = stealth_login.is_enabled(settings)

    if stealth_enabled and request.method == 'GET':
        if stealth_login.secret_query_match(settings, request.args):
            return render_template('login.html', **_login_page_context(stealth_reveal=True))
        resp, new_token = stealth_login.render_decoy_response(settings, token=secrets.token_hex(8))
        session['stealth_token'] = new_token
        return resp

    if request.method == 'POST':
        stealth_token = request.form.get('stealth_token')
        if stealth_token:
            if stealth_enabled:
                sess_token = session.pop('stealth_token', None)
                if stealth_token == sess_token and sess_token is not None:
                    return render_template('login.html', **_login_page_context(stealth_reveal=True))
            resp, _ = stealth_login.render_decoy_response(settings, token=None)
            return resp

        totp_code = (request.form.get('totp_code') or '').strip()
        pending_admin_id = session.get('pending_totp_admin_id')
        if pending_admin_id and totp_code:
            if panel_totp.verify_admin_totp(int(pending_admin_id), totp_code):
                admin = panel_access.get_admin(int(pending_admin_id))
                if admin:
                    remember = bool(session.get('pending_totp_remember'))
                    panel_ctx.complete_panel_login(admin, remember=remember)
                    info = {'ip': ip, 'ua': ua, 'method': request.method, 'user': admin.get('login'), 'real_ip': real_ip}
                    panel_ctx.finalize_login(admin, info, remember=remember, ip=ip)
                    return redirect(resolve_post_login_target(admin=admin))
            flash('Неверный код аутентификатора', 'danger')
            return render_template('login.html', **_login_page_context(totp_step=True))

        account_ref = (request.form.get('account_ref') or '').strip() or None
        if account_ref and not login_accounts.account_auth_rate_ok(ip, account_ref):
            flash('Слишком много попыток входа. Попробуйте позже.', 'danger')
            return render_template('login.html', **_login_page_context())

        username = request.form.get('username')
        if account_ref:
            admin_id_from_ref = login_accounts.decode_account_ref(account_ref)
            if not admin_id_from_ref:
                security.record_failed_login(ip)
                flash('Неверная учётная запись', 'danger')
                return render_template('login.html', **_login_page_context())
            admin_from_ref = panel_access.get_admin(admin_id_from_ref)
            username = admin_from_ref.get('login') if admin_from_ref else None

        password = request.form.get('password')
        bot = panel_ctx.bot_controller.get_bot_instance()
        loop = current_app.config.get('EVENT_LOOP')
        admin_id = settings.get("admin_telegram_id")

        info = {
            'ip': ip,
            'ua': ua,
            'method': request.method,
            'user': username,
            'referer': request.referrer,
            'real_ip': real_ip
        }

        stored_password = get_setting("panel_password") or ""
        admin = panel_access.authenticate(username or "", password or "")
        if not admin and username == settings.get("panel_login") and verify_panel_password(stored_password, password or ""):
            panel_access.ensure_panel_access_migrated()
            panel_access.create_initial_admin(username, password or "")
            admin = panel_access.get_admin_by_login(username or "")

        if admin:
            remember = bool(request.form.get('remember_me'))
            return _handle_admin_authenticated(admin, remember=remember, method='password')

        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'login': username}, admin_login=username or None)
        if bot and admin_id:
            security.notify_admin(
                bot, loop, admin_id,
                "🔴 <b>Кто-то пытается войти</b> 🔴",
                {
                    **info,
                    'msg': '<b>Не верно введенные данные для входа.</b>',
                    'footer': '‼️ <b>Важно срочно ответить, Это были вы?</b>'
                },
                is_alert=True
            )
        flash('Неверный логин или пароль', 'danger')

    if totp_step and session.get('pending_totp_admin_id'):
        return render_template('login.html', **_login_page_context(totp_step=True))
    return render_template('login.html', **_login_page_context())


@bp.route('/login/accounts', methods=['GET'])
def login_accounts_api():
    ip, ua, _ = _client_auth_info()
    if security.is_blocked(ip, ua) or security.is_login_locked(ip):
        return jsonify({'ok': False, 'error': 'Доступ временно заблокирован'}), 429
    if not login_accounts.accounts_lookup_rate_ok(ip):
        return jsonify({'ok': False, 'error': 'Слишком много запросов. Попробуйте позже.'}), 429
    return jsonify({'ok': True, 'accounts': login_accounts.list_public_login_accounts()})


@bp.route('/login/telegram', methods=['POST'])
def login_telegram():
    if not panel_telegram_auth.is_login_enabled():
        return jsonify({'ok': False, 'error': 'Вход через Telegram отключён'}), 403

    ip, ua, _ = _client_auth_info()
    if security.is_blocked(ip, ua) or security.is_login_locked(ip):
        return jsonify({'ok': False, 'error': 'Доступ временно заблокирован'}), 429

    payload = request.get_json(silent=True) or request.form.to_dict()
    account_ref = (payload.get('account_ref') or '').strip() or None
    if account_ref and not login_accounts.account_auth_rate_ok(ip, account_ref):
        return jsonify({'ok': False, 'error': 'Слишком много попыток. Попробуйте позже.'}), 429

    ok, message = panel_telegram_auth.verify_telegram_login(payload)
    if not ok:
        security.record_failed_login(ip)
        return jsonify({'ok': False, 'error': message}), 401

    user = panel_telegram_auth.parse_telegram_user(payload)
    admin = panel_access.get_admin_by_telegram_user_id(user['telegram_user_id'])
    if not admin:
        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'method': 'telegram', 'telegram_id': user['telegram_user_id']})
        return jsonify({'ok': False, 'error': 'Telegram не привязан к учётной записи администратора'}), 401

    _, mismatch = login_accounts.resolve_account_login(int(admin['id']), account_ref)
    if mismatch:
        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'method': 'telegram', 'reason': 'account_mismatch'})
        return jsonify({'ok': False, 'error': mismatch}), 401

    remember = bool(payload.get('remember_me'))
    return _handle_admin_authenticated(admin, remember=remember, method='telegram')


@bp.route('/login/passkey/options', methods=['POST'])
def login_passkey_options():
    if not panel_webauthn.is_login_enabled() or not panel_webauthn.is_available():
        return jsonify({'ok': False, 'error': 'Вход по passkey отключён'}), 403

    ip, ua, _ = _client_auth_info()
    if security.is_blocked(ip, ua) or security.is_login_locked(ip):
        return jsonify({'ok': False, 'error': 'Доступ временно заблокирован'}), 429

    body = request.get_json(silent=True) or {}
    account_ref = (body.get('account_ref') or '').strip() or None
    admin_id = login_accounts.decode_account_ref(account_ref) if account_ref else None
    if account_ref and admin_id is None:
        security.record_failed_login(ip)
        return jsonify({'ok': False, 'error': 'Недействительная учётная запись'}), 400
    if account_ref and not login_accounts.account_auth_rate_ok(ip, account_ref):
        return jsonify({'ok': False, 'error': 'Слишком много попыток. Попробуйте позже.'}), 429

    try:
        begin = panel_webauthn.begin_authentication(request, admin_id=admin_id)
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 503

    session['webauthn_auth_challenge'] = begin['challenge']
    if admin_id is not None:
        session['webauthn_auth_admin_id'] = admin_id
    else:
        session.pop('webauthn_auth_admin_id', None)
    return jsonify({'ok': True, 'options': begin['options']})


@bp.route('/login/passkey/verify', methods=['POST'])
def login_passkey_verify():
    if not panel_webauthn.is_login_enabled() or not panel_webauthn.is_available():
        return jsonify({'ok': False, 'error': 'Вход по passkey отключён'}), 403

    ip, ua, _ = _client_auth_info()
    if security.is_blocked(ip, ua) or security.is_login_locked(ip):
        return jsonify({'ok': False, 'error': 'Доступ временно заблокирован'}), 429

    body = request.get_json(silent=True) or {}
    challenge = session.pop('webauthn_auth_challenge', None)
    expected_admin_id = session.pop('webauthn_auth_admin_id', None)
    if not challenge:
        return jsonify({'ok': False, 'error': 'Сессия passkey истекла, повторите вход'}), 400

    account_ref = (body.get('account_ref') or '').strip() or None
    if account_ref and not login_accounts.account_auth_rate_ok(ip, account_ref):
        return jsonify({'ok': False, 'error': 'Слишком много попыток. Попробуйте позже.'}), 429

    admin, message = panel_webauthn.complete_authentication(
        challenge_b64=challenge,
        credential=body.get('credential') or body,
        request=request,
    )
    if not admin:
        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'method': 'passkey'})
        return jsonify({'ok': False, 'error': message or 'Passkey не принят'}), 401

    if expected_admin_id is not None and int(admin['id']) != int(expected_admin_id):
        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'method': 'passkey', 'reason': 'account_mismatch'})
        return jsonify({'ok': False, 'error': 'Passkey не соответствует выбранной учётной записи'}), 401

    _, mismatch = login_accounts.resolve_account_login(int(admin['id']), account_ref)
    if mismatch:
        security.record_failed_login(ip)
        panel_ctx.audit('login.failed', {'method': 'passkey', 'reason': 'account_mismatch'})
        return jsonify({'ok': False, 'error': mismatch}), 401

    remember = bool(body.get('remember_me'))
    return _handle_admin_authenticated(admin, remember=remember, method='passkey')


def _invite_page_context(invite: dict | None = None, *, error: str | None = None):
    common = panel_ctx.get_common_template_data()
    return {
        **common,
        'invite': invite,
        'invite_error': error,
    }


@bp.route('/invite/<token>', methods=['GET', 'POST'])
def invite_register_page(token: str):
    if not panel_ctx.is_setup_complete():
        return redirect(url_for('setup_page'))

    from shop_bot.data_manager import panel_admin_invites

    token = (token or '').strip()
    ip = panel_ctx.client_ip()

    if security.is_login_locked(ip) or security.is_invite_redeem_locked(ip):
        flash('Слишком много попыток. Попробуйте позже.', 'danger')
        return render_template('invite_register.html', **_invite_page_context(error='rate_limited'))

    invite, public_err = panel_admin_invites.get_public_invite(token)
    if public_err:
        return render_template('invite_register.html', **_invite_page_context(error=public_err))

    if request.method == 'GET':
        if 'logged_in' in session:
            flash('Вы уже вошли в панель. Выйдите, чтобы принять приглашение другой учётной записью.', 'info')
        return render_template('invite_register.html', **_invite_page_context(invite=invite))

    if 'logged_in' in session:
        flash('Выйдите из панели, чтобы принять приглашение.', 'warning')
        return render_template('invite_register.html', **_invite_page_context(invite=invite))

    login = (request.form.get('login') or '').strip()
    password = request.form.get('password') or ''
    confirm = request.form.get('password_confirm') or ''

    if len(login) < 3 or not re.fullmatch(r'[A-Za-z0-9._-]+', login):
        flash('Логин: минимум 3 символа (латиница, цифры, ._-)', 'danger')
        return render_template('invite_register.html', **_invite_page_context(invite=invite))
    if len(password) < 16:
        flash('Пароль должен содержать минимум 16 символов', 'danger')
        return render_template('invite_register.html', **_invite_page_context(invite=invite))
    if password != confirm:
        flash('Пароли не совпадают', 'danger')
        return render_template('invite_register.html', **_invite_page_context(invite=invite))

    ok, message, result = panel_admin_invites.redeem_invite(token, login=login, password=password)
    if not ok:
        security.record_failed_invite_redeem(ip)
        flash(message, 'danger')
        invite, _ = panel_admin_invites.get_public_invite(token)
        return render_template('invite_register.html', **_invite_page_context(invite=invite))

    panel_ctx.audit(
        'invite.redeemed',
        {
            'token_prefix': (invite.get('token_prefix') if invite else None) or token[:8],
            'login': login,
            'role_name': invite.get('role_name') if invite else None,
        },
        admin_login=login,
    )
    flash('Учётная запись создана. Войдите в панель и настройте защиту аккаунта.', 'success')
    return redirect(url_for('login_page'))


@bp.route('/logout', methods=['POST'])
@panel_ctx.login_required
def logout_page():
    panel_ctx.audit('logout')
    for key in ('logged_in', 'panel_admin_id', 'panel_login', 'panel_role_name',
                'panel_is_superadmin', 'panel_permissions', 'pending_totp_admin_id', 'pending_totp_remember'):
        session.pop(key, None)
    flash('Вы успешно вышли.', 'success')
    return redirect(url_for('login_page'))

@bp.route('/security/2fa-setup', methods=['GET'])
@panel_ctx.login_required
def totp_setup_page():
    if not panel_ctx.needs_mandatory_totp_setup():
        return redirect(panel_landing_url())
    admin_id = session.get('panel_admin_id')
    security_info = panel_security.security_status(int(admin_id)) if admin_id else {}
    method = security_info.get('effective_method') or panel_security.SECURITY_NONE
    totp_info = panel_totp.totp_status(admin_id) if admin_id else {'enabled': False, 'pending_setup': False}
    totp_qr_data_uri = None
    totp_secret_key = None
    totp_secret_display = None
    if admin_id and method == panel_security.SECURITY_TOTP and totp_info.get('pending_setup'):
        totp_secret_key = panel_totp.get_setup_secret(int(admin_id))
        if totp_secret_key:
            totp_secret_display = panel_totp.format_secret_for_display(totp_secret_key)
        setup_uri = panel_totp.get_setup_uri(
            int(admin_id),
            session.get('panel_login') or '',
            panel_ctx.get_common_template_data().get('brand_title') or 'Remnawave ShopBot',
        )
        if setup_uri:
            totp_qr_data_uri = panel_ctx.qr_data_uri(setup_uri)
    settings = get_all_settings()
    bot_username = (settings.get('telegram_bot_username') or '').strip().lstrip('@')
    return render_template(
        'totp_setup.html',
        totp_info=totp_info,
        totp_qr_data_uri=totp_qr_data_uri,
        totp_secret_key=totp_secret_key,
        totp_secret_display=totp_secret_display,
        security_info=security_info,
        security_method=method,
        passkeys=panel_webauthn.list_credentials(int(admin_id)) if admin_id else [],
        passkey_available=panel_webauthn.is_available(),
        telegram_bot_username=bot_username,
        telegram_linked=bool(panel_access.get_admin(int(admin_id)).get('telegram_user_id')) if admin_id else False,
        **panel_ctx.get_common_template_data(),
    )


@bp.route('/admin/api/csrf-token.json', methods=['GET'])
@panel_ctx.login_required
def csrf_token_json():
    """Свежий CSRF-токен для длинных сессий и SPA-запросов без перезагрузки."""
    return jsonify({'ok': True, 'csrf_token': generate_csrf()})
