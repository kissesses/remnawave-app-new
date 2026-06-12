#!/usr/bin/env python3
"""Инициализация STEALTHX при запуске через Docker."""

from __future__ import annotations

import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="[stealthx-init] %(message)s")
logger = logging.getLogger(__name__)


def _truthy(val: str | None) -> bool:
    return str(val or "").strip().lower() in ("1", "true", "yes", "on")


def configure_webapp_settings() -> None:
    from shop_bot.data_manager.database import get_webapp_settings, update_webapp_settings

    current = get_webapp_settings() or {}
    updates: dict = {}

    if not _truthy(str(current.get("webapp_enable") or "")):
        updates["webapp_enable"] = 1
        logger.info("webapp_enable → 1")

    title = (current.get("webapp_title") or "").strip()
    if not title or title == "VPN":
        updates["webapp_title"] = "STEALTHX"
        logger.info("webapp_title → STEALTHX")

    accent = (current.get("webapp_accent_color") or "").strip()
    if not accent or accent in ("#3390EC", "#3390ec"):
        updates["webapp_accent_color"] = "#6D28FF"
        logger.info("webapp_accent_color → #6D28FF")

    designs = (current.get("webapp_enabled_designs") or "").strip()
    if "stealthx" not in designs:
        parts = [p.strip() for p in designs.split(",") if p.strip()]
        if "stealthx" not in parts:
            parts.append("stealthx")
        if "telegram-premium" not in parts:
            parts.insert(0, "telegram-premium")
        updates["webapp_enabled_designs"] = ",".join(parts)
        logger.info("webapp_enabled_designs → %s", updates["webapp_enabled_designs"])

    default_design = (current.get("webapp_default_design") or "").strip()
    if default_design != "stealthx":
        updates["webapp_default_design"] = "stealthx"
        logger.info("webapp_default_design → stealthx")

    welcome = (current.get("webapp_welcome_text") or "").strip()
    if not welcome:
        updates["webapp_welcome_text"] = "STEALTHX"
        logger.info("webapp_welcome_text → STEALTHX")

    if updates:
        update_webapp_settings(**updates)


def seed_stealthx_data() -> None:
    from shop_bot.webapp.stealthx.backend.core.database import get_session_factory
    from shop_bot.webapp.stealthx.backend.services.server_service import sync_servers_from_hosts
    from shop_bot.webapp.stealthx.backend.services.subscription_service import seed_default_plans

    db = get_session_factory()()
    try:
        seed_default_plans(db)
        sync_servers_from_hosts(db)
        logger.info("STEALTHX plans and servers seeded")
    finally:
        db.close()


def main() -> int:
    if not _truthy(os.environ.get("STEALTHX_AUTO_CONFIGURE", "1")):
        logger.info("STEALTHX_AUTO_CONFIGURE=0 — skip")
        return 0

    try:
        configure_webapp_settings()
        seed_stealthx_data()
        logger.info("STEALTHX Docker init complete")
        return 0
    except Exception as exc:
        logger.error("STEALTHX init failed: %s", exc)
        if _truthy(os.environ.get("STEALTHX_INIT_STRICT", "0")):
            return 1
        logger.warning("Continuing startup (STEALTHX_INIT_STRICT=0)")
        return 0


if __name__ == "__main__":
    sys.exit(main())
