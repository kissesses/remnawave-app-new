"""Public login account picker (macOS v2) — no usernames exposed."""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

from flask import current_app

from shop_bot.data_manager import panel_access
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
from shop_bot.security.rate_store import allow_action

logger = logging.getLogger(__name__)

AVATAR_PALETTE = (
    ('#5856d6', 'shield'),
    ('#007aff', 'admin_panel_settings'),
    ('#34c759', 'person'),
    ('#ff9500', 'support_agent'),
    ('#af52de', 'badge'),
    ('#ff2d55', 'key'),
)

METHOD_LABELS = {
    'password': 'Пароль',
    'password_totp': 'Пароль и 2FA',
    'passkey': 'Passkey',
    'telegram': 'Telegram',
}


def _secret() -> bytes:
    key = (current_app.config.get('SECRET_KEY') or '').strip()
    if not key:
        key = 'shopbot-login-accounts'
    return key.encode('utf-8')


def encode_account_ref(admin_id: int) -> str:
    payload = str(int(admin_id))
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:20]
    return f'{payload}.{sig}'


def decode_account_ref(ref: str | None) -> int | None:
    if not ref or not isinstance(ref, str):
        return None
    parts = ref.strip().split('.', 1)
    if len(parts) != 2:
        return None
    payload, sig = parts
    if not payload.isdigit():
        return None
    expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:20]
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        admin_id = int(payload)
    except ValueError:
        return None
    admin = panel_access.get_admin(admin_id)
    if not admin or not admin.get('is_active'):
        return None
    return admin_id


def accounts_lookup_rate_ok(ip: str | None) -> bool:
    if not ip:
        return True
    return allow_action(f'login-accounts:{ip}', limit=120, window=3600)


def account_auth_rate_ok(ip: str | None, account_ref: str | None) -> bool:
    if not ip:
        return True
    if account_ref:
        short = account_ref.split('.', 1)[0]
        if not allow_action(f'login-acct:{ip}:{short}', limit=40, window=3600):
            return False
    return allow_action(f'login-acct-ip:{ip}', limit=80, window=3600)


def resolve_login_methods(admin_id: int) -> list[dict[str, str]]:
    """All login methods available for this account (password + configured alternatives)."""
    effective = panel_security.get_effective_security_method(admin_id)
    methods: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(method_type: str) -> None:
        if method_type in seen:
            return
        seen.add(method_type)
        methods.append({'type': method_type, 'label': METHOD_LABELS[method_type]})

    blocked, _ = panel_security.blocks_password_login(admin_id)
    if not blocked:
        if effective == SECURITY_TOTP or (
            effective == SECURITY_NONE and panel_totp.is_enabled(admin_id)
        ):
            add('password_totp')
        else:
            add('password')

    if (
        panel_webauthn.is_login_enabled()
        and panel_webauthn.is_available()
        and panel_security.is_method_configured(admin_id, SECURITY_PASSKEY)
    ):
        add('passkey')

    if (
        panel_telegram_auth.is_login_enabled()
        and panel_security.is_method_configured(admin_id, SECURITY_TELEGRAM)
    ):
        add('telegram')

    if not methods:
        if not blocked:
            add('password')
        elif effective == SECURITY_PASSKEY and panel_webauthn.is_login_enabled():
            add('passkey')
        elif effective == SECURITY_TELEGRAM and panel_telegram_auth.is_login_enabled():
            add('telegram')

    return methods


def _avatar_for_admin(admin_id: int, is_superadmin: bool) -> dict[str, str]:
    idx = int(admin_id) % len(AVATAR_PALETTE)
    color, icon = AVATAR_PALETTE[idx]
    if is_superadmin:
        color, icon = AVATAR_PALETTE[0]
    return {'color': color, 'icon': icon}


def list_public_login_accounts() -> list[dict[str, Any]]:
    admins = [a for a in panel_access.list_admins() if a.get('is_active')]
    role_totals: dict[str, int] = {}
    for admin in admins:
        role = (admin.get('role_name') or 'Администратор').strip()
        role_totals[role] = role_totals.get(role, 0) + 1

    role_seen: dict[str, int] = {}
    out: list[dict[str, Any]] = []
    for admin in sorted(admins, key=lambda a: (a.get('role_name') or '', a.get('id') or 0)):
        methods = resolve_login_methods(int(admin['id']))
        if not methods:
            continue
        role = (admin.get('role_name') or 'Администратор').strip()
        role_seen[role] = role_seen.get(role, 0) + 1
        idx = role_seen[role]
        label = role if role_totals.get(role, 0) <= 1 else f'{role} · {idx}'
        avatar = _avatar_for_admin(int(admin['id']), bool(admin.get('is_superadmin')))
        out.append({
            'ref': encode_account_ref(int(admin['id'])),
            'label': label,
            'role': role,
            'methods': methods,
            'avatar': avatar,
        })
    return out


def resolve_account_login(admin_id: int, account_ref: str | None) -> tuple[int | None, str]:
    """Ensure optional account_ref matches admin_id when provided."""
    if not account_ref:
        return admin_id, ''
    expected = decode_account_ref(account_ref)
    if expected is None:
        return None, 'Недействительная учётная запись'
    if expected != admin_id:
        return None, 'Метод входа не соответствует выбранной учётной записи'
    return admin_id, ''
