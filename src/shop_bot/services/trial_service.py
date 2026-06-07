"""Shared trial period logic for bot, webapp, and admin panel."""

from __future__ import annotations

import logging
import re
from typing import Any

from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager.remnawave_repository import (
    get_key_by_email,
    get_setting,
    get_user,
    record_key_from_payload,
    set_trial_used,
)
from shop_bot.modules import remnawave_api

logger = logging.getLogger(__name__)


def setting_bool(key: str, default: bool = False) -> bool:
    raw = (get_setting(key) or ("true" if default else "false")).strip().lower()
    return raw in ("1", "true", "yes", "on")


def is_trial_enabled() -> bool:
    return setting_bool("trial_enabled", default=True)


def build_trial_slug(user_id: int) -> str:
    user_data = get_user(user_id) or {}
    raw_user = (user_data.get("username") or f"user{user_id}").lower()
    clean_step1 = raw_user.replace(".", "_").replace(" ", "")
    clean_step2 = re.sub(r"[^a-z0-9_-]", "", clean_step1)
    slug = clean_step2.lstrip("_-")[:16]
    return slug or f"user{user_id}"


def build_trial_email(user_id: int) -> str:
    slug = build_trial_slug(user_id)
    attempt = 1
    while True:
        candidate = f"trial_{slug}{f'-{attempt}' if attempt > 1 else ''}@bot.local"
        if not get_key_by_email(candidate) or attempt > 100:
            return candidate
        attempt += 1


def resolve_trial_host(hosts: list[dict], forced_host_id: str | None = None) -> str | None:
    if not hosts:
        return None
    forced = (forced_host_id or get_setting("trial_host_id") or "").strip()
    if forced and any(h.get("host_name") == forced for h in hosts):
        return forced
    if len(hosts) == 1:
        return hosts[0].get("host_name")
    return None


def trial_available_for_user(user_id: int) -> bool:
    if not is_trial_enabled():
        return False
    user = get_user(user_id) or {}
    return not bool(user.get("trial_used"))


async def create_trial_key(
    user_id: int,
    host_name: str,
    *,
    notify: bool = True,
    set_used: bool = True,
    bot: Any = None,
) -> dict[str, Any]:
    candidate_email = build_trial_email(user_id)
    trial_traffic = int(get_setting("trial_traffic_limit_gb") or 0)
    trial_hwid = int(get_setting("trial_hwid_limit") or 0)
    trial_days = int(get_setting("trial_duration_days") or 3)

    result = await remnawave_api.create_or_update_key_on_host(
        host_name=host_name,
        email=candidate_email,
        days_to_add=trial_days,
        telegram_id=user_id,
        traffic_limit_gb=trial_traffic if trial_traffic > 0 else None,
        hwid_limit=trial_hwid if trial_hwid > 0 else None,
    )
    if not result:
        return {"ok": False, "error": "Не удалось создать пробный ключ на сервере"}

    if set_used:
        set_trial_used(user_id)
    new_key_id = record_key_from_payload(user_id=user_id, payload=result, host_name=host_name)

    if notify and bot is not None:
        try:
            from shop_bot.data_manager import telegram_notify as tg_notify

            user_data = get_user(user_id) or {}
            uname = user_data.get("username")
            uname_str = f"@{uname}" if uname else "—"
            trial_txt = (
                f"🆓 <b>Пробный период активирован</b>\n"
                f"👤 <code>{user_id}</code> {uname_str}\n"
                f"🌍 Сервер: <b>{host_name}</b>\n"
                f"📧 Email: <code>{candidate_email}</code>\n"
                f"⏳ Срок: {trial_days} дн."
            )
            await tg_notify.send_notification(bot, tg_notify.CATEGORY_TRIAL, trial_txt)
        except Exception:
            logger.debug("trial notify failed", exc_info=True)

    return {
        "ok": True,
        "key_id": new_key_id,
        "email": candidate_email,
        "host_name": host_name,
        "payload": result,
        "duration_days": trial_days,
        "message": f"Пробный период на {trial_days} дн. активирован",
    }
