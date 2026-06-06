from __future__ import annotations

import logging
import os
import re
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Mapping

from shop_bot.data_manager.db.dialect import (
    DATABASE_URL,
    adapt_sql,
    is_postgresql,
)

logger = logging.getLogger(__name__)


def get_data_dir() -> Path:
    """Directory for panel secrets and local data (PostgreSQL lives in Docker volume)."""
    custom = os.environ.get("SHOPBOT_DATA_DIR")
    if custom:
        return Path(custom)
    return Path.cwd() / "data"


# Legacy import alias; SQLite users.db is no longer used at runtime.
DB_FILE = get_data_dir() / "users.db"

_INSERT_PK: dict[str, str] = {
    "vpn_keys": "key_id",
    "button_configs": "id",
    "transactions": "transaction_id",
    "support_tickets": "ticket_id",
    "support_messages": "message_id",
    "seller_users": "id_seller",
    "host_speedtests": "id",
    "resource_metrics": "id",
    "device_tiers": "tier_id",
    "gift_token_claims": "claim_id",
    "promo_code_usages": "usage_id",
    "broadcast_deliveries": "id",
    "panel_roles": "id",
    "panel_admins": "id",
    "panel_webauthn_credentials": "id",
    "panel_audit_log": "id",
}


def get_msk_time() -> datetime:
    return datetime.now(timezone(timedelta(hours=3)))


def _now_str() -> str:
    return get_msk_time().strftime("%Y-%m-%d %H:%M:%S")


def _to_datetime_str(ts_ms: int | None) -> str | None:
    if ts_ms is None:
        return None
    try:
        dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone(get_msk_time().tzinfo)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _require_postgresql() -> None:
    if not is_postgresql():
        raise RuntimeError(
            "PostgreSQL обязателен: задайте SHOPBOT_DATABASE_URL или DATABASE_URL "
            "(например postgresql://user:pass@postgres:5432/shopbot)"
        )


def _normalize_row(row: Mapping[str, Any] | dict | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    for key, value in data.items():
        if isinstance(value, datetime):
            data[key] = value.strftime("%Y-%m-%d %H:%M:%S")
        elif isinstance(value, date):
            data[key] = value.isoformat()
    return data


def _normalize_key_row(row: Mapping[str, Any] | dict | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    email = _normalize_email(data.get("email") or data.get("key_email"))
    if email:
        data["email"] = email
        data["key_email"] = email
    rem_uuid = data.get("remnawave_user_uuid") or data.get("xui_client_uuid")
    if rem_uuid:
        data["remnawave_user_uuid"] = rem_uuid
        data["xui_client_uuid"] = rem_uuid
    expire_value = data.get("expire_at") or data.get("expiry_date")
    if expire_value:
        expire_str = (
            expire_value.strftime("%Y-%m-%d %H:%M:%S")
            if isinstance(expire_value, datetime)
            else str(expire_value)
        )
        data["expire_at"] = expire_str
        data["expiry_date"] = expire_str
    created_value = data.get("created_at") or data.get("created_date")
    if created_value:
        created_str = (
            created_value.strftime("%Y-%m-%d %H:%M:%S")
            if isinstance(created_value, datetime)
            else str(created_value)
        )
        data["created_at"] = created_str
        data["created_date"] = created_str
    subscription_url = data.get("subscription_url") or data.get("connection_string")
    if subscription_url:
        data["subscription_url"] = subscription_url
        data.setdefault("connection_string", subscription_url)
    return data


def normalize_host_name(name: str | None) -> str:
    s = (name or "").strip()
    for ch in ("\u00A0", "\u200B", "\u200C", "\u200D", "\uFEFF"):
        s = s.replace(ch, "")
    return s


def get_db_connection():
    _require_postgresql()
    import psycopg
    from psycopg.rows import dict_row

    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    return _AdaptConnection(conn)


class _AdaptCursor:
    def __init__(self, cursor: Any):
        self._cursor = cursor

    def execute(self, sql: str, params: tuple | list = ()):
        return self._cursor.execute(adapt_sql(sql), params)

    def executemany(self, sql: str, params_seq):
        return self._cursor.executemany(adapt_sql(sql), params_seq)

    def fetchone(self):
        return _normalize_row(self._cursor.fetchone())

    def fetchall(self):
        return [_normalize_row(row) for row in self._cursor.fetchall()]

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def lastrowid(self):
        return getattr(self._cursor, "lastrowid", None)

    @property
    def description(self):
        return self._cursor.description

    def __enter__(self):
        self._cursor.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        return self._cursor.__exit__(exc_type, exc, tb)

    def __getattr__(self, name: str):
        return getattr(self._cursor, name)


class _AdaptConnection:
    def __init__(self, conn: Any):
        self._conn = conn

    def cursor(self):
        return _AdaptCursor(self._conn.cursor())

    def execute(self, sql: str, params: tuple | list = ()):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, params_seq):
        cur = self.cursor()
        return cur.executemany(sql, params_seq)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def __enter__(self):
        self._conn.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        return self._conn.__exit__(exc_type, exc, tb)

    def __getattr__(self, name: str):
        return getattr(self._conn, name)


class DbExecResult:
    def __init__(self, cursor: Any, lastrowid: int | None = None):
        self.lastrowid = lastrowid if lastrowid is not None else getattr(cursor, "lastrowid", None)
        self.rowcount = cursor.rowcount


def _pg_insert_returning(sql: str) -> str:
    upper = sql.upper()
    if "RETURNING" in upper or not upper.lstrip().startswith("INSERT"):
        return sql
    match = re.search(r"INSERT INTO\s+(\w+)", sql, flags=re.IGNORECASE)
    if not match:
        return sql
    table = match.group(1)
    pk = _INSERT_PK.get(table)
    if not pk:
        return sql
    return sql.rstrip().rstrip(";") + f" RETURNING {pk}"


def _extract_lastrowid(cursor: Any) -> int | None:
    if cursor.description:
        row = cursor.fetchone()
        if row is not None:
            if isinstance(row, dict):
                return next(iter(row.values()), None)
            return row[0]
    return getattr(cursor, "lastrowid", None)


def _exec(sql: str, params: tuple | list = (), error_msg: str = "", commit: bool = True) -> DbExecResult | None:
    _require_postgresql()
    sql = adapt_sql(sql)
    try:
        import psycopg
        from psycopg.rows import dict_row

        exec_sql = _pg_insert_returning(sql)
        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            with conn.cursor() as cursor:
                cursor.execute(exec_sql, params)
                lastrowid = _extract_lastrowid(cursor)
                if commit:
                    conn.commit()
                return DbExecResult(cursor, lastrowid=lastrowid)
    except Exception as e:
        if error_msg:
            logging.error(f"{error_msg}: {e}")
        return None


def _fetch_row(sql: str, params: tuple | list = (), error_msg: str = "") -> dict | None:
    _require_postgresql()
    sql = adapt_sql(sql)
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                return _normalize_row(cursor.fetchone())
    except Exception as e:
        if error_msg:
            logging.error(f"{error_msg}: {e}")
        return None


def _fetch_list(sql: str, params: tuple | list = (), error_msg: str = "") -> list[dict]:
    _require_postgresql()
    sql = adapt_sql(sql)
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
            with conn.cursor() as cursor:
                cursor.execute(sql, params)
                return [_normalize_row(row) for row in cursor.fetchall()]
    except Exception as e:
        if error_msg:
            logging.error(f"{error_msg}: {e}")
        return []


def _fetch_val(sql: str, params: tuple | list = (), default: Any = None, error_msg: str = "") -> Any:
    row = _fetch_row(sql, params, error_msg)
    return list(row.values())[0] if row else default


def _check_rowcount(cursor, entity_name: str, context: str = "") -> bool:
    if cursor and cursor.rowcount == 0:
        msg = f"{context}: {entity_name} не найден" if context else f"{entity_name} не найден"
        logging.warning(msg)
        return False
    return cursor is not None


def _exec_with_check(sql: str, params: tuple | list, entity_name: str, error_msg: str = "", context: str = "") -> bool:
    row = _fetch_row(
        f"SELECT 1 FROM {entity_name.split()[0] if ' ' in entity_name else entity_name}",
        params[:1] if params else (),
        "",
    )
    if not row:
        if context:
            logging.warning(f"{context}: объект не найден")
        return False
    cursor = _exec(sql, params, error_msg)
    return cursor is not None


def _get_count_stat(query: str, default=0) -> int:
    r = _fetch_row(adapt_sql(query), (), "")
    return int(r["c"]) if r and "c" in r else (int(r["s"]) if r and "s" in r else default)


def backend_label() -> str:
    return "postgresql"
