from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.dialect import sql_order_datetime
from shop_bot.data_manager.db.connection import (
    get_msk_time,
    _now_str,
    _to_datetime_str,
    _normalize_email,
    _normalize_key_row,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _exec_with_check,
    _get_count_stat,
    _check_rowcount,
    normalize_host_name,
)


# ===== DELETE_KEY_BY_ID =====
# Удаление ключа по key_id
def delete_key_by_id(key_id: int) -> bool:
    return _check_rowcount(_exec("DELETE FROM vpn_keys WHERE key_id = ?", (key_id,), f"Не удалось удалить ключ по id {key_id}"), f"ключ {key_id}", "")

# ============================


# ===== UPDATE_KEY_COMMENT =====
# Обновление комментария (description) для ключа
def update_key_comment(key_id: int, comment: str) -> bool:
    return _check_rowcount(_exec("UPDATE vpn_keys SET description = ? WHERE key_id = ?", (comment, key_id), f"Не удалось обновить комментарий ключа для {key_id}"), f"ключ {key_id}", "")

# =======================

# ===== GET_ALL_KEYS =====
# Получение всех ключей из БД с нормализацией
def get_all_keys() -> list[dict]:
    rows = _fetch_list("SELECT * FROM vpn_keys ORDER BY key_id DESC", (), "Не удалось получить все ключи")
    return [_normalize_key_row(row) for row in rows]

# =========================


# ===== GET_KEYS_FOR_USER =====
def get_keys_for_user(user_id: int) -> list[dict]:
    return get_user_keys(user_id)


# =============================


# ===== UPDATE_KEY_EMAIL =====
def update_key_email(key_id: int, new_email: str) -> bool:
    normalized = _normalize_email(new_email) or new_email.strip()
    return update_key_fields(key_id, email=normalized)


# ============================


# ===== UPDATE_KEY_HOST =====
def update_key_host(key_id: int, new_host_name: str) -> bool:
    return update_key_fields(key_id, host_name=new_host_name)


# ===========================


# ===== CREATE_GIFT_KEY =====
def create_gift_key(user_id: int, host_name: str, key_email: str, months: int, remnawave_user_uuid: str | None = None) -> int | None:
    try:
        from datetime import timedelta

        months_value = max(1, int(months or 1))
        expiry_dt = get_msk_time() + timedelta(days=30 * months_value)
        expiry_ms = int(expiry_dt.timestamp() * 1000)
        uuid_value = remnawave_user_uuid or f"GIFT-{user_id}-{int(get_msk_time().timestamp())}"
        return add_new_key(
            user_id=user_id,
            host_name=host_name,
            remnawave_user_uuid=uuid_value,
            key_email=key_email,
            expiry_timestamp_ms=expiry_ms,
        )
    except Exception as e:
        logging.error(f"Не удалось создать подарочный ключ для пользователя {user_id}: {e}")
        return None

# ========================


# ===== GET_TOTAL_KEYS_COUNT =====
def get_total_keys_count() -> int:
    row = _fetch_row("SELECT COUNT(*) as c FROM vpn_keys", (), "Не удалось получить кол-во ключей")
    return row["c"] if row else 0

# ========================


# ===== ADD_NEW_KEY =====
def add_new_key(
    user_id: int,
    host_name: str | None,
    remnawave_user_uuid: str,
    key_email: str,
    expiry_timestamp_ms: int,
    *,
    squad_uuid: str | None = None,
    short_uuid: str | None = None,
    subscription_url: str | None = None,
    traffic_limit_bytes: int | None = None,
    traffic_limit_strategy: str | None = None,
    description: str | None = None,
    tag: str | None = None,
    comment_key: str | None = None,
    created_at_ms: int | None = None,
) -> int | None:
    host_name_norm = normalize_host_name(host_name) if host_name else None
    email_normalized = _normalize_email(key_email) or key_email.strip()
    expire_str = _to_datetime_str(expiry_timestamp_ms) or _now_str()
    created_str = _to_datetime_str(created_at_ms) or _now_str() if created_at_ms is not None else _now_str()
    strategy_value = traffic_limit_strategy or "NO_RESET"
    
    cursor = _exec(
        """
        INSERT INTO vpn_keys (
            user_id, host_name, squad_uuid, remnawave_user_uuid, short_uuid, email, key_email,
            subscription_url, expire_at, created_at, updated_at, traffic_limit_bytes,
            traffic_limit_strategy, tag, description, comment_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id, host_name_norm, squad_uuid, remnawave_user_uuid, short_uuid, email_normalized,
            email_normalized, subscription_url, expire_str, created_str, created_str,
            traffic_limit_bytes, strategy_value, tag, description, comment_key
        ),
        f"Не удалось добавить новый ключ для пользователя {user_id}"
    )
    return cursor.lastrowid if cursor else None

# =======================


# ===== _APPLY_KEY_UPDATES =====
def _apply_key_updates(key_id: int, updates: dict[str, Any]) -> bool:
    if not updates: return False
    updates = dict(updates)
    updates["updated_at"] = _now_str()
    columns = ", ".join(f"{column} = ?" for column in updates)
    values = list(updates.values())
    values.append(key_id)
    cursor = _exec(
        f"UPDATE vpn_keys SET {columns} WHERE key_id = ?",
        tuple(values),
        f"Не удалось обновить ключ {key_id}",
    )
    return cursor is not None and cursor.rowcount > 0

# ==============================


# ===== UPDATE_KEY_FIELDS =====
def update_key_fields(
    key_id: int,
    *,
    user_id: int | None = None,
    host_name: str | None = None,
    squad_uuid: str | None = None,
    remnawave_user_uuid: str | None = None,
    short_uuid: str | None = None,
    email: str | None = None,
    subscription_url: str | None = None,
    expire_at_ms: int | None = None,
    traffic_limit_bytes: int | None = None,
    traffic_limit_strategy: str | None = None,
    tag: str | None = None,
    description: str | None = None,
    comment_key: str | None = None,
) -> bool:
    updates: dict[str, Any] = {}
    if user_id is not None:
        updates["user_id"] = user_id
    if host_name is not None:
        updates["host_name"] = normalize_host_name(host_name)
    if squad_uuid is not None:
        updates["squad_uuid"] = squad_uuid
    if remnawave_user_uuid is not None:
        updates["remnawave_user_uuid"] = remnawave_user_uuid
    if short_uuid is not None:
        updates["short_uuid"] = short_uuid
    if email is not None:
        normalized = _normalize_email(email) or email.strip()
        updates["email"] = normalized
        updates["key_email"] = normalized
    if subscription_url is not None:
        updates["subscription_url"] = subscription_url
    if expire_at_ms is not None:
        expire_str = _to_datetime_str(expire_at_ms) or _now_str()
        updates["expire_at"] = expire_str
    if traffic_limit_bytes is not None:
        updates["traffic_limit_bytes"] = traffic_limit_bytes
    if traffic_limit_strategy is not None:
        updates["traffic_limit_strategy"] = traffic_limit_strategy or "NO_RESET"
    if tag is not None:
        updates["tag"] = tag
    if description is not None:
        updates["description"] = description
    if comment_key is not None:
        updates["comment_key"] = comment_key
    return _apply_key_updates(key_id, updates)

# ===========================


# ===== DELETE_KEY_BY_EMAIL =====
def delete_key_by_email(email: str) -> bool:
    lookup = _normalize_email(email) or email.strip()
    cursor = _exec(
        "DELETE FROM vpn_keys WHERE email = ? OR key_email = ?",
        (lookup, lookup),
        "Не удалось удалить ключ"
    )
    if cursor: logger.debug("delete_key_by_email('%s') affected=%s", email, cursor.rowcount); return cursor.rowcount > 0
    return False

# ===========================


# ===== GET_USER_KEYS =====
def get_user_keys(user_id: int) -> list[dict]:
    rows = _fetch_list(
        f"SELECT * FROM vpn_keys WHERE user_id = ? ORDER BY {sql_order_datetime('created_at')} DESC, key_id DESC",
        (user_id,),
        f"Не удалось получить ключи для пользователя {user_id}"
    )
    return [_normalize_key_row(row) for row in rows]

# ===========================


# ===== GET_KEY_BY_ID =====
def get_key_by_id(key_id: int) -> dict | None:
    row = _fetch_row(
        "SELECT * FROM vpn_keys WHERE key_id = ?",
        (key_id,),
        f"Не удалось получить ключ по ID {key_id}"
    )
    return _normalize_key_row(row)

# =========================


# ===== GET_KEY_BY_EMAIL =====
def get_key_by_email(key_email: str) -> dict | None:
    lookup = _normalize_email(key_email) or key_email.strip()
    row = _fetch_row(
        "SELECT * FROM vpn_keys WHERE email = ? OR key_email = ?",
        (lookup, lookup),
        f"Не удалось получить ключ по email {key_email}"
    )
    return _normalize_key_row(row)

# =================================


# ===== GET_KEY_BY_REMNAWAVE_UUID =====
def get_key_by_remnawave_uuid(remnawave_uuid: str) -> dict | None:
    if not remnawave_uuid: return None
    normalized_uuid = remnawave_uuid.strip()
    row = _fetch_row(
        "SELECT * FROM vpn_keys WHERE remnawave_user_uuid = ? LIMIT 1",
        (normalized_uuid,),
        f"Не удалось получить ключ по remnawave uuid {remnawave_uuid}"
    )
    return _normalize_key_row(row)

# ===========================


# ===== UPDATE_KEY_INFO =====
def update_key_info(key_id: int, new_remnawave_uuid: str, new_expiry_ms: int, **kwargs) -> bool:
    return update_key_fields(
        key_id,
        remnawave_user_uuid=new_remnawave_uuid,
        expire_at_ms=new_expiry_ms,
        **kwargs,
    )



# ===== UPDATE_KEY_HOST_AND_INFO =====
def update_key_host_and_info(
    key_id: int,
    new_host_name: str,
    new_remnawave_uuid: str,
    new_expiry_ms: int,
    **kwargs,
) -> bool:
    return update_key_fields(
        key_id,
        host_name=new_host_name,
        remnawave_user_uuid=new_remnawave_uuid,
        expire_at_ms=new_expiry_ms,
        **kwargs,
    )



# ===== GET_NEXT_KEY_NUMBER =====
def get_next_key_number(user_id: int) -> int:
    count = _fetch_val("SELECT COUNT(*) FROM vpn_keys WHERE user_id = ?", (user_id,), 0)
    return int(count) + 1

# ===========================


# ===== GET_KEYS_FOR_HOST =====
def get_keys_for_host(host_name: str) -> list[dict]:
    host_name_normalized = normalize_host_name(host_name)
    rows = _fetch_list(
        "SELECT * FROM vpn_keys WHERE TRIM(host_name) = TRIM(?)",
        (host_name_normalized,),
        f"Не удалось получить ключи для хоста '{host_name}'"
    )
    return [_normalize_key_row(row) for row in rows]

# =============================


# ===== GET_ALL_VPN_USERS =====
def get_all_vpn_users() -> list[dict]:
    return _fetch_list("SELECT DISTINCT user_id FROM vpn_keys", (), "Не удалось получить всех VPN пользователей")

# ===========================


# ===== UPDATE_KEY_STATUS_FROM_SERVER =====
def update_key_status_from_server(key_email: str, client_data) -> bool:
    try:
        normalized_email = _normalize_email(key_email) or key_email.strip()
        existing = get_key_by_email(normalized_email)
        if client_data:
            if isinstance(client_data, dict):
                remote_uuid = client_data.get('uuid') or client_data.get('id')
                expire_value = client_data.get('expireAt') or client_data.get('expiryDate')
                subscription_url = client_data.get('subscriptionUrl') or client_data.get('subscription_url')
                expiry_ms = None
                if expire_value:
                    try:
                        remote_dt = datetime.fromisoformat(str(expire_value).replace('Z', '+00:00'))
                        expiry_ms = int(remote_dt.timestamp() * 1000)
                    except Exception: expiry_ms = None
            else:
                remote_uuid = getattr(client_data, 'id', None) or getattr(client_data, 'uuid', None)
                expiry_ms = getattr(client_data, 'expiry_time', None)
                subscription_url = getattr(client_data, 'subscription_url', None)
            if not existing: return False
            return update_key_fields(
                existing['key_id'],
                remnawave_user_uuid=remote_uuid,
                expire_at_ms=expiry_ms,
                subscription_url=subscription_url,
            )
        if existing: return delete_key_by_email(normalized_email)
        return True
    except Exception as e: logging.error("Не удалось обновить статус ключа для %s: %s", key_email, e); return False

