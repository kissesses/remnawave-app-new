"""Telegram feed for panel audit log (admin actions channel)."""

from __future__ import annotations

import html
import json
import logging
from typing import Any

from shop_bot.data_manager.database import get_setting
from shop_bot.data_manager import panel_audit

logger = logging.getLogger(__name__)

SKIP_ACTIONS = frozenset({"audit.export"})

GROUP_EMOJI: dict[str, str] = {
    "auth": "🔐",
    "access": "🛡",
    "settings": "⚙️",
    "mail": "✉️",
    "bot_messages": "💬",
    "db": "🗄",
    "bot": "🤖",
    "user": "👤",
    "dashboard": "📊",
    "audit": "📋",
    "other": "📌",
}


def _truthy(raw: str | None, *, default: bool = False) -> bool:
    if raw is None or raw == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def should_notify_action(action: str) -> bool:
    if not _truthy(get_setting("notifications_admin_audit_enabled"), default=True):
        return False
    code = (action or "").strip()
    if not code or code in SKIP_ACTIONS:
        return False
    if code == "db.query" and not _truthy(get_setting("notifications_admin_audit_include_sql"), default=False):
        return False
    return True


def format_audit_telegram_message(
    action: str,
    *,
    admin_login: str | None = None,
    details: dict[str, Any] | str | None = None,
    ip: str | None = None,
) -> str:
    entry = panel_audit.humanize_entry(
        {
            "action": action,
            "admin_login": admin_login,
            "details": details if isinstance(details, str) else (
                json.dumps(details, ensure_ascii=False, default=str) if details else None
            ),
            "ip": ip,
        }
    )
    emoji = GROUP_EMOJI.get(entry.get("action_group") or "other", GROUP_EMOJI["other"])
    label = html.escape(str(entry.get("action_label") or action))
    who = html.escape(str(admin_login or "—"))
    lines = [f"{emoji} <b>{label}</b>", f"👤 {who}"]
    if ip:
        lines.append(f"🌐 <code>{html.escape(str(ip))}</code>")
    summary = (entry.get("summary") or "").strip()
    if summary and summary != entry.get("action_label"):
        lines.append(f"📝 {html.escape(summary)}")
    code = html.escape(action)
    lines.append(f"<code>{code}</code>")
    return "\n".join(lines)


def notify_audit_action(
    action: str,
    *,
    admin_id: int | None = None,
    admin_login: str | None = None,
    details: dict[str, Any] | str | None = None,
    ip: str | None = None,
) -> None:
    if not should_notify_action(action):
        return
    try:
        from shop_bot.data_manager import telegram_notify as tg_notify
        from shop_bot.webhook_server.context import panel_ctx

        bot = panel_ctx.bot_controller.get_bot_instance()
        if not bot:
            return
        loop = None
        try:
            from flask import has_app_context, current_app

            if has_app_context():
                loop = current_app.config.get("EVENT_LOOP")
        except Exception:
            loop = None

        text = format_audit_telegram_message(
            action,
            admin_login=admin_login,
            details=details,
            ip=ip,
        )
        tg_notify.send_notification_sync(bot, loop, tg_notify.CATEGORY_ADMIN, text)
    except Exception as exc:
        logger.debug("Audit telegram notify skipped (%s): %s", action, exc)
