from __future__ import annotations

from functools import wraps

from flask import flash, redirect, request, session, url_for

from shop_bot.data_manager import panel_security
from shop_bot.data_manager import panel_totp
from shop_bot.data_manager.panel_rbac import normalize_permission_levels, resolve_landing_route
from shop_bot.data_manager.remnawave_repository import get_setting
from shop_bot.webhook_server.constants import SETTINGS_TAB_IDS
from shop_bot.webhook_server.context import panel_ctx

_SETTINGS_TAB_PAGES = frozenset(SETTINGS_TAB_IDS)

SECURITY_SETUP_ENDPOINTS = frozenset({
    'totp_setup_page',
    'settings_totp_begin',
    'settings_totp_enable',
    'settings_totp_disable',
    'settings_totp_cancel',
    'settings_security_method_save',
    'settings_telegram_link',
    'settings_telegram_unlink',
    'settings_passkey_register_options',
    'settings_passkey_register_complete',
    'settings_passkey_delete',
    'logout_page',
})


def is_setup_complete() -> bool:
    return (get_setting("setup_complete") or "0") == "1"


def needs_security_setup() -> bool:
    if 'logged_in' not in session:
        return False
    admin_id = session.get('panel_admin_id')
    return bool(admin_id and panel_security.needs_security_setup(int(admin_id)))


def needs_mandatory_totp_setup() -> bool:
    """Backward-compatible alias."""
    return needs_security_setup()


def security_flow_redirect(*, success: bool = False):
    if success and not needs_security_setup():
        return redirect(panel_landing_url())
    if needs_security_setup():
        return redirect(url_for('totp_setup_page'))
    return redirect(url_for('settings_tab_page', tab='access'))


def panel_landing_url(*, admin: dict | None = None) -> str:
    """First allowed panel page for the current session or a given admin record."""
    if admin is None:
        if session.get('panel_is_superadmin'):
            return url_for('dashboard_page')
        levels = session.get('panel_permission_levels') or normalize_permission_levels(
            session.get('panel_permissions') or []
        )
    else:
        if admin.get('is_superadmin'):
            return url_for('dashboard_page')
        levels = normalize_permission_levels(admin.get('permission_levels') or admin.get('permissions') or [])
    endpoint, values = resolve_landing_route(levels)
    return url_for(endpoint, **values)


def totp_flow_redirect(*, success: bool = False):
    return security_flow_redirect(success=success)


def is_settings_tab_page_request() -> bool:
    """GET /settings/{tab} — HTML page navigation, not a JSON API call."""
    if request.method != 'GET':
        return False
    parts = request.path.strip('/').split('/')
    return len(parts) == 2 and parts[0] == 'settings' and parts[1] in _SETTINGS_TAB_PAGES


def settings_api_wants_json() -> bool:
    if is_settings_tab_page_request():
        return False
    if request.path.startswith('/settings/'):
        return True
    if request.is_json:
        return True
    accept = request.headers.get('Accept', '')
    if 'application/json' in accept:
        return True
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'


from shop_bot.webhook_server.panel_http import safe_next_path


def capture_login_next() -> None:
    """Store ?next= from login page for post-auth redirect."""
    path = safe_next_path(request, request.args.get('next'))
    if path:
        session['panel_login_next'] = path


def resolve_post_login_target(admin: dict | None = None) -> str:
    """Redirect after login / 2FA — honors ?next=, then role landing."""
    next_path = session.pop('panel_login_next', None)
    if next_path:
        return next_path
    return panel_landing_url(admin=admin)


def login_redirect_url() -> str:
    path = request.full_path if request.query_string else request.path
    if path.endswith('?') and not request.query_string:
        path = request.path
    return url_for('login_page', next=path)


def make_login_required():
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from flask import jsonify

            if session.get('pending_totp_admin_id') and 'logged_in' not in session:
                if settings_api_wants_json():
                    return jsonify({'ok': False, 'error': 'auth_required', 'message': 'Требуется вход в панель'}), 401
                return redirect(url_for('login_page', step='totp', next=session.get('panel_login_next')))
            if 'logged_in' not in session:
                if settings_api_wants_json():
                    return jsonify({'ok': False, 'error': 'auth_required', 'message': 'Требуется вход в панель'}), 401
                return redirect(login_redirect_url())
            if needs_security_setup():
                endpoint = request.endpoint or ''
                if endpoint not in SECURITY_SETUP_ENDPOINTS:
                    if settings_api_wants_json():
                        return jsonify({
                            'ok': False,
                            'error': 'security_setup_required',
                            'message': 'Завершите настройку защиты аккаунта',
                        }), 403
                    flash('Завершите настройку защиты аккаунта для доступа к панели.', 'warning')
                    return redirect(url_for('totp_setup_page'))
            return f(*args, **kwargs)
        return decorated_function
    return login_required
