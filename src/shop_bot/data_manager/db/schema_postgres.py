"""PostgreSQL schema initialization and migrations."""

from __future__ import annotations

import json
import logging

from shop_bot.data_manager.db.connection import get_db_connection

logger = logging.getLogger(__name__)

_PG_DDL = """
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    username TEXT,
    total_spent DOUBLE PRECISION DEFAULT 0,
    total_months INTEGER DEFAULT 0,
    trial_used BOOLEAN DEFAULT FALSE,
    agreed_to_terms BOOLEAN DEFAULT FALSE,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    balance DOUBLE PRECISION DEFAULT 0,
    referred_by BIGINT,
    referral_balance DOUBLE PRECISION DEFAULT 0,
    referral_balance_all DOUBLE PRECISION DEFAULT 0,
    referral_start_bonus_received BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    seller_active INTEGER DEFAULT 0,
    auth_token TEXT,
    auth_token_expires DOUBLE PRECISION,
    auth_email TEXT,
    auth_pass TEXT
);

CREATE TABLE IF NOT EXISTS pending_transactions (
    payment_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount_rub DOUBLE PRECISION,
    metadata TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vpn_keys (
    key_id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
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
    traffic_limit_bytes BIGINT,
    traffic_limit_strategy TEXT DEFAULT 'NO_RESET',
    tag TEXT,
    description TEXT,
    comment_key TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    username TEXT,
    transaction_id SERIAL PRIMARY KEY,
    payment_id TEXT UNIQUE NOT NULL,
    user_id BIGINT NOT NULL,
    status TEXT NOT NULL,
    amount_rub DOUBLE PRECISION NOT NULL,
    amount_currency DOUBLE PRECISION,
    currency_name TEXT,
    payment_method TEXT,
    metadata TEXT,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS other (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS button_configs (
    id SERIAL PRIMARY KEY,
    menu_type TEXT NOT NULL,
    button_id TEXT NOT NULL,
    text TEXT NOT NULL,
    callback_data TEXT,
    url TEXT,
    row_position INTEGER DEFAULT 0,
    column_position INTEGER DEFAULT 0,
    button_width INTEGER DEFAULT 1,
    button_color TEXT,
    emoji_id TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(menu_type, button_id)
);

CREATE TABLE IF NOT EXISTS xui_hosts (
    host_name TEXT PRIMARY KEY,
    squad_uuid TEXT UNIQUE,
    description TEXT,
    default_traffic_limit_bytes BIGINT,
    default_traffic_strategy TEXT DEFAULT 'NO_RESET',
    default_traffic_reset_at TEXT,
    host_url TEXT,
    host_username TEXT,
    host_pass TEXT,
    host_inbound_id INTEGER,
    subscription_url TEXT,
    ssh_host TEXT,
    ssh_port INTEGER,
    ssh_user TEXT,
    ssh_password TEXT,
    ssh_key_path TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,
    see INTEGER DEFAULT 1,
    remnawave_base_url TEXT,
    remnawave_api_token TEXT,
    traffic_limit_strategy TEXT DEFAULT 'NO_RESET',
    device_mode TEXT DEFAULT 'plan',
    tier_lock_extend INTEGER DEFAULT 0,
    button_style TEXT,
    icon_emoji_id TEXT
);

CREATE TABLE IF NOT EXISTS plans (
    plan_id SERIAL PRIMARY KEY,
    host_name TEXT,
    squad_uuid TEXT,
    plan_name TEXT NOT NULL,
    months INTEGER,
    duration_days INTEGER,
    price DOUBLE PRECISION NOT NULL,
    traffic_limit_bytes BIGINT,
    traffic_limit_strategy TEXT DEFAULT 'NO_RESET',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,
    hwid_limit INTEGER DEFAULT 0,
    traffic_limit_gb INTEGER DEFAULT 0,
    button_style TEXT,
    icon_emoji_id TEXT,
    FOREIGN KEY (host_name) REFERENCES xui_hosts (host_name)
);

CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    subject TEXT,
    forum_chat_id TEXT,
    message_thread_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_messages (
    message_id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    media TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (ticket_id)
);

CREATE TABLE IF NOT EXISTS seller_users (
    id_seller SERIAL PRIMARY KEY,
    seller_sale DOUBLE PRECISION DEFAULT 0,
    seller_ref DOUBLE PRECISION DEFAULT 0,
    seller_uuid TEXT DEFAULT '0',
    user_id BIGINT UNIQUE
);

CREATE TABLE IF NOT EXISTS host_speedtests (
    id SERIAL PRIMARY KEY,
    host_name TEXT NOT NULL,
    method TEXT NOT NULL,
    ping_ms DOUBLE PRECISION,
    jitter_ms DOUBLE PRECISION,
    download_mbps DOUBLE PRECISION,
    upload_mbps DOUBLE PRECISION,
    server_name TEXT,
    server_id TEXT,
    ok INTEGER NOT NULL DEFAULT 1,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_metrics (
    id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL,
    object_name TEXT NOT NULL,
    cpu_percent DOUBLE PRECISION,
    mem_percent DOUBLE PRECISION,
    disk_percent DOUBLE PRECISION,
    load1 DOUBLE PRECISION,
    net_bytes_sent BIGINT,
    net_bytes_recv BIGINT,
    raw_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS device_tiers (
    tier_id SERIAL PRIMARY KEY,
    host_name TEXT NOT NULL,
    device_count INTEGER NOT NULL,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(host_name, device_count)
);

CREATE TABLE IF NOT EXISTS webapp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    webapp_title TEXT DEFAULT 'VPN',
    webapp_domen TEXT DEFAULT '',
    webapp_enable INTEGER DEFAULT 0,
    webapp_logo TEXT DEFAULT '',
    webapp_icon TEXT DEFAULT '',
    tg_fullscreen INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gift_tokens (
    token TEXT PRIMARY KEY,
    host_name TEXT NOT NULL,
    days INTEGER NOT NULL,
    activation_limit INTEGER DEFAULT 1,
    activations_used INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_claimed_at TIMESTAMP,
    comment TEXT
);

CREATE TABLE IF NOT EXISTS gift_token_claims (
    claim_id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    key_id INTEGER,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(token) REFERENCES gift_tokens(token) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    discount_percent DOUBLE PRECISION,
    discount_amount DOUBLE PRECISION,
    promo_type TEXT DEFAULT 'discount',
    reward_value INTEGER DEFAULT 0,
    usage_limit_total INTEGER,
    usage_limit_per_user INTEGER,
    used_total INTEGER DEFAULT 0,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

CREATE TABLE IF NOT EXISTS promo_code_usages (
    usage_id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    applied_amount DOUBLE PRECISION,
    order_id TEXT,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(code) REFERENCES promo_codes(code) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS broadcast_deliveries (
    id SERIAL PRIMARY KEY,
    broadcast_id TEXT NOT NULL,
    telegram_id BIGINT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    error_detail TEXT,
    UNIQUE(broadcast_id, telegram_id),
    FOREIGN KEY (broadcast_id) REFERENCES broadcast_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS panel_roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    permissions TEXT NOT NULL DEFAULT '[]',
    is_superadmin INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS panel_admins (
    id SERIAL PRIMARY KEY,
    login TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    telegram_user_id BIGINT,
    telegram_username TEXT,
    auth_security_method TEXT NOT NULL DEFAULT 'none',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(role_id) REFERENCES panel_roles(id)
);

CREATE TABLE IF NOT EXISTS panel_webauthn_credentials (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    transports TEXT DEFAULT '[]',
    label TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES panel_admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS panel_audit_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER,
    admin_login TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS panel_admin_invites (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    token_prefix TEXT DEFAULT '',
    token_encrypted TEXT DEFAULT '',
    role_id INTEGER NOT NULL,
    created_by_admin_id INTEGER,
    created_by_login TEXT DEFAULT '',
    note TEXT DEFAULT '',
    email_hint TEXT DEFAULT '',
    expires_at TIMESTAMP NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    revoked_at TIMESTAMP,
    last_redeemed_at TIMESTAMP,
    last_redeemed_login TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(role_id) REFERENCES panel_roles(id)
);

CREATE TABLE IF NOT EXISTS dev_support_pairing_sessions (
    id SERIAL PRIMARY KEY,
    device_code TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    panel_fp TEXT,
    panel_domain TEXT,
    version TEXT,
    confirmed_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_support_installations (
    id TEXT PRIMARY KEY,
    panel_fp TEXT NOT NULL,
    public_key_b64 TEXT NOT NULL,
    panel_domain TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    paired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_support_tickets (
    id SERIAL PRIMARY KEY,
    installation_id TEXT NOT NULL REFERENCES dev_support_installations(id),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    shopbot_version TEXT,
    panel_domain TEXT,
    public_ip TEXT,
    admin_id INTEGER,
    admin_login TEXT,
    admin_role TEXT,
    diagnostics_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_support_ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES dev_support_tickets(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_support_ticket_attachments (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES dev_support_tickets(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dev_support_nonces (
    nonce TEXT PRIMARY KEY,
    installation_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stealthx_plans (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price_usd DOUBLE PRECISION NOT NULL,
    popular BOOLEAN DEFAULT FALSE,
    features TEXT DEFAULT '[]',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stealthx_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plan_id INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stealthx_vpn_servers (
    id SERIAL PRIMARY KEY,
    country TEXT NOT NULL,
    country_code TEXT DEFAULT '',
    host_name TEXT NOT NULL,
    ping_ms INTEGER DEFAULT 0,
    load_pct INTEGER DEFAULT 0,
    status TEXT DEFAULT 'online',
    lat DOUBLE PRECISION DEFAULT 0,
    lng DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stealthx_payments (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plan_id INTEGER,
    amount_usd DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'pending',
    external_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stealthx_logs (
    id SERIAL PRIMARY KEY,
    user_id BIGINT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_PG_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_thread ON support_tickets(forum_chat_id, message_thread_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_users_user_id ON seller_users(user_id);
CREATE INDEX IF NOT EXISTS idx_host_speedtests_host_time ON host_speedtests(host_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_metrics_scope_time ON resource_metrics(scope, object_name, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vpn_keys_email ON vpn_keys(email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vpn_keys_key_email ON vpn_keys(key_email);
CREATE INDEX IF NOT EXISTS idx_vpn_keys_user_id ON vpn_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_vpn_keys_rem_uuid ON vpn_keys(remnawave_user_uuid);
CREATE INDEX IF NOT EXISTS idx_vpn_keys_expire_at ON vpn_keys(expire_at);
CREATE INDEX IF NOT EXISTS idx_gift_tokens_host ON gift_tokens(host_name);
CREATE INDEX IF NOT EXISTS idx_gift_tokens_expires ON gift_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_gift_token_claims_token ON gift_token_claims(token);
CREATE INDEX IF NOT EXISTS idx_gift_token_claims_user ON gift_token_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_valid ON promo_codes(valid_until);
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_code ON promo_code_usages(code);
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_user ON promo_code_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_runs_started ON broadcast_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_run ON broadcast_deliveries(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_status ON broadcast_deliveries(broadcast_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_reason ON broadcast_deliveries(broadcast_id, reason);
CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_admins_login_lower ON panel_admins(LOWER(login));
CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_admins_telegram_user_id ON panel_admins(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_panel_webauthn_admin ON panel_webauthn_credentials(admin_id);
CREATE INDEX IF NOT EXISTS idx_panel_audit_created ON panel_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_token ON panel_admin_invites(token);
CREATE INDEX IF NOT EXISTS idx_panel_admin_invites_expires ON panel_admin_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_dev_support_tickets_status ON dev_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_dev_support_tickets_installation ON dev_support_tickets(installation_id);
CREATE INDEX IF NOT EXISTS idx_dev_support_messages_ticket ON dev_support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_dev_support_nonces_created ON dev_support_nonces(created_at);
"""


def initialize_db_postgres() -> None:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                for stmt in _PG_DDL.split(";"):
                    text = stmt.strip()
                    if text:
                        cursor.execute(text)
                for stmt in _PG_INDEXES.split(";"):
                    text = stmt.strip()
                    if text:
                        cursor.execute(text)
                cursor.execute(
                    """
                    INSERT INTO bot_settings (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO NOTHING
                    """,
                    ("pay_info_comment", json.dumps({"id": 1, "username": 1, "first_name": 1, "host_name": 1})),
                )
                cursor.execute(
                    "INSERT INTO bot_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    ("skip_email", "0"),
                )
                cursor.execute(
                    "INSERT INTO bot_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    ("enable_wal_mode", "0"),
                )
                cursor.execute(
                    """
                    INSERT INTO other (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO NOTHING
                    """,
                    ("newsletter", json.dumps({})),
                )
                cursor.execute(
                    "INSERT INTO other (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    ("sg_promt", ""),
                )
                cursor.execute(
                    "INSERT INTO other (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    ("theme_newsletter", json.dumps({})),
                )
                cursor.execute(
                    "INSERT INTO other (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                    ("auto_start_bot", "0"),
                )
                cursor.execute(
                    """
                    INSERT INTO webapp_settings
                    (id, webapp_title, webapp_domen, webapp_enable, webapp_logo, webapp_icon)
                    VALUES (1, 'VPN', '', 0, '', '')
                    ON CONFLICT (id) DO NOTHING
                    """
                )
            conn.commit()
        logger.info("PostgreSQL schema initialized")
    except Exception as e:
        logging.error("Failed to initialize PostgreSQL schema: %s", e)
        raise


def run_migration_postgres() -> None:
    from shop_bot.data_manager.db.schema import (
        _ensure_default_button_configs,
        _ensure_default_values,
    )

    logger.info("Running PostgreSQL migrations")
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                _ensure_default_values(cursor, "bot_settings", {
                    "skip_email": "0",
                    "enable_wal_mode": "0",
                    "dashboard_layout": "header",
                    "demo_mode_enabled": "0",
                })
                _ensure_default_values(cursor, "other", {
                    "theme_newsletter": json.dumps({}),
                    "auto_start_bot": "0",
                })
                _ensure_default_button_configs(cursor)
                from shop_bot.data_manager.db.schema import _ensure_webapp_design_columns, _ensure_webapp_studio_columns, _ensure_webapp_platform_columns

                from shop_bot.data_manager.db.schema import _ensure_support_tickets_columns

                _ensure_support_tickets_columns(cursor)
                cursor.execute(
                    """
                    UPDATE support_tickets
                    SET closed_at = updated_at
                    WHERE status = 'closed' AND closed_at IS NULL
                    """
                )
                _ensure_webapp_design_columns(cursor)
                _ensure_webapp_studio_columns(cursor)
                _ensure_webapp_platform_columns(cursor)
                from shop_bot.data_manager.db.schema import _ensure_table_column
                _ensure_table_column(cursor, "users", "jwt_refresh_hash", "TEXT")
                _ensure_table_column(cursor, "users", "display_name", "TEXT")
                try:
                    from shop_bot.data_manager.panel_access import (
                        _ensure_default_roles,
                        migrate_legacy_panel_admin,
                    )
                    from shop_bot.data_manager.db.dialect import adapt_sql, row_cols
                    from shop_bot.data_manager.secrets_vault import (
                        HASH_PREFIX,
                        hash_webapp_password,
                        migrate_plaintext_settings,
                    )

                    migrate_plaintext_settings(cursor)
                    _ensure_default_roles(cursor)
                    migrate_legacy_panel_admin(cursor)
                    from shop_bot.data_manager.panel_security import SECURITY_NONE, SECURITY_TOTP

                    cursor.execute(
                        adapt_sql(
                            """
                            UPDATE panel_admins
                            SET auth_security_method = ?
                            WHERE totp_enabled = 1
                              AND (auth_security_method IS NULL OR auth_security_method = ? OR auth_security_method = '')
                            """
                        ),
                        (SECURITY_TOTP, SECURITY_NONE),
                    )
                    cursor.execute(
                        "SELECT telegram_id, auth_pass FROM users WHERE auth_pass IS NOT NULL AND auth_pass != ''"
                    )
                    for row in cursor.fetchall():
                        telegram_id, auth_pass = row_cols(row, "telegram_id", "auth_pass")
                        text = str(auth_pass or "")
                        if text and not text.startswith(HASH_PREFIX):
                            cursor.execute(
                                adapt_sql("UPDATE users SET auth_pass = ? WHERE telegram_id = ?"),
                                (hash_webapp_password(text), telegram_id),
                            )
                except Exception as e:
                    logging.error("PostgreSQL panel/secrets migration failed: %s", e)
            conn.commit()
    except Exception as e:
        logging.error("PostgreSQL migration failed: %s", e)
