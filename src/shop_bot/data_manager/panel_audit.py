"""Audit log for panel administrator actions."""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import Any

from shop_bot.data_manager.database import DB_FILE, get_db_connection
from shop_bot.data_manager.db.dialect import adapt_sql, first_col, msk_today_sql, sql_date_msk

logger = logging.getLogger(__name__)

MAX_DETAILS_LEN = 2000

ACTION_LABELS: dict[str, str] = {
    "login.success": "Вход в панель",
    "login.failed": "Неудачный вход",
    "login.blocked": "Вход заблокирован",
    "logout": "Выход",
    "settings.save": "Сохранение настроек",
    "smtp.test": "Тест SMTP",
    "mail_templates.save": "Mail Studio — сохранение",
    "mail_templates.reset": "Mail Studio — сброс",
    "mail_templates.test": "Mail Studio — тест",
    "role.save": "Роль — сохранение",
    "role.delete": "Роль — удаление",
    "admin.save": "Администратор — сохранение",
    "admin.delete": "Администратор — удаление",
    "invite.created": "Приглашение — создано",
    "invite.revoked": "Приглашение — отозвано",
    "invite.redeemed": "Приглашение — принято",
    "invite.url_viewed": "Приглашение — ссылка скопирована",
    "invite.regenerated": "Приглашение — ссылка обновлена",
    "totp.setup_begin": "Настройка 2FA",
    "totp.enabled": "2FA включена",
    "totp.disabled": "2FA отключена",
    "security.method_changed": "Смена метода входа",
    "auth_methods.updated": "Методы входа обновлены",
    "telegram.linked": "Telegram привязан",
    "telegram.unlinked": "Telegram отвязан",
    "passkey.registered": "Passkey добавлен",
    "passkey.deleted": "Passkey удалён",
    "audit.export": "Экспорт журнала",
    "db.restore": "Восстановление БД",
    "db.backup.settings": "Настройки бэкапа",
    "db.backup.create": "Создание бэкапа",
    "db.backup.cleanup": "Очистка бэкапов",
    "db.backup.duplicate": "Копия бэкапа",
    "db.backup.delete": "Удаление бэкапа",
    "db.backup.telegram": "Отправка бэкапа в Telegram",
    "db.stepup": "БД — подтверждение 2FA",
    "db.stepup.lock": "БД — блокировка сессии",
    "db.maintenance": "БД — обслуживание",
    "bot.start": "Запуск бота",
    "bot.stop": "Остановка бота",
    "user.ban": "Бан пользователя",
    "user.delete": "Удаление пользователя",
    "dashboard.layout_save": "Dashboard Studio — сохранение",
    "dashboard.layout_global": "Dashboard Studio — глобально",
    "dashboard.layout_reset": "Dashboard Studio — сброс",
    "bot_messages.save": "Bot messages — сохранение",
    "bot_messages.reset": "Bot messages — сброс",
    "db.delete_rows": "БД — удаление строк",
    "db.truncate": "БД — очистка таблицы",
    "db.query": "БД — SQL-запрос",
}

ACTION_GROUPS: list[dict[str, str]] = [
    {"id": "auth", "label": "Вход"},
    {"id": "access", "label": "Доступ"},
    {"id": "settings", "label": "Настройки"},
    {"id": "mail", "label": "Почта"},
    {"id": "bot_messages", "label": "Bot messages"},
    {"id": "db", "label": "База данных"},
    {"id": "bot", "label": "Боты"},
    {"id": "user", "label": "Пользователи"},
    {"id": "dashboard", "label": "Dashboard"},
    {"id": "audit", "label": "Аудит"},
]


def _connect():
    return get_db_connection()


def ensure_audit_schema(cursor: sqlite3.Cursor) -> None:
    from shop_bot.data_manager.db.dialect import is_postgresql

    if is_postgresql():
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS panel_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER,
            admin_login TEXT,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_panel_audit_created ON panel_audit_log(created_at DESC)"
    )


def log_action(
    action: str,
    *,
    admin_id: int | None = None,
    admin_login: str | None = None,
    details: dict[str, Any] | str | None = None,
    ip: str | None = None,
) -> None:
    if details is not None and not isinstance(details, str):
        try:
            details_text = json.dumps(details, ensure_ascii=False, default=str)
        except Exception:
            details_text = str(details)
    else:
        details_text = details
    if details_text and len(details_text) > MAX_DETAILS_LEN:
        details_text = details_text[:MAX_DETAILS_LEN] + "…"

    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO panel_audit_log (admin_id, admin_login, action, details, ip)
                VALUES (?, ?, ?, ?, ?)
                """,
                (admin_id, admin_login, action, details_text, ip),
            )
            conn.commit()
    except Exception as exc:
        logger.error("Failed to write audit log: %s", exc)


def list_recent(limit: int = 80) -> list[dict[str, Any]]:
    items, _ = list_filtered(limit=limit, offset=0)
    return items


def _action_group(action: str) -> str:
    if not action:
        return "other"
    if action.startswith("login.") or action == "logout":
        return "auth"
    prefix = action.split(".", 1)[0]
    return prefix if prefix in {g["id"] for g in ACTION_GROUPS} else "other"


def _parse_details(raw: Any) -> dict[str, Any] | list | str | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, (dict, list)) else raw
        except (json.JSONDecodeError, TypeError):
            return raw
    return str(raw)


def list_filtered(
    *,
    q: str = "",
    admin_login: str = "",
    admin_id: int | None = None,
    action: str = "",
    actions: list[str] | None = None,
    group: str = "",
    ip: str = "",
    date_from: str = "",
    date_to: str = "",
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))
    clauses: list[str] = []
    params: list[Any] = []

    if admin_id is not None:
        clauses.append("admin_id = ?")
        params.append(int(admin_id))

    admin_q = (admin_login or "").strip()
    if admin_q:
        clauses.append("admin_login LIKE ?")
        params.append(f"%{admin_q}%")

    action_list = [a.strip() for a in (actions or []) if a and str(a).strip()]
    if action_list:
        placeholders = ", ".join("?" for _ in action_list)
        clauses.append(f"action IN ({placeholders})")
        params.extend(action_list)
    else:
        action_q = (action or "").strip()
        if action_q:
            clauses.append("action LIKE ?")
            params.append(f"%{action_q}%")

    group_q = (group or "").strip()
    if group_q and group_q != "all":
        if group_q == "auth":
            clauses.append("(action LIKE 'login.%' OR action = 'logout')")
        else:
            clauses.append("action LIKE ?")
            params.append(f"{group_q}.%")

    ip_q = (ip or "").strip()
    if ip_q:
        clauses.append("ip LIKE ?")
        params.append(f"%{ip_q}%")

    date_from_q = (date_from or "").strip()
    if date_from_q:
        clauses.append("created_at >= ?")
        params.append(f"{date_from_q} 00:00:00")

    date_to_q = (date_to or "").strip()
    if date_to_q:
        clauses.append("created_at <= ?")
        params.append(f"{date_to_q} 23:59:59")

    text_q = (q or "").strip()
    if text_q:
        needle = f"%{text_q}%"
        clauses.append("(action LIKE ? OR details LIKE ? OR admin_login LIKE ? OR ip LIKE ?)")
        params.extend([needle, needle, needle, needle])

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    count_sql = adapt_sql(f"SELECT COUNT(*) FROM panel_audit_log{where}")
    list_sql = adapt_sql(
        f"""
        SELECT id, admin_id, admin_login, action, details, ip, created_at
        FROM panel_audit_log{where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """
    )

    with _connect() as conn:
        count_row = conn.execute(count_sql, tuple(params)).fetchone()
        total = int(first_col(count_row, 0))
        rows = conn.execute(list_sql, (*params, limit, offset)).fetchall()
    return [dict(row) for row in rows], total


def get_entry(entry_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            adapt_sql(
                """
                SELECT id, admin_id, admin_login, action, details, ip, created_at
                FROM panel_audit_log WHERE id = ?
                """
            ),
            (int(entry_id),),
        ).fetchone()
    if not row:
        return None
    return humanize_entry(dict(row), include_details=True)


def get_stats() -> dict[str, Any]:
    today_clause = f"{sql_date_msk('created_at')} = {msk_today_sql()}"
    with _connect() as conn:
        total_row = conn.execute(adapt_sql("SELECT COUNT(*) FROM panel_audit_log")).fetchone()
        total = int(first_col(total_row, 0))
        today_row = conn.execute(
            adapt_sql(f"SELECT COUNT(*) FROM panel_audit_log WHERE {today_clause}")
        ).fetchone()
        today = int(first_col(today_row, 0))
        top_rows = conn.execute(
            adapt_sql(
                """
                SELECT action, COUNT(*) AS cnt
                FROM panel_audit_log
                GROUP BY action
                ORDER BY cnt DESC
                LIMIT 6
                """
            )
        ).fetchall()
        admin_rows = conn.execute(
            adapt_sql(
                """
                SELECT admin_login, COUNT(*) AS cnt
                FROM panel_audit_log
                WHERE admin_login IS NOT NULL AND admin_login != ''
                GROUP BY admin_login
                ORDER BY cnt DESC
                LIMIT 8
                """
            )
        ).fetchall()
    top_actions = [
        {
            "action": dict(r).get("action") or "",
            "label": ACTION_LABELS.get(dict(r).get("action") or "", dict(r).get("action") or ""),
            "count": int(dict(r).get("cnt") or 0),
        }
        for r in top_rows
    ]
    top_admins = [
        {"login": dict(r).get("admin_login") or "", "count": int(dict(r).get("cnt") or 0)}
        for r in admin_rows
    ]
    return {"total": total, "today": today, "top_actions": top_actions, "top_admins": top_admins}


def list_distinct_admins(limit: int = 50) -> list[str]:
    limit = max(1, min(int(limit), 200))
    with _connect() as conn:
        rows = conn.execute(
            adapt_sql(
                """
                SELECT DISTINCT admin_login FROM panel_audit_log
                WHERE admin_login IS NOT NULL AND admin_login != ''
                ORDER BY admin_login ASC
                LIMIT ?
                """
            ),
            (limit,),
        ).fetchall()
    return [dict(r).get("admin_login") or "" for r in rows if dict(r).get("admin_login")]


def list_action_catalog() -> list[dict[str, str]]:
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for code, label in sorted(ACTION_LABELS.items(), key=lambda x: x[1].lower()):
        if code in seen:
            continue
        seen.add(code)
        items.append({"code": code, "label": label, "group": _action_group(code)})
    return items


def list_for_export(limit: int = 5000) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 10000))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, admin_id, admin_login, action, details, ip, created_at
            FROM panel_audit_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def list_for_admin(admin_id: int, limit: int = 12) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 50))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, admin_id, admin_login, action, details, ip, created_at
            FROM panel_audit_log
            WHERE admin_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(admin_id), limit),
        ).fetchall()
    return [humanize_entry(dict(row)) for row in rows]


def humanize_entry(entry: dict[str, Any], *, include_details: bool = False) -> dict[str, Any]:
    action = (entry.get("action") or "").strip()
    label = ACTION_LABELS.get(action, action.replace(".", " · ").replace("_", " "))
    summary = ""
    raw = entry.get("details")
    details_parsed = _parse_details(raw)
    if details_parsed is not None:
        try:
            if isinstance(details_parsed, dict):
                bits = []
                if details_parsed.get("tab"):
                    bits.append(f"вкладка {details_parsed['tab']}")
                if details_parsed.get("template_id"):
                    bits.append(f"шаблон {details_parsed['template_id']}")
                if details_parsed.get("login"):
                    bits.append(str(details_parsed["login"]))
                if details_parsed.get("user_id"):
                    bits.append(f"user #{details_parsed['user_id']}")
                if details_parsed.get("admin_id"):
                    bits.append(f"admin #{details_parsed['admin_id']}")
                if details_parsed.get("table"):
                    bits.append(f"таблица {details_parsed['table']}")
                if details_parsed.get("rows") is not None:
                    bits.append(f"строк: {details_parsed['rows']}")
                summary = ", ".join(bits)
            else:
                summary = str(details_parsed)[:160]
        except (TypeError, ValueError):
            summary = str(raw)[:160] if raw else ""
    elif raw:
        summary = str(raw)[:160]
    result = {
        **entry,
        "action_label": label,
        "action_group": _action_group(action),
        "summary": summary or label,
    }
    if include_details:
        result["details_parsed"] = details_parsed
    return result


def list_for_user(user_id: int, limit: int = 50) -> list[dict[str, Any]]:
    """Audit entries related to a user (details contain user_id)."""
    limit = max(1, min(int(limit), 200))
    needle = str(int(user_id))
    patterns = (f'%"user_id": {needle}%', f'%"user_id": "{needle}"%', f'%"telegram_id": {needle}%')
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, admin_id, admin_login, action, details, ip, created_at
            FROM panel_audit_log
            WHERE details LIKE ? OR details LIKE ? OR details LIKE ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (*patterns, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def export_csv_filtered(
    *,
    q: str = "",
    admin_login: str = "",
    admin_id: int | None = None,
    action: str = "",
    actions: list[str] | None = None,
    group: str = "",
    ip: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 10000,
) -> str:
    import csv
    import io

    limit = max(1, min(int(limit), 10000))
    rows, _ = list_filtered(
        q=q,
        admin_login=admin_login,
        admin_id=admin_id,
        action=action,
        actions=actions,
        group=group,
        ip=ip,
        date_from=date_from,
        date_to=date_to,
        offset=0,
        limit=limit,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "admin_login", "action", "action_label", "ip", "details"])
    for row in rows:
        h = humanize_entry(row)
        writer.writerow([
            h.get("id"),
            h.get("created_at"),
            h.get("admin_login") or "",
            h.get("action") or "",
            h.get("action_label") or "",
            h.get("ip") or "",
            h.get("details") or "",
        ])
    return buf.getvalue()


def export_csv(limit: int = 5000) -> str:
    return export_csv_filtered(limit=limit)
