"""TOTP two-factor authentication for panel administrators."""

from __future__ import annotations

import logging
from typing import Any

import os

import pyotp

from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import table_exists
from shop_bot.data_manager.secrets_vault import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)


def require_totp_globally() -> bool:
    return os.getenv("SHOPBOT_REQUIRE_TOTP", "0") == "1"


def _connect():
    return get_db_connection()


def ensure_totp_schema(cursor: Any) -> None:
    if not table_exists(cursor, "panel_admins"):
        return
    from shop_bot.data_manager.database import _ensure_table_column

    _ensure_table_column(cursor, "panel_admins", "totp_secret", "TEXT")
    _ensure_table_column(cursor, "panel_admins", "totp_enabled", "INTEGER NOT NULL DEFAULT 0")


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, login: str, issuer: str = "Remnawave ShopBot") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=login, issuer_name=issuer)


def verify_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    normalized = (code or "").strip().replace(" ", "")
    if not normalized.isdigit() or len(normalized) != 6:
        return False
    try:
        return pyotp.TOTP(secret).verify(normalized, valid_window=1)
    except Exception as exc:
        logger.warning("TOTP verify error: %s", exc)
        return False


def _load_secret(admin_id: int) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT totp_secret FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
    if not row or not row["totp_secret"]:
        return None
    return decrypt_secret(row["totp_secret"]) or None


def is_enabled(admin_id: int) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT totp_enabled, totp_secret FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
    if not row:
        return False
    return bool(row["totp_enabled"]) and bool(row["totp_secret"])


def store_pending_secret(admin_id: int, secret: str) -> None:
    encrypted = encrypt_secret(secret)
    with _connect() as conn:
        conn.execute(
            """
            UPDATE panel_admins
            SET totp_secret = ?, totp_enabled = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (encrypted, admin_id),
        )
        conn.commit()


def enable_totp(admin_id: int, code: str) -> tuple[bool, str]:
    secret = _load_secret(admin_id)
    if not secret:
        return False, "Сначала начните настройку 2FA"
    if not verify_code(secret, code):
        return False, "Неверный код подтверждения"
    with _connect() as conn:
        conn.execute(
            """
            UPDATE panel_admins
            SET totp_enabled = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (admin_id,),
        )
        conn.commit()
    return True, "Двухфакторная аутентификация включена"


def disable_totp(admin_id: int, code: str) -> tuple[bool, str]:
    from shop_bot.data_manager.panel_security import can_disable_totp

    ok, message = can_disable_totp(admin_id)
    if not ok:
        return False, message
    secret = _load_secret(admin_id)
    if not secret or not verify_code(secret, code):
        return False, "Неверный код"
    with _connect() as conn:
        conn.execute(
            """
            UPDATE panel_admins
            SET totp_secret = NULL, totp_enabled = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (admin_id,),
        )
        conn.commit()
    return True, "2FA отключена"


def verify_admin_totp(admin_id: int, code: str) -> bool:
    if not is_enabled(admin_id):
        return True
    secret = _load_secret(admin_id)
    return verify_code(secret or "", code)


def totp_status(admin_id: int) -> dict[str, Any]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT totp_enabled, totp_secret FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
    if not row:
        return {"enabled": False, "pending_setup": False}
    has_secret = bool(row["totp_secret"])
    enabled = bool(row["totp_enabled"]) and has_secret
    return {
        "enabled": enabled,
        "pending_setup": has_secret and not enabled,
    }


def get_setup_uri(admin_id: int, login: str, issuer: str = "Remnawave ShopBot") -> str | None:
    secret = get_setup_secret(admin_id)
    if not secret:
        return None
    return provisioning_uri(secret, login, issuer)


def get_setup_secret(admin_id: int) -> str | None:
    """Секрет для ручного ввода — только пока TOTP ожидает подтверждения."""
    status = totp_status(admin_id)
    if not status.get("pending_setup"):
        return None
    return _load_secret(admin_id)


def format_secret_for_display(secret: str) -> str:
    normalized = (secret or "").replace(" ", "").upper()
    if not normalized:
        return ""
    return " ".join(normalized[i : i + 4] for i in range(0, len(normalized), 4))


def cancel_setup(admin_id: int) -> None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT totp_enabled FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
        if row and not row["totp_enabled"]:
            conn.execute(
                """
                UPDATE panel_admins
                SET totp_secret = NULL, totp_enabled = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (admin_id,),
            )
            conn.commit()

