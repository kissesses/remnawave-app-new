from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.connection import (
    DB_FILE,
    get_db_connection,
    get_msk_time,
    _now_str,
    _to_datetime_str,
    _normalize_email,
    _normalize_key_row,
    _exec,
    _fetch_row,
    _fetch_list,
    _fetch_val,
    _check_rowcount,
    _exec_with_check,
    _get_count_stat,
    normalize_host_name,
)
from shop_bot.data_manager.db.dialect import adapt_sql, is_postgresql, sql_table_columns, table_exists

# ==============================


# ===== _GET_TABLE_COLUMNS =====
def _get_table_columns(cursor: sqlite3.Cursor, table: str) -> set[str]:
    if is_postgresql():
        sql, params = sql_table_columns(table)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        names: set[str] = set()
        for row in rows:
            if isinstance(row, dict):
                names.add(row["name"])
            else:
                names.add(row[0])
        return names
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}

# ==============================


# ===== _ENSURE_TABLE_COLUMN =====
def _ensure_table_column(cursor: sqlite3.Cursor, table: str, column: str, definition: str) -> None:
    columns = _get_table_columns(cursor, table)
    if column not in columns: cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

# ================================


# ===== _ENSURE_UNIQUE_INDEX =====
def _ensure_unique_index(cursor: sqlite3.Cursor, name: str, table: str, column: str) -> None:
    cursor.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table}({column})")

# ================================


# ===== _ENSURE_INDEX =====
def _ensure_index(cursor: sqlite3.Cursor, name: str, table: str, column: str) -> None:
    cursor.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({column})")


# ========================


# ===== INITIALIZE_DB =====
def initialize_db():
    if not is_postgresql():
        raise RuntimeError(
            "PostgreSQL обязателен: задайте SHOPBOT_DATABASE_URL или DATABASE_URL"
        )
    from shop_bot.data_manager.db.schema_postgres import initialize_db_postgres, run_migration_postgres

    initialize_db_postgres()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        _ensure_default_values(cursor, "bot_settings", get_bot_default_settings())
        conn.commit()
    run_migration_postgres()
    logging.info("PostgreSQL database initialized")
# =========================


# ===== _ENSURE_DEFAULT_VALUES =====
def _ensure_default_values(cursor: sqlite3.Cursor, table: str, defaults: dict) -> None:
    for key, value in defaults.items():
        try:
            cursor.execute(
                adapt_sql(f"INSERT OR IGNORE INTO {table} (key, value) VALUES (?, ?)"),
                (key, value),
            )
        except Exception:
            pass


def get_bot_default_settings() -> dict:
    return {
        "setup_complete": "0",
        "panel_login": "",
        "panel_password": "",
        "about_text": None,
        "terms_url": None,
        "privacy_url": None,
        "support_user": None,
        "support_text": None,
        "channel_url": None,
        "force_subscription": "true",
        "receipt_email": "example@example.com",
        "telegram_bot_token": None,
        "telegram_bot_username": None,
        "trial_enabled": "true",
        "trial_duration_days": "3",
        "enable_referrals": "true",
        "referral_percentage": "10",
        "referral_discount": "5",
        "minimum_withdrawal": "100",
        "admin_telegram_id": None,
        "admin_telegram_ids": None,
        "yookassa_shop_id": None,
        "yookassa_secret_key": None,
        "sbp_enabled": "false",
        "cryptobot_token": None,
        "heleket_merchant_id": None,
        "heleket_api_key": None,
        "domain": None,
        "ton_wallet_address": None,
        "tonapi_key": None,
        "ton_webhook_secret": None,
        "support_forum_chat_id": None,
        "enable_fixed_referral_bonus": "false",
        "fixed_referral_bonus_amount": "50",
        "referral_reward_type": "percent_purchase",
        "referral_on_start_referrer_amount": "20",
        "referral_share_message": "",
        "referral_program_extra": "",
        "referral_payout_mode": "main_balance",
        "referral_notify_bonus": "true",
        "backup_interval_days": "1",
        "backup_keep_count": "7",
        "backup_autobackup_telegram": "1",
        "backup_compress_level": "9",
        "backup_autobackup_scope": "database",
        "backup_include_env": "0",
        "backup_encrypt_enabled": "1",
        "backup_password_mode": "random",
        "backup_remnawave_mode": "local",
        "backup_remnawave_compose_dir": "/opt/remnawave",
        "backup_remnawave_ssh_target": "",
        "backup_remnawave_pg_service": "remnawave-db",
        "backup_remnawave_database_url": "",
        "backup_remnawave_compose_cmd": "",
        "backup_telegram_chat_id": "",
        "backup_telegram_topic_id": "",
        "backup_secrets_chat_id": "",
        "backup_secrets_topic_id": "",
        "notifications_chat_id": "",
        "notifications_topic_crm": "",
        "notifications_topic_backup": "",
        "notifications_topic_secrets": "",
        "notifications_topic_auth": "",
        "notifications_topic_nodes": "",
        "notifications_topic_payments": "",
        "notifications_topic_sql": "",
        "notifications_topic_trial": "",
        "notifications_topic_tickets": "",
        "monitoring_enabled": "true",
        "monitoring_interval_sec": "300",
        "monitoring_cpu_threshold": "90",
        "monitoring_mem_threshold": "90",
        "monitoring_disk_threshold": "90",
        "monitoring_alert_cooldown_sec": "3600",
        "smtp_enabled": "0",
        "smtp_host": "",
        "smtp_port": "587",
        "smtp_username": "",
        "smtp_password": "",
        "smtp_from_email": "",
        "smtp_from_name": "",
        "smtp_encryption": "starttls",
        "smtp_notify_emails": "",
        "smtp_notify_login": "0",
        "smtp_notify_monitoring": "0",
        "smtp_notify_password_reset": "0",
        "smtp_notify_key_expiry": "0",
        "smtp_notify_payment_receipt": "0",
        "smtp_templates_json": "",
        "bot_messages_json": "",
        "smtp_template_accent": "#0A84FF",
        "remnawave_base_url": None,
        "remnawave_api_token": None,
        "remnawave_cookies": "{}",
        "remnawave_is_local_network": "false",
        "default_extension_days": "30",
        "main_menu_text": None,
        "howto_intro_text": None,
        "howto_android_text": None,
        "howto_ios_text": None,
        "howto_windows_text": None,
        "howto_linux_text": None,
        "btn_trial_text": None,
        "btn_profile_text": None,
        "btn_my_keys_text": None,
        "btn_buy_key_text": None,
        "btn_topup_text": None,
        "btn_referral_text": None,
        "btn_support_text": None,
        "btn_about_text": None,
        "btn_speed_text": None,
        "btn_howto_text": None,
        "btn_admin_text": None,
        "btn_back_to_menu_text": None,
        "btn_trial_button_style": None,
        "btn_trial_icon_emoji_id": None,
        "btn_profile_button_style": None,
        "btn_profile_icon_emoji_id": None,
        "btn_my_keys_button_style": None,
        "btn_my_keys_icon_emoji_id": None,
        "btn_buy_key_button_style": None,
        "btn_buy_key_icon_emoji_id": None,
        "btn_topup_button_style": None,
        "btn_topup_icon_emoji_id": None,
        "btn_referral_button_style": None,
        "btn_referral_icon_emoji_id": None,
        "btn_support_button_style": None,
        "btn_support_icon_emoji_id": None,
        "btn_about_button_style": None,
        "btn_about_icon_emoji_id": None,
        "btn_howto_button_style": None,
        "btn_howto_icon_emoji_id": None,
        "btn_speed_button_style": None,
        "btn_speed_icon_emoji_id": None,
        "btn_admin_button_style": None,
        "btn_admin_icon_emoji_id": None,
        "btn_back_to_menu_button_style": None,
        "btn_back_to_menu_icon_emoji_id": None,
        "stars_enabled": "false",
        "yoomoney_enabled": "false",
        "yoomoney_wallet": None,
        "yoomoney_secret": None,
        "yoomoney_api_token": None,
        "yoomoney_client_id": None,
        "yoomoney_client_secret": None,
        "yoomoney_redirect_uri": None,
        "stars_per_rub": "1",
        "platega_enabled": "false",
        "platega_crypto_enabled": "false",
        "platega_merchant_id": None,
        "platega_api_key": None,
        "main_menu_image": None,
        "profile_image": None,
        "topup_image": None,
        "referral_image": None,
        "support_image": None,
        "about_image": None,
        "speedtest_image": None,
        "howto_image": None,
        "topup_amount_image": None,
        "payment_image": None,
        "buy_server_image": None,
        "buy_plan_image": None,
        "enter_email_image": None,
        "key_info_image": None,
        "extend_plan_image": None,
        "keys_list_image": None,
        "payment_method_image": None,
        "key_comments_image": None,
        "key_ready_image": None,
        "devices_list_image": None,
        "key_gemini": None,
        "stealth_login_enabled": "0",
        "stealth_login_hotkey": "ctrl+b",
        "stealth_login_decoy": "502_nginx",
        "stealth_login_hotkey_enabled": "1",
        "stealth_login_clicks_enabled": "1",
        "stealth_login_clicks_count": "4",
        "stealth_login_clicks_window_ms": "2000",
        "stealth_login_history_path": "/",
        "stealth_login_secret_param": "",
        "stealth_login_secret_value": "",
        "telegram_login_enabled": "0",
        "passkey_login_enabled": "0",
        "dashboard_layout": "header",
        "demo_mode_enabled": "0",
    }

# ==================================


# ===== _ENSURE_USERS_COLUMNS =====
def _ensure_users_columns(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "users"):
        return
    mapping = {
        "referred_by": "INTEGER",
        "balance": "REAL DEFAULT 0",
        "referral_balance": "REAL DEFAULT 0",
        "referral_balance_all": "REAL DEFAULT 0",
        "referral_start_bonus_received": "BOOLEAN DEFAULT 0",
        "is_pinned": "BOOLEAN DEFAULT 0",
        "seller_active": "INTEGER DEFAULT 0",
        "auth_token": "TEXT",
        "auth_token_expires": "REAL",
        "auth_email": "TEXT",
        "auth_pass": "TEXT",
    }
    for column, definition in mapping.items():
        _ensure_table_column(cursor, "users", column, definition)

# =======================


# ===== _ENSURE_HOSTS_COLUMNS =====
def _ensure_hosts_columns(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "xui_hosts"):
        return
    extras = {
        "squad_uuid": "TEXT",
        "description": "TEXT",
        "default_traffic_limit_bytes": "INTEGER",
        "default_traffic_strategy": "TEXT DEFAULT 'NO_RESET'",
        "default_traffic_reset_at": "TEXT",
        "is_active": "INTEGER DEFAULT 1",
        "sort_order": "INTEGER DEFAULT 0",
        "metadata": "TEXT",
        "subscription_url": "TEXT",
        "ssh_host": "TEXT",
        "ssh_port": "INTEGER",
        "ssh_user": "TEXT",
        "ssh_password": "TEXT",
        "ssh_key_path": "TEXT",

        "remnawave_base_url": "TEXT",
        "remnawave_api_token": "TEXT",
        "see": "INTEGER DEFAULT 1",
        "traffic_limit_strategy": "TEXT DEFAULT 'NO_RESET'",
        "device_mode": "TEXT DEFAULT 'plan'",
        "tier_lock_extend": "INTEGER DEFAULT 0",
        "button_style": "TEXT DEFAULT NULL",
        "icon_emoji_id": "TEXT DEFAULT NULL",
    }
    for column, definition in extras.items():
        _ensure_table_column(cursor, "xui_hosts", column, definition)



# =================================


def _ensure_device_tiers_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS device_tiers (
            tier_id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_name TEXT NOT NULL,
            device_count INTEGER NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            UNIQUE(host_name, device_count)
        )
    ''')



# ===== _ENSURE_PLANS_COLUMNS =====
def _ensure_plans_columns(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "plans"):
        return
    extras = {
        "squad_uuid": "TEXT",
        "duration_days": "INTEGER",
        "traffic_limit_bytes": "INTEGER",
        "traffic_limit_strategy": "TEXT DEFAULT 'NO_RESET'",
        "is_active": "INTEGER DEFAULT 1",
        "sort_order": "INTEGER DEFAULT 0",
        "metadata": "TEXT",
        "hwid_limit": "INTEGER DEFAULT 0",
        "traffic_limit_gb": "INTEGER DEFAULT 0",
        "button_style": "TEXT DEFAULT NULL",
        "icon_emoji_id": "TEXT DEFAULT NULL",
    }
    for column, definition in extras.items():
        _ensure_table_column(cursor, "plans", column, definition)



# =================================


# ===== _ENSURE_SUPPORT_TICKETS_COLUMNS =====
def _ensure_support_tickets_columns(cursor: sqlite3.Cursor) -> None:
    if not table_exists(cursor, "support_tickets"):
        return
    extras = {
        "forum_chat_id": "TEXT",
        "message_thread_id": "INTEGER",
    }
    for column, definition in extras.items():
        _ensure_table_column(cursor, "support_tickets", column, definition)



# ===========================================


# ===== _FINALIZE_VPN_KEY_INDEXES =====
def _finalize_vpn_key_indexes(cursor: sqlite3.Cursor) -> None:
    _ensure_unique_index(cursor, "uq_vpn_keys_email", "vpn_keys", "email")
    _ensure_unique_index(cursor, "uq_vpn_keys_key_email", "vpn_keys", "key_email")
    _ensure_index(cursor, "idx_vpn_keys_user_id", "vpn_keys", "user_id")
    _ensure_index(cursor, "idx_vpn_keys_rem_uuid", "vpn_keys", "remnawave_user_uuid")
    _ensure_index(cursor, "idx_vpn_keys_expire_at", "vpn_keys", "expire_at")



# =====================================


# ===== _REBUILD_VPN_KEYS_TABLE =====
def _rebuild_vpn_keys_table(cursor: sqlite3.Cursor) -> None:
    columns = _get_table_columns(cursor, "vpn_keys")
    legacy_markers = {"xui_client_uuid", "expiry_date", "created_date", "connection_string"}
    required = {"remnawave_user_uuid", "email", "expire_at", "created_at", "updated_at"}
    if required.issubset(columns) and not (columns & legacy_markers): _finalize_vpn_key_indexes(cursor); return

    cursor.execute("ALTER TABLE vpn_keys RENAME TO vpn_keys_legacy")
    cursor.execute('''
        CREATE TABLE vpn_keys (
            key_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            host_name TEXT,
            squad_uuid TEXT,
            remnawave_user_uuid TEXT,
            short_uuid TEXT,
            email TEXT UNIQUE,
            key_email TEXT UNIQUE,
            subscription_url TEXT,
            expire_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            traffic_limit_bytes INTEGER,
            traffic_limit_strategy TEXT DEFAULT 'NO_RESET',
            tag TEXT,
            description TEXT,
            comment_key TEXT
        )
    ''')
    old_columns = _get_table_columns(cursor, "vpn_keys_legacy")

    def has(column: str) -> bool: return column in old_columns

    def col(column: str, default: str = "NULL") -> str: return column if has(column) else default

    rem_uuid_expr = "remnawave_user_uuid" if has("remnawave_user_uuid") else ("xui_client_uuid" if has("xui_client_uuid") else "NULL")
    email_expr = "LOWER(email)" if has("email") else ("LOWER(key_email)" if has("key_email") else "NULL")
    key_email_expr = "LOWER(key_email)" if has("key_email") else ("LOWER(email)" if has("email") else "NULL")
    subscription_expr = col("subscription_url", "connection_string" if has("connection_string") else "NULL")
    expire_expr = col("expire_at", "expiry_date" if has("expiry_date") else "NULL")
    created_expr = col("created_at", "created_date" if has("created_date") else "CURRENT_TIMESTAMP")
    updated_expr = col("updated_at", created_expr)
    traffic_strategy_expr = col("traffic_limit_strategy", "'NO_RESET'")

    select_clause = ",\n            ".join([
        f"{col('key_id')} AS key_id",
        f"{col('user_id')} AS user_id",
        f"{col('host_name')} AS host_name",
        f"{col('squad_uuid')} AS squad_uuid",
        f"{rem_uuid_expr} AS remnawave_user_uuid",
        f"{col('short_uuid')} AS short_uuid",
        f"{email_expr} AS email",
        f"{key_email_expr} AS key_email",
        f"{subscription_expr} AS subscription_url",
        f"{expire_expr} AS expire_at",
        f"{created_expr} AS created_at",
        f"{updated_expr} AS updated_at",
        f"{col('traffic_limit_bytes')} AS traffic_limit_bytes",
        f"{traffic_strategy_expr} AS traffic_limit_strategy",
        f"{col('tag')} AS tag",
        f"{col('description')} AS description",
        f"{col('comment_key')} AS comment_key",
    ])

    cursor.execute(
        f"""
        INSERT INTO vpn_keys (
            key_id,
            user_id,
            host_name,
            squad_uuid,
            remnawave_user_uuid,
            short_uuid,
            email,
            key_email,
            subscription_url,
            expire_at,
            created_at,
            updated_at,
            traffic_limit_bytes,
            traffic_limit_strategy,
            tag,
            description,
            comment_key
        )
        SELECT
            {select_clause}
        FROM vpn_keys_legacy
        """
    )
    cursor.execute("DROP TABLE vpn_keys_legacy")
    cursor.execute("SELECT MAX(key_id) FROM vpn_keys")
    max_id = cursor.fetchone()[0]
    if max_id is not None:
        cursor.execute("INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES('vpn_keys', ?)", (max_id,))
    _finalize_vpn_key_indexes(cursor)



# ===================================


# ===== _ENSURE_VPN_KEYS_SCHEMA =====
def _ensure_vpn_keys_schema(cursor: sqlite3.Cursor) -> None:
    if is_postgresql():
        return
    if not table_exists(cursor, "vpn_keys"):
        cursor.execute('''
            CREATE TABLE vpn_keys (
                key_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                host_name TEXT,
                squad_uuid TEXT,
                remnawave_user_uuid TEXT,
                short_uuid TEXT,
                email TEXT UNIQUE,
                key_email TEXT UNIQUE,
                subscription_url TEXT,
                expire_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                traffic_limit_bytes INTEGER,
                traffic_limit_strategy TEXT DEFAULT 'NO_RESET',
                tag TEXT,
                description TEXT,
                comment_key TEXT
            )
        ''')
        _finalize_vpn_key_indexes(cursor)
        return
    _rebuild_vpn_keys_table(cursor)



# ===================================


# ===== RUN_MIGRATION =====
# ===========================================
# ===== _ENSURE_WEBAPP_SETTINGS_TABLE =====
def _ensure_webapp_settings_table(cursor: sqlite3.Cursor):
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS webapp_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                webapp_title TEXT DEFAULT 'VPN',
                webapp_domen TEXT DEFAULT '',
                webapp_enable INTEGER DEFAULT 0,
                webapp_logo TEXT DEFAULT '',
                webapp_icon TEXT DEFAULT '',
                tg_fullscreen INTEGER DEFAULT 0
            )
        ''')
        
        cursor.execute("PRAGMA table_info(webapp_settings)")
        columns = {row[1] for row in cursor.fetchall()}
        
        if "webapp_title" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_title TEXT DEFAULT 'VPN'")
        if "webapp_domen" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_domen TEXT DEFAULT ''")
        if "webapp_enable" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_enable INTEGER DEFAULT 0")
        if "webapp_logo" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_logo TEXT DEFAULT ''")
        if "webapp_icon" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_icon TEXT DEFAULT ''")
        if "tg_fullscreen" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN tg_fullscreen INTEGER DEFAULT 0")
        if "webapp_default_design" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_default_design TEXT DEFAULT 'classic'")
        if "webapp_enabled_designs" not in columns:
            cursor.execute(
                "ALTER TABLE webapp_settings ADD COLUMN webapp_enabled_designs TEXT DEFAULT 'classic,ios,desktop,stealth,stealth-glass'"
            )
        if "webapp_theme_picker" not in columns:
            cursor.execute("ALTER TABLE webapp_settings ADD COLUMN webapp_theme_picker INTEGER DEFAULT 1")

        cursor.execute("INSERT OR IGNORE INTO webapp_settings (id, webapp_title, webapp_domen, webapp_enable, webapp_logo, webapp_icon) VALUES (1, 'VPN', '', 0, '', '')")
            
    except Exception as e:
        logging.error(f"Ошибка миграции webapp_settings: {e}")


# ===========================================


def _ensure_webapp_design_columns(cursor) -> None:
    _ensure_table_column(cursor, "webapp_settings", "webapp_default_design", "TEXT DEFAULT 'classic'")
    _ensure_table_column(
        cursor,
        "webapp_settings",
        "webapp_enabled_designs",
        "TEXT DEFAULT 'classic,ios,desktop,stealth,stealth-glass'",
    )
    _ensure_table_column(cursor, "webapp_settings", "webapp_theme_picker", "INTEGER DEFAULT 1")


# ===== RUN_MIGRATION =====
def run_migration():
    if not is_postgresql():
        raise RuntimeError(
            "PostgreSQL обязателен: задайте SHOPBOT_DATABASE_URL или DATABASE_URL"
        )
    from shop_bot.data_manager.db.schema_postgres import run_migration_postgres

    run_migration_postgres()


# =========================


# ===== _ENSURE_PENDING_TRANSACTIONS_TABLE =====
def _ensure_pending_transactions_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pending_transactions (
            payment_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount_rub REAL,
            metadata TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')


# ==============================================


# ===== _ENSURE_DEFAULT_BUTTON_CONFIGS =====
def _ensure_default_button_configs(cursor: sqlite3.Cursor) -> None:
    def menu_has_buttons(m_type):
        cursor.execute("SELECT 1 FROM button_configs WHERE menu_type = ? LIMIT 1", (m_type,))
        return cursor.fetchone() is not None

    if not menu_has_buttons("main_menu"):
        main_menu_buttons = [
            ("trial", "🎁 Попробовать бесплатно", "get_trial", 0, 0, 0, 2),
            ("profile", "👤 Мой профиль", "show_profile", 1, 0, 1, 1),
            ("my_keys", "🔑 Мои ключи ({len(user_keys)})", "manage_keys", 1, 1, 2, 1),
            ("buy_key", "🛒 Купить ключ", "buy_new_key", 2, 0, 3, 1),
            ("topup", "💳 Пополнить баланс", "top_up_start", 2, 1, 4, 1),
            ("referral", "🤝 Реферальная программа", "show_referral_program", 3, 0, 5, 2),
            ("support", "🆘 Поддержка", "show_help", 4, 0, 6, 1),
            ("about", "ℹ️ О проекте", "show_about", 4, 1, 7, 1),
            ("speed", "⚡ Скорость", "user_speedtest_last", 5, 0, 8, 1),
            ("howto", "❓ Как использовать", "howto_vless", 5, 1, 9, 1),
            ("admin", "⚙️ Админка", "admin_menu", 6, 0, 10, 2),
        ]
        
        for button_id, text, callback_data, row_pos, col_pos, sort_order, button_width in main_menu_buttons:
            cursor.execute("""
                INSERT INTO button_configs 
                (menu_type, button_id, text, callback_data, row_position, column_position, sort_order, button_width, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, ("main_menu", button_id, text, callback_data, row_pos, col_pos, sort_order, button_width))
    

    if not menu_has_buttons("admin_menu"):
        admin_menu_buttons = [
            ("users", "👥 Пользователи", "admin_users", 0, 0, 0, 1),
            ("host_keys", "🌍 Ключи на хосте", "admin_host_keys", 0, 1, 1, 1),
            ("gift_key", "🎁 Выдать ключ", "admin_gift_key", 1, 0, 2, 1),
            ("promo", "🎟 Промокоды", "admin_promo_menu", 1, 1, 3, 1),
            ("speedtest", "⚡ Тест скорости", "admin_speedtest", 2, 0, 4, 1),
            ("monitor", "📊 Мониторинг", "admin_monitor", 2, 1, 5, 1),
            ("backup", "🗄 Бэкап БД", "admin_backup_db", 3, 0, 6, 1),
            ("restore", "♻️ Восстановить БД", "admin_restore_db", 3, 1, 7, 1),
            ("admins", "👮 Администраторы", "admin_admins_menu", 4, 0, 8, 1),
            ("broadcast", "📢 Рассылка", "start_broadcast", 4, 1, 9, 1),
            ("back_to_menu", "⬅️ Назад в меню", "back_to_main_menu", 5, 0, 10, 3),
        ]
        
        for button_id, text, callback_data, row_pos, col_pos, sort_order, button_width in admin_menu_buttons:
            cursor.execute("""
                INSERT INTO button_configs 
                (menu_type, button_id, text, callback_data, row_position, column_position, sort_order, button_width, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, ("admin_menu", button_id, text, callback_data, row_pos, col_pos, sort_order, button_width))
    

    if not menu_has_buttons("profile_menu"):
        profile_menu_buttons = [
            ("topup", "💳 Пополнить баланс", "top_up_start", 0, 0, 0, 2),
            ("referral", "🤝 Реферальная программа", "show_referral_program", 1, 0, 1, 2),
            ("howto", "🛠 Подключиться", "howto_vless", 2, 0, 2, 1),
            ("promo_uni", "🎁 Ввести промокод", "promo_uni", 2, 1, 3, 1),
            ("back_to_menu", "⬅️ Назад в меню", "back_to_main_menu", 3, 0, 4, 3),
        ]
        
        for button_id, text, callback_data, row_pos, col_pos, sort_order, button_width in profile_menu_buttons:
            cursor.execute("""
                INSERT INTO button_configs 
                (menu_type, button_id, text, callback_data, row_position, column_position, sort_order, button_width, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, ("profile_menu", button_id, text, callback_data, row_pos, col_pos, sort_order, button_width))
    

    if not menu_has_buttons("support_menu"):
        support_menu_buttons = [
            ("new_ticket", "✍️ Новое обращение", "support_new_ticket", 0, 0, 0, 1),
            ("my_tickets", "📨 Мои обращения", "support_my_tickets", 0, 1, 1, 1),
            ("external", "🆘 Внешняя поддержка", "support_external", 1, 0, 2, 2),
            ("back_to_menu", "⬅️ Назад в меню", "back_to_main_menu", 2, 0, 3, 2),
        ]
        
        for button_id, text, callback_data, row_pos, col_pos, sort_order, button_width in support_menu_buttons:
            cursor.execute("""
                INSERT INTO button_configs 
                (menu_type, button_id, text, callback_data, row_position, column_position, sort_order, button_width, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, ("support_menu", button_id, text, callback_data, row_pos, col_pos, sort_order, button_width))

    if not menu_has_buttons("key_info_menu"):
        key_info_menu_buttons = [
            ("connect", "📲 Подключиться", None, "{connection_string}", 0, 0, 0, 2),
            ("extend", "➕ Продлить ключ", "extend_key_{key_id}", None, 1, 0, 1, 2),
            ("key_devices", "📱 Устройства", "key_devices_{key_id}", None, 2, 0, 2, 1),
            ("qr", "📱 QR-код", "show_qr_{key_id}", None, 2, 1, 3, 1),
            ("howto", "📖 Инструкция", "howto_vless_{key_id}", None, 3, 0, 4, 1),
            ("comment_key", "📝 Комментарий", "key_comments_{key_id}", None, 3, 1, 5, 1),
            ("back", "⬅️ Назад к списку ключей", "manage_keys", None, 4, 0, 6, 2),
        ]

        for button_id, text, callback_data, url, row_pos, col_pos, sort_order, width in key_info_menu_buttons:
            cursor.execute("""
                INSERT INTO button_configs 
                (menu_type, button_id, text, callback_data, url, row_position, column_position, sort_order, button_width, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, ("key_info_menu", button_id, text, callback_data, url, row_pos, col_pos, sort_order, width))



# ==========================================


# ===== _ENSURE_SSH_TARGETS_TABLE =====
def _ensure_ssh_targets_table(cursor: sqlite3.Cursor) -> None:
    """Миграция: создать таблицу speedtest_ssh_targets при необходимости и добавить недостающие столбцы."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS speedtest_ssh_targets (
            target_name TEXT PRIMARY KEY,
            ssh_host TEXT NOT NULL,
            ssh_port INTEGER DEFAULT 22,
            ssh_user TEXT,
            ssh_password TEXT,
            ssh_key_path TEXT,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            metadata TEXT,
            time_auto TEXT DEFAULT '{}'
        )
    """)

    extras = {
        "ssh_host": "TEXT",
        "ssh_port": "INTEGER",
        "ssh_user": "TEXT",
        "ssh_password": "TEXT",
        "ssh_key_path": "TEXT",
        "description": "TEXT",
        "is_active": "INTEGER DEFAULT 1",
        "sort_order": "INTEGER DEFAULT 0",
        "metadata": "TEXT",
        "time_auto": "TEXT DEFAULT '{}'",
    }
    for column, definition in extras.items():
        _ensure_table_column(cursor, "speedtest_ssh_targets", column, definition)



# =====================================


# ===== _ENSURE_GIFT_TOKENS_TABLE =====
def _ensure_gift_tokens_table(cursor: sqlite3.Cursor) -> None:
    """Миграция для таблиц подарочных токенов."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS gift_tokens (
            token TEXT PRIMARY KEY,
            host_name TEXT NOT NULL,
            days INTEGER NOT NULL,
            activation_limit INTEGER DEFAULT 1,
            activations_used INTEGER DEFAULT 0,
            expires_at TIMESTAMP,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_claimed_at TIMESTAMP,
            comment TEXT
        )
        """
    )
    _ensure_index(cursor, "idx_gift_tokens_host", "gift_tokens", "host_name")
    _ensure_index(cursor, "idx_gift_tokens_expires", "gift_tokens", "expires_at")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS gift_token_claims (
            claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            key_id INTEGER,
            claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(token) REFERENCES gift_tokens(token) ON DELETE CASCADE
        )
        """
    )
    _ensure_index(cursor, "idx_gift_token_claims_token", "gift_token_claims", "token")
    _ensure_index(cursor, "idx_gift_token_claims_user", "gift_token_claims", "user_id")

# =====================================


# ===== _ENSURE_SELLER_USERS_TABLE =====
def _ensure_seller_users_table(cursor: sqlite3.Cursor) -> None:
    """Миграция для таблицы seller_users."""
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS seller_users (
            id_seller INTEGER PRIMARY KEY AUTOINCREMENT,
            seller_sale REAL DEFAULT 0,
            seller_ref REAL DEFAULT 0,
            seller_uuid TEXT DEFAULT '0',
            user_id INTEGER UNIQUE
        )
    ''')
    
    mapping = {
        "seller_sale": "REAL DEFAULT 0",
        "seller_ref": "REAL DEFAULT 0",
        "seller_uuid": "TEXT DEFAULT '0'",
        "user_id": "INTEGER UNIQUE"
    }
    for column, definition in mapping.items():
        _ensure_table_column(cursor, "seller_users", column, definition)

    _ensure_unique_index(cursor, "idx_seller_users_user_id", "seller_users", "user_id")

# ====================================


# ===== _ENSURE_PROMO_TABLES =====
def _ensure_promo_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS promo_codes (
            code TEXT PRIMARY KEY,
            discount_percent REAL,
            discount_amount REAL,
            promo_type TEXT DEFAULT 'discount',
            reward_value INTEGER DEFAULT 0,
            usage_limit_total INTEGER,
            usage_limit_per_user INTEGER,
            used_total INTEGER DEFAULT 0,
            valid_from TIMESTAMP,
            valid_until TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            description TEXT
        )
        """
    )
    
    mapping = {
        "promo_type": "TEXT DEFAULT 'discount'",
        "reward_value": "INTEGER DEFAULT 0"
    }
    for column, definition in mapping.items():
        _ensure_table_column(cursor, "promo_codes", column, definition)

    _ensure_index(cursor, "idx_promo_codes_valid", "promo_codes", "valid_until")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS promo_code_usages (
            usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            applied_amount REAL,
            order_id TEXT,
            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(code) REFERENCES promo_codes(code) ON DELETE CASCADE
        )
        """
    )
    _ensure_index(cursor, "idx_promo_code_usages_code", "promo_code_usages", "code")
    _ensure_index(cursor, "idx_promo_code_usages_user", "promo_code_usages", "user_id")



# =================================


# ===== _ENSURE_HOST_SPEEDTESTS_TABLE =====
def _ensure_host_speedtests_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS host_speedtests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_name TEXT NOT NULL,
            method TEXT NOT NULL,
            ping_ms REAL,
            jitter_ms REAL,
            download_mbps REAL,
            upload_mbps REAL,
            server_name TEXT,
            server_id TEXT,
            ok INTEGER NOT NULL DEFAULT 1,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_host_speedtests_host_time ON host_speedtests(host_name, created_at DESC)")



# =========================================


# ===== _ENSURE_RESOURCE_METRICS_TABLE =====
def _ensure_resource_metrics_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resource_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL,                -- 'local' | 'host' | 'target'
            object_name TEXT NOT NULL,          -- 'panel' | host_name | target_name
            cpu_percent REAL,
            mem_percent REAL,
            disk_percent REAL,
            load1 REAL,
            net_bytes_sent INTEGER,
            net_bytes_recv INTEGER,
            raw_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resource_metrics_scope_time ON resource_metrics(scope, object_name, created_at DESC)")


# ===== _ENSURE_BROADCAST_HISTORY_TABLES =====
def _ensure_broadcast_history_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS broadcast_runs (
            id TEXT PRIMARY KEY,
            started_at TIMESTAMP NOT NULL,
            finished_at TIMESTAMP,
            mode TEXT,
            skip_banned INTEGER DEFAULT 0,
            text_preview TEXT,
            total_recipients INTEGER DEFAULT 0,
            sent_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            skipped_count INTEGER DEFAULT 0,
            blocked_bot_count INTEGER DEFAULT 0,
            deactivated_count INTEGER DEFAULT 0
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS broadcast_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broadcast_id TEXT NOT NULL,
            telegram_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            error_detail TEXT,
            UNIQUE(broadcast_id, telegram_id),
            FOREIGN KEY (broadcast_id) REFERENCES broadcast_runs(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_broadcast_runs_started ON broadcast_runs(started_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_run ON broadcast_deliveries(broadcast_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_status ON broadcast_deliveries(broadcast_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_reason ON broadcast_deliveries(broadcast_id, reason)")

