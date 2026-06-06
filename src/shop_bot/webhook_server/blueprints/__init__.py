from __future__ import annotations

from flask import Flask

from shop_bot.webhook_server.blueprints import (
    auth,
    backups,
    buttons,
    dashboard,
    dev_support,
    keys,
    misc,
    settings,
    settings_tools,
    support,
    users,
    webhooks,
)


def register_blueprints(app: Flask) -> None:
    for module in (
        auth,
        backups,
        dashboard,
        dev_support,
        support,
        users,
        keys,
        settings,
        settings_tools,
        webhooks,
        buttons,
        misc,
    ):
        app.register_blueprint(module.bp)
