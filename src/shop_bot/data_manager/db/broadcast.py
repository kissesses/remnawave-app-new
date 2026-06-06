"""Broadcast delivery history storage."""

from __future__ import annotations

from shop_bot.data_manager.db.connection import _exec, _fetch_list, _fetch_row, _fetch_val, get_msk_time

BROADCAST_HISTORY_LIMIT = 50

REASON_LABELS = {
    'blocked_bot': 'Заблокировал бота',
    'deactivated': 'Аккаунт удалён в Telegram',
    'skip_banned_list': 'В списке ЧС (пропуск)',
    'user_banned': 'Забанен в системе',
    'forbidden_other': 'Telegram запретил доставку',
    'rate_limit': 'Лимит Telegram',
    'error': 'Ошибка отправки',
}

STATUS_LABELS = {
    'sent': 'Доставлено',
    'skipped': 'Пропущено',
    'failed': 'Не доставлено',
}


def create_broadcast_run(
    broadcast_id: str,
    *,
    mode: str,
    skip_banned: bool,
    text_preview: str,
    total_recipients: int,
) -> bool:
    now = get_msk_time().replace(tzinfo=None).replace(microsecond=0)
    cursor = _exec(
        """
        INSERT INTO broadcast_runs (
            id, started_at, mode, skip_banned, text_preview, total_recipients
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (broadcast_id, now, mode, 1 if skip_banned else 0, (text_preview or '')[:240], total_recipients),
        f"Не удалось создать запись рассылки {broadcast_id}",
    )
    return bool(cursor)


def save_broadcast_deliveries(broadcast_id: str, deliveries: list[dict]) -> None:
    if not deliveries:
        return
    rows = []
    for item in deliveries:
        uid = item.get('telegram_id')
        if not uid:
            continue
        rows.append((
            broadcast_id,
            int(uid),
            item.get('status') or 'failed',
            item.get('reason'),
            (item.get('error_detail') or '')[:500] or None,
        ))
    if not rows:
        return
    from shop_bot.data_manager.db.connection import get_db_connection
    conn = get_db_connection()
    try:
        conn.executemany(
            """
            INSERT OR REPLACE INTO broadcast_deliveries
                (broadcast_id, telegram_id, status, reason, error_detail)
            VALUES (?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def finish_broadcast_run(broadcast_id: str, stats: dict) -> None:
    now = get_msk_time().replace(tzinfo=None).replace(microsecond=0)
    _exec(
        """
        UPDATE broadcast_runs SET
            finished_at = ?,
            sent_count = ?,
            failed_count = ?,
            skipped_count = ?,
            blocked_bot_count = ?,
            deactivated_count = ?
        WHERE id = ?
        """,
        (
            now,
            int(stats.get('sent') or 0),
            int(stats.get('failed') or 0),
            int(stats.get('skipped') or 0),
            int(stats.get('blocked_bot') or 0),
            int(stats.get('deactivated') or 0),
            broadcast_id,
        ),
        f"Не удалось завершить запись рассылки {broadcast_id}",
    )
    _trim_broadcast_history(BROADCAST_HISTORY_LIMIT)


def _trim_broadcast_history(keep: int) -> None:
    rows = _fetch_list(
        """
        SELECT id FROM broadcast_runs
        ORDER BY started_at DESC
        LIMIT -1 OFFSET ?
        """,
        (keep,),
        "Не удалось получить старые рассылки",
    ) or []
    if not rows:
        return
    ids = [row['id'] for row in rows if row.get('id')]
    if not ids:
        return
    placeholders = ','.join('?' for _ in ids)
    _exec(
        f"DELETE FROM broadcast_deliveries WHERE broadcast_id IN ({placeholders})",
        tuple(ids),
        "Не удалось удалить старые доставки рассылок",
    )
    _exec(
        f"DELETE FROM broadcast_runs WHERE id IN ({placeholders})",
        tuple(ids),
        "Не удалось удалить старые рассылки",
    )


def list_broadcast_runs(limit: int = 30) -> list[dict]:
    rows = _fetch_list(
        """
        SELECT *
        FROM broadcast_runs
        ORDER BY started_at DESC
        LIMIT ?
        """,
        (limit,),
        "Не удалось получить историю рассылок",
    ) or []
    return [dict(row) for row in rows]


def get_broadcast_run(broadcast_id: str) -> dict | None:
    row = _fetch_row(
        "SELECT * FROM broadcast_runs WHERE id = ?",
        (broadcast_id,),
        f"Не удалось получить рассылку {broadcast_id}",
    )
    return dict(row) if row else None


def get_broadcast_delivery_stats(broadcast_id: str) -> dict:
    rows = _fetch_list(
        """
        SELECT status, reason, COUNT(*) AS cnt
        FROM broadcast_deliveries
        WHERE broadcast_id = ?
        GROUP BY status, reason
        """,
        (broadcast_id,),
        f"Не удалось получить статистику доставок {broadcast_id}",
    ) or []
    breakdown = {}
    for row in rows:
        status = row.get('status') or 'unknown'
        reason = row.get('reason') or '_none'
        breakdown.setdefault(status, {})[reason] = int(row.get('cnt') or 0)
    return breakdown


def get_broadcast_deliveries(
    broadcast_id: str,
    *,
    page: int = 1,
    per_page: int = 50,
    status: str | None = None,
    reason: str | None = None,
    search: str | None = None,
) -> tuple[list[dict], int]:
    page = max(1, page)
    per_page = min(max(1, per_page), 200)
    offset = (page - 1) * per_page

    where = ["d.broadcast_id = ?"]
    params: list = [broadcast_id]

    if status and status != 'all':
        where.append("d.status = ?")
        params.append(status)
    if reason and reason != 'all':
        where.append("d.reason = ?")
        params.append(reason)
    if search:
        term = search.strip()
        if term.isdigit():
            where.append("d.telegram_id = ?")
            params.append(int(term))
        else:
            where.append("LOWER(COALESCE(u.username, '')) LIKE ?")
            params.append(f"%{term.lower().lstrip('@')}%")

    where_sql = " AND ".join(where)
    total = _fetch_val(
        f"""
        SELECT COUNT(*)
        FROM broadcast_deliveries d
        LEFT JOIN users u ON u.telegram_id = d.telegram_id
        WHERE {where_sql}
        """,
        tuple(params),
        "Не удалось посчитать доставки рассылки",
    ) or 0

    rows = _fetch_list(
        f"""
        SELECT
            d.telegram_id,
            d.status,
            d.reason,
            d.error_detail,
            u.username,
            u.is_banned,
            u.total_spent
        FROM broadcast_deliveries d
        LEFT JOIN users u ON u.telegram_id = d.telegram_id
        WHERE {where_sql}
        ORDER BY
            CASE d.status
                WHEN 'failed' THEN 0
                WHEN 'skipped' THEN 1
                ELSE 2
            END,
            d.telegram_id ASC
        LIMIT ? OFFSET ?
        """,
        tuple(params + [per_page, offset]),
        "Не удалось получить доставки рассылки",
    ) or []

    items = []
    for row in rows:
        item = dict(row)
        reason_key = item.get('reason')
        item['reason_label'] = REASON_LABELS.get(reason_key, reason_key or '—')
        item['status_label'] = STATUS_LABELS.get(item.get('status'), item.get('status') or '—')
        item['username'] = (item.get('username') or '').strip()
        item['total_spent'] = float(item.get('total_spent') or 0)
        items.append(item)
    return items, int(total)
