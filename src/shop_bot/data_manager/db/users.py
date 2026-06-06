from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.dialect import is_sqlite, json_extract, json_valid, msk_now_sql, msk_time_filter, sql_strftime
from shop_bot.data_manager.db.connection import (
    get_db_connection,
    get_msk_time,
    _now_str,
    _normalize_email,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _exec_with_check,
    _get_count_stat,
    _check_rowcount,
)



# =================================

# ===== DELETE_USER =====
def delete_user(telegram_id: int) -> bool:
    cursor = _exec(
        "DELETE FROM users WHERE telegram_id = ?",
        (telegram_id,),
        f"Ошибка удаления пользователя {telegram_id}",
    )
    return cursor is not None and cursor.rowcount > 0


def purge_user_account(telegram_id: int) -> bool:
    """Remove user and related local DB rows. Revoke Remna keys before calling."""
    try:
        tickets = _fetch_list(
            "SELECT ticket_id FROM support_tickets WHERE user_id = ?",
            (telegram_id,),
            f"purge tickets for {telegram_id}",
        ) or []
        for row in tickets:
            _exec(
                "DELETE FROM support_messages WHERE ticket_id = ?",
                (row["ticket_id"],),
                f"purge messages for ticket {row['ticket_id']}",
            )
        _exec("DELETE FROM support_tickets WHERE user_id = ?", (telegram_id,), f"purge tickets {telegram_id}")
        _exec("DELETE FROM transactions WHERE user_id = ?", (telegram_id,), f"purge txs {telegram_id}")
        _exec("DELETE FROM vpn_keys WHERE user_id = ?", (telegram_id,), f"purge keys {telegram_id}")
        _exec("DELETE FROM seller_users WHERE user_id = ?", (telegram_id,), f"purge seller {telegram_id}")
        _exec("DELETE FROM gift_token_claims WHERE user_id = ?", (telegram_id,), f"purge gifts {telegram_id}")
        _exec("DELETE FROM promo_code_usages WHERE user_id = ?", (telegram_id,), f"purge promos {telegram_id}")
        _exec("UPDATE users SET referred_by = NULL WHERE referred_by = ?", (telegram_id,), f"unlink refs {telegram_id}")
        return delete_user(telegram_id)
    except Exception as exc:
        logger.error("purge_user_account %s: %s", telegram_id, exc)
        return False



# =====================================


# ===== GET_USER_ID_BY_GIFT_TOKEN =====
def get_user_id_by_gift_token(token: str) -> int | None:
    row = _fetch_row("SELECT user_id FROM gift_token_claims WHERE token = ? ORDER BY claimed_at DESC LIMIT 1", (token,), f"Ошибка поиска user_id по токену {token}")
    return row["user_id"] if row else None

# ========================================


# ===== SET_REFERRAL_START_BONUS_RECEIVED =====
def set_referral_start_bonus_received(user_id: int) -> bool:
    return _check_rowcount(_exec(
        "UPDATE users SET referral_start_bonus_received = 1 WHERE telegram_id = ?",
        (user_id,),
        f"Не удалось установить бонус реферала для пользователя {user_id}"
    ), f"пользователь {user_id}", "")

# =======================================


# ===== GET_REFERRALS_FOR_USER =====
def get_referrals_for_user(user_id: int) -> list[dict]:
    rows = _fetch_list(
        """
        SELECT telegram_id, username, registration_date, total_spent
        FROM users
        WHERE referred_by = ?
        ORDER BY registration_date DESC
        """,
        (user_id,),
        f"Не удалось получить рефералов для пользователя {user_id}"
    )
    return [dict(r) for r in rows]

# =======================


def register_user_if_not_exists(telegram_id: int, username: str, referrer_id):
    row = _fetch_row("SELECT referred_by FROM users WHERE telegram_id = ?", (telegram_id,), "")
    
    if not row:
        _exec(
            "INSERT INTO users (telegram_id, username, registration_date, referred_by) VALUES (?, ?, ?, ?)",
            (telegram_id, username, get_msk_time().replace(tzinfo=None).replace(microsecond=0), referrer_id),
            f"Не удалось зарегистрировать пользователя {telegram_id}"
        )
    else:
        _exec("UPDATE users SET username = ? WHERE telegram_id = ?", (username, telegram_id), "")
        
        current_ref = row['referred_by']
        if referrer_id and (current_ref is None or str(current_ref).strip() == "") and int(referrer_id) != int(telegram_id):
            _exec("UPDATE users SET referred_by = ? WHERE telegram_id = ?", (int(referrer_id), telegram_id), "")


def add_to_referral_balance(user_id: int, amount: float):
    _exec("UPDATE users SET referral_balance = referral_balance + ? WHERE telegram_id = ?", (amount, user_id), f"Не удалось добавить реферальный баланс для пользователя {user_id}")


def set_referral_balance(user_id: int, value: float):
    _exec("UPDATE users SET referral_balance = ? WHERE telegram_id = ?", (value, user_id), f"Не удалось установить реферальный баланс для пользователя {user_id}")


def set_referral_balance_all(user_id: int, value: float):
    _exec("UPDATE users SET referral_balance_all = ? WHERE telegram_id = ?", (value, user_id), f"Не удалось установить общий реф-баланс для пользователя {user_id}")


def add_to_referral_balance_all(user_id: int, amount: float):
    _exec(
        "UPDATE users SET referral_balance_all = referral_balance_all + ? WHERE telegram_id = ?",
        (amount, user_id),
        f"Не удалось добавить к общему реф-балансу для пользователя {user_id}"
    )


def get_referral_balance_all(user_id: int) -> float:
    row = _fetch_row("SELECT referral_balance_all FROM users WHERE telegram_id = ?", (user_id,), f"Не удалось получить общий реф-баланс для пользователя {user_id}")
    return row["referral_balance_all"] if row else 0.0


def get_referral_balance(user_id: int) -> float:
    row = _fetch_row("SELECT referral_balance FROM users WHERE telegram_id = ?", (user_id,), f"Не удалось получить реф-баланс для пользователя {user_id}")
    return row["referral_balance"] if row else 0.0


def get_balance(user_id: int) -> float:
    row = _fetch_row("SELECT balance FROM users WHERE telegram_id = ?", (user_id,), f"Не удалось получить баланс для пользователя {user_id}")
    return row["balance"] if row else 0.0


def adjust_user_balance(user_id: int, delta: float) -> bool:
    cursor = _exec(
        "UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE telegram_id = ?",
        (float(delta), user_id),
        f"Не удалось изменить баланс для пользователя {user_id}"
    )
    return cursor is not None and cursor.rowcount > 0


def set_balance(user_id: int, value: float) -> bool:
    cursor = _exec(
        "UPDATE users SET balance = ? WHERE telegram_id = ?",
        (value, user_id),
        f"Не удалось установить баланс для пользователя {user_id}"
    )
    return cursor is not None and cursor.rowcount > 0


def add_to_balance(user_id: int, amount: float) -> bool:
    logging.info(f"💳 Добавляем {amount:.2f} RUB к балансу пользователя {user_id}")
    
    # Check if user exists first to match original logic logging
    row = _fetch_row("SELECT telegram_id, balance FROM users WHERE telegram_id = ?", (int(user_id),), "")
    if not row: logging.error(f"❌ Пользователь {user_id} не найден в базе данных"); return False

    old_balance = row["balance"] or 0.0
    
    cursor = _exec(
        "UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE telegram_id = ?",
        (float(amount), int(user_id)),
        f"Ошибка базы данных при пополнении баланса для пользователя {user_id}"
    )
    
    if cursor and cursor.rowcount > 0:
        new_balance = old_balance + float(amount)
        logging.info(f"✅ Баланс обновлен: пользователь {user_id} | {old_balance:.2f} → {new_balance:.2f} RUB (+{amount:.2f})")
        return True
    
    logging.error(f"❌ Не удалось обновить баланс для пользователя {user_id}: строки не затронуты")
    return False


def deduct_from_balance(user_id: int, amount: float) -> bool:
    if amount <= 0: return True
        
    cursor = _exec(
        "UPDATE users SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?",
        (amount, user_id, amount),
        f"Не удалось списать с баланса для пользователя {user_id}"
    )
    if cursor and cursor.rowcount > 0: return True
        
    return False

# ============================


# ===== DEDUCT_FROM_REFERRAL_BALANCE =====
def deduct_from_referral_balance(user_id: int, amount: float) -> bool:
    if amount <= 0: return True
    cursor = _exec(
        "UPDATE users SET referral_balance = referral_balance - ? WHERE telegram_id = ? AND referral_balance >= ?",
        (amount, user_id, amount),
        f"Не удалось списать с реферального баланса для пользователя {user_id}"
    )
    if cursor and cursor.rowcount > 0: return True
    return False

# ======================================


# ===== GET_REFERRAL_COUNT =====
def get_referral_count(user_id: int) -> int:
    row = _fetch_row("SELECT COUNT(*) as c FROM users WHERE referred_by = ?", (user_id,), f"Не удалось получить кол-во рефералов для пользователя {user_id}")
    return row["c"] if row else 0

# ==============================


# ===== GET_USER =====
def get_user(telegram_id: int):
    row = _fetch_row("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,), f"Не удалось получить пользователя {telegram_id}")
    return dict(row) if row else None

# ==================

# ===== GET_USER_BY_EMAIL =====
def get_user_by_email(email: str):
    row = _fetch_row("SELECT * FROM users WHERE LOWER(auth_email) = ?", (email.lower().strip(),), f"Не удалось получить пользователя {email}")
    return dict(row) if row else None

# ==================

# ===== CREATE_USER_BY_EMAIL =====
def create_user_by_email(email: str, password: str) -> dict | None:
    from shop_bot.data_manager.secrets_vault import hash_webapp_password
    import random
    while True:
        telegram_id = int(f"999{random.randint(1000000, 9999999)}")
        if not get_user(telegram_id):
            break

    password_hash = hash_webapp_password(password)
    cursor = _exec(
        "INSERT INTO users (telegram_id, username, registration_date, auth_email, auth_pass) VALUES (?, ?, ?, ?, ?)",
        (telegram_id, "", get_msk_time().replace(tzinfo=None).replace(microsecond=0), email.strip(), password_hash),
        f"Не удалось зарегистрировать пользователя {email}"
    )
    if cursor:
        return get_user(telegram_id)
    return None

# =================================

# ===== UPDATE_USER_PASSWORD =====
def update_user_password(email: str, password: str) -> bool:
    from shop_bot.data_manager.secrets_vault import hash_webapp_password
    password_hash = hash_webapp_password(password)
    cursor = _exec(
        "UPDATE users SET auth_pass = ? WHERE LOWER(auth_email) = ?",
        (password_hash, email.lower().strip()),
        f"Не удалось обновить пароль для {email}",
    )
    return cursor is not None and cursor.rowcount > 0

# =================================

# ===== VERIFY_USER_EMAIL_PASSWORD =====
def verify_user_email_password(user: dict | None, password: str) -> bool:
    from shop_bot.data_manager.secrets_vault import verify_webapp_password, HASH_PREFIX, hash_webapp_password
    if not user or not password:
        return False
    stored = user.get("auth_pass")
    if not verify_webapp_password(stored, password):
        return False
    if stored and not str(stored).startswith(HASH_PREFIX):
        email = user.get("auth_email")
        if email:
            update_user_password(email, password)
    return True

# ======================================

# ===== LINK_TELEGRAM_TO_EMAIL_USER =====
def link_telegram_to_email_user(old_telegram_id: int, new_telegram_id: int, new_username: str):
    old_user = get_user(old_telegram_id)
    if not old_user:
        return "Ошибка: веб-аккаунт не найден."

    existing = get_user(new_telegram_id)
        
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if existing:
                cursor.execute("UPDATE vpn_keys SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE transactions SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE pending_transactions SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE support_tickets SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE seller_users SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE users SET referred_by = ? WHERE referred_by = ?", (new_telegram_id, old_telegram_id))
                
                old_bal = old_user.get('balance', 0)
                old_ref_bal = old_user.get('referral_balance', 0)
                old_ref_all = old_user.get('referral_balance_all', 0)
                old_spent = old_user.get('total_spent', 0)
                old_months = old_user.get('total_months', 0)
                
                cursor.execute("""
                    UPDATE users 
                    SET balance = balance + ?, 
                        referral_balance = referral_balance + ?,
                        referral_balance_all = referral_balance_all + ?,
                        total_spent = total_spent + ?,
                        total_months = total_months + ?,
                        auth_email = ?,
                        auth_pass = ?,
                        auth_token = ?,
                        auth_token_expires = ?
                    WHERE telegram_id = ?
                """, (old_bal, old_ref_bal, old_ref_all, old_spent, old_months, 
                      old_user.get('auth_email'), old_user.get('auth_pass'), old_user.get('auth_token'),
                      old_user.get('auth_token_expires'),
                      new_telegram_id))
                
                cursor.execute("DELETE FROM users WHERE telegram_id = ?", (old_telegram_id,))
            else:
                cursor.execute("UPDATE users SET telegram_id = ?, username = ? WHERE telegram_id = ?", (new_telegram_id, new_username, old_telegram_id))
                cursor.execute("UPDATE vpn_keys SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE transactions SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE pending_transactions SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE support_tickets SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE seller_users SET user_id = ? WHERE user_id = ?", (new_telegram_id, old_telegram_id))
                cursor.execute("UPDATE users SET referred_by = ? WHERE referred_by = ?", (new_telegram_id, old_telegram_id))
            
            conn.commit()
            return True
    except Exception as e:
        logging.error(f"Failed to link telegram {new_telegram_id} to {old_telegram_id}: {e}")
        return "Ошибка базы данных."

# =========================


# ===== SET_TERMS_AGREED =====
def set_terms_agreed(telegram_id: int):
    cursor = _exec("UPDATE users SET agreed_to_terms = 1 WHERE telegram_id = ?", (telegram_id,), f"Не удалось установить согласие с условиями для пользователя {telegram_id}")
    if cursor: logging.info(f"Пользователь {telegram_id} согласился с условиями.")

# ==========================


# ===== UPDATE_USER_STATS =====
def update_user_stats(telegram_id: int, amount_spent: float, months_purchased: int):
    _exec("UPDATE users SET total_spent = total_spent + ?, total_months = total_months + ? WHERE telegram_id = ?", (amount_spent, months_purchased, telegram_id), f"Не удалось обновить статистику пользователя {telegram_id}")

# ===========================


# ===== GET_USER_COUNT =====
def get_user_count() -> int:
    row = _fetch_row("SELECT COUNT(*) as c FROM users", (), "Не удалось получить кол-во пользователей")
    return row["c"] if row else 0

# ==========================================


# ===== SET_TRIAL_USED =====
def set_trial_used(telegram_id: int):
    cursor = _exec("UPDATE users SET trial_used = 1 WHERE telegram_id = ?", (telegram_id,), f"Не удалось установить trial_used для пользователя {telegram_id}")
    if cursor: logging.info(f"Пробный период отмечен как использованный для пользователя {telegram_id}.")

# ===========================


# ===== GET_DAILY_STATS_FOR_CHARTS =====
def get_daily_stats_for_charts(days: int = 30) -> dict:
    stats = {'users': {}, 'keys': {}, 'income': {}, 'finance': {'topups': {'amount': 0.0, 'count': 0}, 'subscriptions': {'amount': 0.0, 'count': 0}, 'total': {'amount': 0.0, 'count': 0}}}
    time_filter = ""
    params = []
    group_fmt = "%Y-%m-%d"
    
    if days > 0:
        time_filter = f" >= {msk_time_filter()}"
        params.append(f'-{days} days')
        if days == 1: group_fmt = "%Y-%m-%d %H:00"
    
    def get_data(table, date_col, is_count=True):
        nonlocal group_fmt
        where_clause = f"WHERE {date_col} {time_filter}" if time_filter else ""
        
        if is_count:
            period_expr = sql_strftime(group_fmt, date_col)
            query = f"SELECT {period_expr} AS period, COUNT(*) as cnt FROM {table} {where_clause} GROUP BY period ORDER BY period"
        else:
            income_filter = "LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success') AND LOWER(COALESCE(payment_method, '')) NOT IN ('balance', 'admin', 'referral')"
            if where_clause:
                where_clause += f" AND {income_filter}"
            else:
                where_clause = f"WHERE {income_filter}"
            period_expr = sql_strftime(group_fmt, date_col)
            query = f"SELECT {period_expr} AS period, payment_method, SUM(amount_rub) as total FROM {table} {where_clause} GROUP BY period, payment_method ORDER BY period"
        
        return _fetch_list(query, tuple(params), "Не удалось получить данные статистики по дням")

    for row in get_data("users", "registration_date"):
        stats['users'][row['period']] = row['cnt']

    for row in get_data("vpn_keys", "COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)"):
        stats['keys'][row['period']] = row['cnt']

    for row in get_data("transactions", "created_date", is_count=False):
        period = row['period']
        method = row['payment_method']
        amount = row['total']
        if period not in stats['income']:
            stats['income'][period] = {}
        stats['income'][period][method or 'Other'] = float(amount) if amount else 0.0
    
    tx_where = "WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success')"
    tx_params = []
    if days > 0:
        tx_where += f" AND created_date >= {msk_time_filter()}"
        tx_params.append(f'-{days} days')
    rows = _fetch_list(
        f"""
        SELECT amount_rub, payment_method, metadata
        FROM transactions
        {tx_where}
        """,
        tuple(tx_params),
        "Не удалось получить финансовую статистику"
    )
    for row in rows:
        amount = float(row['amount_rub'] or 0.0)
        payment_method = str(row['payment_method'] or '').strip().lower()
        try:
            metadata = json.loads(row['metadata'] or '{}')
            if not isinstance(metadata, dict):
                metadata = {}
        except Exception:
            metadata = {}
        action = str(metadata.get('action') or '').strip().lower()
        reason = str(metadata.get('reason') or '').strip().lower()
        is_income_method = payment_method not in ('balance', 'admin', 'referral')
        is_topup = action in ('topup', 'top_up') or reason == 'external_balance_top_up'
        is_subscription = action in ('new', 'extend') or reason == 'subscription_purchase_or_extend' or any(metadata.get(k) for k in ('plan_id', 'key_id', 'host_name', 'host', 'customer_email')) or is_income_method
        if is_topup and is_income_method:
            stats['finance']['topups']['amount'] += abs(amount)
            stats['finance']['topups']['count'] += 1
        elif is_subscription and is_income_method:
            stats['finance']['subscriptions']['amount'] += abs(amount)
            stats['finance']['subscriptions']['count'] += 1
    stats['finance']['total']['amount'] = stats['finance']['topups']['amount'] + stats['finance']['subscriptions']['amount']
    stats['finance']['total']['count'] = stats['finance']['topups']['count'] + stats['finance']['subscriptions']['count']
    return stats



# ===== GET_ALL_USERS =====
# Получение всех пользователей с сортировкой по дате регистрации
def get_all_users() -> list[dict]:
    return _fetch_list("SELECT * FROM users ORDER BY registration_date DESC", (), "Не удалось получить всех пользователей")

    return rows

# ===================================


# ===== GET_USERS_PAGINATED =====
def get_users_paginated(
    page: int = 1,
    per_page: int = 30,
    q: str | None = None,
    filter_type: str | None = None,
) -> tuple[list[dict], int]:
    """Вернуть пользователей постранично и общее количество (с учётом фильтра).

    filter_type: all | banned | pinned | with_keys | trial
    q ищет по username (LIKE) и по текстовому представлению telegram_id.
    """
    page = max(1, int(page or 1))
    per_page = max(1, int(per_page or 30))
    offset = (page - 1) * per_page
    filter_type = (filter_type or 'all').strip().lower()

    where_parts: list[str] = []
    params: list = []

    if q:
        q_like = f"%{q.strip()}%"
        where_parts.append("(username LIKE ? OR CAST(telegram_id AS TEXT) LIKE ?)")
        params.extend([q_like, q_like])

    if filter_type == 'banned':
        where_parts.append("COALESCE(is_banned, 0) = 1")
    elif filter_type == 'pinned':
        where_parts.append("COALESCE(is_pinned, 0) = 1")
    elif filter_type == 'with_keys':
        where_parts.append("telegram_id IN (SELECT DISTINCT user_id FROM vpn_keys)")
    elif filter_type == 'trial':
        where_parts.append("COALESCE(trial_used, 0) = 0")

    where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

    count_query = f"SELECT COUNT(*) FROM users{where_sql}"
    total = _fetch_val(count_query, tuple(params), 0, "Не удалось подсчитать пользователей") or 0

    data_query = (
        f"SELECT * FROM users{where_sql} "
        "ORDER BY is_pinned DESC, registration_date DESC LIMIT ? OFFSET ?"
    )
    users = _fetch_list(
        data_query,
        tuple(params + [per_page, offset]),
        "Не удалось получить страницу пользователей",
    )

    return users, total


def get_users_filter_counts() -> dict[str, int]:
    return {
        'all': int(_fetch_val("SELECT COUNT(*) FROM users", (), 0, "count users") or 0),
        'banned': int(_fetch_val("SELECT COUNT(*) FROM users WHERE COALESCE(is_banned, 0) = 1", (), 0, "count banned") or 0),
        'pinned': int(_fetch_val("SELECT COUNT(*) FROM users WHERE COALESCE(is_pinned, 0) = 1", (), 0, "count pinned") or 0),
        'with_keys': int(_fetch_val("SELECT COUNT(DISTINCT user_id) FROM vpn_keys", (), 0, "count with keys") or 0),
        'trial': int(_fetch_val("SELECT COUNT(*) FROM users WHERE COALESCE(trial_used, 0) = 0", (), 0, "count trial") or 0),
    }

# ========================


# ===== TOGGLE_USER_PIN =====
def toggle_user_pin(user_id: int) -> bool:
    cursor = _exec(
        "UPDATE users SET is_pinned = NOT COALESCE(is_pinned, 0) WHERE telegram_id = ?",
        (user_id,),
        f"Не удалось переключить закреп для пользователя {user_id}"
    )
    return cursor is not None and cursor.rowcount > 0

# ===========================


# ===== GET_KEYS_COUNTS_FOR_USERS =====
def get_keys_counts_for_users(user_ids: list[int]) -> dict[int, int]:
    result: dict[int, int] = {}
    if not user_ids: return result

    placeholders = ",".join(["?"] * len(user_ids))
    query = f"SELECT user_id, COUNT(*) AS cnt FROM vpn_keys WHERE user_id IN ({placeholders}) GROUP BY user_id"
    
    rows = _fetch_list(query, tuple(int(x) for x in user_ids), "Не удалось получить кол-во ключей для пользователей")
    
    for row in rows: result[int(row['user_id'])] = int(row['cnt'] or 0)
        
    return result


# ===== BAN_USER =====
# Установка флага is_banned=1 для пользователя
def ban_user(telegram_id: int):
    _exec("UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (telegram_id,), f"Не удалось забанить пользователя {telegram_id}")


# ===== UNBAN_USER =====
# Снятие бана (is_banned=0) для пользователя
def unban_user(telegram_id: int):
    _exec("UPDATE users SET is_banned = 0 WHERE telegram_id = ?", (telegram_id,), f"Не удалось разбанить пользователя {telegram_id}")


# ===== DELETE_USER_KEYS =====
# Удаление всех ключей пользователя
def delete_user_keys(user_id: int):
    _exec("DELETE FROM vpn_keys WHERE user_id = ?", (user_id,), f"Не удалось удалить ключи пользователя {user_id}")

def update_user_auth_token(user_id: int, token: str | None, *, expires_at: float | None = None) -> bool:
    if token is None:
        return _exec(
            "UPDATE users SET auth_token = NULL, auth_token_expires = NULL WHERE telegram_id = ?",
            (user_id,),
            "Failed to clear auth_token",
        ) is not None
    return _exec(
        "UPDATE users SET auth_token = ?, auth_token_expires = ? WHERE telegram_id = ?",
        (token, expires_at, user_id),
        "Failed to update auth_token",
    ) is not None



def _auth_token_is_valid(row: dict | None) -> bool:
    if not row:
        return False
    token = row.get("auth_token")
    if not token:
        return False
    expires = row.get("auth_token_expires")
    if expires is None:
        return True
    try:
        return float(expires) > time.time()
    except (TypeError, ValueError):
        return True



def get_user_by_auth_token(token: str) -> dict | None:
    if not token:
        return None
    row = _fetch_row("SELECT * FROM users WHERE auth_token = ?", (token,), "Failed to get user by auth_token")
    if not row:
        return None
    if not _auth_token_is_valid(row):
        user_id = row["telegram_id"]
        update_user_auth_token(user_id, None)
        return None
    return dict(row)



def get_auth_token_by_user_id(user_id: int) -> str | None:
    row = _fetch_row(
        "SELECT auth_token, auth_token_expires FROM users WHERE telegram_id = ?",
        (user_id,),
        "Failed to get auth_token by user_id",
    )
    if not _auth_token_is_valid(row):
        update_user_auth_token(user_id, None)
        return None
    return row["auth_token"] if row else None


# ===== ДАШБОРД: СТАТИСТИКА ГРУПП ПОЛЬЗОВАТЕЛЕЙ =====
def get_dashboard_user_groups() -> dict:
    groups = {
        "no_purchases": [],
        "inactive_buyers": [],
        "trials": [],
        "active_buyers": [],
        "active_keys": []
    }
    
    def purchase_condition(alias: str) -> str:
        if is_sqlite():
            meta_expr = (
                f"CASE WHEN json_valid(COALESCE({alias}.metadata, '{{}}')) "
                f"THEN COALESCE({alias}.metadata, '{{}}') ELSE '{{}}' END"
            )
        else:
            meta_expr = f"COALESCE({alias}.metadata, '{{}}')"
        return f"""
        LOWER(COALESCE({alias}.status, '')) IN ('paid', 'completed', 'success', 'succeeded')
        AND LOWER(COALESCE({alias}.payment_method, '')) NOT IN ('admin', 'referral')
        AND (
            LOWER(COALESCE({json_extract(meta_expr, '$.action')}, '')) IN ('new', 'extend')
            OR LOWER(COALESCE({json_extract(meta_expr, '$.reason')}, '')) = 'subscription_purchase_or_extend'
            OR {json_extract(meta_expr, '$.plan_id')} IS NOT NULL
            OR {json_extract(meta_expr, '$.key_id')} IS NOT NULL
            OR {json_extract(meta_expr, '$.host_name')} IS NOT NULL
            OR {json_extract(meta_expr, '$.host')} IS NOT NULL
            OR {json_extract(meta_expr, '$.customer_email')} IS NOT NULL
        )
        """
    
    # 1. Не купил ключ (нет транзакций 'paid' и нет ключей)
    q_no = f"""
    SELECT u.telegram_id, u.username, u.balance,
           (SELECT COALESCE(SUM(t2.amount_rub), 0) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as total_spent
    FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM vpn_keys k WHERE k.user_id = u.telegram_id AND COALESCE(k.key_email, '') NOT LIKE 'trial_%')
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.telegram_id AND {purchase_condition('t')})
    """
    groups["no_purchases"] = _fetch_list(q_no, (), "Ошибка получения no_purchases")

    meta = "t2.metadata"
    months_expr = f"CAST({json_extract(meta, '$.months')} AS INTEGER)"
    plan_expr = f"CAST({json_extract(meta, '$.plan_id')} AS INTEGER)"
    
    # 2. Покупали, но сейчас нет активных (истекли или нет ключей, но есть транзакции)
    q_inactive = f"""
    SELECT u.telegram_id, u.username, u.balance,
           (SELECT SUM(COALESCE(
               {months_expr},
               (SELECT p.months FROM plans p WHERE p.plan_id = {plan_expr}),
               0
           )) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as months_bought,
           (SELECT COALESCE(SUM(t2.amount_rub), 0) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as total_spent
    FROM users u
    WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.telegram_id AND {purchase_condition('t')})
      AND NOT EXISTS (
          SELECT 1 FROM vpn_keys k 
          WHERE k.user_id = u.telegram_id 
            AND COALESCE(k.key_email, '') NOT LIKE 'trial_%'
            AND (k.expire_at IS NULL OR k.expire_at > {msk_now_sql()})
      )
    """
    groups["inactive_buyers"] = _fetch_list(q_inactive, (), "Ошибка получения inactive_buyers")

    # 3. Используют триал (есть активный триальный ключ)
    q_trials = f"""
    SELECT u.telegram_id, MAX(u.username) AS username, MAX(u.balance) AS balance,
           MAX(k.key_id) AS key_id, MAX(k.expire_at) AS expire_at,
           (SELECT SUM(COALESCE(
               {months_expr},
               (SELECT p.months FROM plans p WHERE p.plan_id = {plan_expr}),
               0
           )) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as months_bought,
           (SELECT COALESCE(SUM(t2.amount_rub), 0) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as total_spent
    FROM users u
    JOIN vpn_keys k ON k.user_id = u.telegram_id
    WHERE COALESCE(k.key_email, '') LIKE 'trial_%' 
      AND (k.expire_at IS NULL OR k.expire_at > {msk_now_sql()})
    GROUP BY u.telegram_id
    """
    groups["trials"] = _fetch_list(q_trials, (), "Ошибка получения trials")
    
    # 4. Купили ключ (есть активный нетриальный ключ)
    q_active_buyers = f"""
    SELECT u.telegram_id, MAX(u.username) AS username, MAX(u.balance) AS balance,
           MAX(k.key_id) AS key_id, MAX(k.expire_at) AS expire_at,
           (SELECT SUM(COALESCE(
               {months_expr},
               (SELECT p.months FROM plans p WHERE p.plan_id = {plan_expr}),
               0
           )) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as months_bought,
           (SELECT COALESCE(SUM(t2.amount_rub), 0) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as total_spent
    FROM users u
    JOIN vpn_keys k ON k.user_id = u.telegram_id
    WHERE COALESCE(k.key_email, '') NOT LIKE 'trial_%' 
      AND (k.expire_at IS NULL OR k.expire_at > {msk_now_sql()})
    GROUP BY u.telegram_id
    """
    groups["active_buyers"] = _fetch_list(q_active_buyers, (), "Ошибка получения active_buyers")
    
    # 5. Всего активных ключей (действующих)
    q_active_keys = f"""
    SELECT k.key_id, k.user_id as telegram_id, k.host_name, k.expire_at, u.username, u.balance,
           (SELECT SUM(COALESCE(
               {months_expr},
               (SELECT p.months FROM plans p WHERE p.plan_id = {plan_expr}),
               0
           )) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as months_bought,
           (SELECT COALESCE(SUM(t2.amount_rub), 0) FROM transactions t2 WHERE t2.user_id = u.telegram_id AND {purchase_condition('t2')}) as total_spent
    FROM vpn_keys k
    LEFT JOIN users u ON k.user_id = u.telegram_id
    WHERE (k.expire_at IS NULL OR k.expire_at > {msk_now_sql()})
      AND COALESCE(k.key_email, '') NOT LIKE 'trial_%'
    """
    groups["active_keys"] = _fetch_list(q_active_keys, (), "Ошибка получения active_keys")
    
    return groups

