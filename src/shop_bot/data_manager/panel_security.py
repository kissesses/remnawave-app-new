"""Per-admin account security preferences (TOTP, Passkey, Telegram, or password only)."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

from shop_bot.data_manager.database import DB_FILE, _ensure_table_column, get_db_connection
from shop_bot.data_manager.db.dialect import is_postgresql, table_exists
from shop_bot.data_manager import panel_totp
from shop_bot.data_manager import panel_webauthn
from shop_bot.data_manager import panel_access

logger = logging.getLogger(__name__)

SECURITY_NONE = "none"
SECURITY_TOTP = "totp"
SECURITY_PASSKEY = "passkey"
SECURITY_TELEGRAM = "telegram"

VALID_SECURITY_METHODS = frozenset({
    SECURITY_NONE,
    SECURITY_TOTP,
    SECURITY_PASSKEY,
    SECURITY_TELEGRAM,
})

STRONG_SECURITY_METHODS = frozenset({
    SECURITY_TOTP,
    SECURITY_PASSKEY,
    SECURITY_TELEGRAM,
})

SECURITY_METHOD_LABELS: dict[str, str] = {
    SECURITY_NONE: "Только пароль",
    SECURITY_TOTP: "Приложение-аутентификатор (TOTP)",
    SECURITY_PASSKEY: "Passkey (Face ID / Touch ID / ключ)",
    SECURITY_TELEGRAM: "Вход через Telegram",
}

SECURITY_METHOD_DESCRIPTIONS: dict[str, str] = {
    SECURITY_NONE: "Базовый вход по паролю. Passkey и Telegram также доступны при входе, если настроены ниже.",
    SECURITY_TOTP: "После пароля потребуется 6-значный код из Google Authenticator или аналога.",
    SECURITY_PASSKEY: "Основной вход по Passkey; пароль отключён. Другие настроенные методы (Telegram) остаются доступны при входе.",
    SECURITY_TELEGRAM: "Основной вход через Telegram Login; пароль отключён. Другие настроенные методы (Passkey) остаются доступны при входе.",
}


def _connect():
    return get_db_connection()


def ensure_security_schema(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "panel_admins"):
        return
    _ensure_table_column(cursor, "panel_admins", "auth_security_method", f"TEXT NOT NULL DEFAULT '{SECURITY_NONE}'")
    if is_postgresql():
        return
    cursor.execute(
        """
        UPDATE panel_admins
        SET auth_security_method = ?
        WHERE totp_enabled = 1 AND (auth_security_method IS NULL OR auth_security_method = ? OR auth_security_method = '')
        """,
        (SECURITY_TOTP, SECURITY_NONE),
    )


def get_security_method(admin_id: int) -> str:
    with _connect() as conn:
        row = conn.execute(
            "SELECT auth_security_method FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
    if not row:
        return SECURITY_NONE
    method = (row["auth_security_method"] or SECURITY_NONE).strip().lower()
    return method if method in VALID_SECURITY_METHODS else SECURITY_NONE


def get_effective_security_method(admin_id: int) -> str:
    """SHOPBOT_REQUIRE_TOTP=1 requires a strong method (TOTP, Passkey, or Telegram)."""
    stored = get_security_method(admin_id)
    if panel_totp.require_totp_globally():
        if stored in STRONG_SECURITY_METHODS:
            return stored
        return SECURITY_TOTP
    return stored


def is_method_configured(admin_id: int, method: str | None = None) -> bool:
    method = method or get_effective_security_method(admin_id)
    if method == SECURITY_NONE:
        return True
    if method == SECURITY_TOTP:
        return panel_totp.is_enabled(admin_id)
    if method == SECURITY_PASSKEY:
        return bool(panel_webauthn.list_credentials(admin_id))
    if method == SECURITY_TELEGRAM:
        admin = panel_access.get_admin(admin_id)
        return bool(admin and admin.get("telegram_user_id"))
    return False


def needs_security_setup(admin_id: int) -> bool:
    method = get_effective_security_method(admin_id)
    return not is_method_configured(admin_id, method)


def requires_totp_on_login(admin_id: int, login_method: str) -> bool:
    if login_method in (SECURITY_PASSKEY, SECURITY_TELEGRAM):
        return False
    method = get_effective_security_method(admin_id)
    return method == SECURITY_TOTP and panel_totp.is_enabled(admin_id)


def blocks_password_login(admin_id: int) -> tuple[bool, str]:
    """When Passkey/Telegram is the account method, password-only login is not allowed."""
    method = get_effective_security_method(admin_id)
    if method == SECURITY_PASSKEY and is_method_configured(admin_id, SECURITY_PASSKEY):
        if panel_webauthn.is_available() and panel_webauthn.is_login_enabled():
            return True, "Для этого аккаунта настроен вход по Passkey. Используйте кнопку «Passkey» на странице входа."
    if method == SECURITY_TELEGRAM and is_method_configured(admin_id, SECURITY_TELEGRAM):
        from shop_bot.data_manager import panel_telegram_auth

        if panel_telegram_auth.is_login_enabled():
            return True, "Для этого аккаунта настроен вход через Telegram. Используйте кнопку «Telegram» на странице входа."
    return False, ""


def security_status(admin_id: int) -> dict[str, Any]:
    stored = get_security_method(admin_id)
    effective = get_effective_security_method(admin_id)
    configured = is_method_configured(admin_id, effective)
    return {
        "method": stored,
        "effective_method": effective,
        "configured": configured,
        "needs_setup": not configured,
        "forced_totp": panel_totp.require_totp_globally(),
        "forced_strong_auth": panel_totp.require_totp_globally(),
        "label": SECURITY_METHOD_LABELS.get(effective, SECURITY_METHOD_LABELS[SECURITY_NONE]),
    }


def set_security_method(admin_id: int, method: str) -> tuple[bool, str]:
    method = (method or SECURITY_NONE).strip().lower()
    if method not in VALID_SECURITY_METHODS:
        return False, "Неизвестный способ защиты"

    if method == SECURITY_PASSKEY and not panel_webauthn.is_available():
        return False, "Passkey недоступен: установите пакет webauthn"

    from shop_bot.data_manager import panel_telegram_auth

    if method == SECURITY_PASSKEY and not panel_webauthn.is_login_enabled():
        return False, "Включите вход по Passkey в разделе «Методы входа»"
    if method == SECURITY_TELEGRAM and not panel_telegram_auth.is_login_enabled():
        return False, "Включите вход через Telegram в разделе «Методы входа»"

    if panel_totp.require_totp_globally() and method == SECURITY_NONE:
        return False, (
            "Администратор сервера требует двухфакторную защиту (SHOPBOT_REQUIRE_TOTP=1). "
            "Выберите TOTP, Passkey или Telegram."
        )

    with _connect() as conn:
        row = conn.execute("SELECT id FROM panel_admins WHERE id = ?", (admin_id,)).fetchone()
        if not row:
            return False, "Администратор не найден"
        conn.execute(
            """
            UPDATE panel_admins
            SET auth_security_method = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (method, admin_id),
        )
        conn.commit()
    return True, "Способ защиты сохранён"


def can_unlink_telegram(admin_id: int) -> tuple[bool, str]:
    if get_effective_security_method(admin_id) == SECURITY_TELEGRAM:
        return False, "Сначала выберите другой способ защиты аккаунта"
    return True, ""


def can_delete_passkey(admin_id: int, *, remaining_count: int) -> tuple[bool, str]:
    if remaining_count > 0:
        return True, ""
    if get_effective_security_method(admin_id) == SECURITY_PASSKEY:
        return False, "Нельзя удалить последний Passkey — это ваш основной способ защиты"
    return True, ""


def can_disable_totp(admin_id: int) -> tuple[bool, str]:
    if panel_totp.require_totp_globally():
        return False, "2FA обязательна для всех (SHOPBOT_REQUIRE_TOTP=1)"
    if get_effective_security_method(admin_id) == SECURITY_TOTP:
        return False, "Сначала выберите другой способ защиты аккаунта"
    return True, ""
