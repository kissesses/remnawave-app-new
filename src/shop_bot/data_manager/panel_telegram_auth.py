"""Telegram Login Widget verification for panel administrators."""

from __future__ import annotations

import hashlib
import hmac
import logging
import sqlite3
import time
from typing import Any

from shop_bot.data_manager.database import DB_FILE, _ensure_table_column, get_db_connection
from shop_bot.data_manager.db.dialect import table_exists
from shop_bot.data_manager.remnawave_repository import get_setting

logger = logging.getLogger(__name__)

MAX_AUTH_AGE_SEC = 86400

# Fields signed by Telegram Login Widget (https://core.telegram.org/widgets/login)
TELEGRAM_LOGIN_FIELDS = frozenset({
    "id",
    "first_name",
    "last_name",
    "username",
    "photo_url",
    "auth_date",
})


def extract_telegram_auth_payload(data: dict[str, Any]) -> dict[str, str]:
    """Keep only Telegram widget fields (ignore csrf_token, remember_me, etc.)."""
    out: dict[str, str] = {}
    for key in TELEGRAM_LOGIN_FIELDS:
        if key not in data:
            continue
        value = data[key]
        if value is None:
            continue
        text = str(value).strip()
        if text:
            out[key] = text
    return out


def _connect():
    return get_db_connection()


def ensure_telegram_auth_schema(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "panel_admins"):
        return
    _ensure_table_column(cursor, "panel_admins", "telegram_user_id", "INTEGER")
    _ensure_table_column(cursor, "panel_admins", "telegram_username", "TEXT")
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_admins_telegram_user_id
        ON panel_admins(telegram_user_id)
        WHERE telegram_user_id IS NOT NULL
        """
    )


def is_login_enabled() -> bool:
    return (get_setting("telegram_login_enabled") or "0") == "1"


def verify_telegram_login(data: dict[str, Any], *, bot_token: str | None = None) -> tuple[bool, str]:
    """Verify Telegram Login Widget payload (https://core.telegram.org/widgets/login)."""
    token = (bot_token or get_setting("telegram_bot_token") or "").strip()
    if not token:
        return False, "Telegram bot token не настроен"

    payload = extract_telegram_auth_payload(data)
    received_hash = (data.get("hash") or "").strip()
    if not received_hash:
        return False, "Отсутствует hash"

    try:
        auth_date = int(payload.get("auth_date", 0))
    except (TypeError, ValueError):
        return False, "Некорректная дата авторизации"

    if auth_date <= 0 or time.time() - auth_date > MAX_AUTH_AGE_SEC:
        return False, "Данные авторизации устарели"

    try:
        telegram_id = int(payload.get("id", 0))
    except (TypeError, ValueError):
        return False, "Некорректный Telegram ID"

    if telegram_id <= 0:
        return False, "Некорректный Telegram ID"

    data_check_string = "\n".join(f"{k}={payload[k]}" for k in sorted(payload.keys()))
    secret_key = hashlib.sha256(token.encode()).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        logger.warning(
            "Telegram auth signature mismatch (fields=%s, bot_username_setting=%s)",
            sorted(payload.keys()),
            (get_setting("telegram_bot_username") or "").strip(),
        )
        return False, "Неверная подпись Telegram"

    return True, ""


def parse_telegram_user(data: dict[str, Any]) -> dict[str, Any]:
    payload = extract_telegram_auth_payload(data)
    username = (payload.get("username") or data.get("username") or "").strip().lstrip("@") or None
    first_name = (payload.get("first_name") or data.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or data.get("last_name") or "").strip()
    display = " ".join(p for p in (first_name, last_name) if p).strip() or username or str(payload.get("id") or data.get("id"))
    return {
        "telegram_user_id": int(payload.get("id") or data.get("id")),
        "telegram_username": username,
        "display_name": display,
    }


def link_telegram_to_admin(admin_id: int, data: dict[str, Any]) -> tuple[bool, str]:
    ok, message = verify_telegram_login(data)
    if not ok:
        return False, message

    user = parse_telegram_user(data)
    tg_id = user["telegram_user_id"]

    with _connect() as conn:
        existing = conn.execute(
            "SELECT id, login FROM panel_admins WHERE telegram_user_id = ? AND id != ?",
            (tg_id, admin_id),
        ).fetchone()
        if existing:
            return False, f"Этот Telegram уже привязан к «{existing['login']}»"

        row = conn.execute("SELECT id FROM panel_admins WHERE id = ?", (admin_id,)).fetchone()
        if not row:
            return False, "Администратор не найден"

        conn.execute(
            """
            UPDATE panel_admins
            SET telegram_user_id = ?, telegram_username = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (tg_id, user["telegram_username"], admin_id),
        )
        conn.commit()
    return True, "Telegram привязан"


def unlink_telegram_from_admin(admin_id: int) -> tuple[bool, str]:
    from shop_bot.data_manager.panel_security import can_unlink_telegram

    ok, message = can_unlink_telegram(admin_id)
    if not ok:
        return False, message

    with _connect() as conn:
        row = conn.execute(
            "SELECT telegram_user_id FROM panel_admins WHERE id = ?",
            (admin_id,),
        ).fetchone()
        if not row:
            return False, "Администратор не найден"
        if not row["telegram_user_id"]:
            return False, "Telegram не привязан"
        conn.execute(
            """
            UPDATE panel_admins
            SET telegram_user_id = NULL, telegram_username = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (admin_id,),
        )
        conn.commit()
    return True, "Telegram отвязан"
