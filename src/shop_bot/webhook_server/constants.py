ALL_SETTINGS_KEYS = [
    "panel_login", "panel_password", "about_text", "terms_url", "privacy_url",
    "support_user", "support_text", "channel_url", "telegram_bot_token",
    "telegram_bot_username", "admin_telegram_id", "yookassa_shop_id",
    "yookassa_secret_key", "sbp_enabled", "receipt_email", "cryptobot_token",
    "heleket_merchant_id", "heleket_api_key", "domain", "referral_percentage",
    "referral_discount", "ton_wallet_address", "tonapi_key", "ton_webhook_secret", "force_subscription", "trial_enabled", "trial_duration_days", "trial_host_id", "trial_traffic_limit_gb", "trial_hwid_limit", "enable_referrals", "minimum_withdrawal",

    "enable_fixed_referral_bonus", "fixed_referral_bonus_amount",

    "referral_reward_type", "referral_on_start_referrer_amount",
    "referral_share_message", "referral_program_extra", "referral_payout_mode", "referral_notify_bonus",
    "support_forum_chat_id",
    "support_bot_token", "support_bot_username",

    "panel_brand_title",

    "bot_messages_json",

    "main_menu_text", "howto_intro_text",
    "howto_android_text", "howto_ios_text", "howto_windows_text", "howto_linux_text",

    "btn_trial_text", "btn_profile_text", "btn_my_keys_text", "btn_buy_key_text", "btn_topup_text",
    "btn_referral_text", "btn_support_text", "btn_about_text", "btn_speed_text", "btn_howto_text",
    "btn_admin_text", "btn_back_to_menu_text",
    "btn_trial_button_style", "btn_trial_icon_emoji_id",
    "btn_profile_button_style", "btn_profile_icon_emoji_id",
    "btn_my_keys_button_style", "btn_my_keys_icon_emoji_id",
    "btn_buy_key_button_style", "btn_buy_key_icon_emoji_id",
    "btn_topup_button_style", "btn_topup_icon_emoji_id",
    "btn_referral_button_style", "btn_referral_icon_emoji_id",
    "btn_support_button_style", "btn_support_icon_emoji_id",
    "btn_about_button_style", "btn_about_icon_emoji_id",
    "btn_howto_button_style", "btn_howto_icon_emoji_id",
    "btn_speed_button_style", "btn_speed_icon_emoji_id",
    "btn_admin_button_style", "btn_admin_icon_emoji_id",
    "btn_back_to_menu_button_style", "btn_back_to_menu_icon_emoji_id",

    "backup_interval_days", "backup_keep_count", "backup_autobackup_telegram", "backup_compress_level",
    "backup_autobackup_scope", "backup_include_env",
    "backup_encrypt_enabled", "backup_password_mode",
    "backup_telegram_chat_id", "backup_telegram_topic_id",
    "backup_secrets_chat_id", "backup_secrets_topic_id",
    "notifications_chat_id",
    "notifications_topic_crm", "notifications_topic_backup", "notifications_topic_secrets",
    "notifications_topic_auth", "notifications_topic_nodes", "notifications_topic_payments",
    "notifications_topic_sql", "notifications_topic_trial", "notifications_topic_tickets",
    "backup_remnawave_mode", "backup_remnawave_compose_dir", "backup_remnawave_ssh_target",
    "backup_remnawave_pg_service", "backup_remnawave_database_url", "backup_remnawave_compose_cmd",

    "monitoring_enabled", "monitoring_interval_sec",
    "monitoring_cpu_threshold", "monitoring_mem_threshold", "monitoring_disk_threshold",
    "monitoring_alert_cooldown_sec",

    "smtp_enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_password",
    "smtp_from_email", "smtp_from_name", "smtp_encryption", "smtp_notify_emails",
    "smtp_notify_login", "smtp_notify_monitoring",
    "smtp_notify_password_reset", "smtp_notify_key_expiry", "smtp_notify_payment_receipt",

    "yoomoney_enabled", "yoomoney_wallet", "yoomoney_secret", "stars_per_rub", "stars_enabled",

    "yoomoney_api_token", "yoomoney_client_id", "yoomoney_client_secret", "yoomoney_redirect_uri",

    "platega_enabled", "platega_crypto_enabled", "platega_payform_enabled", "platega_merchant_id", "platega_api_key",

    "main_menu_image",
    "skip_email", "enable_wal_mode",
    "key_ready_image",
    "devices_list_image",
    "stealth_login_enabled", "stealth_login_hotkey",
    "stealth_login_decoy", "stealth_login_hotkey_enabled", "stealth_login_clicks_enabled",
    "stealth_login_clicks_count", "stealth_login_clicks_window_ms",
    "stealth_login_history_path", "stealth_login_secret_param", "stealth_login_secret_value",
    "telegram_login_enabled", "passkey_login_enabled",
]

SETTINGS_TAB_IDS = [
    "panel", "database", "stealth-login", "bot", "payments", "hosts", "referrals", "content",
    "access", "audit", "broadcast", "promo", "logs", "webapp", "remnawave", "mail-templates",
]

SETTINGS_NAV_GROUPS: dict[str, dict[str, str]] = {
    "system": {
        "label": "Система",
        "desc": "Панель, боты и доступ",
        "icon": "settings",
    },
    "services": {
        "label": "Сервисы",
        "desc": "Платежи, хосты и контент",
        "icon": "hub",
    },
    "tools": {
        "label": "Инструменты",
        "desc": "Рассылка, логи и интеграции",
        "icon": "handyman",
    },
}

SETTINGS_TAB_SECTIONS: dict[str, list[dict[str, str]]] = {
    "panel": [
        {"id": "panel-system", "label": "Система", "icon": "tune"},
        {"id": "panel-trial", "label": "Пробный период", "icon": "timer"},
        {"id": "panel-monitoring", "label": "Мониторинг", "icon": "monitoring"},
        {"id": "panel-smtp", "label": "Email / SMTP", "icon": "mail"},
        {"id": "panel-backup", "label": "Бэкапы", "icon": "database"},
    ],
    "payments": [
        {"id": "payments-general", "label": "Общие", "icon": "settings_suggest"},
        {"id": "payments-fiat", "label": "RUB и карты", "icon": "account_balance"},
        {"id": "payments-crypto", "label": "Криптовалюты", "icon": "currency_bitcoin"},
        {"id": "payments-telegram", "label": "Telegram", "icon": "star"},
    ],
    "bot": [
        {"id": "bot-telegram", "label": "Telegram боты", "icon": "smart_toy"},
        {"id": "bot-channels", "label": "Уведомления", "icon": "chat"},
    ],
    "content": [
        {"id": "all", "label": "Все", "icon": "forum"},
        {"id": "purchase", "label": "Покупка", "icon": "shopping_cart"},
        {"id": "subscription", "label": "Подписка", "icon": "schedule"},
        {"id": "onboarding", "label": "Onboarding", "icon": "waving_hand"},
        {"id": "topup", "label": "Пополнение", "icon": "account_balance_wallet"},
        {"id": "trial", "label": "Триал", "icon": "timer"},
        {"id": "payment", "label": "Оплаты", "icon": "credit_card"},
        {"id": "referral", "label": "Рефералы", "icon": "group_add"},
        {"id": "admin", "label": "Админ", "icon": "admin_panel_settings"},
        {"id": "system", "label": "Система", "icon": "shield"},
    ],
    "referrals": [
        {"id": "overview", "label": "Обзор", "icon": "dashboard"},
        {"id": "rewards", "label": "Начисления", "icon": "payments"},
        {"id": "invitee", "label": "Бонус другу", "icon": "redeem"},
        {"id": "messages", "label": "Сообщения", "icon": "chat"},
        {"id": "analytics", "label": "Аналитика", "icon": "analytics"},
        {"id": "advanced", "label": "Дополнительно", "icon": "tune"},
    ],
}

SETTINGS_FORM_TABS = frozenset({"panel", "stealth-login", "bot", "payments", "referrals", "content"})

# Per-tab checkbox keys and default when absent from submitted form.
SETTINGS_TAB_CHECKBOXES: dict[str, dict[str, str]] = {
    "stealth-login": {
        "stealth_login_enabled": "0",
        "stealth_login_hotkey_enabled": "1",
        "stealth_login_clicks_enabled": "1",
    },
    "panel": {
        "trial_enabled": "false",
        "monitoring_enabled": "false",
        "enable_wal_mode": "0",
        "demo_mode_enabled": "0",
        "smtp_enabled": "0",
        "smtp_notify_login": "0",
        "smtp_notify_monitoring": "0",
        "smtp_notify_password_reset": "0",
        "smtp_notify_key_expiry": "0",
        "smtp_notify_payment_receipt": "0",
        "backup_autobackup_telegram": "1",
        "backup_include_env": "0",
    },
    "payments": {
        "sbp_enabled": "false",
        "stars_enabled": "false",
        "yoomoney_enabled": "false",
        "platega_enabled": "false",
        "platega_crypto_enabled": "false",
        "platega_payform_enabled": "false",
        "skip_email": "0",
    },
    "referrals": {
        "enable_referrals": "false",
        "enable_fixed_referral_bonus": "false",
        "referral_notify_bonus": "true",
    },
    "content": {
        "force_subscription": "false",
    },
    "access": {
        "telegram_login_enabled": "0",
        "passkey_login_enabled": "0",
    },
}

SETTINGS_TAB_OTHER_KEYS: dict[str, dict[str, str]] = {
    "panel": {"auto_start_bot": "0"},
}

SETTINGS_TAB_TEXT_KEYS: dict[str, list[str]] = {
    "stealth-login": [
        "stealth_login_hotkey", "stealth_login_decoy",
        "stealth_login_clicks_count", "stealth_login_clicks_window_ms",
        "stealth_login_history_path", "stealth_login_secret_param", "stealth_login_secret_value",
    ],
    "panel": [
        "backup_interval_days", "backup_keep_count", "backup_compress_level",
        "backup_autobackup_scope",
        "backup_remnawave_mode", "backup_remnawave_compose_dir", "backup_remnawave_ssh_target",
        "backup_remnawave_pg_service", "backup_remnawave_database_url", "backup_remnawave_compose_cmd",
        "trial_duration_days", "trial_traffic_limit_gb", "trial_hwid_limit", "trial_host_id",
        "monitoring_interval_sec", "monitoring_cpu_threshold", "monitoring_mem_threshold",
        "monitoring_disk_threshold", "monitoring_alert_cooldown_sec",
        "smtp_host", "smtp_port", "smtp_username", "smtp_password",
        "smtp_from_email", "smtp_from_name", "smtp_encryption", "smtp_notify_emails",
    ],
    "bot": [
        "telegram_bot_token", "telegram_bot_username", "admin_telegram_id",
        "support_bot_token", "support_bot_username", "support_forum_chat_id",
        "notifications_chat_id",
        "notifications_topic_crm", "notifications_topic_backup", "notifications_topic_secrets",
        "notifications_topic_auth", "notifications_topic_nodes", "notifications_topic_payments",
        "notifications_topic_sql", "notifications_topic_trial", "notifications_topic_tickets",
        "backup_telegram_chat_id", "backup_telegram_topic_id",
        "backup_secrets_chat_id", "backup_secrets_topic_id",
    ],
    "payments": [
        "receipt_email", "yookassa_shop_id", "yookassa_secret_key",
        "heleket_merchant_id", "heleket_api_key", "domain",
        "platega_merchant_id", "platega_api_key",
        "ton_wallet_address", "tonapi_key", "ton_webhook_secret", "stars_per_rub", "cryptobot_token",
        "yoomoney_wallet", "yoomoney_secret", "yoomoney_api_token",
        "yoomoney_client_id", "yoomoney_client_secret", "yoomoney_redirect_uri",
    ],
    "referrals": [
        "referral_reward_type", "minimum_withdrawal", "referral_percentage",
        "fixed_referral_bonus_amount", "referral_on_start_referrer_amount", "referral_discount",
        "referral_share_message", "referral_program_extra", "referral_payout_mode",
    ],
    "content": [
        k for k in ALL_SETTINGS_KEYS
        if k.startswith(("btn_", "howto_"))
        or k in {
            "about_text", "support_text", "main_menu_text", "support_user",
            "channel_url", "terms_url", "privacy_url",
            "main_menu_image", "key_ready_image", "devices_list_image",
        }
    ],
}
