"""One-time / limited admin invitation links for Access Studio."""

from __future__ import annotations

import hashlib
import logging
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import adapt_sql, is_postgresql
from shop_bot.data_manager import panel_access
from shop_bot.data_manager.secrets_vault import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

DEFAULT_EXPIRES_DAYS = 7
DEFAULT_MAX_USES = 1
MAX_EXPIRES_DAYS = 365
MAX_USES_LIMIT = 100
TOKEN_HASH_HEX_LEN = 64


def _connect():
    return get_db_connection()


def hash_invite_token(raw_token: str) -> str:
    return hashlib.sha256((raw_token or "").strip().encode("utf-8")).hexdigest()


def invite_token_prefix(raw_token: str) -> str:
    return (raw_token or "").strip()[:8]


def _is_token_hashed(value: str) -> bool:
    text = (value or "").strip().lower()
    return len(text) == TOKEN_HASH_HEX_LEN and all(c in "0123456789abcdef" for c in text)


def _migrate_plaintext_invite_tokens(cursor: sqlite3.Cursor) -> None:
    from shop_bot.data_manager.database import _ensure_table_column

    _ensure_table_column(cursor, "panel_admin_invites", "token_prefix", "TEXT DEFAULT ''")
    _ensure_table_column(cursor, "panel_admin_invites", "token_encrypted", "TEXT DEFAULT ''")
    cursor.execute("SELECT id, token, token_prefix FROM panel_admin_invites")
    rows = cursor.fetchall()
    for row in rows:
        data = dict(row)
        invite_id = int(data["id"])
        stored = (data.get("token") or "").strip()
        if not stored or _is_token_hashed(stored):
            continue
        prefix = (data.get("token_prefix") or "").strip() or stored[:8]
        cursor.execute(
            adapt_sql(
                "UPDATE panel_admin_invites SET token = ?, token_prefix = ? WHERE id = ?"
            ),
            (hash_invite_token(stored), prefix, invite_id),
        )
        logger.info("Migrated invite id=%s to hashed token storage", invite_id)


def ensure_invites_schema(cursor: sqlite3.Cursor) -> None:
    if is_postgresql():
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS panel_admin_invites (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                token_prefix TEXT DEFAULT '',
                token_encrypted TEXT DEFAULT '',
                role_id INTEGER NOT NULL,
                created_by_admin_id INTEGER,
                created_by_login TEXT DEFAULT '',
                note TEXT DEFAULT '',
                email_hint TEXT DEFAULT '',
                expires_at TIMESTAMP NOT NULL,
                max_uses INTEGER NOT NULL DEFAULT 1,
                uses_count INTEGER NOT NULL DEFAULT 0,
                revoked_at TIMESTAMP,
                last_redeemed_at TIMESTAMP,
                last_redeemed_login TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(role_id) REFERENCES panel_roles(id)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_token ON panel_admin_invites(token)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_expires ON panel_admin_invites(expires_at)"
        )
        _migrate_plaintext_invite_tokens(cursor)
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS panel_admin_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            token_prefix TEXT DEFAULT '',
            token_encrypted TEXT DEFAULT '',
            role_id INTEGER NOT NULL,
            created_by_admin_id INTEGER,
            created_by_login TEXT DEFAULT '',
            note TEXT DEFAULT '',
            email_hint TEXT DEFAULT '',
            expires_at TIMESTAMP NOT NULL,
            max_uses INTEGER NOT NULL DEFAULT 1,
            uses_count INTEGER NOT NULL DEFAULT 0,
            revoked_at TIMESTAMP,
            last_redeemed_at TIMESTAMP,
            last_redeemed_login TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(role_id) REFERENCES panel_roles(id)
        )
        """
    )
    if not is_postgresql():
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_token ON panel_admin_invites(token)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_expires ON panel_admin_invites(expires_at)"
        )
    _migrate_plaintext_invite_tokens(cursor)


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                dt = datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
            except ValueError:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _invite_status(row: dict[str, Any], *, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if row.get("revoked_at"):
        return "revoked"
    expires = _parse_ts(row.get("expires_at"))
    if expires and expires <= now:
        return "expired"
    uses = int(row.get("uses_count") or 0)
    max_uses = int(row.get("max_uses") or 1)
    if uses >= max_uses:
        return "exhausted"
    return "active"


def _row_to_invite(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    data = dict(row)
    role_name = data.pop("role_name", None)
    is_superadmin = bool(data.pop("is_superadmin", 0))
    invite = {
        "id": int(data["id"]),
        "token_hash": (data.get("token") or "").strip(),
        "token_prefix": (data.get("token_prefix") or "").strip(),
        "token_encrypted": (data.get("token_encrypted") or "").strip(),
        "role_id": int(data["role_id"]),
        "role_name": role_name or "",
        "is_superadmin_role": is_superadmin,
        "created_by_admin_id": data.get("created_by_admin_id"),
        "created_by_login": data.get("created_by_login") or "",
        "note": data.get("note") or "",
        "email_hint": data.get("email_hint") or "",
        "expires_at": data.get("expires_at"),
        "max_uses": int(data.get("max_uses") or 1),
        "uses_count": int(data.get("uses_count") or 0),
        "revoked_at": data.get("revoked_at"),
        "last_redeemed_at": data.get("last_redeemed_at"),
        "last_redeemed_login": data.get("last_redeemed_login") or "",
        "created_at": data.get("created_at"),
    }
    invite["status"] = _invite_status(invite)
    invite["uses_left"] = max(0, invite["max_uses"] - invite["uses_count"])
    return invite


def _invite_url(raw_token: str, base_url: str) -> str:
    return f"{base_url.rstrip('/')}/invite/{raw_token.strip()}"


def decrypt_invite_token(invite: dict[str, Any] | None) -> str | None:
    if not invite:
        return None
    encrypted = (invite.get("token_encrypted") or "").strip()
    if not encrypted:
        return None
    raw = (decrypt_secret(encrypted) or "").strip()
    return raw or None


def get_invite_url(invite: dict[str, Any], *, base_url: str) -> str | None:
    if invite.get("status") != "active":
        return None
    raw = decrypt_invite_token(invite)
    if not raw:
        return None
    return _invite_url(raw, base_url)


def regenerate_invite_token(invite_id: int) -> tuple[bool, str, dict[str, Any] | None, str | None]:
    invite = get_invite_by_id(invite_id)
    if not invite:
        return False, "Приглашение не найдено", None, None
    if invite["status"] != "active":
        return False, "Нельзя обновить ссылку для неактивного приглашения", invite, None

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_invite_token(raw_token)
    prefix = invite_token_prefix(raw_token)
    token_encrypted = encrypt_secret(raw_token) or ""

    with _connect() as conn:
        conn.execute(
            adapt_sql(
                """
                UPDATE panel_admin_invites
                SET token = ?, token_prefix = ?, token_encrypted = ?
                WHERE id = ? AND revoked_at IS NULL
                """
            ),
            (token_hash, prefix, token_encrypted, int(invite_id)),
        )
        conn.commit()

    updated = get_invite_by_id(invite_id)
    if not updated or updated.get("status") != "active":
        return False, "Не удалось обновить ссылку", updated, None
    return True, "Ссылка обновлена", updated, raw_token


def sanitize_invite_for_api(
    invite: dict[str, Any],
    *,
    include_secrets: bool = False,
    raw_token: str | None = None,
    base_url: str = "",
    include_url: bool = False,
) -> dict[str, Any]:
    out = {k: v for k, v in invite.items() if k not in ("token_hash", "token_encrypted")}
    prefix = (out.get("token_prefix") or "").strip()
    if not prefix and raw_token:
        prefix = invite_token_prefix(raw_token)
    out["token_prefix"] = prefix
    if include_secrets and raw_token:
        out["token"] = raw_token.strip()
        if base_url:
            out["url"] = _invite_url(raw_token, base_url)
    elif include_url and base_url:
        url = get_invite_url(invite, base_url=base_url)
        if url:
            out["url"] = url
    else:
        out.pop("token", None)
        out.pop("url", None)
    return out


def _consume_invite_slot(raw_token: str, login: str) -> tuple[bool, str]:
    token_hash = hash_invite_token(raw_token)
    now_str = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            adapt_sql(
                """
                UPDATE panel_admin_invites AS i
                SET uses_count = uses_count + 1,
                    last_redeemed_at = ?,
                    last_redeemed_login = ?
                WHERE i.token = ?
                  AND i.revoked_at IS NULL
                  AND i.uses_count < i.max_uses
                  AND i.expires_at > ?
                  AND EXISTS (
                    SELECT 1 FROM panel_roles r
                    WHERE r.id = i.role_id AND r.is_superadmin = 0
                  )
                """
            ),
            (now_str, login.strip(), token_hash, now_str),
        )
        changed = int(cursor.rowcount or 0)
        conn.commit()
    if changed == 1:
        return True, ""
    _, err = get_public_invite(raw_token)
    return False, err or "Приглашение недействительно"


def _release_invite_slot(raw_token: str, login: str) -> None:
    token_hash = hash_invite_token(raw_token)
    login = (login or "").strip()
    if not raw_token.strip() or not login:
        return
    with _connect() as conn:
        conn.execute(
            adapt_sql(
                """
                UPDATE panel_admin_invites
                SET uses_count = CASE WHEN uses_count > 0 THEN uses_count - 1 ELSE 0 END,
                    last_redeemed_at = NULL,
                    last_redeemed_login = ''
                WHERE token = ?
                  AND last_redeemed_login = ?
                  AND uses_count > 0
                """
            ),
            (token_hash, login),
        )
        conn.commit()


def list_invites(*, include_inactive: bool = True) -> list[dict[str, Any]]:
    panel_access.ensure_panel_access_migrated()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT i.*, r.name AS role_name, r.is_superadmin
            FROM panel_admin_invites i
            JOIN panel_roles r ON r.id = i.role_id
            ORDER BY i.created_at DESC, i.id DESC
            """
        ).fetchall()
    invites = [_row_to_invite(row) for row in rows if row]
    if include_inactive:
        return [i for i in invites if i]
    return [i for i in invites if i and i["status"] == "active"]


def get_invite_by_id(invite_id: int) -> dict[str, Any] | None:
    panel_access.ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT i.*, r.name AS role_name, r.is_superadmin
            FROM panel_admin_invites i
            JOIN panel_roles r ON r.id = i.role_id
            WHERE i.id = ?
            """,
            (int(invite_id),),
        ).fetchone()
    return _row_to_invite(row)


def get_invite_by_token(raw_token: str) -> dict[str, Any] | None:
    raw_token = (raw_token or "").strip()
    if not raw_token:
        return None
    token_hash = hash_invite_token(raw_token)
    panel_access.ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT i.*, r.name AS role_name, r.is_superadmin
            FROM panel_admin_invites i
            JOIN panel_roles r ON r.id = i.role_id
            WHERE i.token = ?
            """,
            (token_hash,),
        ).fetchone()
    return _row_to_invite(row)


def get_public_invite(raw_token: str) -> tuple[dict[str, Any] | None, str | None]:
    invite = get_invite_by_token(raw_token)
    if not invite:
        return None, "Приглашение не найдено"
    if invite["status"] == "revoked":
        return None, "Приглашение отозвано"
    if invite["status"] == "expired":
        return None, "Срок действия приглашения истёк"
    if invite["status"] == "exhausted":
        return None, "Приглашение уже использовано"
    if invite.get("is_superadmin_role"):
        return None, "Приглашение недействительно"
    return invite, None


def create_invite(
    *,
    role_id: int,
    created_by_admin_id: int | None,
    created_by_login: str,
    note: str = "",
    email_hint: str = "",
    expires_days: int = DEFAULT_EXPIRES_DAYS,
    max_uses: int = DEFAULT_MAX_USES,
) -> tuple[bool, str, dict[str, Any] | None, str | None]:
    panel_access.ensure_panel_access_migrated()
    role = panel_access.get_role(role_id)
    if not role:
        return False, "Роль не найдена", None, None
    if role.get("is_superadmin"):
        return False, "Роль Superadmin нельзя выдать по приглашению", None, None

    expires_days = max(1, min(int(expires_days or DEFAULT_EXPIRES_DAYS), MAX_EXPIRES_DAYS))
    max_uses = max(1, min(int(max_uses or DEFAULT_MAX_USES), MAX_USES_LIMIT))
    note = (note or "").strip()[:500]
    email_hint = (email_hint or "").strip()[:200]

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_invite_token(raw_token)
    prefix = invite_token_prefix(raw_token)
    token_encrypted = encrypt_secret(raw_token) or ""
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)
    expires_str = expires_at.replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")

    insert_sql = adapt_sql(
        """
        INSERT INTO panel_admin_invites (
            token, token_prefix, token_encrypted, role_id, created_by_admin_id, created_by_login,
            note, email_hint, expires_at, max_uses
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
    )
    if is_postgresql():
        insert_sql = insert_sql.rstrip() + " RETURNING id"

    with _connect() as conn:
        cursor = conn.cursor()
        params = (
            token_hash,
            prefix,
            token_encrypted,
            role_id,
            created_by_admin_id,
            (created_by_login or "").strip(),
            note,
            email_hint,
            expires_str,
            max_uses,
        )
        cursor.execute(insert_sql, params)
        conn.commit()

    invite = get_invite_by_token(raw_token)
    return True, "Приглашение создано", invite, raw_token


def revoke_invite_by_id(invite_id: int) -> tuple[bool, str, dict[str, Any] | None]:
    invite = get_invite_by_id(invite_id)
    if not invite:
        return False, "Приглашение не найдено", None
    if invite["status"] == "revoked":
        return False, "Приглашение уже отозвано", invite

    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")
    with _connect() as conn:
        conn.execute(
            adapt_sql(
                "UPDATE panel_admin_invites SET revoked_at = ?, token_encrypted = '' WHERE id = ?"
            ),
            (now, int(invite_id)),
        )
        conn.commit()
    return True, "Приглашение отозвано", get_invite_by_id(invite_id)


def revoke_invite(raw_token: str) -> tuple[bool, str, dict[str, Any] | None]:
    invite = get_invite_by_token(raw_token)
    if not invite:
        return False, "Приглашение не найдено", None
    return revoke_invite_by_id(int(invite["id"]))


def redeem_invite(
    raw_token: str,
    *,
    login: str,
    password: str,
) -> tuple[bool, str, dict[str, Any] | None]:
    raw_token = (raw_token or "").strip()
    login = (login or "").strip()
    invite, err = get_public_invite(raw_token)
    if err or not invite:
        return False, err or "Приглашение недействительно", None

    if panel_access.get_admin_by_login(login):
        return False, "Логин уже занят", None

    ok_slot, slot_err = _consume_invite_slot(raw_token, login)
    if not ok_slot:
        return False, slot_err, None

    role = panel_access.get_role(int(invite["role_id"]))
    if not role or role.get("is_superadmin"):
        _release_invite_slot(raw_token, login)
        return False, "Приглашение недействительно", None

    try:
        ok, message = panel_access.save_admin(
            admin_id=None,
            login=login,
            password=password,
            role_id=int(invite["role_id"]),
            is_active=True,
            forbid_superadmin_role=True,
        )
    except Exception as exc:
        _release_invite_slot(raw_token, login)
        logger.warning("Invite redeem failed for login %s: %s", login, exc)
        err_text = str(exc).lower()
        if "unique" in err_text or "duplicate" in err_text:
            return False, "Логин уже занят", None
        return False, "Не удалось создать учётную запись", None

    if not ok:
        _release_invite_slot(raw_token, login)
        return False, message, None

    admin = panel_access.get_admin_by_login(login)
    updated = get_invite_by_token(raw_token)
    return True, "Учётная запись создана", {"admin": admin, "invite": updated}
