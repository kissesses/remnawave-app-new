from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.dialect import sql_date_eq_msk_today, sql_order_datetime
from shop_bot.data_manager.db.connection import (
    get_msk_time,
    _now_str,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _exec_with_check,
)


# ===== CREATE_PAYLOAD_PENDING =====
def create_payload_pending(payment_id: str, user_id: int, amount_rub: float | None, metadata: dict | None) -> bool:
    logger.debug(
        "create_payload_pending: payment_id=%s user_id=%s amount_rub=%s",
        payment_id,
        user_id,
        amount_rub,
    )
    cursor = _exec(
        """
        INSERT OR REPLACE INTO pending_transactions (payment_id, user_id, amount_rub, metadata, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, COALESCE((SELECT status FROM pending_transactions WHERE payment_id = ?), 'pending'),
                COALESCE((SELECT created_at FROM pending_transactions WHERE payment_id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
        """,
        (payment_id, int(user_id), float(amount_rub) if amount_rub is not None else None, json.dumps(metadata or {}), payment_id, payment_id),
        f"Не удалось создать ожидающую транзакцию {payment_id}"
    )
    return cursor is not None

# ==============================


# ===== _GET_PENDING_METADATA =====
def _get_pending_metadata(payment_id: str) -> dict | None:
    row = _fetch_row("SELECT * FROM pending_transactions WHERE payment_id = ?", (payment_id,), f"Не удалось прочитать ожидающую транзакцию {payment_id}")
    if not row: return None
    try:
        meta = json.loads(row["metadata"] or "{}")
    except Exception: meta = {}

    meta.setdefault('payment_id', payment_id)
    return meta

# =================================


# ===== GET_PENDING_METADATA =====
def get_pending_metadata(payment_id: str) -> dict | None:
    return _get_pending_metadata(payment_id)



# ================================


# ===== GET_PENDING_STATUS =====
def get_pending_status(payment_id: str) -> str | None:
    row = _fetch_row("SELECT status FROM pending_transactions WHERE payment_id = ?", (payment_id,), f"Не удалось получить статус для ожидающей {payment_id}")
    return (row["status"] or '').strip() or None if row else None


# ==============================


# ===== _COMPLETE_PENDING =====
def _complete_pending(payment_id: str) -> bool:
    cursor = _exec(
        "UPDATE pending_transactions SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ? AND status != 'paid'",
        (payment_id,),
        f"Не удалось завершить ожидающую транзакцию {payment_id}"
    )
    return cursor is not None and cursor.rowcount > 0

# ===========================


# ===== FIND_AND_COMPLETE_PENDING_TRANSACTION =====
def find_and_complete_pending_transaction(payment_id: str) -> dict | None:
    logging.info(f"🔍 Ищем ожидающую транзакцию: {payment_id}")
    meta = _get_pending_metadata(payment_id)
    if not meta: logging.warning(f"❌ Ожидающая транзакция не найдена: {payment_id}"); return None
    
    user_id = meta.get('user_id', 'неизвестно')
    amount = meta.get('price', 0)
    logging.info(f"✅ Найдена ожидающая транзакция: пользователь {user_id}, сумма {amount:.2f} RUB")
    
    success = _complete_pending(payment_id)
    if success:
        logging.info(f"✅ Транзакция отмечена как оплаченная: {payment_id}")
        return meta
    else:
        logging.warning(f"⚠️ Транзакция {payment_id} уже была оплачена или заблокирована (дубликат вебхука)")
        return None

# =================================================


# ===== GET_LATEST_PENDING_FOR_USER =====
def get_latest_pending_for_user(user_id: int) -> dict | None:
    row = _fetch_row(
        f"""
        SELECT payment_id, metadata FROM pending_transactions
        WHERE user_id = ? AND status = 'pending'
        ORDER BY {sql_order_datetime('created_at')} DESC, {sql_order_datetime('updated_at')} DESC
        LIMIT 1
        """,
        (int(user_id),),
        f"Не удалось получить последнюю ожидающую для пользователя {user_id}"
    )
    if not row:
        return None
    try:
        meta = json.loads(row["metadata"] or "{}")
    except Exception:
        meta = {}
    meta.setdefault('payment_id', row["payment_id"]) 
    return meta

# =======================================


# ===== GET_TRANSACTION =====
def get_transaction(payment_id: str) -> dict | None:
    row = _fetch_row("SELECT * FROM transactions WHERE payment_id = ?", (payment_id,), f"Не удалось получить транзакцию {payment_id}")
    return dict(row) if row else None

# ==============================


# ===== GET_TOTAL_SPENT_SUM =====
def get_total_spent_sum() -> float:
    row = _fetch_row(
        """
        SELECT COALESCE(SUM(amount_rub), 0.0) as s
        FROM transactions
        WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success', 'succeeded')
          AND LOWER(COALESCE(payment_method, '')) NOT IN ('balance', 'admin', 'referral')
        """,
        (),
        "Не удалось получить общую сумму расходов"
    )
    return row["s"] if row else 0.0

# =============================


# ===== GET_TOTAL_SPENT_BY_METHOD =====
def get_total_spent_by_method(payment_method: str) -> float:
    method_norm = (payment_method or '').strip().lower()
    method_aliases = {
        'platega': ('platega', 'platega payform', 'platega crypto'),
        'ton connect': ('ton connect', 'ton'),
    }
    methods = method_aliases.get(method_norm, (method_norm,))
    placeholders = ','.join('?' for _ in methods)
    val = _fetch_val(
        f"""
        SELECT COALESCE(SUM(amount_rub), 0.0)
        FROM transactions
        WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success', 'succeeded')
          AND LOWER(COALESCE(payment_method, '')) IN ({placeholders})
          AND LOWER(COALESCE(payment_method, '')) NOT IN ('balance', 'admin', 'referral')
        """,
        methods,
        0.0,
        f"Не удалось получить доход по методу {payment_method}"
    )
    return float(val) if val is not None else 0.0

# ===================================


# ===== GET_TODAY_INCOME_BY_CURRENCY =====
def get_today_income_by_currency() -> dict:
    rub_methods = ('yookassa', 'platega', 'platega payform')
    crypto_methods = ('telegram stars', 'cryptobot', 'heleket', 'ton connect', 'platega crypto')
    rub = _fetch_val(
        f"""
        SELECT COALESCE(SUM(amount_rub), 0.0)
        FROM transactions
        WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success')
          AND {sql_date_eq_msk_today('created_date')}
          AND LOWER(COALESCE(payment_method, '')) IN ({','.join('?' for _ in rub_methods)})
        """,
        rub_methods, 0.0, "Не удалось получить рублёвый доход за сегодня"
    )
    crypto = _fetch_val(
        f"""
        SELECT COALESCE(SUM(amount_rub), 0.0)
        FROM transactions
        WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success')
          AND {sql_date_eq_msk_today('created_date')}
          AND LOWER(COALESCE(payment_method, '')) IN ({','.join('?' for _ in crypto_methods)})
        """,
        crypto_methods, 0.0, "Не удалось получить крипто доход за сегодня"
    )
    return {"rub": float(rub or 0), "crypto": float(crypto or 0)}

# ========================================


# ===== CREATE_PENDING_TRANSACTION =====
def create_pending_transaction(payment_id: str, user_id: int, amount_rub: float, metadata: dict) -> int:
    cursor = _exec(
        "INSERT INTO transactions (payment_id, user_id, status, amount_rub, metadata) VALUES (?, ?, ?, ?, ?)",
        (payment_id, user_id, 'pending', amount_rub, json.dumps(metadata)),
        f"Не удалось создать ожидающую транзакцию для пользователя {user_id}"
    )
    return cursor.lastrowid if cursor else 0

# ====================================


# ===== LOG_TRANSACTION_SIMPLE =====
def log_transaction_simple(user_id: int, amount: float, method: str, description: str) -> bool:
    logging.info(f"📝 Логирование транзакции: user={user_id}, amount={amount}, method={method}")
    cursor = _exec(
        """
        INSERT INTO transactions (user_id, amount_rub, payment_method, status, description, created_date)
        VALUES (?, ?, ?, 'paid', ?, ?)
        """,
        (user_id, amount, method, description, get_msk_time().replace(tzinfo=None).replace(microsecond=0)),
        f"Не удалось залогировать транзакцию для пользователя {user_id}"
    )
    if cursor: logging.info(f"✅ Транзакция успешно сохранена для пользователя {user_id}"); return True
    return False

# ==================================

# ===== FIND_AND_COMPLETE_TON_TRANSACTION =====
def find_and_complete_ton_transaction(payment_id: str, amount_ton: float) -> dict | None:
    meta = _get_pending_metadata(payment_id)
    if not meta:
        logging.warning(f"TON Webhook: неизвестный или уже обработанный payment_id: {payment_id}")
        return None

    expected_raw = meta.get("expected_amount_ton")
    if expected_raw is not None:
        try:
            expected = float(expected_raw)
        except (TypeError, ValueError):
            logging.warning(f"TON Webhook: некорректная expected_amount_ton для {payment_id}")
            return None
        tolerance = max(0.001, expected * 0.01)
        if amount_ton + tolerance < expected:
            logging.warning(
                f"TON Webhook: сумма {amount_ton} TON ниже ожидаемой {expected} для {payment_id}"
            )
            return None

    if not _complete_pending(payment_id):
        logging.warning(f"TON Webhook: дубликат или уже оплаченный {payment_id}")
        return None

    meta["amount_ton_paid"] = amount_ton
    return meta

# ===============================================


# ===== LOG_TRANSACTION =====
def log_transaction(username: str, transaction_id: str | None, payment_id: str | None, user_id: int, status: str, amount_rub: float, amount_currency: float | None, currency_name: str | None, payment_method: str, metadata: str):
    created = get_msk_time().replace(tzinfo=None).replace(microsecond=0)
    cols = [
        "username", "payment_id", "user_id", "status", "amount_rub",
        "amount_currency", "currency_name", "payment_method", "metadata", "created_date",
    ]
    vals: list[Any] = [
        username, payment_id, user_id, status, amount_rub,
        amount_currency, currency_name, payment_method, metadata, created,
    ]
    if transaction_id is not None:
        cols.insert(1, "transaction_id")
        vals.insert(1, transaction_id)
    placeholders = ", ".join("?" for _ in cols)
    _exec(
        f"INSERT INTO transactions ({', '.join(cols)}) VALUES ({placeholders})",
        tuple(vals),
        f"Не удалось залогировать транзакцию для пользователя {user_id}",
    )

# ===========================

# ===== CHECK_TRANSACTION_EXISTS =====
def check_transaction_exists(payment_id: str) -> bool:
    row = _fetch_row("SELECT 1 as ex FROM transactions WHERE payment_id = ? LIMIT 1", (payment_id,), f"Не удалось проверить транзакцию {payment_id}")
    return bool(row)


def get_paginated_transactions(page: int = 1, per_page: int = 15) -> tuple[list[dict], int]:
    offset = (page - 1) * per_page
    transactions = []
    total = 0

    r_count = _fetch_row("SELECT COUNT(*) as c FROM transactions", (), "Не удалось получить кол-во транзакций")
    total = r_count["c"] if r_count else 0

    query = "SELECT * FROM transactions ORDER BY created_date DESC LIMIT ? OFFSET ?"
    rows = _fetch_list(query, (per_page, offset), "Не удалось получить страницу транзакций")

    for row in rows:
        transaction_dict = dict(row)
        
        metadata_str = transaction_dict.get('metadata')
        if metadata_str:
            try:
                metadata = json.loads(metadata_str)
                transaction_dict['action'] = metadata.get('action')
                transaction_dict['host_name'] = metadata.get('host_name', 'N/A')
                transaction_dict['plan_name'] = metadata.get('plan_name', 'N/A')
            except json.JSONDecodeError:
                transaction_dict['action'] = None
                transaction_dict['host_name'] = 'Error'
                transaction_dict['plan_name'] = 'Error'
        else:
            transaction_dict['host_name'] = 'N/A'
            transaction_dict['plan_name'] = 'N/A'
        
        transactions.append(transaction_dict)
    
    return transactions, total

# ==========================


# ===== GET_RECENT_TRANSACTIONS =====
def get_recent_transactions(limit: int = 15) -> list[dict]:
    query = f"""
        SELECT
            k.key_id,
            k.host_name,
            k.created_at,
            u.telegram_id,
            u.username
        FROM vpn_keys k
        JOIN users u ON k.user_id = u.telegram_id
        ORDER BY {sql_order_datetime('k.created_at')} DESC, k.key_id DESC
        LIMIT ?
    """
    rows = _fetch_list(query, (limit,), "Не удалось получить последние транзакции")
    return rows

