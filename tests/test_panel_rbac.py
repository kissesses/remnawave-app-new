from shop_bot.data_manager.panel_rbac import ENDPOINT_PERMISSIONS


def test_create_notification_topics_requires_settings_bot():
    assert ENDPOINT_PERMISSIONS["create_notification_topics_route"] == "settings_bot"


def test_bot_studio_endpoints_use_settings_bot():
    assert ENDPOINT_PERMISSIONS["settings_bot_status_json"] == "settings_bot"
    assert ENDPOINT_PERMISSIONS["settings_bot_validate_token"] == "settings_bot"


def test_user_timeline_endpoints_use_users_permission():
    assert ENDPOINT_PERMISSIONS["user_timeline_page"] == "users"
    assert ENDPOINT_PERMISSIONS["user_timeline_export"] == "users"


def test_bot_audit_toggles_use_checkbox_save_path():
    from shop_bot.webhook_server.constants import SETTINGS_TAB_CHECKBOXES, SETTINGS_TAB_TEXT_KEYS

    bot_cb = SETTINGS_TAB_CHECKBOXES.get("bot", {})
    assert "notifications_admin_audit_enabled" in bot_cb
    assert "notifications_admin_audit_include_sql" in bot_cb
    text_keys = SETTINGS_TAB_TEXT_KEYS.get("bot", [])
    assert "notifications_admin_audit_enabled" not in text_keys
    assert "notifications_admin_audit_include_sql" not in text_keys
