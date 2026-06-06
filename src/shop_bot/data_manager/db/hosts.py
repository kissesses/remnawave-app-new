from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.dialect import sql_date_eq_msk_today, sql_order_datetime
from shop_bot.data_manager.db.connection import (
    get_db_connection,
    get_msk_time,
    _now_str,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _exec_with_check,
    _check_rowcount,
    normalize_host_name,
    _get_count_stat,
)



# ==============================


# ===== CREATE_HOST =====
def create_host(name: str, url: str, user: str, passwd: str, inbound: int, subscription_url: str | None = None):
    name = normalize_host_name(name)
    url = (url or "").strip()
    user = (user or "").strip()
    passwd = passwd or ""
    try:
        inbound = int(inbound)
    except Exception:
        pass
    subscription_url = (subscription_url or None)

    cursor = _exec(
         "INSERT INTO xui_hosts (host_name, host_url, host_username, host_pass, host_inbound_id, subscription_url) VALUES (?, ?, ?, ?, ?, ?)",
         (name, url, user, passwd, inbound, subscription_url),
         ""
    )
    if cursor:
        logging.info(f"Успешно создан новый хост: {name}")
        return

    cursor = _exec(
         "INSERT INTO xui_hosts (host_name, host_url, host_username, host_pass, host_inbound_id) VALUES (?, ?, ?, ?, ?)",
         (name, url, user, passwd, inbound),
         f"Ошибка при создании хоста '{name}'"
    )
    if cursor:
         logging.info(f"Успешно создан новый хост (fallback): {name}")


# =======================


# ===== UPDATE_HOST_SUBSCRIPTION_URL =====
def update_host_subscription_url(host_name: str, subscription_url: str | None) -> bool:
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET subscription_url = ? WHERE TRIM(host_name) = TRIM(?)",
        (subscription_url, host_name),
        f"Не удалось обновить subscription_url для хоста '{host_name}'"
    )
    return _check_rowcount(cursor, f"хост '{host_name}'", "update_host_subscription_url")

# ========================================

# ===== UPDATE_HOST_DESCRIPTION =====

# ===== UPDATE_HOST_DESCRIPTION =====
# Обновление описания хоста
def update_host_description(host_name: str, description: str | None) -> bool:
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET description = ? WHERE TRIM(host_name) = TRIM(?)",
        (description, host_name),
        f"Не удалось обновить описание для хоста '{host_name}'"
    )
    return _check_rowcount(cursor, f"хост '{host_name}'", "update_host_description")

# ===================================

# ===== UPDATE_HOST_TRAFFIC_SETTINGS =====

# ===== UPDATE_HOST_TRAFFIC_SETTINGS =====
# Обновление стратегии лимита трафика для хоста
# Default: 'NO_RESET'
def update_host_traffic_settings(host_name: str, traffic_strategy: str | None = 'NO_RESET') -> bool:
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET default_traffic_strategy = ? WHERE TRIM(host_name) = TRIM(?)",
        (traffic_strategy or 'NO_RESET', host_name),
        f"Не удалось обновить настройки трафика для хоста '{host_name}'"
    )
    return _check_rowcount(cursor, f"хост '{host_name}'", "update_host_traffic_settings")

# =============================================


# ===== UPDATE_HOST_URL =====
# Обновление URL хоста
def update_host_url(host_name: str, new_url: str) -> bool:
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET host_url = ? WHERE TRIM(host_name) = TRIM(?)",
        (new_url, host_name),
        f"Не удалось обновить URL для хоста '{host_name}'"
    )
    return _check_rowcount(cursor, f"хост '{host_name}'", "update_host_url")


# ==========================


# ===== UPDATE_HOST_REMNAWAVE_SETTINGS =====
def update_host_remnawave_settings(
    host_name: str,
    *,
    remnawave_base_url: str | None = None,
    remnawave_api_token: str | None = None,
    squad_uuid: str | None = None,
) -> bool:
    host_name_n = normalize_host_name(host_name)
    row = _fetch_row("SELECT 1 FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (host_name_n,), "")
    if not row:
        logging.warning(f"update_host_remnawave_settings: хост не найден '{host_name_n}'")
        return False

    sets: list[str] = []
    params: list[Any] = []
    if remnawave_base_url is not None:
        value = (remnawave_base_url or '').strip() or None
        sets.append("remnawave_base_url = ?")
        params.append(value)
    if remnawave_api_token is not None:
        from shop_bot.data_manager.secrets_vault import prepare_host_field_for_storage
        value = prepare_host_field_for_storage("remnawave_api_token", (remnawave_api_token or '').strip() or None)
        sets.append("remnawave_api_token = ?")
        params.append(value)
    if squad_uuid is not None:
        value = (squad_uuid or '').strip() or None
        sets.append("squad_uuid = ?")
        params.append(value)
    
    if not sets:
        return True
    
    params.append(host_name_n)
    sql = f"UPDATE xui_hosts SET {', '.join(sets)} WHERE TRIM(host_name) = TRIM(?)"
    cursor = _exec(sql, params, f"Не удалось обновить Remnawave-настройки для хоста '{host_name}'")
    return cursor is not None


# ========================================


# ===== UPDATE_HOST_SSH_SETTINGS =====
def update_host_ssh_settings(
    host_name: str,
    ssh_host: str | None = None,
    ssh_port: int | None = None,
    ssh_user: str | None = None,
    ssh_password: str | None = None,
    ssh_key_path: str | None = None,
) -> bool:
    host_name_n = normalize_host_name(host_name)
    row = _fetch_row("SELECT 1 FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (host_name_n,), "")
    if not row:
        logging.warning(f"update_host_ssh_settings: хост не найден '{host_name_n}'")
        return False

    cursor = _exec(
        """
        UPDATE xui_hosts
        SET ssh_host = ?, ssh_port = ?, ssh_user = ?, ssh_password = ?, ssh_key_path = ?
        WHERE TRIM(host_name) = TRIM(?)
        """,
        (
            (ssh_host or None),
            (int(ssh_port) if ssh_port is not None else None),
            (ssh_user or None),
            (ssh_password if ssh_password is not None else None),
            (ssh_key_path or None),
            host_name_n,
        ),
        f"Не удалось обновить SSH-параметры для хоста '{host_name}'"
    )
    return cursor is not None

# ====================================


# ===== UPDATE_HOST_NAME =====
def update_host_name(old_name: str, new_name: str) -> bool:
    old_n = normalize_host_name(old_name)
    new_n = normalize_host_name(new_name)
    if not old_n or not new_n:
        return False
    if old_n == new_n:
        return True

    row = _fetch_row("SELECT 1 FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (old_n,), "")
    if not row:
        logging.warning(f"update_host_name: исходный хост не найден '{old_n}'")
        return False

    row_new = _fetch_row("SELECT 1 FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (new_n,), "")
    if row_new:
        logging.warning(f"update_host_name: новое имя занято '{new_n}'")
        return False

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE xui_hosts SET host_name = ? WHERE TRIM(host_name) = TRIM(?)",
                (new_n, old_n)
            )
            cursor.execute(
                "UPDATE plans SET host_name = ? WHERE TRIM(host_name) = TRIM(?)",
                (new_n, old_n)
            )
            cursor.execute(
                "UPDATE vpn_keys SET host_name = ? WHERE TRIM(host_name) = TRIM(?)",
                (new_n, old_n)
            )
            cursor.execute(
                "UPDATE host_speedtests SET host_name = ? WHERE TRIM(host_name) = TRIM(?)",
                (new_n, old_n)
            )
            conn.commit()
            return True
    except Exception as e: logging.error(f"Не удалось переименовать хост '{old_name}' -> '{new_name}': {e}"); return False


# ===== DELETE_HOST =====
# Удаление хоста и всех связанных тарифов
def delete_host(host_name: str):
    try:
        host_name = normalize_host_name(host_name)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM plans WHERE TRIM(host_name) = TRIM(?)", (host_name,))
            cursor.execute("DELETE FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (host_name,))
            conn.commit()
            logging.info(f"Хост '{host_name}' и его тарифы успешно удалены.")
    except Exception as e: logging.error(f"Ошибка удаления хоста '{host_name}': {e}")

# =========================


# ===== GET_HOST =====
# Получение информации о хосте по имени
# Fallback: None если хост не найден
def get_host(host_name: str) -> dict | None:
    try:
        host_name = normalize_host_name(host_name)
        row = _fetch_row("SELECT * FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (host_name,), f"Ошибка получения хоста '{host_name}'")
        return dict(row) if row else None
    except Exception as e: logging.error(f"Ошибка получения хоста '{host_name}': {e}"); return None

# ==================


# ===== TOGGLE_HOST_VISIBILITY =====
# Переключение видимости хоста (поле see)
def toggle_host_visibility(host_name: str, visible: int) -> bool:
    host_name_n = normalize_host_name(host_name)
    visible_int = 1 if visible else 0
    row = _fetch_row("SELECT 1 FROM xui_hosts WHERE TRIM(host_name) = TRIM(?)", (host_name_n,), "")
    if not row: logging.warning(f"toggle_host_visibility: хост не найден '{host_name_n}'"); return False
    cursor = _exec(
        "UPDATE xui_hosts SET see = ? WHERE TRIM(host_name) = TRIM(?)",
        (visible_int, host_name_n),
        f"Не удалось обновить видимость для хоста '{host_name}'"
    )
    if cursor and cursor.rowcount > 0: logging.info(f"Видимость хоста '{host_name_n}' обновлена: see={visible_int}")
    return _check_rowcount(cursor, f"хост '{host_name_n}'", "")

# ==================================


def get_device_tiers(host_name: str) -> list[dict]:
    return _fetch_list("SELECT * FROM device_tiers WHERE TRIM(host_name)=TRIM(?) ORDER BY sort_order, device_count", (host_name,))


def add_device_tier(host_name: str, device_count: int, price: float) -> int | None:
    r = _exec("INSERT OR REPLACE INTO device_tiers (host_name, device_count, price) VALUES (?,?,?)", (host_name, device_count, price))
    return r.lastrowid if r else None


def update_device_tier(tier_id: int, device_count: int, price: float) -> bool:
    r = _exec("UPDATE device_tiers SET device_count=?, price=? WHERE tier_id=?", (device_count, price, tier_id))
    return r is not None and r.rowcount > 0


def delete_device_tier(tier_id: int) -> bool:
    r = _exec("DELETE FROM device_tiers WHERE tier_id=?", (tier_id,))
    return r is not None and r.rowcount > 0


def get_device_tier_by_id(tier_id: int) -> dict | None:
    return _fetch_row("SELECT * FROM device_tiers WHERE tier_id=?", (tier_id,))


def update_host_device_mode(host_name: str, mode: str) -> bool:
    r = _exec("UPDATE xui_hosts SET device_mode=? WHERE TRIM(host_name)=TRIM(?)", (mode, host_name))
    return r is not None and r.rowcount > 0

# ==============================


# ===== GET_ALL_HOSTS =====
def get_all_hosts(visible_only: bool = False) -> list[dict]:
    # Сначала пытаемся выполнить запрос
    sql = "SELECT * FROM xui_hosts ORDER BY sort_order ASC, host_name ASC"
    if visible_only: sql = "SELECT * FROM xui_hosts WHERE see = 1 ORDER BY sort_order ASC, host_name ASC"
    
    rows = _fetch_list(sql, (), "")
    if not rows:
        # Если пусто или ошибка, возможно нет колонки see (хотя миграция должна была сработать)
        # Пробуем через старый механизм fallback только если реально была ошибка
        # Но у нас _fetch_list возвращает [], так что сложно отличить "пусто" от "ошибка".
        # Однако, раз мы строго следим за миграциями, колонка see должна быть.
        # Если ошибка была, она залогировалась в _fetch_list.
        pass

    result = []
    for row in rows:
        d = dict(row)
        d['host_name'] = normalize_host_name(d.get('host_name'))
        result.append(d)
    return result


# =========================


# ===== GET_SPEEDTESTS =====
def get_speedtests(host_name: str, limit: int = 20) -> list[dict]:
    host_name_n = normalize_host_name(host_name)
    try:
        limit_int = int(limit)
    except Exception: limit_int = 20
        
    return _fetch_list(
        f"""
        SELECT id, host_name, method, ping_ms, jitter_ms, download_mbps, upload_mbps,
               server_name, server_id, ok, error, created_at
        FROM host_speedtests
        WHERE TRIM(host_name) = TRIM(?)
        ORDER BY {sql_order_datetime('created_at')} DESC
        LIMIT ?
        """,
        (host_name_n, limit_int),
        f"Не удалось получить speedtest-данные для хоста '{host_name}'"
    )


# ========================


# ===== GET_LATEST_SPEEDTEST =====
def get_latest_speedtest(host_name: str) -> dict | None:
    host_name_n = normalize_host_name(host_name)
    return _fetch_row(
        f"""
        SELECT id, host_name, method, ping_ms, jitter_ms, download_mbps, upload_mbps,
               server_name, server_id, ok, error, created_at
        FROM host_speedtests
        WHERE TRIM(host_name) = TRIM(?)
        ORDER BY {sql_order_datetime('created_at')} DESC
        LIMIT 1
        """,
        (host_name_n,),
        f"Не удалось получить последний speedtest для хоста '{host_name}'"
    )


# ===== INSERT_HOST_SPEEDTEST =====
def insert_host_speedtest(
    host_name: str,
    method: str,
    ping_ms: float | None = None,
    jitter_ms: float | None = None,
    download_mbps: float | None = None,
    upload_mbps: float | None = None,
    server_name: str | None = None,
    server_id: str | None = None,
    ok: bool = True,
    error: str | None = None
) -> int | None:
    host_name_n = normalize_host_name(host_name)
    cursor = _exec(
        """
        INSERT INTO host_speedtests (host_name, method, ping_ms, jitter_ms, download_mbps, upload_mbps, server_name, server_id, ok, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (host_name_n, method, ping_ms, jitter_ms, download_mbps, upload_mbps, server_name, server_id, 1 if ok else 0, error),
        f"Не удалось сохранить запись speedtest для '{host_name}'"
    )
    return cursor.lastrowid if cursor else None







# ===== GET_ALL_SSH_TARGETS =====
def get_all_ssh_targets() -> list[dict]:
    return _fetch_list("SELECT * FROM speedtest_ssh_targets ORDER BY sort_order ASC, target_name ASC", (), "Не удалось получить список SSH-целей")



# ===========================


# ===== GET_SSH_TARGET =====
def get_ssh_target(target_name: str) -> dict | None:
    name = normalize_host_name(target_name)
    return _fetch_row("SELECT * FROM speedtest_ssh_targets WHERE TRIM(target_name) = TRIM(?)", (name,), f"Не удалось получить SSH-цель '{target_name}'")



# ========================


# ===== CREATE_SSH_TARGET =====
# Создание новой SSH-цели для speedtest
def create_ssh_target(
    target_name: str,
    ssh_host: str,
    ssh_port: int | None = 22,
    ssh_user: str | None = None,
    ssh_password: str | None = None,
    ssh_key_path: str | None = None,
    description: str | None = None,
    *,
    sort_order: int | None = 0,
    is_active: int | None = 1,
) -> bool:
    name = normalize_host_name(target_name)
    cursor = _exec(
        """
        INSERT INTO speedtest_ssh_targets
            (target_name, ssh_host, ssh_port, ssh_user, ssh_password, ssh_key_path, description, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            name,
            (ssh_host or '').strip(),
            int(ssh_port) if ssh_port is not None else None,
            (ssh_user or None),
            (ssh_password if ssh_password is not None else None),
            (ssh_key_path or None),
            (description or None),
            1 if (is_active is None or int(is_active) != 0) else 0,
            int(sort_order or 0),
        ),
        f"Не удалось создать SSH-цель '{target_name}'"
    )
    return cursor is not None

# ===========================


# ===== UPDATE_SSH_TARGET_FIELDS =====
# Обновление полей SSH-цели (выборочное обновление)
# Параметры с None не обновляются
def update_ssh_target_fields(
    target_name: str,
    *,
    ssh_host: str | None = None,
    ssh_port: int | None = None,
    ssh_user: str | None = None,
    ssh_password: str | None = None,
    ssh_key_path: str | None = None,
    description: str | None = None,
    sort_order: int | None = None,
    is_active: int | None = None,
) -> bool:
    name = normalize_host_name(target_name)
    row = _fetch_row("SELECT 1 FROM speedtest_ssh_targets WHERE TRIM(target_name) = TRIM(?)", (name,), "")
    if not row: logging.warning(f"update_ssh_target_fields: цель не найдена '{name}'"); return False
        
    sets: list[str] = []
    params: list[Any] = []
    if ssh_host is not None:
        sets.append("ssh_host = ?")
        params.append((ssh_host or '').strip())
    if ssh_port is not None:
        try:
            val = int(ssh_port)
        except Exception:
            val = None
        sets.append("ssh_port = ?")
        params.append(val)
    if ssh_user is not None:
        sets.append("ssh_user = ?")
        params.append(ssh_user or None)
    if ssh_password is not None:
        sets.append("ssh_password = ?")
        params.append(ssh_password)
    if ssh_key_path is not None:
        sets.append("ssh_key_path = ?")
        params.append(ssh_key_path or None)
    if description is not None:
        sets.append("description = ?")
        params.append(description or None)
    if sort_order is not None:
        try:
            so = int(sort_order)
        except Exception:
            so = 0
        sets.append("sort_order = ?")
        params.append(so)
    if is_active is not None:
        sets.append("is_active = ?")
        params.append(1 if int(is_active) != 0 else 0)
    
    if not sets: return True
    
    params.append(name)
    sql = f"UPDATE speedtest_ssh_targets SET {', '.join(sets)} WHERE TRIM(target_name) = TRIM(?)"
    cursor = _exec(sql, params, f"Не удалось обновить SSH-цель '{target_name}'")
    return cursor is not None









# ===== DELETE_SSH_TARGET =====
# Удаление SSH-цели по имени
def delete_ssh_target(target_name: str) -> bool:
    return _check_rowcount(_exec(
        "DELETE FROM speedtest_ssh_targets WHERE TRIM(target_name) = TRIM(?)",
        (normalize_host_name(target_name),),
        f"Не удалось удалить SSH-цель '{target_name}'"
    ), f"SSH-цель '{target_name}'", "")

# =============================


# ===== RENAME_SSH_TARGET =====
# Переименование SSH-цели с обновлением связанных speedtest-записей
def rename_ssh_target(old_target_name: str, new_target_name: str) -> bool:
    old_name = normalize_host_name(old_target_name)
    new_name = normalize_host_name(new_target_name)
    
    if old_name == new_name: return True
    
    row = _fetch_row("SELECT 1 FROM speedtest_ssh_targets WHERE TRIM(target_name) = TRIM(?)", (old_name,), "")
    if not row: logging.warning(f"rename_ssh_target: старая цель не найдена '{old_name}'"); return False
    
    row_new = _fetch_row("SELECT 1 FROM speedtest_ssh_targets WHERE TRIM(target_name) = TRIM(?)", (new_name,), "")
    if row_new: logging.warning(f"rename_ssh_target: новое имя уже занято '{new_name}'"); return False
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE speedtest_ssh_targets SET target_name = ? WHERE TRIM(target_name) = TRIM(?)",
                (new_name, old_name)
            )
            cursor.execute(
                "UPDATE host_speedtests SET host_name = ? WHERE TRIM(host_name) = TRIM(?)",
                (new_name, old_name)
            )
            conn.commit()
            logging.info(f"SSH-цель переименована: '{old_name}' → '{new_name}'")
            return True
    except Exception as e: logging.error(f"Не удалось переименовать SSH-цель '{old_target_name}' → '{new_target_name}': {e}"); return False




# ===== GET_ADMIN_STATS =====
# Получение статистики для админ-панели
# Возвращает: total_users, total_keys, active_keys, total_income, today_new_users, today_income, today_issued_keys
def get_admin_stats() -> dict:
    stats = {}
    stats["total_users"] = _get_count_stat("SELECT COUNT(*) as c FROM users")
    stats["total_keys"] = _get_count_stat("SELECT COUNT(*) as c FROM vpn_keys")
    stats["active_keys"] = _get_count_stat(
        "SELECT COUNT(*) as c FROM vpn_keys WHERE expire_at IS NOT NULL AND expire_at > CURRENT_TIMESTAMP"
    )
    stats["total_income"] = float(_get_count_stat("""
        SELECT COALESCE(SUM(amount_rub), 0) as s FROM transactions
        WHERE status IN ('paid','success','succeeded') AND LOWER(COALESCE(payment_method, '')) <> 'balance'
    """))
    stats["today_new_users"] = _get_count_stat(
        f"SELECT COUNT(*) as c FROM users WHERE {sql_date_eq_msk_today('registration_date')}"
    )
    stats["today_income"] = float(_get_count_stat(f"""
        SELECT COALESCE(SUM(amount_rub), 0) as s FROM transactions
        WHERE status IN ('paid','success','succeeded') AND {sql_date_eq_msk_today('created_date')}
          AND LOWER(COALESCE(payment_method, '')) <> 'balance'
    """))
    stats["today_issued_keys"] = _get_count_stat(
        f"SELECT COUNT(*) as c FROM vpn_keys WHERE {sql_date_eq_msk_today('COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)')}"
    )
    return stats

# ================================



# ===== CREATE_PLAN =====
def create_plan(host_name: str, plan_name: str, months: int, price: float, hwid_limit: int = 0, traffic_limit_gb: int = 0, button_style: str = None, icon_emoji_id: str = None):
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "INSERT INTO plans (host_name, plan_name, months, price, hwid_limit, traffic_limit_gb, button_style, icon_emoji_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (host_name, plan_name, months, price, hwid_limit, traffic_limit_gb, button_style or None, icon_emoji_id or None),
        f"Не удалось создать тариф для хоста '{host_name}'"
    )
    if cursor: new_id = cursor.lastrowid; logging.info(f"Created new plan '{plan_name}' for host '{host_name}' with HWID={hwid_limit}, Traffic={traffic_limit_gb}GB."); return new_id
    return None

# =======================


# ===== GET_PLANS_FOR_HOST =====
def get_plans_for_host(host_name: str) -> list[dict]:
    host_name = normalize_host_name(host_name)
    rows = _fetch_list("SELECT * FROM plans WHERE TRIM(host_name) = TRIM(?) ORDER BY months", (host_name,), f"Не удалось получить тарифы для хоста '{host_name}'")
    return [dict(plan) for plan in rows]


# ==============================


# ===== GET_PLAN_BY_ID =====
def get_plan_by_id(plan_id: int) -> dict | None:
    row = _fetch_row("SELECT * FROM plans WHERE plan_id = ?", (plan_id,), f"Не удалось получить тариф по id '{plan_id}'")
    return dict(row) if row else None


# ==========================


# ===== DELETE_PLAN =====
def delete_plan(plan_id: int):
    cursor = _exec("DELETE FROM plans WHERE plan_id = ?", (plan_id,), f"Не удалось удалить тариф с id {plan_id}")
    if cursor: logging.info(f"Удалён тариф с id {plan_id}.")

# =======================


# ===== UPDATE_PLAN =====
def update_plan(plan_id: int, plan_name: str, months: int, price: float, hwid_limit: int = 0, traffic_limit_gb: int = 0, button_style: str = None, icon_emoji_id: str = None) -> bool:
    cursor = _exec(
        "UPDATE plans SET plan_name = ?, months = ?, price = ?, hwid_limit = ?, traffic_limit_gb = ?, button_style = ?, icon_emoji_id = ? WHERE plan_id = ?",
        (plan_name, months, price, hwid_limit, traffic_limit_gb, button_style or None, icon_emoji_id or None, plan_id),
        f"Не удалось обновить тариф {plan_id}"
    )
    if cursor and cursor.rowcount > 0: logging.info(f"Updated plan {plan_id}: name='{plan_name}', months={months}, price={price}, hwid={hwid_limit}, traffic={traffic_limit_gb}."); return True
    if cursor and cursor.rowcount == 0: logging.warning(f"No plan updated for id {plan_id} (not found).")
    return False



def update_host_button_style(host_name: str, button_style: str = None, icon_emoji_id: str = None) -> bool:
    host_name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET button_style = ?, icon_emoji_id = ? WHERE TRIM(host_name) = TRIM(?)",
        (button_style or None, icon_emoji_id or None, host_name),
        f"Не удалось обновить стиль кнопки для хоста '{host_name}'"
    )
    if cursor and cursor.rowcount > 0: logging.info(f"Updated button style for host '{host_name}': style={button_style}, emoji={icon_emoji_id}"); return True
    return False

# =======================


# ===== UPDATE_SSH_TARGET_SCHEDULER =====
def update_ssh_target_scheduler(target_name: str, time_auto: str) -> bool:
    name = normalize_host_name(target_name)
    cursor = _exec(
        "UPDATE speedtest_ssh_targets SET time_auto = ? WHERE TRIM(target_name) = TRIM(?)",
        (time_auto, name),
        f"Не удалось обновить планировщик для '{target_name}'"
    )
    return cursor is not None and cursor.rowcount > 0

# ===================================


# ===== UPDATE_HOST_SORT_ORDER =====
def update_host_sort_order(host_name: str, sort_order: int) -> bool:
    name = normalize_host_name(host_name)
    cursor = _exec(
        "UPDATE xui_hosts SET sort_order = ? WHERE TRIM(host_name) = TRIM(?)",
        (sort_order, name),
        "Не удалось обновить sort_order хоста"
    )
    if cursor and cursor.rowcount > 0: logging.info(f"Обновлён sort_order хоста '{name}': {sort_order}"); return True
    logging.warning(f"Хост '{name}' не найден для обновления sort_order"); return False

# ==============================


# ===== UPDATE_SSH_TARGET_SORT_ORDER =====
def update_ssh_target_sort_order(target_name: str, sort_order: int) -> bool:
    name = normalize_host_name(target_name)
    cursor = _exec(
        "UPDATE speedtest_ssh_targets SET sort_order = ? WHERE TRIM(target_name) = TRIM(?)",
        (sort_order, name),
        "Не удалось обновить sort_order SSH-цели"
    )
    if cursor and cursor.rowcount > 0: logging.info(f"Обновлён sort_order SSH-цели '{name}': {sort_order}"); return True
    logging.warning(f"SSH-цель '{name}' не найдена для обновления sort_order"); return False

