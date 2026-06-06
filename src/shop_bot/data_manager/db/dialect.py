"""SQL dialect helpers for SQLite and PostgreSQL."""

from __future__ import annotations

import os
import re
from typing import Any

DATABASE_URL = (os.getenv("SHOPBOT_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()


def is_postgresql() -> bool:
    return DATABASE_URL.startswith(("postgres://", "postgresql://"))


def is_sqlite() -> bool:
    return not is_postgresql()


def adapt_placeholders(sql: str) -> str:
    if is_sqlite():
        return sql
    return sql.replace("?", "%s")


def _escape_pg_percent_literals(sql: str) -> str:
    """Psycopg treats % as placeholder; double literal % outside %s/%b/%t."""
    if is_sqlite():
        return sql
    parts = re.split(r"(%[sbt])", sql)
    out: list[str] = []
    for part in parts:
        if part in ("%s", "%b", "%t"):
            out.append(part)
        else:
            out.append(part.replace("%", "%%"))
    return "".join(out)


_BOOL_COLS = (
    "is_banned",
    "is_pinned",
    "trial_used",
    "agreed_to_terms",
    "referral_start_bonus_received",
)


def _adapt_pg_booleans(sql: str) -> str:
    if is_sqlite():
        return sql
    text = sql
    for col in _BOOL_COLS:
        text = re.sub(
            rf"COALESCE\(\s*{col}\s*,\s*0\s*\)\s*=\s*1",
            f"(COALESCE({col}, false) IS TRUE)",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            rf"COALESCE\(\s*{col}\s*,\s*0\s*\)\s*=\s*0",
            f"(COALESCE({col}, false) IS NOT TRUE)",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            rf"NOT COALESCE\(\s*{col}\s*,\s*0\s*\)",
            f"NOT COALESCE({col}, false)",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            rf"COALESCE\(\s*{col}\s*,\s*0\s*\)",
            f"COALESCE({col}, false)",
            text,
            flags=re.IGNORECASE,
        )
        # SQLite uses 0/1 for booleans; PostgreSQL columns are BOOLEAN.
        text = re.sub(
            rf"\b{col}\s*=\s*(%s|\?)",
            f"{col} = ((\\1)::int <> 0)",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(rf"\b{col}\s*=\s*1\b", f"{col} = true", text, flags=re.IGNORECASE)
        text = re.sub(rf"\b{col}\s*=\s*0\b", f"{col} = false", text, flags=re.IGNORECASE)
    return text


# ON CONFLICT clauses for INSERT OR REPLACE / upsert patterns
_UPSERT_ON_CONFLICT: dict[str, str] = {
    "bot_settings": "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    "other": "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    "pending_transactions": (
        "ON CONFLICT (payment_id) DO UPDATE SET "
        "user_id = EXCLUDED.user_id, amount_rub = EXCLUDED.amount_rub, "
        "metadata = EXCLUDED.metadata, status = EXCLUDED.status, "
        "updated_at = EXCLUDED.updated_at"
    ),
    "button_configs": (
        "ON CONFLICT (menu_type, button_id) DO UPDATE SET "
        "text = EXCLUDED.text, callback_data = EXCLUDED.callback_data, "
        "url = EXCLUDED.url, row_position = EXCLUDED.row_position, "
        "column_position = EXCLUDED.column_position, button_width = EXCLUDED.button_width, "
        "is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order, "
        "metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at"
    ),
    "device_tiers": (
        "ON CONFLICT (host_name, device_count) DO UPDATE SET price = EXCLUDED.price"
    ),
    "seller_users": (
        "ON CONFLICT (user_id) DO UPDATE SET "
        "seller_sale = EXCLUDED.seller_sale, seller_ref = EXCLUDED.seller_ref, "
        "seller_uuid = EXCLUDED.seller_uuid"
    ),
    "broadcast_deliveries": (
        "ON CONFLICT (broadcast_id, telegram_id) DO UPDATE SET "
        "status = EXCLUDED.status, reason = EXCLUDED.reason, error_detail = EXCLUDED.error_detail"
    ),
}

_IGNORE_ON_CONFLICT: dict[str, str] = {
    "bot_settings": "ON CONFLICT (key) DO NOTHING",
    "other": "ON CONFLICT (key) DO NOTHING",
    "panel_roles": "ON CONFLICT (name) DO NOTHING",
    "webapp_settings": "ON CONFLICT (id) DO NOTHING",
}


def adapt_sql(sql: str) -> str:
    if is_sqlite():
        return sql

    text = adapt_placeholders(sql)
    upper = text.upper()

    if "INSERT OR REPLACE INTO" in upper:
        match = re.search(r"INSERT OR REPLACE INTO\s+(\w+)", text, flags=re.IGNORECASE)
        if match:
            table = match.group(1)
            on_conflict = _UPSERT_ON_CONFLICT.get(table)
            text = re.sub(r"INSERT OR REPLACE INTO", "INSERT INTO", text, count=1, flags=re.IGNORECASE)
            if on_conflict and on_conflict.upper() not in upper:
                text = text.rstrip().rstrip(";") + f" {on_conflict}"

    if "INSERT OR IGNORE INTO" in upper:
        match = re.search(r"INSERT OR IGNORE INTO\s+(\w+)", text, flags=re.IGNORECASE)
        if match:
            table = match.group(1)
            on_conflict = _IGNORE_ON_CONFLICT.get(table, "ON CONFLICT DO NOTHING")
            text = re.sub(r"INSERT OR IGNORE INTO", "INSERT INTO", text, count=1, flags=re.IGNORECASE)
            if " ON CONFLICT " not in text.upper():
                text = text.rstrip().rstrip(";") + f" {on_conflict}"

    text = re.sub(r"\bCOLLATE NOCASE\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"date\('now',\s*'\+3 hours'\)", msk_today_sql(), text, flags=re.IGNORECASE)
    text = re.sub(r"datetime\('now',\s*'\+3 hours'\)", msk_now_sql(), text, flags=re.IGNORECASE)
    text = re.sub(
        r"datetime\('now',\s*'\+3 hours',\s*(\?|\%s)\)",
        f"({msk_now_sql()} + %s)" if "%s" in text else f"({msk_now_sql()} + ?)",
        text,
        flags=re.IGNORECASE,
    )

    text = _adapt_pg_booleans(text)
    text = _escape_pg_percent_literals(text)
    # SQLite treats LIMIT -1 as unlimited; PostgreSQL rejects negative limits.
    text = re.sub(r"\bLIMIT\s+-1\s+", "", text, flags=re.IGNORECASE)

    return text


def msk_now_sql() -> str:
    if is_sqlite():
        return "datetime('now', '+3 hours')"
    return "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '3 hours')"


def msk_today_sql() -> str:
    """Current calendar date in MSK (SQLite: date('now', '+3 hours'))."""
    if is_sqlite():
        return "date('now', '+3 hours')"
    return f"({msk_now_sql()})::date"


def sql_date_msk(column: str) -> str:
    """Date part of a datetime column for MSK-oriented comparisons."""
    col = column.strip()
    if is_sqlite():
        return f"date({col})"
    return f"({col}::timestamp)::date"


def sql_date_eq_msk_today(column: str) -> str:
    return f"{sql_date_msk(column)} = {msk_today_sql()}"


def sql_datetime(column: str) -> str:
    col = column.strip()
    if is_sqlite():
        return f"datetime({col})"
    return f"{col}::timestamp"


def sql_table_exists(table: str) -> tuple[str, tuple[Any, ...]]:
    if is_sqlite():
        return (
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        )
    return (
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = %s",
        (table,),
    )


def sql_table_columns(table: str) -> tuple[str, tuple[Any, ...]]:
    if is_sqlite():
        return (f"PRAGMA table_info({table})", ())
    return (
        """
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (table,),
    )


def sql_vacuum() -> str | None:
    if is_sqlite():
        return "VACUUM"
    return "VACUUM FULL"


def msk_time_filter() -> str:
    """Compare column against MSK now + interval modifier bound as ? (e.g. '-7 days')."""
    if is_sqlite():
        return "datetime('now', '+3 hours', ?)"
    return f"({msk_now_sql()} + (?::interval))"


def msk_now_compare(column: str, op: str = ">") -> str:
    """Active-key style: column op MSK now."""
    return f"{column} {op} {msk_now_sql()}"


def sql_strftime(fmt: str, column: str) -> str:
    if is_sqlite():
        return f"STRFTIME('{fmt}', {column})"
    pg_map = {
        "%Y-%m-%d": "YYYY-MM-DD",
        "%Y-%m-%d %H:00": 'YYYY-MM-DD HH24":00"',
    }
    pg_fmt = pg_map.get(fmt, "YYYY-MM-DD")
    return f"TO_CHAR({column}::timestamp, '{pg_fmt}')"


def sql_order_datetime(column: str) -> str:
    if is_sqlite():
        return f"datetime({column})"
    return column


def json_extract(column: str, path: str) -> str:
    key = path.lstrip("$.").split(".")[0]
    if is_sqlite():
        return f"json_extract({column}, '{path}')"
    return f"({column}::json->>'{key}')"


def json_valid(column: str) -> str:
    if is_sqlite():
        return f"json_valid({column})"
    return f"({column} IS NOT NULL AND {column} <> '' AND {column}::json IS NOT NULL)"


def table_exists(cursor: Any, table: str) -> bool:
    sql, params = sql_table_exists(table)
    cursor.execute(sql, params)
    return cursor.fetchone() is not None


def first_col(row: Any, default: Any = None) -> Any:
    if row is None:
        return default
    if isinstance(row, dict):
        return next(iter(row.values()), default)
    return row[0]


def row_cols(row: Any, *names: str) -> tuple[Any, ...]:
    if row is None:
        return tuple(None for _ in names)
    if isinstance(row, dict):
        return tuple(row[name] for name in names)
    return tuple(row[i] for i in range(len(names)))
