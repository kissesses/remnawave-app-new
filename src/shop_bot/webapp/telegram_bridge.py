"""Telegram Mini App bridge — cabinet URLs, menu button, inline WebApp buttons."""
from __future__ import annotations

import logging
import re
from typing import Any

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, MenuButtonDefault, MenuButtonWebApp, WebAppInfo

from shop_bot.data_manager.remnawave_repository import get_webapp_settings
from shop_bot.webhook_server.modules.webapp_panel import normalize_domain, webapp_public_url

logger = logging.getLogger(__name__)

WEBAPP_URL_PLACEHOLDERS = frozenset({"{webapp}", "{cabinet}", "{webapp_cabinet}"})
_PLACEHOLDER_WITH_PATH_RE = re.compile(
    r"^\{(?:webapp|cabinet|webapp_cabinet)(?::([^}]*))?\}$",
    re.IGNORECASE,
)

# Bot callback → hash route in cabinet (app.html)
CALLBACK_CABINET_HASH: dict[str, str] = {
    "show_profile": "pro",
    "manage_keys": "",
    "buy_new_key": "bay",
    "top_up_start": "pro",
    "show_referral_program": "pro",
    "show_help": "support",
    "howto_vless": "setup",
    "get_trial": "",
    "show_about": "",
    "user_speedtest_last": "",
}


def _truthy(raw: Any) -> bool:
    return str(raw or "").strip().lower() in ("1", "true", "yes", "on")


def resolve_https_cabinet_base(webapp_settings: dict | None = None) -> str | None:
    """Public HTTPS base URL for Telegram WebApp (required by Bot API)."""
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})
    if not _truthy(settings.get("webapp_enable")):
        return None
    domain = normalize_domain(settings.get("webapp_domen"))
    if not domain:
        return None
    url = webapp_public_url(settings)
    if not url.startswith("https://"):
        return None
    return url.rstrip("/")


def is_cabinet_miniapp_ready(webapp_settings: dict | None = None) -> bool:
    return resolve_https_cabinet_base(webapp_settings) is not None


def is_webapp_url_placeholder(url: str | None) -> bool:
    u = (url or "").strip()
    if not u:
        return False
    if u in WEBAPP_URL_PLACEHOLDERS:
        return True
    return bool(_PLACEHOLDER_WITH_PATH_RE.match(u))


def parse_webapp_placeholder_path(url: str | None) -> str:
    """Extract hash fragment from placeholder like `{webapp:bay}` → `bay`."""
    u = (url or "").strip()
    if u in WEBAPP_URL_PLACEHOLDERS:
        return ""
    match = _PLACEHOLDER_WITH_PATH_RE.match(u)
    if not match:
        return ""
    return (match.group(1) or "").strip().lstrip("#/")


def build_cabinet_url(
    path: str = "",
    *,
    webapp_settings: dict | None = None,
) -> str | None:
    base = resolve_https_cabinet_base(webapp_settings)
    if not base:
        return None
    fragment = (path or "").strip()
    if not fragment:
        return base
    if fragment.startswith("#"):
        return f"{base}{fragment}"
    if fragment.startswith("/"):
        return f"{base}{fragment}"
    return f"{base}#{fragment}"


def cabinet_webapp_info(
    path: str = "",
    *,
    webapp_settings: dict | None = None,
) -> WebAppInfo | None:
    url = build_cabinet_url(path, webapp_settings=webapp_settings)
    if not url:
        return None
    return WebAppInfo(url=url)


def resolve_webapp_placeholder_url(
    url: str | None,
    *,
    webapp_settings: dict | None = None,
) -> str | None:
    if not is_webapp_url_placeholder(url):
        return None
    fragment = parse_webapp_placeholder_path(url)
    return build_cabinet_url(fragment, webapp_settings=webapp_settings)


def miniapp_buttons_enabled(webapp_settings: dict | None = None) -> bool:
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})
    return _truthy(settings.get("webapp_miniapp_buttons")) and is_cabinet_miniapp_ready(settings)


def menu_button_enabled(webapp_settings: dict | None = None) -> bool:
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})
    if not _truthy(settings.get("webapp_enable")):
        return False
    if "webapp_menu_button" in settings:
        return _truthy(settings.get("webapp_menu_button"))
    return True


def menu_button_text(webapp_settings: dict | None = None) -> str:
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})
    text = (settings.get("webapp_menu_button_text") or "").strip()
    return text or "Открыть кабинет"


def build_cabinet_or_callback_button(
    text: str,
    callback_data: str | None,
    *,
    path: str = "",
    webapp_settings: dict | None = None,
    extra_kwargs: dict | None = None,
) -> InlineKeyboardButton | None:
    extra = dict(extra_kwargs or {})
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})

    if miniapp_buttons_enabled(settings) and callback_data:
        hash_path = path or CALLBACK_CABINET_HASH.get(callback_data, "")
        if callback_data in CALLBACK_CABINET_HASH or path:
            info = cabinet_webapp_info(hash_path, webapp_settings=settings)
            if info:
                return InlineKeyboardButton(text=text, web_app=info, **extra)

    if callback_data:
        return InlineKeyboardButton(text=text, callback_data=callback_data, **extra)
    return None


async def sync_chat_menu_button(
    bot: Bot,
    webapp_settings: dict | None = None,
) -> dict[str, Any]:
    """Set or reset Telegram chat menu button for the cabinet Mini App."""
    settings = webapp_settings if webapp_settings is not None else (get_webapp_settings() or {})

    if not menu_button_enabled(settings):
        try:
            await bot.set_chat_menu_button(menu_button=MenuButtonDefault())
            return {"ok": True, "action": "reset", "reason": "menu_button_disabled"}
        except Exception as exc:
            logger.warning("Failed to reset chat menu button: %s", exc)
            return {"ok": False, "error": str(exc)}

    if not _truthy(settings.get("webapp_enable")):
        try:
            await bot.set_chat_menu_button(menu_button=MenuButtonDefault())
            return {"ok": True, "action": "reset", "reason": "webapp_disabled"}
        except Exception as exc:
            logger.warning("Failed to reset chat menu button: %s", exc)
            return {"ok": False, "error": str(exc)}

    url = build_cabinet_url(webapp_settings=settings)
    if not url:
        return {
            "ok": False,
            "skipped": True,
            "reason": "https_domain_required",
            "hint": "Задайте HTTPS-домен в WebApp Studio и включите WebApp",
        }

    label = menu_button_text(settings)
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=label, web_app=WebAppInfo(url=url)),
        )
        logger.info("Telegram Menu Button → %s (%s)", url, label)
        return {"ok": True, "action": "set", "url": url, "text": label}
    except Exception as exc:
        logger.error("Failed to set chat menu button: %s", exc, exc_info=True)
        return {"ok": False, "error": str(exc), "url": url, "text": label}
