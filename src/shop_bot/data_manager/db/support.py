from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone, timedelta

SUPPORT_REOPEN_HOURS = 24
import logging
from pathlib import Path
import json
import re
from typing import Any

import logging

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.connection import (
    DB_FILE,
    get_msk_time,
    _now_str,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _exec_with_check,
)
from shop_bot.data_manager.db.dialect import msk_time_filter


# ===== CREATE_SUPPORT_TICKET =====
def create_support_ticket(user_id: int, subject: str | None = None) -> int | None:
    row = _fetch_row(
        "SELECT ticket_id FROM support_tickets WHERE user_id = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 1",
        (user_id,),
        ""
    )
    if row and row['ticket_id']: return int(row['ticket_id'])

    cursor = _exec(
        "INSERT INTO support_tickets (user_id, subject) VALUES (?, ?)",
        (user_id, subject),
        f"Не удалось создать тикет поддержки для пользователя {user_id}"
    )
    return cursor.lastrowid if cursor else None

    return cursor.lastrowid if cursor else None

# ===========================


# ===== GET_OR_CREATE_OPEN_TICKET =====
def get_or_create_open_ticket(user_id: int, subject: str | None = None) -> tuple[int | None, bool]:
    row = _fetch_row(
        "SELECT ticket_id FROM support_tickets WHERE user_id = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 1",
        (user_id,),
        f"Не удалось получить тикет для пользователя {user_id}"
    )
    if row and row['ticket_id']: return int(row['ticket_id']), False
    cursor = _exec(
        "INSERT INTO support_tickets (user_id, subject) VALUES (?, ?)",
        (user_id, subject),
        f"Не удалось создать/получить тикет для пользователя {user_id}"
    )
    if cursor and cursor.lastrowid: return int(cursor.lastrowid), True
    return None, False

    return None, False

# ===================================


# ===== ADD_SUPPORT_MESSAGE =====
def add_support_message(ticket_id: int, sender: str, content: str) -> int | None:
    cursor = _exec(
        "INSERT INTO support_messages (ticket_id, sender, content) VALUES (?, ?, ?)",
        (ticket_id, sender, content),
        f"Не удалось добавить сообщение в тикет {ticket_id}"
    )
    if cursor and cursor.lastrowid: mid = cursor.lastrowid; _exec("UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?", (ticket_id,), "Не удалось обновить время тикета"); return mid
    return None

# =============================


# ===== UPDATE_TICKET_THREAD_INFO =====
def update_ticket_thread_info(ticket_id: int, forum_chat_id: str | None, message_thread_id: int | None) -> bool:
    cursor = _exec(
        "UPDATE support_tickets SET forum_chat_id = ?, message_thread_id = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
        (forum_chat_id, message_thread_id, ticket_id),
        f"Не удалось обновить инфо о треде для тикета {ticket_id}"
    )
    return cursor is not None and cursor.rowcount > 0

    return cursor is not None and cursor.rowcount > 0

# =================================


# ===== GET_TICKET =====
def get_ticket(ticket_id: int) -> dict | None:
    return _fetch_row(
        """
        SELECT t.*,
               u.username,
               (SELECT sender FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1) AS last_sender,
               (SELECT content FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1) AS last_message
        FROM support_tickets t
        LEFT JOIN users u ON t.user_id = u.telegram_id
        WHERE t.ticket_id = ?
        """,
        (ticket_id,),
        f"Не удалось получить тикет {ticket_id}",
    )

# ==================


# ===== GET_TICKET_BY_THREAD =====
def get_ticket_by_thread(forum_chat_id: str, message_thread_id: int) -> dict | None:
    return _fetch_row(
        "SELECT * FROM support_tickets WHERE forum_chat_id = ? AND message_thread_id = ?",
        (str(forum_chat_id), int(message_thread_id)),
        f"Не удалось получить тикет по треду {forum_chat_id}/{message_thread_id}"
    )

    return _fetch_row(
        "SELECT * FROM support_tickets WHERE forum_chat_id = ? AND message_thread_id = ?",
        (str(forum_chat_id), int(message_thread_id)),
        f"Не удалось получить тикет по треду {forum_chat_id}/{message_thread_id}"
    )

# ============================


# ===== GET_USER_TICKETS =====
def get_user_tickets(user_id: int, status: str | None = None) -> list[dict]:
    if status:
        return _fetch_list(
            "SELECT * FROM support_tickets WHERE user_id = ? AND status = ? ORDER BY updated_at DESC",
            (user_id, status),
            f"Не удалось получить тикеты для пользователя {user_id}"
        )
    return _fetch_list(
        "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
        f"Не удалось получить тикеты для пользователя {user_id}"
    )

    return _fetch_list(
        "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,),
        f"Не удалось получить тикеты для пользователя {user_id}"
    )

# ============================


# ===== GET_TICKET_MESSAGES =====
def get_ticket_messages(ticket_id: int) -> list[dict]:
    return _fetch_list(
        "SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC",
        (ticket_id,),
        f"Не удалось получить сообщения для тикета {ticket_id}"
    )

# ===============================


# ===== _PARSE_DB_TIMESTAMP =====
def _parse_db_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(text[:26], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


# ===== GET_TICKET_CLOSED_AT =====
def get_ticket_closed_at(ticket: dict | None) -> datetime | None:
    if not ticket or ticket.get("status") != "closed":
        return None
    return _parse_db_timestamp(ticket.get("closed_at") or ticket.get("updated_at"))


# ===== CAN_REOPEN_SUPPORT_TICKET =====
def can_reopen_support_ticket(ticket: dict | None) -> tuple[bool, str | None]:
    if not ticket:
        return False, "Тикет не найден"
    if ticket.get("status") == "open":
        return False, "Обращение уже открыто"
    closed_at = get_ticket_closed_at(ticket)
    if not closed_at:
        return True, None
    deadline = closed_at + timedelta(hours=SUPPORT_REOPEN_HOURS)
    if datetime.now(timezone.utc) > deadline:
        return (
            False,
            "Переоткрыть обращение можно только в течение 24 часов после закрытия. Создайте новое.",
        )
    return True, None


# ===== GET_TICKET_REOPEN_DEADLINE =====
def get_ticket_reopen_deadline(ticket: dict | None) -> str | None:
    closed_at = get_ticket_closed_at(ticket)
    if not closed_at:
        return None
    return (closed_at + timedelta(hours=SUPPORT_REOPEN_HOURS)).strftime("%Y-%m-%d %H:%M:%S")


# ===== SET_TICKET_STATUS =====
def set_ticket_status(ticket_id: int, status: str) -> bool:
    if status == "closed":
        cursor = _exec(
            "UPDATE support_tickets SET status = ?, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
            (status, ticket_id),
            f"Не удалось установить статус '{status}' для тикета {ticket_id}",
        )
    elif status == "open":
        cursor = _exec(
            "UPDATE support_tickets SET status = ?, closed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
            (status, ticket_id),
            f"Не удалось установить статус '{status}' для тикета {ticket_id}",
        )
    else:
        cursor = _exec(
            "UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
            (status, ticket_id),
            f"Не удалось установить статус '{status}' для тикета {ticket_id}",
        )
    return cursor is not None and cursor.rowcount > 0

# ===========================


# ===== UPDATE_TICKET_SUBJECT =====
def update_ticket_subject(ticket_id: int, subject: str) -> bool:
    cursor = _exec(
        "UPDATE support_tickets SET subject = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
        (subject, ticket_id),
        f"Не удалось обновить тему для тикета {ticket_id}"
    )
    return cursor is not None and cursor.rowcount > 0

    return cursor is not None and cursor.rowcount > 0

# ===============================


# ===== DELETE_TICKET =====
def delete_ticket(ticket_id: int) -> bool:
    _exec("DELETE FROM support_messages WHERE ticket_id = ?", (ticket_id,), "Не удалось удалить сообщения тикета")
    cursor = _exec("DELETE FROM support_tickets WHERE ticket_id = ?", (ticket_id,), f"Не удалось удалить тикет {ticket_id}")
    return cursor is not None and cursor.rowcount > 0

    return cursor is not None and cursor.rowcount > 0

# ===========================


# ===== GET_TICKETS_PAGINATED =====
def get_tickets_paginated(
    page: int = 1,
    per_page: int = 20,
    status: str | None = None,
    search: str | None = None,
    sort: str | None = None,
) -> tuple[list[dict], int]:
    offset = (page - 1) * per_page
    where_parts: list[str] = []
    params: list[Any] = []

    if status == 'waiting':
        where_parts.append(
            """t.status = 'open' AND (
                SELECT sender FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1
            ) != 'admin'"""
        )
    elif status and status not in ('', 'all'):
        where_parts.append("t.status = ?")
        params.append(status)

    q = (search or '').strip()
    if q:
        like = f"%{q}%"
        where_parts.append(
            "(CAST(t.ticket_id AS TEXT) LIKE ? OR CAST(t.user_id AS TEXT) LIKE ? "
            "OR u.username LIKE ? OR t.subject LIKE ? OR EXISTS ("
            "SELECT 1 FROM support_messages sm WHERE sm.ticket_id = t.ticket_id AND sm.content LIKE ?))"
        )
        params.extend([like, like, like, like, like])

    where_clause = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""

    count_query = f"""
        SELECT COUNT(*)
        FROM support_tickets t
        LEFT JOIN users u ON t.user_id = u.telegram_id
        {where_clause}
    """
    total = _fetch_val(count_query, tuple(params), 0) or 0

    base_query = """
        SELECT t.*,
               u.username,
               (SELECT sender FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1) AS last_sender,
               (SELECT content FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1) AS last_message,
               (SELECT COUNT(*) FROM support_messages
                WHERE ticket_id = t.ticket_id) AS message_count
        FROM support_tickets t
        LEFT JOIN users u ON t.user_id = u.telegram_id
    """

    sort_key = (sort or 'priority').strip().lower()
    if sort_key == 'created':
        order_clause = " ORDER BY t.created_at DESC"
    elif sort_key == 'oldest':
        order_clause = " ORDER BY t.updated_at ASC"
    elif sort_key == 'updated':
        order_clause = " ORDER BY t.updated_at DESC"
    else:
        order_clause = """
        ORDER BY
        CASE
            WHEN t.status = 'open' AND (
                SELECT sender FROM support_messages
                WHERE ticket_id = t.ticket_id
                ORDER BY created_at DESC LIMIT 1
            ) != 'admin' THEN 1
            WHEN t.status = 'open' THEN 2
            ELSE 3
        END ASC,
        CASE WHEN t.subject LIKE '⭐%' THEN 0 ELSE 1 END ASC,
        t.updated_at DESC
    """

    full_query = base_query + where_clause + order_clause + " LIMIT ? OFFSET ?"
    params.extend([per_page, offset])

    rows = _fetch_list(full_query, tuple(params), "Не удалось получить страницу тикетов поддержки")
    return rows, total

# ===========================


# ===== TOGGLE_TICKET_IMPORTANT =====
def toggle_ticket_important(ticket_id: int) -> tuple[bool, str | None]:
    ticket = get_ticket(ticket_id)
    if not ticket:
        return False, None
    subject = (ticket.get('subject') or '').strip() or 'Без темы'
    if subject.startswith('⭐ '):
        new_subject = subject[2:].strip() or 'Без темы'
    elif subject.startswith('⭐'):
        new_subject = subject.lstrip('⭐').strip() or 'Без темы'
    else:
        new_subject = f"⭐ {subject}"
    if update_ticket_subject(ticket_id, new_subject):
        return True, new_subject
    return False, None

# ================================


# ===== GET_OPEN_TICKETS_COUNT =====
def get_open_tickets_count() -> int:
    return _fetch_val("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'", (), 0) or 0

# ==============================


# ===== GET_WAITING_TICKETS_COUNT =====
def get_waiting_tickets_count() -> int:
    query = """
        SELECT COUNT(*) FROM support_tickets t
        WHERE t.status = 'open' AND (
            SELECT sender FROM support_messages 
            WHERE ticket_id = t.ticket_id 
            ORDER BY created_at DESC LIMIT 1
        ) != 'admin'
    """
    return _fetch_val(query, (), 0, "Не удалось получить кол-во ожидающих тикетов")

# ===================================


# ===== GET_SUPPORT_BADGE_COUNTS =====
def get_support_badge_counts() -> dict:
    """Универсальная функция для получения всех счетчиков бейджей в один запрос."""
    try:
        # Получаем общее количество открытых тикетов
        open_count = _fetch_val("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'", (), 0) or 0
        
        # Получаем количество тикетов, ожидающих ответа админа (последнее сообщение не от админа)
        waiting_count = _fetch_val("""
            SELECT COUNT(*) FROM support_tickets t
            WHERE t.status = 'open' AND (
                SELECT sender FROM support_messages 
                WHERE ticket_id = t.ticket_id 
                ORDER BY created_at DESC LIMIT 1
            ) != 'admin'
        """, (), 0) or 0
        
        return {
            "ok": True,
            "open_count": open_count,
            "waiting_tickets_count": waiting_count
        }
    except Exception as e:
        logger.error(f"Ошибка при получении счетчиков бейджей: {e}")
        return {"ok": False, "error": str(e), "open_count": 0, "waiting_tickets_count": 0}



# ===== GET_CLOSED_TICKETS_COUNT =====
def get_closed_tickets_count() -> int:
    return _fetch_val("SELECT COUNT(*) FROM support_tickets WHERE status = 'closed'", (), 0) or 0

# ==================================


# ===== GET_ALL_TICKETS_COUNT =====
def get_all_tickets_count() -> int:
    return _fetch_val("SELECT COUNT(*) FROM support_tickets", (), 0) or 0


# ===== GET_IMPORTANT_TICKETS_COUNT =====
def get_important_tickets_count() -> int:
    return _fetch_val("SELECT COUNT(*) FROM support_tickets WHERE subject LIKE '⭐%'", (), 0) or 0


# ===== GET_SUPPORT_INBOX_STATS =====
def get_support_inbox_stats() -> dict:
    messages_today = _fetch_val(
        f"SELECT COUNT(*) FROM support_messages WHERE created_at >= {msk_time_filter()}",
        ('-1 day',),
        0,
    ) or 0
    return {
        'waiting': get_waiting_tickets_count(),
        'open': get_open_tickets_count(),
        'closed': get_closed_tickets_count(),
        'all': get_all_tickets_count(),
        'important': get_important_tickets_count(),
        'messages_today': messages_today,
    }


# ===== GET_TICKETS_FOR_EXPORT =====
def get_tickets_for_export(status: str | None = None, search: str | None = None, limit: int = 5000) -> list[dict]:
    rows, _ = get_tickets_paginated(page=1, per_page=limit, status=status, search=search, sort='updated')
    return rows

