"""Маршрутизация админ-уведомлений в Telegram: один чат + топики по категориям."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any

from shop_bot.data_manager.database import get_admin_ids, get_setting

logger = logging.getLogger(__name__)

CATEGORY_CRM = "crm"
CATEGORY_BACKUP = "backup"
CATEGORY_SECRETS = "secrets"
CATEGORY_AUTH = "auth"
CATEGORY_NODES = "nodes"
CATEGORY_PAYMENTS = "payments"
CATEGORY_SQL = "sql"
CATEGORY_TRIAL = "trial"
CATEGORY_TICKETS = "tickets"
CATEGORY_ADMIN = "admin"

ALL_CATEGORIES = (
    CATEGORY_CRM,
    CATEGORY_BACKUP,
    CATEGORY_SECRETS,
    CATEGORY_AUTH,
    CATEGORY_NODES,
    CATEGORY_PAYMENTS,
    CATEGORY_SQL,
    CATEGORY_TRIAL,
    CATEGORY_TICKETS,
    CATEGORY_ADMIN,
)

CATEGORY_LABELS: dict[str, str] = {
    CATEGORY_CRM: "CRM",
    CATEGORY_BACKUP: "Архив бэкапов",
    CATEGORY_SECRETS: "Пароли архивов",
    CATEGORY_AUTH: "Авторизация в панели",
    CATEGORY_NODES: "Ноды и хосты",
    CATEGORY_PAYMENTS: "Покупки и продления",
    CATEGORY_SQL: "SQL / подтверждение БД",
    CATEGORY_TRIAL: "Пробный период",
    CATEGORY_TICKETS: "Тикеты поддержки",
    CATEGORY_ADMIN: "Действия админов",
}

CATEGORY_TOPIC_KEYS: dict[str, str] = {
    CATEGORY_CRM: "notifications_topic_crm",
    CATEGORY_BACKUP: "notifications_topic_backup",
    CATEGORY_SECRETS: "notifications_topic_secrets",
    CATEGORY_AUTH: "notifications_topic_auth",
    CATEGORY_NODES: "notifications_topic_nodes",
    CATEGORY_PAYMENTS: "notifications_topic_payments",
    CATEGORY_SQL: "notifications_topic_sql",
    CATEGORY_TRIAL: "notifications_topic_trial",
    CATEGORY_TICKETS: "notifications_topic_tickets",
    CATEGORY_ADMIN: "notifications_topic_admin",
}

# legacy fallback (chat, topic) — только если notifications_chat_id пуст
CATEGORY_LEGACY: dict[str, tuple[str, str]] = {
    CATEGORY_BACKUP: ("backup_telegram_chat_id", "backup_telegram_topic_id"),
    CATEGORY_SECRETS: ("backup_secrets_chat_id", "backup_secrets_topic_id"),
}


@dataclass(frozen=True)
class NotifyDestination:
    chat_id: int | None
    thread_id: int | None
    via_dm: bool = False


def parse_chat_id(raw: str | None) -> int | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def parse_topic_id(raw: str | None) -> int | None:
    s = (raw or "").strip()
    if s.isdigit():
        return int(s)
    return None


def effective_thread_id(thread_id: int | None) -> int | None:
    """General forum topic is 1 in t.me links but sendMessage must omit message_thread_id for it."""
    if thread_id == 1:
        return None
    return thread_id


def parse_telegram_private_link(raw: str | None) -> dict[str, int] | None:
    """Разбор ссылки t.me/c/… или «голого» inner id в Bot API chat_id (+ topic_id при наличии)."""
    s = (raw or "").strip()
    if not s:
        return None

    m = re.match(
        r"(?:https?://)?(?:www\.)?t\.me/c/(\d+)(?:/(\d+))?(?:/(\d+))?(?:[/?#]|$)",
        s,
        re.IGNORECASE,
    )
    if m:
        chat_id = int(f"-100{m.group(1)}")
        topic_id = int(m.group(2)) if m.group(2) else None
        out: dict[str, int] = {"chat_id": chat_id}
        if topic_id is not None:
            out["topic_id"] = topic_id
        return out

    if re.fullmatch(r"-100\d+", s):
        return {"chat_id": int(s)}

    if re.fullmatch(r"\d{6,}", s):
        return {"chat_id": int(f"-100{s}")}

    return None


def resolve_notifications_chat_id(raw: str | None) -> int | None:
    """Числовой chat_id из поля настроек: int, -100… или ссылка t.me/c/…"""
    s = (raw or "").strip()
    if not s:
        return None
    parsed = parse_chat_id(s)
    if parsed is not None:
        return parsed
    link = parse_telegram_private_link(s)
    if link and link.get("chat_id") is not None:
        return int(link["chat_id"])
    return None


def global_chat_id() -> int | None:
    return resolve_notifications_chat_id(get_setting("notifications_chat_id"))


def resolve_destination(category: str) -> NotifyDestination:
    """Чат форума + топик; иначе legacy; иначе DM админам."""
    cat = (category or "").strip().lower()
    global_chat = global_chat_id()

    topic_key = CATEGORY_TOPIC_KEYS.get(cat)
    topic_raw = get_setting(topic_key) if topic_key else None
    thread_id = effective_thread_id(parse_topic_id(topic_raw))

    if global_chat is not None:
        return NotifyDestination(chat_id=global_chat, thread_id=thread_id, via_dm=False)

    legacy = CATEGORY_LEGACY.get(cat)
    if legacy:
        leg_chat = parse_chat_id(get_setting(legacy[0]))
        leg_topic = effective_thread_id(parse_topic_id(get_setting(legacy[1])))
        if leg_chat is not None:
            return NotifyDestination(chat_id=leg_chat, thread_id=leg_topic, via_dm=False)

    return NotifyDestination(chat_id=None, thread_id=None, via_dm=True)


def assess_backup_delivery(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Проверка каналов для бэкапов (архив + секреты)."""
    archive = resolve_destination(CATEGORY_BACKUP)
    secrets = resolve_destination(CATEGORY_SECRETS)
    encrypt = True
    autobackup_tg = True
    autobackup_on = True
    if cfg:
        encrypt = bool(cfg.get("encrypt_enabled", True))
        autobackup_tg = bool(cfg.get("autobackup_telegram", True))
        autobackup_on = int(cfg.get("interval_days") or 0) > 0

    archive_ok = archive.chat_id is not None and not archive.via_dm
    secrets_ok = secrets.chat_id is not None and not secrets.via_dm
    delivery_ready = archive_ok and (not encrypt or secrets_ok)

    alerts: list[str] = []
    if autobackup_tg and autobackup_on:
        if not archive_ok:
            alerts.append(
                "Автобэкап в Telegram: укажите Chat ID в Настройки → Боты → Уведомления."
            )
        if encrypt and not secrets_ok:
            alerts.append(
                "Автобэкап: включено шифрование — нужен Chat ID (топик «Пароли» или legacy секретный канал)."
            )

    return {
        "archive_channel_configured": archive_ok,
        "secrets_channel_configured": secrets_ok,
        "delivery_ready": delivery_ready,
        "autobackup_delivery_blocked": bool(alerts),
        "delivery_alerts": alerts,
        "notifications_chat_configured": global_chat_id() is not None,
    }


def _is_thread_not_found(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "message thread not found" in msg or "invalid message thread" in msg


async def _send_forum_with_fallback(send_coro_factory, dest: NotifyDestination, *, label: str) -> None:
    """Send to forum topic; on missing thread retry without topic (General / main chat)."""
    thread_id = effective_thread_id(dest.thread_id)
    try:
        await send_coro_factory(thread_id)
        return
    except Exception as exc:
        if thread_id is None or not _is_thread_not_found(exc):
            raise
        logger.warning(
            "Notify forum %s: topic %s not found, retrying without topic (General/main chat)",
            label,
            dest.thread_id,
        )
        await send_coro_factory(None)


async def send_notification(
    bot,
    category: str,
    text: str,
    *,
    parse_mode: str = "HTML",
    reply_markup=None,
    disable_notification: bool = False,
) -> int:
    """Отправить уведомление; возвращает число успешных доставок."""
    dest = resolve_destination(category)
    sent = 0
    base = {"text": text, "parse_mode": parse_mode, "disable_notification": disable_notification}

    if dest.via_dm:
        for aid in get_admin_ids():
            try:
                await bot.send_message(chat_id=int(aid), **base, reply_markup=reply_markup)
                sent += 1
            except Exception as exc:
                logger.warning("Notify DM to %s failed (%s): %s", aid, category, exc)
        return sent

    try:
        await _send_forum_with_fallback(
            lambda thread_id: bot.send_message(
                **base,
                chat_id=dest.chat_id,
                reply_markup=reply_markup,
                **({"message_thread_id": thread_id} if thread_id is not None else {}),
            ),
            dest,
            label=category,
        )
        return 1
    except Exception as exc:
        logger.warning("Notify forum %s failed: %s", category, exc)
        for aid in get_admin_ids():
            try:
                await bot.send_message(chat_id=int(aid), **base, reply_markup=reply_markup)
                sent += 1
            except Exception:
                continue
        return sent


async def send_document(
    bot,
    category: str,
    document,
    *,
    caption: str | None = None,
    parse_mode: str = "HTML",
) -> int:
    dest = resolve_destination(category)
    kwargs: dict[str, Any] = {"document": document, "parse_mode": parse_mode}
    if caption:
        kwargs["caption"] = caption

    if dest.via_dm:
        sent = 0
        for aid in get_admin_ids():
            try:
                await bot.send_document(chat_id=int(aid), **kwargs)
                sent += 1
            except Exception as exc:
                logger.warning("Notify document DM to %s: %s", aid, exc)
        return sent

    try:
        await _send_forum_with_fallback(
            lambda thread_id: bot.send_document(
                chat_id=dest.chat_id,
                **kwargs,
                **({"message_thread_id": thread_id} if thread_id is not None else {}),
            ),
            dest,
            label=category,
        )
        return 1
    except Exception as exc:
        logger.warning("Notify document forum %s failed: %s", category, exc)
        sent = 0
        for aid in get_admin_ids():
            try:
                await bot.send_document(chat_id=int(aid), **kwargs)
                sent += 1
            except Exception as dm_exc:
                logger.warning("Notify document DM to %s failed (%s): %s", aid, category, dm_exc)
        return sent


def send_notification_sync(
    bot,
    loop,
    category: str,
    text: str,
    *,
    parse_mode: str = "HTML",
    reply_markup=None,
) -> None:
    if not bot:
        return
    coro = send_notification(bot, category, text, parse_mode=parse_mode, reply_markup=reply_markup)
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, loop)
    else:
        try:
            asyncio.run(coro)
        except Exception as exc:
            logger.warning("Notify sync failed (%s): %s", category, exc)


async def send_test(category: str, bot) -> tuple[bool, str]:
    label = CATEGORY_LABELS.get(category, category)
    dest = resolve_destination(category)
    topic_key = CATEGORY_TOPIC_KEYS.get(category)
    raw_topic = parse_topic_id(get_setting(topic_key) if topic_key else None)
    where = "личные сообщения админам" if dest.via_dm else f"чат {dest.chat_id}"
    if not dest.via_dm:
        if raw_topic == 1:
            where += ", General (поле Topic ID = 1 → отправка без топика)"
        elif dest.thread_id:
            where += f", топик {dest.thread_id}"
        elif raw_topic:
            where += f", топик {raw_topic} (недоступен — проверьте ссылку)"
        else:
            where += ", без топика (General / основной чат)"
    text = f"✅ Тест Remnawave App: <b>{label}</b>\nМаршрут: {where}"
    n = await send_notification(bot, category, text)
    if n <= 0:
        return False, "Не удалось отправить (проверьте Chat ID, топик и права бота)"
    return True, f"Тест «{label}» отправлен ({where})"
