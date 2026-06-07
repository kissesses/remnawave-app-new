"""Role-based access control definitions for the web panel."""

from __future__ import annotations

from typing import Any

PERMISSION_GROUPS: list[dict] = [
    {
        "id": "overview",
        "title": "Обзор",
        "permissions": [
            ("dashboard", "Главная"),
        ],
    },
    {
        "id": "management",
        "title": "Управление",
        "permissions": [
            ("users", "Пользователи"),
            ("keys", "Ключи"),
            ("support", "Поддержка"),
            ("button_constructor", "Конструктор кнопок"),
        ],
    },
    {
        "id": "system",
        "title": "Система",
        "permissions": [
            ("node", "Ноды"),
            ("settings", "Настройки"),
            ("bot_control", "Старт / стоп ботов"),
        ],
    },
    {
        "id": "settings_tabs",
        "title": "Разделы настроек",
        "permissions": [
            ("settings_panel", "Панель"),
            ("settings_bot", "Боты"),
            ("settings_payments", "Платежи"),
            ("settings_hosts", "Хосты"),
            ("settings_referrals", "Рефералы"),
            ("settings_content", "Контент"),
            ("settings_access", "Администраторы и роли"),
            ("settings_audit", "Журнал аудита"),
            ("settings_anti_fraud", "Anti-Fraud"),
            ("other_broadcast", "Рассылка"),
            ("other_promo", "Промо коды"),
            ("other_logs", "Логи"),
            ("other_webapp", "WebApp"),
            ("other_remnawave", "Remnawave"),
            ("settings_mail_templates", "Шаблоны почты (Mail Studio)"),
            ("dev_support", "Поддержка разработчика"),
            ("dev_support_hub", "Support Hub Inbox"),
        ],
    },
    {
        "id": "admin",
        "title": "Администрирование",
        "permissions": [
            ("db_manage", "Бэкап / восстановление БД"),
            ("system_upgrade", "Обновление панели (Docker)"),
            ("node_power", "Перезагрузка серверов (SSH)"),
        ],
    },
]

ALL_PERMISSIONS: dict[str, str] = {
    perm: label
    for group in PERMISSION_GROUPS
    for perm, label in group["permissions"]
}

DEFAULT_OPERATOR_PERMISSIONS: list[str] = [
    "dashboard",
    "users",
    "keys",
    "support",
]

ENDPOINT_PERMISSIONS: dict[str, str] = {
    # Dashboard
    "index": "dashboard",
    "dashboard_page": "dashboard",
    "dashboard_ssh_targets_json": "dashboard",
    "run_speedtests_route": "dashboard",
    "dashboard_stats_partial": "dashboard",
    "dashboard_transactions_partial": "dashboard",
    "dashboard_charts_json": "dashboard",
    "dashboard_user_groups_json": "dashboard",
    "dashboard_speedtests_json": "dashboard",
    "dashboard_layout_config": "dashboard",
    "dashboard_layout_prefs_get": "dashboard",
    "dashboard_layout_prefs_save": "dashboard",
    "dashboard_layout_prefs_reset": "dashboard",
    # Users
    "users_page": "users",
    "users_table_partial": "users",
    "users_pagination_partial": "users",
    "user_avatar": "users",
    "users_avatars_check": "users",
    "user_keys_partial": "users",
    "user_referrals_json": "users",
    "adjust_balance_route": "users",
    "clear_balance_history_route": "users",
    "clear_payment_history_route": "users",
    "user_details_json": "users",
    "user_timeline_page": "users",
    "user_timeline_json": "users",
    "user_timeline_export": "users",
    "toggle_trial_used_route": "users",
    "ban_user_route": "users",
    "toggle_block_user_route": "users",
    "toggle_pin_user_route": "users",
    "unban_user_route": "users",
    "revoke_keys_route": "users",
    "delete_user_route": "users",
    "send_user_message_route": "users",
    "update_seller_settings_route": "users",
    # Keys
    "admin_keys_page": "keys",
    "admin_keys_table_partial": "keys",
    "admin_keys_pagination_partial": "keys",
    "admin_get_plans_for_host_json": "keys",
    "create_key_route": "keys",
    "create_key_ajax_route": "keys",
    "generate_key_email_route": "keys",
    "delete_key_route": "keys",
    "adjust_key_expiry_route": "keys",
    "sweep_expired_keys_route": "keys",
    "update_key_comment_route": "keys",
    "export_keys_csv": "keys",
    "bulk_keys_route": "keys",
    # Support
    "support_list_page": "support",
    "support_badge_counts_json": "support",
    "admin_presence_json": "dashboard",
    "admin_presence_detail_json": "dashboard",
    "support_stats_json": "support",
    "support_export_csv": "support",
    "support_bulk_route": "support",
    "support_ticket_panel_partial": "support",
    "support_table_partial": "support",
    "support_open_count_partial": "support",
    "support_ticket_page": "support",
    "support_ticket_messages_api": "support",
    "delete_support_ticket_route": "support",
    "delete_all_tickets_route": "support",
    # Button constructor
    "button_constructor_page": "button_constructor",
    "get_button_configs_api": "button_constructor",
    "create_button_config_api": "button_constructor",
    "update_button_config_api": "button_constructor",
    "delete_button_config_api": "button_constructor",
    "reorder_button_configs_api": "button_constructor",
    # Settings (general + tabs)
    "settings_page": "settings",
    "settings_tab_page": "settings",
    "settings_smtp_test": "settings_panel",
    "settings_mail_templates_data": "settings_mail_templates",
    "settings_mail_templates_save": "settings_mail_templates",
    "settings_mail_templates_preview": "settings_mail_templates",
    "settings_mail_templates_reset": "settings_mail_templates",
    "settings_mail_templates_send_test": "settings_mail_templates",
    "settings_mail_templates_accent": "settings_mail_templates",
    "settings_bot_messages_data": "settings_content",
    "settings_bot_messages_save": "settings_content",
    "settings_bot_messages_preview": "settings_content",
    "settings_bot_messages_reset": "settings_content",
    "settings_stealth_decoy_preview": "settings_panel",
    "update_brand_title_route": "settings_panel",
    "update_pay_info_api": "settings_payments",
    "upload_menu_image_route": "settings_content",
    "delete_menu_image_route": "settings_content",
    "content_menu_image_route": "settings_content",
    "settings_referrals_stats_route": "settings_referrals",
    "settings_referrals_leaderboard_route": "settings_referrals",
    "settings_referrals_recent_route": "settings_referrals",
    "settings_access_role_save": "settings_access",
    "settings_access_role_delete": "settings_access",
    "settings_access_admin_save": "settings_access",
    "settings_access_admin_delete": "settings_access",
    "settings_access_admin_detail": "settings_access",
    "settings_totp_begin": "settings_access",
    "settings_totp_enable": "settings_access",
    "settings_totp_disable": "settings_access",
    "settings_totp_cancel": "settings_access",
    "settings_security_method_save": "settings_access",
    "settings_access_auth_methods": "settings_access",
    "settings_telegram_link": "settings_access",
    "settings_telegram_unlink": "settings_access",
    "settings_passkey_register_options": "settings_access",
    "settings_passkey_register_complete": "settings_access",
    "settings_passkey_delete": "settings_access",
    "settings_access_audit_export": "settings_access",
    "settings_access_audit_list": "settings_access",
    "settings_audit_list": "settings_audit",
    "settings_audit_stats": "settings_audit",
    "settings_audit_entry": "settings_audit",
    "settings_audit_export": "settings_audit",
    "settings_audit_catalog": "settings_audit",
    "settings_anti_fraud_signals": "settings_anti_fraud",
    "settings_anti_fraud_signal": "settings_anti_fraud",
    "settings_access_role_duplicate": "settings_access",
    "settings_access_invites_list": "settings_access",
    "settings_access_invite_create": "settings_access",
    "settings_access_invite_url": "settings_access",
    "settings_access_invite_regenerate": "settings_access",
    "settings_access_invite_revoke": "settings_access",
    "yoomoney_connect_route": "settings_payments",
    "yoomoney_callback_route": "settings_payments",
    "yoomoney_check_route": "settings_payments",
    "backup_db_route": "db_manage",
    "restore_db_route": "db_manage",
    "backups_page": "db_manage",
    "backup_list_json": "db_manage",
    "backup_create_server_route": "db_manage",
    "backup_download_route": "db_manage",
    "backup_delete_route": "db_manage",
    "backup_send_telegram_route": "db_manage",
    "backup_test_channel_route": "db_manage",
    "create_notification_topics_route": "settings_bot",
    "backup_settings_json": "db_manage",
    "backup_settings_save": "db_manage",
    "backup_detail_json": "db_manage",
    "backup_cleanup_route": "db_manage",
    "backup_duplicate_route": "db_manage",
    "settings_database_info": "db_manage",
    "settings_database_maintenance": "db_manage",
    "settings_database_stepup_totp": "db_manage",
    "settings_database_stepup_passkey_options": "db_manage",
    "settings_database_stepup_passkey_verify": "db_manage",
    "settings_database_stepup_telegram": "db_manage",
    "settings_database_stepup_lock": "db_manage",
    "settings_database_source": "db_manage",
    "settings_database_tables": "db_manage",
    "settings_database_table_detail": "db_manage",
    "settings_database_table_delete": "db_manage",
    "settings_database_table_truncate": "db_manage",
    "settings_database_table_export": "db_manage",
    "settings_database_query": "db_manage",
    "settings_database_stats": "db_manage",
    "settings_database_maintenance_action": "db_manage",
    "check_updates_route": "settings",
    "project_info_route": "settings",
    "update_capabilities_route": "system_upgrade",
    "update_apply_route": "system_upgrade",
    "update_job_route": "system_upgrade",
    "update_job_health_route": "system_upgrade",
    "logs_restart": "system_upgrade",
    "workspace_prefs_get": "settings",
    "workspace_prefs_save": "settings",
    "add_host_route": "settings_hosts",
    "delete_host_route": "settings_hosts",
    "toggle_host_visibility_route": "settings_hosts",
    "add_plan_route": "settings_hosts",
    "delete_plan_route": "settings_hosts",
    "update_plan_route": "settings_hosts",
    "update_host_subscription_route": "settings_hosts",
    "update_host_description_route": "settings_hosts",
    "update_host_traffic_settings_route": "settings_hosts",
    "update_host_url_route": "settings_hosts",
    "update_host_remnawave_route": "settings_hosts",
    "update_host_base_devices_route": "settings_hosts",
    "rename_host_route": "settings_hosts",
    "update_host_button_style_route": "settings_hosts",
    "update_host_ssh_route": "settings_hosts",
    "run_host_speedtest_route": "settings_hosts",
    "host_speedtests_json": "settings_hosts",
    "run_all_speedtests_route": "settings_hosts",
    "auto_install_speedtest_route": "settings_hosts",
    "update_host_device_mode_route": "settings_hosts",
    "update_tier_lock_extend_route": "settings_hosts",
    "add_device_tier_route": "settings_hosts",
    "delete_device_tier_route": "settings_hosts",
    "edit_device_tier_route": "settings_hosts",
    # Monitor
    "monitor_page": "dashboard",
    "monitor_local_json": "dashboard",
    "monitor_host_json": "dashboard",
    "monitor_target_json": "dashboard",
    "monitor_series_json": "dashboard",
    "monitor_clear_metrics": "dashboard",
    # Trials
    "trials_page": "dashboard",
    "trials_stats_json": "dashboard",
    "trials_list_partial": "dashboard",
    "trials_settings_save": "settings_panel",
    "trials_grant": "users",
    "trials_reset_flag": "users",
    "trials_extend_key": "keys",
    "trials_revoke_key": "keys",
    # Node
    "node_page": "node",
    "node_create_ssh_target_route": "node",
    "node_upload_ssh_key_route": "node",
    "create_ssh_target_route": "node",
    "node_update_ssh_target_route": "node",
    "update_ssh_target_route": "node",
    "node_delete_ssh_target_route": "node",
    "delete_ssh_target_route": "node",
    "node_run_ssh_target_speedtest_route": "node",
    "run_ssh_target_speedtest_route": "node",
    "node_run_all_ssh_target_speedtests_route": "node",
    "node_auto_install_speedtest_on_target_route": "node",
    "auto_install_speedtest_on_target_route": "node",
    "node_servers_list": "node",
    "node_ssh_servers_reorder": "node",
    "node_hosts_reorder": "node",
    "node_server_uptime": "node",
    "node_server_reboot": "node_power",
    "node_deploy_check_status": "node",
    "node_deploy_install_docker": "node",
    "node_deploy_create_directory": "node",
    "node_deploy_save_compose": "node",
    "node_deploy_view_compose": "node",
    "node_deploy_manage_containers": "node",
    "node_deploy_remove_all": "node",
    "node_warp_status": "node",
    "node_warp_install": "node",
    "node_warp_uninstall": "node",
    "node_warp_config": "node",
    "node_warp_restart": "node",
    "node_warp_start": "node",
    "node_warp_stop": "node",
    "node_swap_install": "node",
    "node_swap_delete": "node",
    "node_swap_resize": "node",
    "node_swap_swappiness": "node",
    "node_warp_systemd_get": "node",
    "node_warp_systemd_save": "node",
    "node_warp_logs_usage": "node",
    "node_warp_logs_clean": "node",
    "node_server_execute_command": "node",
    "node_close_ssh_session": "node",
    "node_save_scheduler_config": "node",
    "handle_server_gemini_settings": "support",
    "gemini_settings": "support",
    "gemini_key": "support",
    "generate_gemini_response": "support",
    # Bot control
    "start_bot_route": "bot_control",
    "stop_bot_route": "bot_control",
    "start_support_bot_route": "bot_control",
    "stop_support_bot_route": "bot_control",
    "start_both_bots_route": "bot_control",
    "stop_both_bots_route": "bot_control",
    # Settings tools (broadcast, promo, logs, webapp)
    "other_legacy_redirect": "other_broadcast",
    "webapp_save": "other_webapp",
    "broadcast_stats": "other_broadcast",
    "broadcast_blocked_users": "other_broadcast",
    "broadcast_history_list": "other_broadcast",
    "broadcast_history_detail": "other_broadcast",
    "broadcast_clear_banned": "other_broadcast",
    "broadcast_delete_banned_users": "other_broadcast",
    "broadcast_preview": "other_broadcast",
    "broadcast_upload": "other_broadcast",
    "broadcast_send": "other_broadcast",
    "broadcast_status": "other_broadcast",
    "broadcast_delete_media": "other_broadcast",
    "broadcast_themes_save": "other_broadcast",
    "broadcast_themes_list": "other_broadcast",
    "broadcast_themes_delete": "other_broadcast",
    "broadcast_presets": "other_broadcast",
    "promo_list": "other_promo",
    "promo_stats": "other_promo",
    "promo_spotlight": "other_promo",
    "promo_usages": "other_promo",
    "promo_create": "other_promo",
    "promo_duplicate": "other_promo",
    "promo_toggle": "other_promo",
    "promo_delete": "other_promo",
    "promo_update": "other_promo",
    "logs_stream": "other_logs",
    "logs_history": "other_logs",
    "logs_clear": "other_logs",
    # Developer Support Hub
    "developer_support_page": "dev_support",
    "developer_support_state_json": "dev_support",
    "developer_support_pairing_start": "dev_support",
    "developer_support_pairing_poll": "dev_support",
    "developer_support_pairing_revoke": "dev_support",
    "developer_support_ticket_create": "dev_support",
    "developer_support_tickets_json": "dev_support",
    "developer_support_ticket_json": "dev_support",
    "developer_support_ticket_reply": "dev_support",
    "developer_support_ticket_attachment": "dev_support",
    "developer_page": "dev_support_hub",
    "developer_ticket_page": "dev_support_hub",
    "developer_ticket_reply": "dev_support_hub",
    "developer_attachment": "dev_support_hub",
    "developer_support_inbox_page": "dev_support_hub",
    "developer_support_inbox_detail": "dev_support_hub",
    "developer_support_inbox_reply": "dev_support_hub",
    "developer_support_inbox_attachment": "dev_support_hub",
}

# Read-only endpoints available to any authenticated panel session.
PANEL_GLOBAL_READ_ENDPOINTS: frozenset[str] = frozenset({
    "admin_presence_json",
    "support_badge_counts_json",
})

# Endpoint allowed if the admin has view access to any listed permission.
ENDPOINT_ANY_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "host_speedtests_json": ("settings_hosts", "node", "dashboard"),
}

SETTINGS_TAB_PERMISSIONS: dict[str, str] = {
    "database": "db_manage",
    "panel": "settings_panel",
    "stealth-login": "settings_panel",
    "bot": "settings_bot",
    "payments": "settings_payments",
    "hosts": "settings_hosts",
    "referrals": "settings_referrals",
    "content": "settings_content",
    "access": "settings_access",
    "audit": "settings_audit",
    "anti-fraud": "settings_anti_fraud",
    "broadcast": "other_broadcast",
    "promo": "other_promo",
    "logs": "other_logs",
    "webapp": "other_webapp",
    "remnawave": "other_remnawave",
    "mail-templates": "settings_mail_templates",
}

# --- Permission levels (view / edit) ---

PERMISSION_LEVEL_NONE = "none"
PERMISSION_LEVEL_VIEW = "view"
PERMISSION_LEVEL_EDIT = "edit"
VALID_PERMISSION_LEVELS = frozenset({PERMISSION_LEVEL_VIEW, PERMISSION_LEVEL_EDIT})

PERMISSION_RISK: dict[str, str] = {
    "dashboard": "low",
    "users": "medium",
    "keys": "medium",
    "support": "low",
    "button_constructor": "medium",
    "node": "high",
    "settings": "medium",
    "bot_control": "high",
    "settings_panel": "high",
    "settings_bot": "medium",
    "settings_payments": "high",
    "settings_hosts": "high",
    "settings_referrals": "medium",
    "settings_content": "medium",
    "settings_access": "critical",
    "settings_audit": "medium",
    "settings_anti_fraud": "medium",
    "other_broadcast": "medium",
    "other_promo": "medium",
    "other_logs": "low",
    "other_webapp": "medium",
    "other_remnawave": "high",
    "settings_mail_templates": "medium",
    "db_manage": "critical",
    "system_upgrade": "critical",
    "node_power": "critical",
    "dev_support": "medium",
    "dev_support_hub": "high",
}

DOCK_COVERAGE: list[tuple[str, str]] = [
    ("dashboard", "Главная"),
    ("users", "Пользователи"),
    ("keys", "Ключи"),
    ("support", "Поддержка"),
    ("button_constructor", "Кнопки"),
    ("node", "Ноды"),
    ("db_manage", "Бэкапы"),
    ("settings", "Настройки"),
]

ROLE_PRESETS: list[dict] = [
    {
        "id": "auditor",
        "label": "Аудитор",
        "icon": "visibility",
        "desc": "Только просмотр ключевых разделов",
        "levels": {
            "dashboard": "view",
            "users": "view",
            "keys": "view",
            "support": "view",
            "other_logs": "view",
            "settings_audit": "view",
            "settings_anti_fraud": "view",
        },
    },
    {
        "id": "support_l1",
        "label": "Поддержка L1",
        "icon": "support_agent",
        "desc": "Тикеты + просмотр пользователей",
        "levels": {
            "dashboard": "view",
            "users": "view",
            "keys": "view",
            "support": "edit",
        },
    },
    {
        "id": "support_l2",
        "label": "Поддержка L2",
        "icon": "headset_mic",
        "desc": "Поддержка + управление ключами",
        "levels": {
            "dashboard": "view",
            "users": "edit",
            "keys": "edit",
            "support": "edit",
        },
    },
    {
        "id": "operator",
        "label": "Оператор",
        "icon": "engineering",
        "desc": "Стандартный оператор (как раньше)",
        "levels": {k: "edit" for k in DEFAULT_OPERATOR_PERMISSIONS},
    },
    {
        "id": "hub_inbox",
        "label": "Support Hub",
        "icon": "inbox",
        "desc": "Inbox тикетов с клиентских панелей (maintainer)",
        "levels": {
            "dashboard": "view",
            "dev_support_hub": "edit",
        },
    },
    {
        "id": "content",
        "label": "Контент-менеджер",
        "icon": "article",
        "desc": "Бот, контент, рассылки",
        "levels": {
            "dashboard": "view",
            "settings_bot": "edit",
            "settings_content": "edit",
            "other_broadcast": "edit",
            "settings_mail_templates": "view",
        },
    },
]


def normalize_permission_levels(raw: Any) -> dict[str, str]:
    """Legacy list[str] → all edit; dict → sanitized levels."""
    if isinstance(raw, dict):
        out: dict[str, str] = {}
        for key, val in raw.items():
            if key not in ALL_PERMISSIONS:
                continue
            level = str(val or "").strip().lower()
            if level in VALID_PERMISSION_LEVELS:
                out[key] = level
        return out
    if isinstance(raw, list):
        return {
            str(p).strip(): PERMISSION_LEVEL_EDIT
            for p in raw
            if str(p).strip() in ALL_PERMISSIONS
        }
    return {}


def permission_keys(levels: dict[str, str]) -> list[str]:
    return sorted(levels.keys())


def count_levels(levels: dict[str, str]) -> tuple[int, int]:
    view = sum(1 for v in levels.values() if v == PERMISSION_LEVEL_VIEW)
    edit = sum(1 for v in levels.values() if v == PERMISSION_LEVEL_EDIT)
    return view, edit


def full_edit_levels() -> dict[str, str]:
    return {k: PERMISSION_LEVEL_EDIT for k in ALL_PERMISSIONS}


def resolve_permission(levels: dict[str, str], perm: str) -> str:
    if not perm:
        return PERMISSION_LEVEL_NONE
    return levels.get(perm, PERMISSION_LEVEL_NONE)


def allows_permission(
    levels: dict[str, str],
    perm: str,
    *,
    require_edit: bool = False,
) -> bool:
    level = resolve_permission(levels, perm)
    if require_edit:
        return level == PERMISSION_LEVEL_EDIT
    return level in VALID_PERMISSION_LEVELS


def dock_coverage(levels: dict[str, str]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for perm, label in DOCK_COVERAGE:
        level = resolve_permission(levels, perm)
        if level == PERMISSION_LEVEL_NONE:
            continue
        items.append({"perm": perm, "label": label, "level": level})
    return items


# First page after login / RBAC redirect (order matters)
LANDING_ROUTES: list[tuple[str, str, dict[str, str]]] = [
    ("dashboard", "dashboard_page", {}),
    ("users", "users_page", {}),
    ("keys", "admin_keys_page", {}),
    ("support", "support_list_page", {}),
    ("button_constructor", "button_constructor_page", {}),
    ("node", "node_page", {}),
    ("db_manage", "backups_page", {}),
    ("dev_support_hub", "developer_page", {}),
    ("dev_support", "developer_support_page", {}),
    ("settings_audit", "settings_tab_page", {"tab": "audit"}),
    ("settings", "settings_tab_page", {"tab": "panel"}),
    ("other_logs", "settings_tab_page", {"tab": "logs"}),
]


def resolve_landing_route(levels: dict[str, str]) -> tuple[str, dict[str, str]]:
    for perm, endpoint, values in LANDING_ROUTES:
        if allows_permission(levels, perm, require_edit=False):
            return endpoint, dict(values)
    return "dashboard_page", {}
