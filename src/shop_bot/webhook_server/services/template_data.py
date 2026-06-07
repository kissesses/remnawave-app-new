from __future__ import annotations

import logging
import os

from shop_bot.data_manager.remnawave_repository import get_all_other_settings, get_all_settings
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)


def get_common_template_data() -> dict:
    bot_status = panel_ctx.bot_controller.get_status()
    support_bot_status = panel_ctx.support_bot_controller.get_status()
    settings = get_all_settings()
    required_for_start = ['telegram_bot_token', 'telegram_bot_username', 'admin_telegram_id']
    required_support_for_start = ['support_bot_token', 'support_bot_username', 'admin_telegram_id']
    all_settings_ok = all(settings.get(key) for key in required_for_start)
    support_settings_ok = all(settings.get(key) for key in required_support_for_start)
    try:
        open_tickets_count = None
        waiting_tickets_count = None
        closed_tickets_count = None
        all_tickets_count = None
    except Exception:
        open_tickets_count = 0
        waiting_tickets_count = 0
        closed_tickets_count = 0
        all_tickets_count = 0

    project_info = None
    app_version = '0.0.0'
    try:
        from shop_bot.webhook_server.modules.update import get_project_config, get_current_version
        project_info = get_project_config()
        app_version = get_current_version()
    except Exception as e:
        logger.error(f"Failed to read project config: {e}")
        project_info = {}

    return {
        "settings": settings,
        "bot_status": bot_status,
        "main_running": bot_status.get("is_running", False),
        "all_settings_ok": all_settings_ok,
        "support_bot_status": support_bot_status,
        "support_running": support_bot_status.get("is_running", False),
        "support_settings_ok": support_settings_ok,
        "open_tickets_count": open_tickets_count,
        "waiting_tickets_count": waiting_tickets_count,
        "closed_tickets_count": closed_tickets_count,
        "all_tickets_count": all_tickets_count,
        "brand_title": settings.get('panel_brand_title') or 'Remnawave App',
        "project_info": project_info,
        "app_version": app_version,
        "other_settings": get_all_other_settings(),
    }
