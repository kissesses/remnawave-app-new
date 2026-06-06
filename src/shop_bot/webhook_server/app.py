"""Thin entry point for the webhook panel Flask application."""

from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.factory import create_webhook_app

_support_bot_controller = panel_ctx.support_bot_controller

__all__ = ['create_webhook_app', '_support_bot_controller']
