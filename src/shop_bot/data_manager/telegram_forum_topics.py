"""Создание топиков форума для категорий уведомлений (Bot API createForumTopic)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from shop_bot.data_manager.database import get_setting, update_setting
from shop_bot.data_manager import telegram_notify as tg

logger = logging.getLogger(__name__)

# Telegram Bot API: допустимые icon_color для createForumTopic
ICON_BLUE = 7322096
ICON_YELLOW = 16766590
ICON_VIOLET = 13338331
ICON_GREEN = 9367192
ICON_ORANGE = 16749490
ICON_CYAN = 16478047

# Эмодзи из набора https://t.me/addemoji/tgmacicons — подбираются через getForumTopicIconStickers
TGMACICONS_PACK_URL = "https://t.me/addemoji/tgmacicons"


@dataclass(frozen=True)
class TopicCreateSpec:
    category: str
    title: str
    icon_color: int
    emoji_candidates: tuple[str, ...]


TOPIC_CREATE_SPECS: tuple[TopicCreateSpec, ...] = (
    TopicCreateSpec(tg.CATEGORY_CRM, "CRM", ICON_BLUE, ("👥", "💼", "🧑‍💼", "👤")),
    TopicCreateSpec(tg.CATEGORY_BACKUP, "Архив бэкапов", ICON_YELLOW, ("📦", "🗂️", "💾", "📁")),
    TopicCreateSpec(tg.CATEGORY_SECRETS, "Пароли архивов", ICON_VIOLET, ("🔐", "🔑", "🗝", "🔒")),
    TopicCreateSpec(tg.CATEGORY_AUTH, "Авторизация", ICON_GREEN, ("🔒", "🛡", "🛡️", "🔐")),
    TopicCreateSpec(tg.CATEGORY_NODES, "Ноды и хосты", ICON_ORANGE, ("🖥", "🖥️", "⚙️", "🌐", "📡")),
    TopicCreateSpec(tg.CATEGORY_PAYMENTS, "Покупки", ICON_CYAN, ("💳", "🛒", "💰", "🧾")),
    TopicCreateSpec(tg.CATEGORY_SQL, "SQL / БД", ICON_BLUE, ("🗄", "🗄️", "📊", "💾")),
    TopicCreateSpec(tg.CATEGORY_TRIAL, "Пробный период", ICON_YELLOW, ("🎁", "⭐", "✨", "🆓")),
    TopicCreateSpec(tg.CATEGORY_TICKETS, "Тикеты", ICON_GREEN, ("💬", "🎫", "📩", "✉️")),
    TopicCreateSpec(tg.CATEGORY_ADMIN, "Действия админов", ICON_ORANGE, ("⚙️", "👤", "🛠", "📋")),
)


def _sticker_custom_emoji_id(sticker: Any) -> str | None:
    cid = getattr(sticker, "custom_emoji_id", None)
    if cid is not None:
        return str(cid)
    return None


def _sticker_emoji(sticker: Any) -> str:
    return (getattr(sticker, "emoji", None) or "").strip()


def _pick_forum_icon_id(stickers: list[Any], emoji_candidates: tuple[str, ...]) -> str | None:
    """Иконка топика из getForumTopicIconStickers (часто SF Symbols / tgmacicons)."""
    if not stickers:
        return None
    allowed: dict[str, str] = {}
    for st in stickers:
        cid = _sticker_custom_emoji_id(st)
        em = _sticker_emoji(st)
        if cid and em:
            allowed[em] = cid
    for candidate in emoji_candidates:
        if candidate in allowed:
            return allowed[candidate]
    return None


async def _load_forum_icon_stickers(bot) -> list[Any]:
    try:
        stickers = await bot.get_forum_topic_icon_stickers()
        return list(stickers or [])
    except Exception as exc:
        logger.warning("getForumTopicIconStickers failed: %s", exc)
        return []


def _existing_topic_id(category: str) -> int | None:
    key = tg.CATEGORY_TOPIC_KEYS.get(category)
    if not key:
        return None
    return tg.parse_topic_id(get_setting(key))


async def create_notification_forum_topics(
    bot,
    chat_id: int,
    *,
    skip_filled: bool = True,
    persist: bool = True,
) -> dict[str, Any]:
    """
    Создать топики для пустых notifications_topic_* (стратегия B).

    Возвращает created / skipped / errors и topics {setting_key: topic_id}.
    """
    stickers = await _load_forum_icon_stickers(bot)
    created: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    topics: dict[str, str] = {}

    for spec in TOPIC_CREATE_SPECS:
        setting_key = tg.CATEGORY_TOPIC_KEYS.get(spec.category, "")
        existing = _existing_topic_id(spec.category)
        if existing is not None:
            skipped.append({
                "category": spec.category,
                "label": tg.CATEGORY_LABELS.get(spec.category, spec.category),
                "topic_id": existing,
                "reason": "already_set",
            })
            if setting_key:
                topics[setting_key] = str(existing)
            continue

        icon_id = _pick_forum_icon_id(stickers, spec.emoji_candidates)
        kwargs: dict[str, Any] = {"chat_id": chat_id, "name": spec.title}
        if icon_id:
            kwargs["icon_custom_emoji_id"] = icon_id
        else:
            kwargs["icon_color"] = spec.icon_color

        try:
            forum_topic = await bot.create_forum_topic(**kwargs)
        except Exception as exc:
            if icon_id:
                try:
                    forum_topic = await bot.create_forum_topic(
                        chat_id=chat_id,
                        name=spec.title,
                        icon_color=spec.icon_color,
                    )
                except Exception as retry_exc:
                    errors.append({
                        "category": spec.category,
                        "label": tg.CATEGORY_LABELS.get(spec.category, spec.category),
                        "error": str(retry_exc),
                    })
                    logger.warning(
                        "createForumTopic %s failed (icon retry): %s",
                        spec.category,
                        retry_exc,
                    )
                    continue
            else:
                errors.append({
                    "category": spec.category,
                    "label": tg.CATEGORY_LABELS.get(spec.category, spec.category),
                    "error": str(exc),
                })
                logger.warning("createForumTopic %s failed: %s", spec.category, exc)
                continue

        thread_id = getattr(forum_topic, "message_thread_id", None)
        if thread_id is None:
            errors.append({
                "category": spec.category,
                "label": tg.CATEGORY_LABELS.get(spec.category, spec.category),
                "error": "createForumTopic не вернул message_thread_id",
            })
            continue

        tid = int(thread_id)
        entry = {
            "category": spec.category,
            "label": tg.CATEGORY_LABELS.get(spec.category, spec.category),
            "topic_id": tid,
            "title": spec.title,
            "icon_custom_emoji_id": icon_id,
        }
        created.append(entry)
        if setting_key:
            topics[setting_key] = str(tid)
            if persist:
                update_setting(setting_key, str(tid))

    ok = not errors and (bool(created) or bool(skipped))
    return {
        "ok": ok,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "topics": topics,
        "icons_pack": TGMACICONS_PACK_URL,
        "icons_available": len(stickers),
    }
