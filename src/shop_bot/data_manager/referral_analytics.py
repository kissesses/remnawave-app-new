"""Referral program analytics for the panel."""

from __future__ import annotations

from shop_bot.data_manager.db.connection import _fetch_list, _fetch_row
from shop_bot.data_manager.db.dialect import adapt_sql


def get_referral_overview() -> dict:
    referred = _fetch_row(
        adapt_sql(
            """
            SELECT
                COUNT(*) AS referred_users,
                COUNT(DISTINCT referred_by) AS active_referrers,
                COALESCE(SUM(referral_balance_all), 0) AS total_earned,
                COALESCE(SUM(referral_balance), 0) AS pending_withdrawal
            FROM users
            WHERE referred_by IS NOT NULL AND referred_by != 0
            """
        ),
        (),
        "referral overview",
    ) or {}

    converted = _fetch_row(
        adapt_sql(
            """
            SELECT COUNT(*) AS converted
            FROM users
            WHERE referred_by IS NOT NULL AND referred_by != 0 AND COALESCE(total_spent, 0) > 0
            """
        ),
        (),
        "referral converted",
    ) or {}

    bonuses = _fetch_row(
        adapt_sql(
            """
            SELECT COUNT(*) AS bonus_count, COALESCE(SUM(amount_rub), 0) AS bonus_sum
            FROM transactions
            WHERE LOWER(COALESCE(payment_method, '')) = 'referral'
              AND LOWER(COALESCE(status, '')) IN ('paid', 'completed', 'success')
            """
        ),
        (),
        "referral bonus tx",
    ) or {}

    referred_n = int(referred.get("referred_users") or 0)
    converted_n = int(converted.get("converted") or 0)
    conversion_pct = round((converted_n / referred_n) * 100, 1) if referred_n else 0.0

    return {
        "referred_users": referred_n,
        "active_referrers": int(referred.get("active_referrers") or 0),
        "total_earned": float(referred.get("total_earned") or 0),
        "pending_withdrawal": float(referred.get("pending_withdrawal") or 0),
        "converted_users": converted_n,
        "conversion_pct": conversion_pct,
        "bonus_payouts": int(bonuses.get("bonus_count") or 0),
        "bonus_sum": float(bonuses.get("bonus_sum") or 0),
    }


def get_referral_leaderboard(limit: int = 15) -> list[dict]:
    lim = max(1, min(int(limit or 15), 50))
    rows = _fetch_list(
        adapt_sql(
            """
            SELECT
                u.telegram_id,
                u.username,
                u.referral_balance_all,
                u.referral_balance,
                (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.telegram_id) AS ref_count,
                (SELECT COALESCE(SUM(r.total_spent), 0) FROM users r WHERE r.referred_by = u.telegram_id) AS ref_revenue
            FROM users u
            WHERE EXISTS (SELECT 1 FROM users r WHERE r.referred_by = u.telegram_id)
            ORDER BY ref_count DESC, u.referral_balance_all DESC
            LIMIT ?
            """
        ),
        (lim,),
        "referral leaderboard",
    )
    out: list[dict] = []
    for row in rows or []:
        out.append(
            {
                "telegram_id": row.get("telegram_id"),
                "username": row.get("username") or "",
                "ref_count": int(row.get("ref_count") or 0),
                "earned": float(row.get("referral_balance_all") or 0),
                "withdrawable": float(row.get("referral_balance") or 0),
                "ref_revenue": float(row.get("ref_revenue") or 0),
            }
        )
    return out


def get_seller_ref_overrides() -> list[dict]:
    """Active sellers with individual referral percent (seller_ref > 0)."""
    rows = _fetch_list(
        adapt_sql(
            """
            SELECT
                u.telegram_id,
                u.username,
                s.seller_ref,
                s.seller_sale,
                u.referral_balance_all,
                u.referral_balance,
                (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.telegram_id) AS ref_count
            FROM seller_users s
            INNER JOIN users u ON u.telegram_id = s.user_id
            WHERE COALESCE(u.seller_active, 0) = 1
              AND COALESCE(s.seller_ref, 0) > 0
            ORDER BY s.seller_ref DESC, u.username ASC, u.telegram_id ASC
            """
        ),
        (),
        "seller ref overrides",
    )
    out: list[dict] = []
    for row in rows or []:
        username = (row.get("username") or "").strip()
        out.append(
            {
                "telegram_id": row.get("telegram_id"),
                "username": username,
                "display_name": username if username else f"ID {row.get('telegram_id')}",
                "seller_ref": float(row.get("seller_ref") or 0),
                "seller_sale": float(row.get("seller_sale") or 0),
                "earned": float(row.get("referral_balance_all") or 0),
                "withdrawable": float(row.get("referral_balance") or 0),
                "ref_count": int(row.get("ref_count") or 0),
            }
        )
    return out


def get_recent_referrals(limit: int = 20) -> list[dict]:
    lim = max(1, min(int(limit or 20), 50))
    rows = _fetch_list(
        adapt_sql(
            """
            SELECT
                u.telegram_id,
                u.username,
                u.referred_by,
                u.registration_date,
                u.total_spent,
                ref.username AS referrer_username
            FROM users u
            LEFT JOIN users ref ON ref.telegram_id = u.referred_by
            WHERE u.referred_by IS NOT NULL AND u.referred_by != 0
            ORDER BY u.registration_date DESC
            LIMIT ?
            """
        ),
        (lim,),
        "recent referrals",
    )
    out: list[dict] = []
    for row in rows or []:
        out.append(
            {
                "telegram_id": row.get("telegram_id"),
                "username": row.get("username") or "",
                "referred_by": row.get("referred_by"),
                "referrer_username": row.get("referrer_username") or "",
                "registration_date": str(row.get("registration_date") or ""),
                "total_spent": float(row.get("total_spent") or 0),
            }
        )
    return out


def get_recent_referral_bonuses(limit: int = 20) -> list[dict]:
    lim = max(1, min(int(limit or 20), 50))
    rows = _fetch_list(
        adapt_sql(
            """
            SELECT user_id, username, amount_rub, created_date, metadata
            FROM transactions
            WHERE LOWER(COALESCE(payment_method, '')) = 'referral'
            ORDER BY created_date DESC
            LIMIT ?
            """
        ),
        (lim,),
        "recent referral bonuses",
    )
    out: list[dict] = []
    for row in rows or []:
        out.append(
            {
                "user_id": row.get("user_id"),
                "username": row.get("username") or "",
                "amount_rub": float(row.get("amount_rub") or 0),
                "created_date": str(row.get("created_date") or ""),
                "metadata": row.get("metadata") or "",
            }
        )
    return out
