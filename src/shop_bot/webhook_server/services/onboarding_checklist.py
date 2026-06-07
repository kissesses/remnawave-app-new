"""Чеклист первого запуска для новых установок Remnawave App."""

from __future__ import annotations

from typing import Any

from shop_bot.data_manager.database import get_all_settings, get_db_connection, get_setting


def _truthy(raw: str | None) -> bool:
    return str(raw or "").strip().lower() in ("1", "true", "yes", "on")


def _payment_configured(settings: dict[str, str]) -> bool:
    checks = (
        (settings.get("yookassa_shop_id") and settings.get("yookassa_secret_key")),
        (settings.get("cryptobot_token")),
        (settings.get("platega_merchant_id") and settings.get("platega_api_key")),
        (settings.get("heleket_merchant_id") and settings.get("heleket_api_key")),
        (settings.get("ton_wallet_address")),
        (_truthy(settings.get("stars_enabled"))),
        (_truthy(settings.get("yoomoney_enabled")) and settings.get("yoomoney_wallet")),
    )
    return any(checks)


def _hosts_configured() -> bool:
    try:
        from shop_bot.data_manager.remnawave_repository import get_all_hosts

        return bool(get_all_hosts())
    except Exception:
        return False


def _plans_configured() -> bool:
    try:
        with get_db_connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM plans").fetchone()
            return int(row["c"] if row else 0) > 0
    except Exception:
        return False


def build_onboarding_checklist() -> dict[str, Any]:
    from shop_bot.webhook_server.context import panel_ctx

    settings = get_all_settings()
    bot_status = panel_ctx.bot_controller.get_status()
    main_running = bool(bot_status.get("is_running"))

    required_bot = ["telegram_bot_token", "telegram_bot_username", "admin_telegram_id"]
    bot_ok = all(settings.get(key) for key in required_bot)
    hosts_ok = _hosts_configured()
    payments_ok = _payment_configured(settings)
    plans_ok = _plans_configured()
    remnawave_ok = bool(get_setting("remnawave_api_token") or settings.get("remnawave_api_token"))

    steps = [
        {
            "id": "bot",
            "label": "Telegram-бот",
            "hint": "Токен, username и ID администратора",
            "done": bot_ok,
            "url": "/settings/bot",
        },
        {
            "id": "hosts",
            "label": "Хосты Remnawave",
            "hint": "URL панели и API-токен",
            "done": hosts_ok and remnawave_ok,
            "url": "/settings/hosts",
        },
        {
            "id": "payments",
            "label": "Способ оплаты",
            "hint": "Хотя бы один платёжный провайдер",
            "done": payments_ok,
            "url": "/settings/payments",
        },
        {
            "id": "plans",
            "label": "Тарифы",
            "hint": "Планы на хостах для продажи",
            "done": plans_ok,
            "url": "/admin/keys",
        },
        {
            "id": "start",
            "label": "Запуск бота",
            "hint": "Старт основного бота из панели",
            "done": main_running,
            "url": "/settings/bot",
        },
    ]

    done_count = sum(1 for step in steps if step["done"])
    return {
        "steps": steps,
        "done_count": done_count,
        "total": len(steps),
        "complete": done_count == len(steps),
        "visible": done_count < len(steps),
    }
