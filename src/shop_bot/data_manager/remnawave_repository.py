import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from shop_bot.data_manager import database
from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import first_col, msk_now_sql
from shop_bot.data_manager.db.errors import ForeignKeyViolation

logger = logging.getLogger(__name__)

DB_FILE = database.DB_FILE
normalize_host_name = database.normalize_host_name


def _connect():
    return get_db_connection()


def _normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def get_msk_time() -> datetime:
    return datetime.now(timezone(timedelta(hours=3)))


def _default_expire_at_ms() -> int:
    return int(get_msk_time().timestamp() * 1000)


def list_squads(active_only: bool = False) -> list[dict[str, Any]]:
    from shop_bot.data_manager import secrets_vault
    query = "SELECT * FROM xui_hosts"
    params: list[Any] = []
    if active_only:
        query += " WHERE COALESCE(is_active, 1) = 1"
    query += " ORDER BY sort_order ASC, host_name ASC"
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return [secrets_vault.decrypt_host_row(dict(row)) for row in cursor.fetchall()]


def get_squad(identifier: str) -> dict[str, Any] | None:
    if not identifier:
        return None
    ident = identifier.strip()
    if not ident:
        return None
    normalized = normalize_host_name(ident)
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT *
            FROM xui_hosts
            WHERE TRIM(host_name) = TRIM(?)
               OR TRIM(host_name) = TRIM(?)
               OR TRIM(squad_uuid) = TRIM(?)
               OR TRIM(squad_uuid) = TRIM(?)
            LIMIT 1
            """,
            (ident, normalized, ident, normalized),
        )
        row = cursor.fetchone()
        from shop_bot.data_manager import secrets_vault
        return secrets_vault.decrypt_host_row(dict(row) if row else None)


def get_key_by_id(key_id: int) -> dict | None:
    return database.get_key_by_id(key_id)

def check_transaction_exists(payment_id: str) -> bool:
    return database.check_transaction_exists(payment_id)


def get_key_by_email(email: str) -> dict | None:
    return database.get_key_by_email(email)


def get_key_by_remnawave_uuid(remnawave_uuid: str) -> dict | None:
    return database.get_key_by_remnawave_uuid(remnawave_uuid)


def record_key(
    user_id: int,
    squad_uuid: str,
    remnawave_user_uuid: str,
    email: str,
    *,
    host_name: str | None = None,
    expire_at_ms: int | None = None,
    short_uuid: str | None = None,
    subscription_url: str | None = None,
    traffic_limit_bytes: int | None = None,
    traffic_limit_strategy: str | None = None,
    tag: str | None = None,
    description: str | None = None,
    comment_key: str | None = None,
    created_at_ms: int | None = None,
) -> int | None:
    expire_ms = expire_at_ms if expire_at_ms is not None else _default_expire_at_ms()
    email_normalized = _normalize_email(email)
    host_name_norm = normalize_host_name(host_name) if host_name else None

    existing = None
    if email_normalized:
        existing = database.get_key_by_email(email_normalized)
    if not existing and remnawave_user_uuid:
        existing = database.get_key_by_remnawave_uuid(remnawave_user_uuid)

    try:
        if existing:
            key_id = existing['key_id']
            database.update_key_fields(
                key_id,
                host_name=host_name_norm or existing.get('host_name'),
                squad_uuid=squad_uuid or existing.get('squad_uuid'),
                remnawave_user_uuid=remnawave_user_uuid or existing.get('remnawave_user_uuid'),
                short_uuid=short_uuid or existing.get('short_uuid'),
                email=email_normalized or existing.get('email'),
                subscription_url=subscription_url,
                expire_at_ms=expire_ms,
                traffic_limit_bytes=traffic_limit_bytes,
                traffic_limit_strategy=traffic_limit_strategy,
                tag=tag,
                description=description,
                comment_key=comment_key,
            )
            return key_id

        return database.add_new_key(
            user_id=user_id,
            host_name=host_name_norm,
            remnawave_user_uuid=remnawave_user_uuid,
            key_email=email_normalized or email,
            expiry_timestamp_ms=expire_ms,
            squad_uuid=squad_uuid,
            short_uuid=short_uuid,
            subscription_url=subscription_url,
            traffic_limit_bytes=traffic_limit_bytes,
            traffic_limit_strategy=traffic_limit_strategy,
            description=description,
            tag=tag,
            comment_key=comment_key,
            created_at_ms=created_at_ms,
        )
    except Exception:
        logger.exception("Remnawave repository failed to record key for user %s", user_id)
        return None


def record_key_from_payload(
    user_id: int,
    payload: dict[str, Any],
    *,
    host_name: str | None = None,
    description: str | None = None,
    tag: str | None = None,
) -> int | None:
    if not payload:
        return None
    squad_uuid = (payload.get('squad_uuid') or payload.get('squadUuid') or '').strip()
    remnawave_user_uuid = (payload.get('client_uuid') or payload.get('uuid') or payload.get('id') or '').strip()
    email = payload.get('email') or payload.get('accountEmail') or ''
    expire_at_ms = payload.get('expiry_timestamp_ms')
    if expire_at_ms is None:
        expire_iso = payload.get('expireAt') or payload.get('expiryDate')
        if expire_iso:
            try:
                expire_at_ms = int(datetime.fromisoformat(str(expire_iso).replace('Z', '+00:00')).timestamp() * 1000)
            except Exception:
                expire_at_ms = None
                
    created_at_ms = payload.get('created_at_ms')
    if created_at_ms is None:
        created_iso = payload.get('createdAt') or payload.get('createdDate')
        if created_iso:
            try:
                created_at_ms = int(datetime.fromisoformat(str(created_iso).replace('Z', '+00:00')).timestamp() * 1000)
            except Exception:
                created_at_ms = None
                
    return record_key(
        user_id=user_id,
        squad_uuid=squad_uuid,
        remnawave_user_uuid=remnawave_user_uuid,
        email=email,
        host_name=host_name or payload.get('host_name'),
        expire_at_ms=expire_at_ms,
        short_uuid=payload.get('short_uuid') or payload.get('shortUuid'),
        subscription_url=payload.get('subscription_url')
            or payload.get('connection_string')
            or payload.get('subscriptionUrl'),
        traffic_limit_bytes=payload.get('traffic_limit_bytes') or payload.get('trafficLimitBytes'),
        traffic_limit_strategy=payload.get('traffic_limit_strategy') or payload.get('trafficLimitStrategy'),
        tag=tag or payload.get('tag'),
        description=description or payload.get('description'),
        created_at_ms=created_at_ms,
    )


def update_key(
    key_id: int,
    *,
    host_name: str | None = None,
    squad_uuid: str | None = None,
    remnawave_user_uuid: str | None = None,
    short_uuid: str | None = None,
    email: str | None = None,
    subscription_url: str | None = None,
    expire_at_ms: int | None = None,
    traffic_limit_bytes: int | None = None,
    traffic_limit_strategy: str | None = None,
    tag: str | None = None,
    description: str | None = None,
    comment_key: str | None = None,
) -> bool:
    return database.update_key_fields(
        key_id,
        host_name=host_name,
        squad_uuid=squad_uuid,
        remnawave_user_uuid=remnawave_user_uuid,
        short_uuid=short_uuid,
        email=email,
        subscription_url=subscription_url,
        expire_at_ms=expire_at_ms,
        traffic_limit_bytes=traffic_limit_bytes,
        traffic_limit_strategy=traffic_limit_strategy,
        tag=tag,
        description=description,
        comment_key=comment_key,
    )


def delete_key_by_email(email: str) -> bool:
    return database.delete_key_by_email(email)




_LEGACY_FORWARDERS = (
    "add_support_message",
    "add_to_balance",
    "add_to_referral_balance",
    "add_to_referral_balance_all",
    "adjust_user_balance",
    "ban_user",
    "create_gift_key",
    "create_host",
    "create_pending_transaction",
    "create_payload_pending",
    "create_plan",
    "can_reopen_support_ticket",
    "create_support_ticket",
    "deduct_from_balance",
    "deduct_from_referral_balance",
    "delete_host",
    "delete_key_by_id",
    "delete_plan",
    "delete_ticket",
    "delete_user",
    "delete_user_keys",
    "purge_user_account",
    "find_and_complete_ton_transaction",
    "find_and_complete_pending_transaction",
    "get_latest_pending_for_user",
    "get_pending_status",
    "get_pending_metadata",
    "get_admin_ids",
    "get_admin_stats",
    "get_all_hosts",
    "get_all_keys",
    "get_all_settings",
    "get_all_tickets_count",
    "get_all_users",
    "get_user_id_by_gift_token",
    "get_balance",
    "get_closed_tickets_count",
    "get_support_badge_counts",
    "get_support_inbox_stats",
    "get_tickets_for_export",
    "get_daily_stats_for_charts",
    "get_host",
    "get_keys_for_host",
    "get_keys_for_user",
    "get_latest_speedtest",
    "get_next_key_number",
    "get_open_tickets_count",
    "get_waiting_tickets_count",
    "get_paginated_transactions",
    "get_plan_by_id",
    "get_plans_for_host",
    "get_recent_transactions",
    "get_referral_balance",
    "get_referral_balance_all",
    "get_referral_count",
    "get_referrals_for_user",
    "get_setting",
    "get_speedtests",
    "get_ticket",
    "get_ticket_by_thread",
    "get_ticket_messages",
    "get_ticket_reopen_deadline",
    "get_or_create_open_ticket",
    "get_tickets_paginated",
    "toggle_ticket_important",
    "get_total_keys_count",
    "get_total_spent_sum",
    "get_user",
    "get_user_count",
    "get_user_keys",
    "get_user_by_email",
    "create_user_by_email",
    "update_user_auth_token",
    "link_telegram_to_email_user",

    "get_users_paginated",
    "get_users_filter_counts",
    "get_keys_counts_for_users",
    "get_user_tickets",
    "insert_host_speedtest",
    "initialize_db",
    "is_admin",
    "log_transaction",
    "register_user_if_not_exists",
    "run_migration",
    "set_referral_start_bonus_received",
    "set_terms_agreed",
    "set_ticket_status",
    "set_trial_used",
    "toggle_host_visibility",
    "unban_user",
    "update_host_name",
    "update_host_remnawave_settings",
    "update_host_button_style",
    "update_host_ssh_settings",
    "update_host_subscription_url",
    "update_host_description",
    "update_host_traffic_settings",
    "update_host_url",
    "update_key_comment",
    "update_key_fields",
    "update_key_host",
    "update_key_host_and_info",
    "update_key_status_from_server",
    "update_plan",
    "update_setting",
    "get_device_tiers",
    "add_device_tier",
    "delete_device_tier",
    "get_device_tier_by_id",
    "update_host_device_mode",
    "update_ticket_subject",
    "update_ticket_thread_info",
    "update_user_stats",

    "get_all_ssh_targets",
    "get_ssh_target",
    "create_ssh_target",
    "update_ssh_target_fields",
    "delete_ssh_target",
    "rename_ssh_target",
    "update_ssh_target_scheduler",
    "update_ssh_target_sort_order",
    "update_host_sort_order",

    "insert_resource_metric",
    "get_latest_resource_metric",
    "get_metrics_series",
    "get_other_value",
    "set_other_value",
    "get_all_other_settings",
    "update_other_setting",
    "get_webapp_settings",
    "update_webapp_settings",
    "increment_webapp_design_stat",
)

for _name in _LEGACY_FORWARDERS:
    if _name not in globals():
        globals()[_name] = getattr(database, _name)

__all__ = sorted(
    name for name in globals()
    if not name.startswith('_') and name not in {"logging", "datetime", "Any", "database", "logger"}
)




def create_gift_token(
    token: str,
    host_name: str,
    days: int,
    *,
    activation_limit: int = 1,
    expires_at: datetime | None = None,
    created_by: int | None = None,
    comment: str | None = None,
) -> bool:
    token_s = (token or "").strip()
    if not token_s:
        raise ValueError("token is required")
    host_name_n = normalize_host_name(host_name)
    days_i = int(days)
    limit_i = int(activation_limit or 1)
    if days_i <= 0 or limit_i <= 0:
        raise ValueError("days and activation_limit must be positive")

    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO gift_tokens (token, host_name, days, activation_limit, expires_at, created_by, comment)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    token_s,
                    host_name_n,
                    days_i,
                    limit_i,
                    expires_at.isoformat() if isinstance(expires_at, datetime) else expires_at,
                    created_by,
                    comment,
                ),
            )
            conn.commit()
            return True
    except UniqueViolation:
        return False


def get_gift_token(token: str) -> dict | None:
    token_s = (token or "").strip()
    if not token_s:
        return None
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM gift_tokens WHERE token = ?", (token_s,))
        row = cursor.fetchone()
        return dict(row) if row else None


def list_gift_tokens(active_only: bool = False) -> list[dict]:
    query = "SELECT * FROM gift_tokens"
    params: list[Any] = []
    if active_only:
        query += " WHERE (activation_limit IS NULL OR activation_limit > activations_used)"
        query += f" AND (expires_at IS NULL OR expires_at >= {msk_now_sql()})"
    query += " ORDER BY created_at DESC"
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def delete_gift_token(token: str) -> bool:
    token_s = (token or "").strip()
    if not token_s:
        return False
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM gift_tokens WHERE token = ?", (token_s,))
        conn.commit()
        return cursor.rowcount > 0


def claim_gift_token(token: str, user_id: int, key_id: int | None = None) -> dict | None:
    token_s = (token or "").strip()
    if not token_s:
        return None
    user_id_i = int(user_id)
    now_iso = get_msk_time().isoformat()
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT token, host_name, days, activation_limit, activations_used, expires_at
            FROM gift_tokens
            WHERE token = ?
            """,
            (token_s,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        record = dict(row)
        expires_at = record.get("expires_at")
        if expires_at:
            try:
                exp_dt = datetime.fromisoformat(str(expires_at))
            except Exception:
                exp_dt = None
            if exp_dt and exp_dt < get_msk_time():
                return None
        activation_limit = record.get("activation_limit") or 0
        activations_used = record.get("activations_used") or 0
        if activation_limit and activations_used >= activation_limit:
            return None

        try:
            cursor.execute(
                """
                UPDATE gift_tokens
                SET activations_used = activations_used + 1,
                    last_claimed_at = ?
                WHERE token = ?
                """,
                (now_iso, token_s),
            )
            cursor.execute(
                """
                INSERT INTO gift_token_claims (token, user_id, key_id, claimed_at)
                VALUES (?, ?, ?, ?)
                """,
                (token_s, user_id_i, key_id, now_iso),
            )
            conn.commit()
            record["activations_used"] = activations_used + 1
            record["claimed_by"] = user_id_i
            record["claimed_at"] = now_iso
            record["key_id"] = key_id
            return record
        except Exception:
            conn.rollback()
            return None




def create_promo_code(
    code: str,
    *,
    discount_percent: float | None = None,
    discount_amount: float | None = None,
    promo_type: str = 'discount',
    reward_value: int = 0,
    usage_limit_total: int | None = None,
    usage_limit_per_user: int | None = None,
    valid_from: datetime | None = None,
    valid_until: datetime | None = None,
    created_by: int | None = None,
    description: str | None = None,
) -> bool:
    code_s = (code or "").strip().upper()
    if not code_s:
        raise ValueError("code is required")
    if promo_type == 'discount' and (discount_percent or 0) <= 0 and (discount_amount or 0) <= 0:
        raise ValueError("discount must be positive")
    if promo_type == 'universal' and reward_value <= 0:
        raise ValueError("reward_value for universal promo must be positive")
    if promo_type == 'balance' and reward_value <= 0:
        raise ValueError("reward_value for balance promo must be positive")
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO promo_codes (
                    code, discount_percent, discount_amount, promo_type, reward_value,
                    usage_limit_total, usage_limit_per_user,
                    valid_from, valid_until, created_by, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    code_s,
                    float(discount_percent) if discount_percent is not None else None,
                    float(discount_amount) if discount_amount is not None else None,
                    promo_type,
                    reward_value,
                    usage_limit_total,
                    usage_limit_per_user,
                    valid_from.isoformat() if isinstance(valid_from, datetime) else valid_from,
                    valid_until.isoformat() if isinstance(valid_until, datetime) else valid_until,
                    created_by,
                    description,
                ),
            )
            conn.commit()
            return True
    except UniqueViolation:
        return False


def get_promo_code(code: str) -> dict | None:
    code_s = (code or "").strip().upper()
    if not code_s:
        return None
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM promo_codes WHERE code = ?", (code_s,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_promo_code_params(
    code: str,
    *,
    discount_percent: float | None = None,
    discount_amount: float | None = None,
    promo_type: str = 'discount',
    reward_value: int = 0,
    usage_limit_total: int | None = None,
    usage_limit_per_user: int | None = None,
    valid_from: datetime | None = None,
    valid_until: datetime | None = None,
    description: str | None = None,
) -> bool:
    code_s = (code or "").strip().upper()
    if not code_s:
        return False
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE promo_codes SET
                discount_percent = ?,
                discount_amount = ?,
                promo_type = ?,
                reward_value = ?,
                usage_limit_total = ?,
                usage_limit_per_user = ?,
                valid_from = ?,
                valid_until = ?,
                description = ?
            WHERE code = ?
            """,
            (
                float(discount_percent) if discount_percent is not None else None,
                float(discount_amount) if discount_amount is not None else None,
                promo_type,
                reward_value,
                usage_limit_total,
                usage_limit_per_user,
                valid_from.isoformat() if isinstance(valid_from, datetime) else valid_from,
                valid_until.isoformat() if isinstance(valid_until, datetime) else valid_until,
                description,
                code_s,
            )
        )
        conn.commit()
        return cursor.rowcount > 0


def list_promo_codes(include_inactive: bool = True) -> list[dict]:
    query = "SELECT * FROM promo_codes"
    if not include_inactive:
        query += " WHERE is_active = 1"
    query += " ORDER BY created_at DESC"
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]


def check_promo_code_available(code: str, user_id: int) -> tuple[dict | None, str | None]:
    """Проверить возможность использования промокода, не изменяя лимиты."""
    code_s = (code or "").strip().upper()
    if not code_s:
        return None, "empty_code"
    user_id_i = int(user_id)
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT code, discount_percent, discount_amount,
                   promo_type, reward_value,
                   usage_limit_total, usage_limit_per_user,
                   used_total, valid_from, valid_until, is_active
            FROM promo_codes
            WHERE code = ?
            """,
            (code_s,),
        )
        promo_row = cursor.fetchone()
        if promo_row is None:
            return None, "not_found"
        promo = dict(promo_row)
        if not promo.get("is_active"):
            return None, "inactive"
        now_dt = get_msk_time().replace(tzinfo=None)
        valid_from = promo.get("valid_from")
        if valid_from:
            try:
                if datetime.fromisoformat(str(valid_from)) > now_dt:
                    return None, "not_started"
            except Exception:
                pass
        valid_until = promo.get("valid_until")
        if valid_until:
            try:
                if datetime.fromisoformat(str(valid_until)) < now_dt:
                    try:
                        update_promo_code_status(code_s, is_active=False)
                    except Exception:
                        pass
                    return None, "expired"
            except Exception:
                pass
        usage_limit_total = promo.get("usage_limit_total")
        used_total = promo.get("used_total") or 0
        if usage_limit_total and used_total >= usage_limit_total:
            return None, "total_limit_reached"
        usage_limit_per_user = promo.get("usage_limit_per_user")
        if usage_limit_per_user:
            cursor.execute(
                "SELECT COUNT(1) FROM promo_code_usages WHERE code = ? AND user_id = ?",
                (code_s, user_id_i),
            )
            per_user_count = int(first_col(cursor.fetchone(), 0))
            if per_user_count >= usage_limit_per_user:
                return None, "user_limit_reached"
        return promo, None


def update_promo_code_status(code: str, *, is_active: bool | None = None) -> bool:
    code_s = (code or "").strip().upper()
    if not code_s:
        return False
    sets: list[str] = []
    params: list[Any] = []
    if is_active is not None:
        sets.append("is_active = ?")
        params.append(1 if is_active else 0)
    if not sets:
        return False
    params.append(code_s)
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE promo_codes SET {', '.join(sets)} WHERE code = ?", params)
        conn.commit()
        return cursor.rowcount > 0


def delete_promo_code(code: str) -> bool:
    code_s = (code or "").strip().upper()
    if not code_s:
        return False
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM promo_codes WHERE code = ?", (code_s,))
        conn.commit()
        return cursor.rowcount > 0


def redeem_promo_code(code: str, user_id: int, *, applied_amount: float, order_id: str | None = None) -> dict | None:
    code_s = (code or "").strip().upper()
    if not code_s:
        return None
    user_id_i = int(user_id)
    applied_amount_f = float(applied_amount)
    now_iso = get_msk_time().isoformat()
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT code, discount_percent, discount_amount,
                   promo_type, reward_value,
                   usage_limit_total, usage_limit_per_user,
                   used_total, valid_from, valid_until, is_active
            FROM promo_codes
            WHERE code = ?
            """,
            (code_s,),
        )
        promo_row = cursor.fetchone()
        if promo_row is None:
            return None
        promo = dict(promo_row)
        if not promo.get("is_active"):
            return None
        valid_from = promo.get("valid_from")
        valid_until = promo.get("valid_until")
        now_dt = get_msk_time().replace(tzinfo=None)
        if valid_from:
            try:
                if datetime.fromisoformat(str(valid_from)) > now_dt:
                    return None
            except Exception:
                pass
        if valid_until:
            try:
                if datetime.fromisoformat(str(valid_until)) < now_dt:
                    try:
                        update_promo_code_status(code_s, is_active=False)
                    except Exception:
                        pass
                    return None
            except Exception:
                pass
        usage_limit_total = promo.get("usage_limit_total")
        used_total = promo.get("used_total") or 0
        if usage_limit_total and used_total >= usage_limit_total:
            return None
        usage_limit_per_user = promo.get("usage_limit_per_user")
        per_user_count = 0
        if usage_limit_per_user:
            cursor.execute(
                "SELECT COUNT(1) FROM promo_code_usages WHERE code = ? AND user_id = ?",
                (code_s, user_id_i),
            )
            per_user_count = int(first_col(cursor.fetchone(), 0))
            if per_user_count >= usage_limit_per_user:
                return None
        try:
            cursor.execute(
                """
                INSERT INTO promo_code_usages (code, user_id, applied_amount, order_id, used_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (code_s, user_id_i, applied_amount_f, order_id, now_iso),
            )
            cursor.execute(
                """
                UPDATE promo_codes
                SET used_total = COALESCE(used_total, 0) + 1
                WHERE code = ?
                """,
                (code_s,),
            )
            conn.commit()
            promo["used_total"] = used_total + 1
            promo["usage_limit_per_user"] = usage_limit_per_user
            promo["user_used_count"] = per_user_count + 1
            promo["redeemed_by"] = user_id_i
            promo["applied_amount"] = applied_amount_f
            promo["order_id"] = order_id
            promo["used_at"] = now_iso
            return promo
        except ForeignKeyViolation:
            conn.rollback()
            return None
        except Exception:
            conn.rollback()
            raise



def redeem_universal_promo(code: str, user_id: int) -> dict | None:
    code_s = (code or "").strip().upper()
    if not code_s:
        return None
    user_id_i = int(user_id)
    now_iso = get_msk_time().isoformat()
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT code, discount_percent, discount_amount,
                   promo_type, reward_value,
                   usage_limit_total, usage_limit_per_user,
                   used_total, valid_from, valid_until, is_active
            FROM promo_codes
            WHERE code = ? AND promo_type IN ('universal', 'balance')
            """,
            (code_s,),
        )
        promo_row = cursor.fetchone()
        if promo_row is None:
            return None
        promo = dict(promo_row)
        if not promo.get("is_active"):
            return None
        valid_from = promo.get("valid_from")
        valid_until = promo.get("valid_until")
        now_dt = get_msk_time().replace(tzinfo=None)
        if valid_from:
            try:
                if datetime.fromisoformat(str(valid_from)) > now_dt:
                    return None
            except Exception:
                pass
        if valid_until:
            try:
                if datetime.fromisoformat(str(valid_until)) < now_dt:
                    try:
                        update_promo_code_status(code_s, is_active=False)
                    except Exception:
                        pass
                    return None
            except Exception:
                pass
        usage_limit_total = promo.get("usage_limit_total")
        used_total = promo.get("used_total") or 0
        if usage_limit_total and used_total >= usage_limit_total:
            return None
        usage_limit_per_user = promo.get("usage_limit_per_user")
        per_user_count = 0
        if usage_limit_per_user:
            cursor.execute(
                "SELECT COUNT(1) FROM promo_code_usages WHERE code = ? AND user_id = ?",
                (code_s, user_id_i),
            )
            per_user_count = int(first_col(cursor.fetchone(), 0))
            if per_user_count >= usage_limit_per_user:
                return None
        try:
            cursor.execute(
                """
                INSERT INTO promo_code_usages (code, user_id, applied_amount, order_id, used_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (code_s, user_id_i, 0, 'UNIVERSAL_PROMO', now_iso),
            )
            cursor.execute(
                """
                UPDATE promo_codes
                SET used_total = COALESCE(used_total, 0) + 1
                WHERE code = ?
                """,
                (code_s,),
            )
            conn.commit()
            promo["used_total"] = used_total + 1
            promo["usage_limit_per_user"] = usage_limit_per_user
            promo["user_used_count"] = per_user_count + 1
            promo["redeemed_by"] = user_id_i
            promo["used_at"] = now_iso
            return promo
        except ForeignKeyViolation:
            conn.rollback()
            return None
        except Exception:
            conn.rollback()
            raise



def _trial_key_filter(status: str = "all") -> str:
    base = "COALESCE(k.key_email, '') LIKE 'trial_%'"
    status = (status or "all").strip().lower()
    if status == "active":
        return f"{base} AND (k.expire_at IS NULL OR k.expire_at > {msk_now_sql()})"
    if status == "expired":
        return f"{base} AND k.expire_at IS NOT NULL AND k.expire_at <= {msk_now_sql()}"
    return base


def get_paginated_trials(
    page: int = 1,
    per_page: int = 10,
    status: str = "all",
) -> tuple[list[dict[str, Any]], int]:
    offset = (page - 1) * per_page
    where_clause = _trial_key_filter(status)

    count_query = f"SELECT COUNT(*) FROM vpn_keys k WHERE {where_clause}"

    query = f"""
        SELECT
            k.key_id,
            k.key_email,
            k.host_name,
            k.expire_at,
            k.created_at,
            u.telegram_id,
            u.username,
            u.registration_date,
            COALESCE(u.trial_used, 0) AS trial_used,
            CASE
                WHEN k.expire_at IS NULL OR k.expire_at > {msk_now_sql()} THEN 1
                ELSE 0
            END AS is_active
        FROM vpn_keys k
        LEFT JOIN users u ON k.user_id = u.telegram_id
        WHERE {where_clause}
        ORDER BY k.created_at DESC
        LIMIT ? OFFSET ?
    """

    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(count_query)
        total = int(first_col(cursor.fetchone(), 0))
        cursor.execute(query, (per_page, offset))
        items = [dict(row) for row in cursor.fetchall()]
        return items, total


def _trial_eligible_where() -> str:
    now_sql = msk_now_sql()
    return f"""
        COALESCE(u.trial_used, 0) = 0
        AND COALESCE(u.is_banned, 0) = 0
        AND NOT EXISTS (
            SELECT 1 FROM vpn_keys k
            WHERE k.user_id = u.telegram_id
              AND COALESCE(k.key_email, '') LIKE 'trial_%'
              AND (k.expire_at IS NULL OR k.expire_at > {now_sql})
        )
    """


def get_paginated_trial_eligible(page: int = 1, per_page: int = 10) -> tuple[list[dict[str, Any]], int]:
    offset = (page - 1) * per_page
    where_clause = _trial_eligible_where()

    count_query = f"SELECT COUNT(*) FROM users u WHERE {where_clause}"
    query = f"""
        SELECT
            u.telegram_id,
            u.username,
            u.registration_date,
            u.balance,
            COALESCE(u.trial_used, 0) AS trial_used
        FROM users u
        WHERE {where_clause}
        ORDER BY u.registration_date DESC
        LIMIT ? OFFSET ?
    """

    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(count_query)
        total = int(first_col(cursor.fetchone(), 0))
        cursor.execute(query, (per_page, offset))
        items = [dict(row) for row in cursor.fetchall()]
        return items, total


def get_trial_stats() -> dict[str, Any]:
    now_sql = msk_now_sql()
    seven_days_ago = (get_msk_time() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

    with _connect() as conn:
        cursor = conn.cursor()

        cursor.execute(
            f"""
            SELECT COUNT(DISTINCT k.user_id)
            FROM vpn_keys k
            WHERE COALESCE(k.key_email, '') LIKE 'trial_%'
              AND (k.expire_at IS NULL OR k.expire_at > {now_sql})
            """
        )
        active = int(first_col(cursor.fetchone(), 0))

        cursor.execute(
            f"SELECT COUNT(*) FROM users u WHERE {_trial_eligible_where()}"
        )
        eligible = int(first_col(cursor.fetchone(), 0))

        cursor.execute(
            f"""
            SELECT COUNT(DISTINCT k.user_id)
            FROM vpn_keys k
            WHERE COALESCE(k.key_email, '') LIKE 'trial_%'
              AND k.expire_at IS NOT NULL
              AND k.expire_at <= {now_sql}
              AND k.expire_at >= ?
            """,
            (seven_days_ago,),
        )
        expired_recent = int(first_col(cursor.fetchone(), 0))

        cursor.execute(
            "SELECT COUNT(DISTINCT user_id) FROM vpn_keys WHERE COALESCE(key_email, '') LIKE 'trial_%'"
        )
        total_activations = int(first_col(cursor.fetchone(), 0))

        cursor.execute(
            """
            SELECT COUNT(DISTINCT k.user_id)
            FROM vpn_keys k
            WHERE COALESCE(k.key_email, '') LIKE 'trial_%'
              AND EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.user_id = k.user_id
                    AND LOWER(COALESCE(t.status, '')) IN ('paid', 'completed', 'success', 'succeeded')
                    AND LOWER(COALESCE(t.payment_method, '')) NOT IN ('admin', 'referral')
              )
            """
        )
        converted = int(first_col(cursor.fetchone(), 0))

    conversion_pct = round((converted / total_activations) * 100, 1) if total_activations else 0.0
    return {
        "active": active,
        "eligible": eligible,
        "expired_recent": expired_recent,
        "total_activations": total_activations,
        "converted": converted,
        "conversion_pct": conversion_pct,
    }


def get_trial_activations_series(days: int = 30) -> list[dict[str, Any]]:
    days = max(1, min(int(days or 30), 365))
    since = (get_msk_time() - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    query = """
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM vpn_keys
        WHERE COALESCE(key_email, '') LIKE 'trial_%'
          AND DATE(created_at) >= ?
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    """

    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (since,))
        rows = [dict(row) for row in cursor.fetchall()]

    by_day = {str(r.get("day")): int(r.get("count") or 0) for r in rows}
    series: list[dict[str, Any]] = []
    start = get_msk_time() - timedelta(days=days - 1)
    for i in range(days):
        day_dt = start + timedelta(days=i)
        day_key = day_dt.strftime("%Y-%m-%d")
        series.append({"day": day_key, "count": by_day.get(day_key, 0)})
    return series


def get_promo_code_usages(code: str) -> list[dict]:
    code_s = (code or "").strip().upper()
    query = """
        SELECT 
            u.user_id, 
            us.username, 
            u.applied_amount, 
            u.used_at,
            p.promo_type,
            p.reward_value,
            p.discount_percent,
            p.discount_amount
        FROM promo_code_usages u
        LEFT JOIN users us ON u.user_id = us.telegram_id
        LEFT JOIN promo_codes p ON u.code = p.code
        WHERE u.code = ?
        ORDER BY u.used_at DESC
    """
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (code_s,))
        return [dict(row) for row in cursor.fetchall()]


def get_total_spent_by_method(payment_method: str) -> float:
    return database.get_total_spent_by_method(payment_method)


def get_user_by_username(username: str) -> dict | None:
    username_s = (username or "").strip().lower().lstrip('@')
    if not username_s:
        return None
    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(username) = ?", (username_s,))
        row = cursor.fetchone()
        return dict(row) if row else None

