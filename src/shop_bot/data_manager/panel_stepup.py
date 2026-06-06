"""Кратковременное подтверждение 2FA для чувствительных разделов панели."""

from __future__ import annotations

import time
from typing import Any

from flask import session

from shop_bot.data_manager import panel_security
from shop_bot.data_manager import panel_telegram_auth
from shop_bot.data_manager import panel_totp
from shop_bot.data_manager import panel_webauthn
from shop_bot.data_manager.panel_security import (
    SECURITY_NONE,
    SECURITY_PASSKEY,
    SECURITY_TELEGRAM,
    SECURITY_TOTP,
)

STEPUP_TTL_SECONDS = 900
SCOPE_DATABASE = 'database'
SCOPE_DESTRUCTIVE = 'destructive'
SCOPE_NODE_POWER = 'node_power'

ELEVATED_SCOPES: tuple[str, ...] = (
    SCOPE_DATABASE,
    SCOPE_DESTRUCTIVE,
    SCOPE_NODE_POWER,
)


def _session_key(scope: str) -> str:
    return f'stepup_{scope}_at'


def grant_stepup(scope: str = SCOPE_DATABASE) -> None:
    session[_session_key(scope)] = time.time()


def grant_all_elevated_stepups() -> None:
    now = time.time()
    for scope in ELEVATED_SCOPES:
        session[_session_key(scope)] = now


def revoke_all_elevated_stepups() -> None:
    for scope in ELEVATED_SCOPES:
        session.pop(_session_key(scope), None)


def revoke_stepup(scope: str = SCOPE_DATABASE) -> None:
    session.pop(_session_key(scope), None)


def has_valid_stepup(scope: str = SCOPE_DATABASE) -> bool:
    raw = session.get(_session_key(scope))
    if raw is None:
        return False
    try:
        age = time.time() - float(raw)
    except (TypeError, ValueError):
        return False
    if age >= STEPUP_TTL_SECONDS:
        session.pop(_session_key(scope), None)
        return False
    return True


def stepup_remaining_seconds(scope: str = SCOPE_DATABASE) -> int:
    raw = session.get(_session_key(scope))
    if raw is None:
        return 0
    try:
        left = STEPUP_TTL_SECONDS - (time.time() - float(raw))
    except (TypeError, ValueError):
        return 0
    return max(0, int(left))


def required_stepup_method(admin_id: int) -> str | None:
    """Метод 2FA для step-up или None, если сильная защита не настроена."""
    method = panel_security.get_effective_security_method(admin_id)
    if method == SECURITY_NONE:
        return None
    if panel_security.is_method_configured(admin_id, method):
        return method
    return None


def stepup_gate_meta(admin_id: int, scope: str = SCOPE_DATABASE) -> dict[str, Any]:
    method = required_stepup_method(admin_id)
    unlocked = has_valid_stepup(scope)
    meta: dict[str, Any] = {
        'scope': scope,
        'unlocked': unlocked,
        'method': method,
        'method_label': panel_security.SECURITY_METHOD_LABELS.get(method or SECURITY_NONE, ''),
        'needs_2fa_setup': method is None,
        'remaining_sec': stepup_remaining_seconds(scope) if unlocked else 0,
        'passkey_available': panel_webauthn.is_available(),
        'telegram_login_enabled': panel_telegram_auth.is_login_enabled(),
    }
    if method == SECURITY_TELEGRAM:
        from shop_bot.data_manager import panel_access

        admin = panel_access.get_admin(admin_id)
        meta['telegram_linked'] = bool(admin and admin.get('telegram_user_id'))
    return meta


def verify_totp_stepup(admin_id: int, code: str) -> tuple[bool, str]:
    method = required_stepup_method(admin_id)
    if method != SECURITY_TOTP:
        return False, 'Для вашего аккаунта требуется другой способ подтверждения'
    if not panel_totp.verify_admin_totp(admin_id, code):
        return False, 'Неверный код аутентификатора'
    grant_all_elevated_stepups()
    return True, ''


def verify_telegram_stepup(admin_id: int, payload: dict[str, Any]) -> tuple[bool, str]:
    method = required_stepup_method(admin_id)
    if method != SECURITY_TELEGRAM:
        return False, 'Для вашего аккаунта требуется другой способ подтверждения'
    ok, message = panel_telegram_auth.verify_telegram_login(payload)
    if not ok:
        return False, message
    user = panel_telegram_auth.parse_telegram_user(payload)
    from shop_bot.data_manager import panel_access

    admin = panel_access.get_admin(admin_id)
    if not admin or int(admin.get('telegram_user_id') or 0) != int(user['telegram_user_id']):
        return False, 'Telegram-аккаунт не совпадает с привязанным'
    grant_all_elevated_stepups()
    return True, ''


def verify_passkey_stepup(
    admin_id: int,
    *,
    challenge_b64: str,
    credential: dict[str, Any],
    request,
) -> tuple[bool, str]:
    method = required_stepup_method(admin_id)
    if method != SECURITY_PASSKEY:
        return False, 'Для вашего аккаунта требуется другой способ подтверждения'
    admin, message = panel_webauthn.complete_authentication(
        challenge_b64=challenge_b64,
        credential=credential,
        request=request,
    )
    if not admin or int(admin['id']) != int(admin_id):
        return False, message or 'Passkey не принят'
    grant_all_elevated_stepups()
    return True, ''
