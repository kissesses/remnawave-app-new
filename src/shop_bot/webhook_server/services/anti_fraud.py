"""Anti-fraud signal detectors — read-only analytics ported from STEALTHNET."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from shop_bot.data_manager.db.connection import _fetch_list

Severity = Literal["info", "warn", "error"]

SIGNAL_DEFINITIONS: dict[str, dict[str, str]] = {
    "multi_account_email": {
        "label": "Один email — несколько аккаунтов",
        "description": "Один auth_email привязан к нескольким Telegram-профилям",
    },
    "web_account_farm": {
        "label": "Ферма веб-аккаунтов",
        "description": "Несколько web-only аккаунтов (999*) с одного домена за 7 дней без оплат",
    },
    "rapid_trial_burn": {
        "label": "Trial-фарма",
        "description": "Много trial-аккаунтов с одного email-домена за 7 дней без покупок",
    },
    "high_failed_payments": {
        "label": "Много незавершённых платежей (>5 за 7д)",
        "description": "Пользователи с >5 pending-платежами — возможная проба карт",
    },
    "referral_self_chain": {
        "label": "Самореферралы",
        "description": "Реферер и реферал с совпадающим email или подозрительным alias",
    },
    "high_pending_stale": {
        "label": "Зависшие pending (>10 за 7д)",
        "description": "Много незавершённых платежей, которые так и не стали paid",
    },
    "payment_velocity_burst": {
        "label": "Burst оплат (>20 за час)",
        "description": "Более 20 успешных транзакций за один час",
    },
    "suspicious_promo_burst": {
        "label": "Промокод >30 активаций за минуту",
        "description": "Массовая активация промокода — возможная утечка или бот",
    },
}


def _rows(limit: int, sql: str, params: tuple[Any, ...] = ()) -> list[dict]:
    raw = _fetch_list(sql, (*params, limit), "anti-fraud query failed")
    return [dict(row) for row in raw]


def detect_multi_account_email(limit: int = 10) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            LOWER(auth_email) AS email,
            COUNT(*) AS account_count,
            ARRAY_AGG(telegram_id::text ORDER BY telegram_id) AS telegram_ids,
            ARRAY_AGG(COALESCE(username, '(no-name)')) AS usernames
        FROM users
        WHERE auth_email IS NOT NULL AND TRIM(auth_email) <> ''
        GROUP BY LOWER(auth_email)
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "email": r["email"],
            "accountCount": int(r["account_count"]),
            "telegramIds": list(r["telegram_ids"] or []),
            "usernames": list(r["usernames"] or []),
        }
        for r in rows
    ]


def detect_web_account_farm(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            LOWER(SPLIT_PART(auth_email, '@', 2)) AS email_domain,
            COUNT(*) AS account_count,
            ARRAY_AGG(telegram_id::text ORDER BY telegram_id) AS telegram_ids
        FROM users
        WHERE auth_email IS NOT NULL
          AND TRIM(auth_email) <> ''
          AND telegram_id::text LIKE '999%'
          AND trial_used = TRUE
          AND COALESCE(total_spent, 0) = 0
          AND registration_date >= NOW() - INTERVAL '7 days'
        GROUP BY LOWER(SPLIT_PART(auth_email, '@', 2))
        HAVING COUNT(*) > 2
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "emailDomain": r["email_domain"],
            "accountCount": int(r["account_count"]),
            "telegramIds": list(r["telegram_ids"] or []),
        }
        for r in rows
    ]


def detect_rapid_trial_burn(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            LOWER(SPLIT_PART(COALESCE(auth_email, 'unknown@local'), '@', 2)) AS email_domain,
            COUNT(*) AS burner_count,
            ARRAY_AGG(telegram_id::text ORDER BY telegram_id) AS telegram_ids
        FROM users
        WHERE trial_used = TRUE
          AND COALESCE(total_spent, 0) = 0
          AND registration_date >= NOW() - INTERVAL '7 days'
          AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.user_id = users.telegram_id AND LOWER(t.status) = 'paid'
          )
        GROUP BY LOWER(SPLIT_PART(COALESCE(auth_email, 'unknown@local'), '@', 2))
        HAVING COUNT(*) > 2
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "emailDomain": r["email_domain"],
            "burnerCount": int(r["burner_count"]),
            "telegramIds": list(r["telegram_ids"] or []),
        }
        for r in rows
    ]


def detect_high_failed_payments(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            u.telegram_id,
            u.username,
            u.auth_email,
            COUNT(*) AS pending_count
        FROM pending_transactions p
        JOIN users u ON u.telegram_id = p.user_id
        WHERE p.status = 'pending'
          AND p.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY u.telegram_id, u.username, u.auth_email
        HAVING COUNT(*) > 5
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "telegramId": int(r["telegram_id"]),
            "username": r.get("username"),
            "authEmail": r.get("auth_email"),
            "pendingCount": int(r["pending_count"]),
        }
        for r in rows
    ]


def detect_high_pending_stale(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            u.telegram_id,
            u.username,
            u.auth_email,
            COUNT(*) AS stale_count
        FROM pending_transactions p
        JOIN users u ON u.telegram_id = p.user_id
        WHERE p.status <> 'paid'
          AND p.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY u.telegram_id, u.username, u.auth_email
        HAVING COUNT(*) > 10
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "telegramId": int(r["telegram_id"]),
            "username": r.get("username"),
            "authEmail": r.get("auth_email"),
            "staleCount": int(r["stale_count"]),
        }
        for r in rows
    ]


def detect_payment_velocity_burst(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            u.telegram_id,
            u.username,
            u.auth_email,
            COUNT(*) AS payment_count,
            MIN(t.created_date) AS window_start
        FROM transactions t
        JOIN users u ON u.telegram_id = t.user_id
        WHERE LOWER(t.status) = 'paid'
          AND t.created_date >= NOW() - INTERVAL '7 days'
        GROUP BY u.telegram_id, u.username, u.auth_email, DATE_TRUNC('hour', t.created_date)
        HAVING COUNT(*) > 20
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "telegramId": int(r["telegram_id"]),
            "username": r.get("username"),
            "authEmail": r.get("auth_email"),
            "paymentCount": int(r["payment_count"]),
            "windowStart": r["window_start"].isoformat() if r.get("window_start") else None,
        }
        for r in rows
    ]


def detect_suspicious_promo_burst(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            u.code,
            COUNT(*) AS activations,
            MIN(u.used_at) AS window_start
        FROM promo_code_usages u
        WHERE u.used_at >= NOW() - INTERVAL '30 days'
        GROUP BY u.code, DATE_TRUNC('minute', u.used_at)
        HAVING COUNT(*) > 30
        ORDER BY COUNT(*) DESC
        LIMIT ?
        """,
    )
    return [
        {
            "code": r["code"],
            "activations": int(r["activations"]),
            "windowStart": r["window_start"].isoformat() if r.get("window_start") else None,
        }
        for r in rows
    ]


def detect_referral_self_chain(limit: int = 20) -> list[dict]:
    rows = _rows(
        limit,
        """
        SELECT
            r.telegram_id AS referrer_id,
            r.username AS referrer_username,
            r.auth_email AS referrer_email,
            c.telegram_id AS client_id,
            c.username AS client_username,
            c.auth_email AS client_email,
            CASE
                WHEN r.auth_email IS NOT NULL AND c.auth_email IS NOT NULL
                     AND LOWER(r.auth_email) = LOWER(c.auth_email)
                THEN 'same_email'
                WHEN r.auth_email IS NOT NULL AND c.auth_email IS NOT NULL
                     AND SPLIT_PART(LOWER(r.auth_email), '@', 1) = SPLIT_PART(LOWER(c.auth_email), '@', 1)
                     AND SPLIT_PART(LOWER(r.auth_email), '@', 2) = SPLIT_PART(LOWER(c.auth_email), '@', 2)
                THEN 'email_prefix_match'
                ELSE 'unknown'
            END AS reason
        FROM users c
        JOIN users r ON r.telegram_id = c.referred_by
        WHERE c.referred_by IS NOT NULL
          AND (
            (r.auth_email IS NOT NULL AND c.auth_email IS NOT NULL AND LOWER(r.auth_email) = LOWER(c.auth_email))
            OR (
                r.auth_email IS NOT NULL AND c.auth_email IS NOT NULL
                AND SPLIT_PART(LOWER(r.auth_email), '+', 1) = SPLIT_PART(LOWER(c.auth_email), '+', 1)
                AND SPLIT_PART(LOWER(r.auth_email), '@', 2) = SPLIT_PART(LOWER(c.auth_email), '@', 2)
            )
          )
        LIMIT ?
        """,
    )
    return [
        {
            "referrerId": int(r["referrer_id"]),
            "referrerUsername": r.get("referrer_username"),
            "referrerEmail": r.get("referrer_email"),
            "clientId": int(r["client_id"]),
            "clientUsername": r.get("client_username"),
            "clientEmail": r.get("client_email"),
            "reason": r.get("reason"),
        }
        for r in rows
    ]


DETECTORS: dict[str, Any] = {
    "multi_account_email": detect_multi_account_email,
    "web_account_farm": detect_web_account_farm,
    "rapid_trial_burn": detect_rapid_trial_burn,
    "high_failed_payments": detect_high_failed_payments,
    "referral_self_chain": detect_referral_self_chain,
    "high_pending_stale": detect_high_pending_stale,
    "payment_velocity_burst": detect_payment_velocity_burst,
    "suspicious_promo_burst": detect_suspicious_promo_burst,
}

SEVERITY_RULES: dict[str, Severity] = {
    "multi_account_email": "warn",
    "web_account_farm": "warn",
    "rapid_trial_burn": "warn",
    "high_failed_payments": "error",
    "referral_self_chain": "warn",
    "high_pending_stale": "warn",
    "payment_velocity_burst": "error",
    "suspicious_promo_burst": "error",
}


def _severity_for(key: str, count: int) -> Severity:
    if count <= 0:
        return "info"
    return SEVERITY_RULES.get(key, "warn")


def get_all_signals(*, preview_limit: int = 5) -> dict[str, Any]:
    signals: list[dict[str, Any]] = []
    for key, meta in SIGNAL_DEFINITIONS.items():
        detector = DETECTORS[key]
        items = detector(preview_limit)
        count = len(items)
        signals.append(
            {
                "key": key,
                "label": meta["label"],
                "description": meta["description"],
                "severity": _severity_for(key, count),
                "count": count,
                "topItems": items,
            }
        )
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "signals": signals,
        "total": sum(s["count"] for s in signals),
    }


def get_signal_detail(key: str, *, limit: int = 50) -> dict[str, Any] | None:
    detector = DETECTORS.get(key)
    if not detector:
        return None
    limit = max(1, min(int(limit), 200))
    items = detector(limit)
    return {"key": key, "items": items, "total": len(items)}
