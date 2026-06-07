"""Сборка CRM-ленты активности клиента (платежи, ключи, тикеты, audit)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from shop_bot.data_manager import panel_audit
from shop_bot.data_manager.database import get_db_connection, get_plan_by_id
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.data_manager.db.support import get_ticket_messages, get_user_tickets
from shop_bot.data_manager.remnawave_repository import (
    get_keys_for_user,
    get_referrals_for_user,
    get_user,
)

logger = logging.getLogger(__name__)

CATEGORY_ALL = "all"
CATEGORY_PAYMENTS = "payments"
CATEGORY_BALANCE = "balance"
CATEGORY_KEYS = "keys"
CATEGORY_SUPPORT = "support"
CATEGORY_BROADCAST = "broadcast"
CATEGORY_ADMIN = "admin"
CATEGORY_REFERRAL = "referral"
CATEGORY_SYSTEM = "system"

CATEGORIES: list[dict[str, str]] = [
    {"id": CATEGORY_ALL, "label": "Все", "icon": "view_timeline"},
    {"id": CATEGORY_PAYMENTS, "label": "Платежи", "icon": "payments"},
    {"id": CATEGORY_BALANCE, "label": "Баланс", "icon": "account_balance_wallet"},
    {"id": CATEGORY_KEYS, "label": "Ключи", "icon": "vpn_key"},
    {"id": CATEGORY_SUPPORT, "label": "Поддержка", "icon": "support_agent"},
    {"id": CATEGORY_BROADCAST, "label": "Рассылки", "icon": "campaign"},
    {"id": CATEGORY_ADMIN, "label": "Админ", "icon": "admin_panel_settings"},
    {"id": CATEGORY_REFERRAL, "label": "Рефералы", "icon": "diversity_3"},
    {"id": CATEGORY_SYSTEM, "label": "Система", "icon": "settings"},
]

_KIND_META: dict[str, dict[str, str]] = {
    "registration": {"icon": "person_add", "accent": "blue", "category": CATEGORY_SYSTEM},
    "referral_join": {"icon": "link", "accent": "purple", "category": CATEGORY_REFERRAL},
    "referral_invite": {"icon": "group_add", "accent": "purple", "category": CATEGORY_REFERRAL},
    "referral_bonus": {"icon": "redeem", "accent": "purple", "category": CATEGORY_REFERRAL},
    "payment": {"icon": "receipt_long", "accent": "green", "category": CATEGORY_PAYMENTS},
    "balance": {"icon": "account_balance_wallet", "accent": "orange", "category": CATEGORY_BALANCE},
    "key_created": {"icon": "vpn_key", "accent": "cyan", "category": CATEGORY_KEYS},
    "key_expired": {"icon": "event_busy", "accent": "red", "category": CATEGORY_KEYS},
    "trial": {"icon": "timer", "accent": "yellow", "category": CATEGORY_SYSTEM},
    "support_ticket": {"icon": "confirmation_number", "accent": "blue", "category": CATEGORY_SUPPORT},
    "support_message": {"icon": "chat", "accent": "blue", "category": CATEGORY_SUPPORT},
    "broadcast": {"icon": "campaign", "accent": "pink", "category": CATEGORY_BROADCAST},
    "admin": {"icon": "shield_person", "accent": "violet", "category": CATEGORY_ADMIN},
    "promo": {"icon": "sell", "accent": "green", "category": CATEGORY_PAYMENTS},
    "ban": {"icon": "block", "accent": "red", "category": CATEGORY_ADMIN},
}


def _safe_float(value, default=0.0) -> float:
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _event(
    *,
    eid: str,
    kind: str,
    ts: str | None,
    title: str,
    subtitle: str = "",
    description: str = "",
    amount: float | None = None,
    amount_signed: bool = False,
    status: str | None = None,
    status_label: str | None = None,
    badges: list[str] | None = None,
    links: list[dict[str, str]] | None = None,
    meta: dict | None = None,
) -> dict[str, Any]:
    meta_kind = _KIND_META.get(kind, {"icon": "info", "accent": "gray", "category": CATEGORY_SYSTEM})
    dt = _parse_dt(ts)
    day = dt.strftime("%Y-%m-%d") if dt else ""
    return {
        "id": eid,
        "kind": kind,
        "category": meta_kind["category"],
        "icon": meta_kind["icon"],
        "accent": meta_kind["accent"],
        "ts": ts or "",
        "ts_ms": int(dt.timestamp() * 1000) if dt else 0,
        "day": day,
        "title": title,
        "subtitle": subtitle,
        "description": description,
        "amount": amount,
        "amount_signed": amount_signed,
        "status": status,
        "status_label": status_label,
        "badges": badges or [],
        "links": links or [],
        "meta": meta or {},
    }


def _method_label(payment_method: str | None) -> str:
    mapping = {
        "balance": "Баланс",
        "yookassa": "ЮKassa",
        "platega": "Platega",
        "platega crypto": "Platega Crypto",
        "cryptobot": "CryptoBot",
        "heleket": "Heleket",
        "ton connect": "TON Connect",
        "telegram stars": "Telegram Stars",
        "admin": "Админ-панель",
        "referral": "Реферальный бонус",
        "yoomoney": "ЮMoney",
    }
    raw = payment_method or "N/A"
    return mapping.get(str(raw).strip().lower(), raw)


def _action_label(action: str | None, payment_method: str | None) -> str:
    action_norm = (action or "").strip().lower()
    pm = (payment_method or "").strip().lower()
    if action_norm in ("topup", "top_up"):
        return "Пополнение баланса"
    if action_norm == "admin_balance_adjust":
        return "Ручное изменение баланса"
    if action_norm in ("referral_bonus", "referral_start_bonus"):
        return "Реферальное начисление"
    if pm == "balance":
        return "Оплата с баланса"
    if action_norm == "new":
        return "Покупка нового ключа"
    if action_norm == "extend":
        return "Продление ключа"
    return "Внешняя оплата"


def _plan_name(meta: dict) -> str:
    plan_name = meta.get("plan_name")
    if plan_name:
        return str(plan_name)
    plan_id = meta.get("plan_id")
    if plan_id:
        try:
            plan = get_plan_by_id(int(plan_id))
            if plan:
                return plan.get("plan_name") or f"Тариф #{plan_id}"
        except Exception:
            return f"Тариф #{plan_id}"
    return "—"


def _tx_events(user_id: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT transaction_id, payment_id, created_date, amount_rub, metadata, status, payment_method
                FROM transactions
                WHERE user_id = ?
                ORDER BY created_date DESC
                LIMIT 300
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    except Exception as exc:
        logger.warning("timeline tx for %s: %s", user_id, exc)
        return events

    for row in rows:
        pm_raw = row["payment_method"] or "N/A"
        pm = str(pm_raw).strip().lower()
        meta: dict = {}
        try:
            meta = json.loads(row["metadata"] or "{}")
            if not isinstance(meta, dict):
                meta = {}
        except Exception:
            meta = {}

        action = (meta.get("action") or "").strip()
        action_norm = action.lower()
        host_name = meta.get("host_name") or meta.get("host") or ""
        plan_name = _plan_name(meta)
        amount = _safe_float(row["amount_rub"])
        delta = _safe_float(meta.get("delta"), amount)
        status_norm = (row["status"] or "").strip().lower()
        is_success = status_norm in ("paid", "completed", "success")
        is_topup = action_norm in ("topup", "top_up")
        is_admin_balance = action_norm == "admin_balance_adjust" or pm == "admin"
        is_referral_bonus = action_norm in ("referral_bonus", "referral_start_bonus")
        is_balance_payment = pm == "balance"

        details_bits = []
        if plan_name and plan_name != "—":
            details_bits.append(f"Тариф: {plan_name}")
        if host_name:
            details_bits.append(f"Сервер: {host_name}")
        if meta.get("months"):
            details_bits.append(f"Срок: {meta.get('months')} мес.")
        if meta.get("promo_code"):
            details_bits.append(f"Промокод: {meta.get('promo_code')}")

        links = []
        if meta.get("key_id"):
            links.append({"label": f"Ключ #{meta.get('key_id')}", "href": f"/keys?highlight={meta.get('key_id')}"})
        if meta.get("ticket_id"):
            links.append({"label": "Тикет", "href": f"/support/{meta.get('ticket_id')}"})

        label = _action_label(action, pm_raw)
        method = _method_label(pm_raw)
        tx_id = row["transaction_id"] or row["payment_id"]

        if meta.get("promo_code") and is_success and not is_referral_bonus:
            events.append(
                _event(
                    eid=f"promo-{tx_id}",
                    kind="promo",
                    ts=row["created_date"],
                    title=f"Промокод {meta.get('promo_code')}",
                    subtitle=label,
                    description=" · ".join(details_bits),
                    amount=-_safe_float(meta.get("promo_discount")),
                    status=row["status"],
                    status_label="Применён" if is_success else row["status"],
                    badges=[method],
                    links=links,
                    meta={"transaction_id": tx_id, **meta},
                )
            )

        if is_success and (is_topup or is_admin_balance or is_referral_bonus or is_balance_payment):
            signed_amount = -abs(amount) if is_balance_payment else (delta if is_admin_balance else abs(amount))
            kind = "referral_bonus" if is_referral_bonus else "balance"
            events.append(
                _event(
                    eid=f"bal-{tx_id}",
                    kind=kind,
                    ts=row["created_date"],
                    title=label,
                    subtitle=method,
                    description=" · ".join(details_bits),
                    amount=signed_amount,
                    amount_signed=True,
                    status=row["status"],
                    status_label="Успешно" if is_success else row["status"],
                    badges=[method],
                    links=links,
                    meta={"transaction_id": tx_id, **meta},
                )
            )

        if not is_balance_payment and not is_admin_balance and not is_referral_bonus:
            events.append(
                _event(
                    eid=f"pay-{tx_id}",
                    kind="payment",
                    ts=row["created_date"],
                    title=label,
                    subtitle=method,
                    description=" · ".join(details_bits),
                    amount=amount,
                    status=row["status"],
                    status_label="Успешно" if is_success else row["status"],
                    badges=[method],
                    links=links,
                    meta={"transaction_id": tx_id, "payment_id": row["payment_id"], **meta},
                )
            )
    return events


def _key_events(user_id: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    now = get_msk_time().replace(tzinfo=None)
    try:
        keys = get_keys_for_user(user_id) or []
    except Exception:
        return events
    for key in keys:
        kid = key.get("key_id")
        host = key.get("host_name") or "—"
        email = key.get("email") or key.get("key_email") or ""
        created = key.get("created_at")
        if created:
            events.append(
                _event(
                    eid=f"key-new-{kid}",
                    kind="key_created",
                    ts=str(created),
                    title="Ключ создан",
                    subtitle=host,
                    description=email or f"ID {kid}",
                    links=[{"label": f"Ключ #{kid}", "href": f"/keys?highlight={kid}"}],
                    meta={"key_id": kid, "host_name": host, "email": email},
                )
            )
        expire_raw = key.get("expire_at")
        if expire_raw:
            expire_dt = _parse_dt(str(expire_raw))
            if expire_dt and expire_dt <= now:
                events.append(
                    _event(
                        eid=f"key-exp-{kid}",
                        kind="key_expired",
                        ts=str(expire_raw),
                        title="Ключ истёк",
                        subtitle=host,
                        description=email or f"ID {kid}",
                        status="expired",
                        status_label="Истёк",
                        links=[{"label": f"Ключ #{kid}", "href": f"/keys?highlight={kid}"}],
                        meta={"key_id": kid, "host_name": host},
                    )
                )
    return events


def _support_events(user_id: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        tickets = get_user_tickets(user_id) or []
    except Exception:
        return events
    for ticket in tickets:
        tid = ticket.get("ticket_id")
        subject = ticket.get("subject") or "Без темы"
        status = ticket.get("status") or "open"
        created = ticket.get("created_at") or ticket.get("updated_at")
        events.append(
            _event(
                eid=f"ticket-{tid}",
                kind="support_ticket",
                ts=created,
                title=f"Тикет #{tid}",
                subtitle=subject,
                description=f"Статус: {status}",
                status=status,
                status_label="Открыт" if status == "open" else "Закрыт",
                links=[{"label": "Открыть тикет", "href": f"/support/{tid}"}],
                meta={"ticket_id": tid, "subject": subject},
            )
        )
        try:
            messages = get_ticket_messages(int(tid)) or []
        except Exception:
            messages = []
        for msg in messages[-20:]:
            sender = msg.get("sender") or "user"
            body = (msg.get("content") or msg.get("message_text") or "")[:240]
            if not body and msg.get("media"):
                body = "[медиа]"
            events.append(
                _event(
                    eid=f"msg-{msg.get('message_id') or msg.get('id')}-{tid}",
                    kind="support_message",
                    ts=msg.get("created_at"),
                    title="Сообщение в поддержке",
                    subtitle=f"#{tid} · {sender}",
                    description=body,
                    links=[{"label": "Тикет", "href": f"/support/{tid}"}],
                    meta={"ticket_id": tid, "sender": sender},
                )
            )
    return events


def _broadcast_events(user_id: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT d.broadcast_id, d.status, d.reason, d.error_detail,
                       r.started_at, r.mode, r.text_preview
                FROM broadcast_deliveries d
                JOIN broadcast_runs r ON r.id = d.broadcast_id
                WHERE d.telegram_id = ?
                ORDER BY r.started_at DESC
                LIMIT 80
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    except Exception as exc:
        logger.warning("timeline broadcast for %s: %s", user_id, exc)
        return events

    status_labels = {
        "sent": "Доставлено",
        "failed": "Ошибка",
        "skipped": "Пропущено",
    }
    for row in rows:
        st = row["status"] or "unknown"
        preview = (row["text_preview"] or "")[:120]
        reason = row["reason"] or ""
        desc = preview
        if reason:
            desc = f"{reason}" + (f" · {preview}" if preview else "")
        if row["error_detail"]:
            desc = f"{desc} · {row['error_detail']}"[:240]
        events.append(
            _event(
                eid=f"bc-{row['broadcast_id']}-{user_id}",
                kind="broadcast",
                ts=row["started_at"],
                title="Рассылка",
                subtitle=status_labels.get(st, st),
                description=desc,
                status=st,
                status_label=status_labels.get(st, st),
                badges=[row["mode"] or "broadcast"],
                meta={"broadcast_id": row["broadcast_id"], "reason": reason},
            )
        )
    return events


def _admin_events(user_id: int) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    action_labels = {
        "user.ban": "Блокировка",
        "user.unban": "Разблокировка",
        "user.delete": "Удаление аккаунта",
        "user.revoke_keys": "Отзыв ключей",
    }
    try:
        rows = panel_audit.list_for_user(user_id, 80)
    except Exception:
        return events
    for row in rows:
        action = row.get("action") or ""
        try:
            human = panel_audit.humanize_entry(row)
            summary = human.get("summary") or action_labels.get(action, action)
        except Exception:
            summary = action_labels.get(action, action)
        kind = "ban" if action in ("user.ban", "user.unban") else "admin"
        events.append(
            _event(
                eid=f"audit-{row.get('id')}",
                kind=kind,
                ts=row.get("created_at"),
                title=summary,
                subtitle=row.get("admin_login") or "Админ",
                description=(row.get("details") or "")[:280],
                status="audit",
                status_label=row.get("ip") or "",
                meta={"action": action, "admin_id": row.get("admin_id")},
            )
        )
    return events


def _trial_activation_ts(user_id: int) -> str | None:
    try:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT MIN(created_at) AS ts
                FROM vpn_keys
                WHERE user_id = ? AND COALESCE(key_email, '') LIKE 'trial_%'
                """,
                (user_id,),
            ).fetchone()
        if row and row["ts"]:
            return str(row["ts"])
    except Exception as exc:
        logger.debug("timeline trial ts for %s: %s", user_id, exc)
    return None


def _referral_events(user_id: int, user: dict) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    referred_by = user.get("referred_by")
    if referred_by:
        try:
            inviter = get_user(int(referred_by))
            uname = (inviter or {}).get("username") or str(referred_by)
        except Exception:
            uname = str(referred_by)
        events.append(
            _event(
                eid=f"ref-join-{user_id}",
                kind="referral_join",
                ts=user.get("registration_date"),
                title="Пришёл по реферальной ссылке",
                subtitle=f"Пригласил: @{uname}" if not str(uname).startswith("@") else f"Пригласил: {uname}",
                links=[{"label": "Пригласивший", "href": f"/users/{referred_by}/timeline"}],
                meta={"referrer_id": referred_by},
            )
        )
    try:
        refs = get_referrals_for_user(user_id) or []
    except Exception:
        refs = []
    for ref in refs:
        rid = ref.get("telegram_id")
        uname = ref.get("username") or str(rid)
        events.append(
            _event(
                eid=f"ref-invite-{rid}",
                kind="referral_invite",
                ts=ref.get("registration_date"),
                title="Пригласил нового клиента",
                subtitle=f"@{uname}" if uname and not str(uname).startswith("@") else str(uname),
                links=[{"label": "Профиль", "href": f"/users/{rid}/timeline"}],
                meta={"invited_id": rid},
            )
        )
    return events


def _system_events(user: dict) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    uid = user.get("telegram_id")
    if user.get("registration_date"):
        events.append(
            _event(
                eid=f"reg-{uid}",
                kind="registration",
                ts=user.get("registration_date"),
                title="Регистрация в боте",
                subtitle="Первый контакт с системой",
                status="info",
                status_label="Старт",
            )
        )
    if user.get("trial_used"):
        trial_ts = _trial_activation_ts(int(uid)) if uid else None
        events.append(
            _event(
                eid=f"trial-{uid}",
                kind="trial",
                ts=trial_ts or user.get("registration_date"),
                title="Пробный период использован",
                subtitle="Trial активирован",
                status="used",
                status_label="Trial",
            )
        )
    return events


def _compute_stats(events: list[dict[str, Any]], user: dict) -> dict[str, Any]:
    payments = [e for e in events if e["kind"] == "payment" and (e.get("status") or "").lower() in ("paid", "completed", "success")]
    support = [e for e in events if e["kind"] == "support_ticket"]
    broadcasts = [e for e in events if e["kind"] == "broadcast"]
    admin = [e for e in events if e["category"] == CATEGORY_ADMIN]
    last_ts = max((e.get("ts_ms") or 0 for e in events), default=0)
    return {
        "total_events": len(events),
        "payments_count": len(payments),
        "payments_sum": round(sum(_safe_float(e.get("amount")) for e in payments), 2),
        "support_tickets": len(support),
        "broadcasts_count": len(broadcasts),
        "admin_actions": len(admin),
        "balance": _safe_float(user.get("balance")),
        "total_spent": _safe_float(user.get("total_spent")),
        "referral_count": int(user.get("referral_count") or 0) if user.get("referral_count") is not None else 0,
        "last_activity_ms": last_ts,
    }


def _matches_filters(
    event: dict[str, Any],
    *,
    category: str,
    q: str,
    date_from: str,
    date_to: str,
) -> bool:
    if category and category != CATEGORY_ALL and event.get("category") != category:
        return False
    if q:
        needle = q.lower()
        hay = " ".join(
            str(event.get(k) or "")
            for k in ("title", "subtitle", "description", "status_label")
        ).lower()
        if needle not in hay:
            badges = " ".join(event.get("badges") or []).lower()
            if needle not in badges:
                return False
    if date_from:
        dt_from = _parse_dt(date_from + " 00:00:00")
        evt_dt = _parse_dt(event.get("ts"))
        if dt_from and evt_dt and evt_dt < dt_from:
            return False
    if date_to:
        dt_to = _parse_dt(date_to + " 23:59:59")
        evt_dt = _parse_dt(event.get("ts"))
        if dt_to and evt_dt and evt_dt > dt_to:
            return False
    return True


def build_user_timeline(
    user_id: int,
    *,
    category: str = CATEGORY_ALL,
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 80,
    offset: int = 0,
) -> dict[str, Any]:
    user = get_user(user_id)
    if not user:
        return {"ok": False, "error": "user_not_found"}

    user["referral_count"] = len(get_referrals_for_user(user_id) or [])

    all_events: list[dict[str, Any]] = []
    all_events.extend(_system_events(user))
    all_events.extend(_referral_events(user_id, user))
    all_events.extend(_tx_events(user_id))
    all_events.extend(_key_events(user_id))
    all_events.extend(_support_events(user_id))
    all_events.extend(_broadcast_events(user_id))
    all_events.extend(_admin_events(user_id))

    all_events.sort(key=lambda e: (e.get("ts_ms") or 0, e.get("id") or ""), reverse=True)

    stats = _compute_stats(all_events, user)
    filtered = [e for e in all_events if _matches_filters(e, category=category, q=q, date_from=date_from, date_to=date_to)]
    total = len(filtered)
    page = filtered[offset : offset + max(1, min(limit, 200))]

    days: list[dict[str, Any]] = []
    current_day = None
    for evt in page:
        day = evt.get("day") or "—"
        if day != current_day:
            current_day = day
            days.append({"day": day, "events": []})
        days[-1]["events"].append(evt)

    category_counts: dict[str, int] = {c["id"]: 0 for c in CATEGORIES}
    category_counts[CATEGORY_ALL] = len(all_events)
    for evt in all_events:
        cat = evt.get("category") or CATEGORY_SYSTEM
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "ok": True,
        "user": _serialize_user(user),
        "stats": stats,
        "category_counts": category_counts,
        "events": page,
        "days": days,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(page) < total,
    }


def _serialize_user(user: dict) -> dict[str, Any]:
    return {
        "telegram_id": user.get("telegram_id"),
        "username": user.get("username"),
        "registration_date": user.get("registration_date"),
        "balance": _safe_float(user.get("balance")),
        "total_spent": _safe_float(user.get("total_spent")),
        "total_months": int(user.get("total_months") or 0),
        "trial_used": bool(user.get("trial_used")),
        "is_banned": bool(user.get("is_banned")),
        "is_pinned": bool(user.get("is_pinned")),
        "referral_count": user.get("referral_count") or 0,
    }


def export_user_timeline(
    user_id: int,
    *,
    category: str = CATEGORY_ALL,
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    max_events: int = 5000,
) -> dict[str, Any]:
    """Экспорт с учётом фильтров (до max_events событий)."""
    payload = build_user_timeline(
        user_id,
        category=category,
        q=q,
        date_from=date_from,
        date_to=date_to,
        limit=max(1, min(max_events, 5000)),
        offset=0,
    )
    if not payload.get("ok"):
        return payload

    if not payload.get("has_more"):
        return payload

    all_events = list(payload.get("events") or [])
    offset = len(all_events)
    cap = max(1, min(max_events, 5000))
    while payload.get("has_more") and len(all_events) < cap:
        chunk = build_user_timeline(
            user_id,
            category=category,
            q=q,
            date_from=date_from,
            date_to=date_to,
            limit=min(200, cap - len(all_events)),
            offset=offset,
        )
        if not chunk.get("ok"):
            break
        batch = chunk.get("events") or []
        if not batch:
            break
        all_events.extend(batch)
        offset += len(batch)
        if not chunk.get("has_more"):
            break

    return {
        **payload,
        "events": all_events[:cap],
        "total": payload.get("total"),
        "offset": 0,
        "limit": len(all_events[:cap]),
        "has_more": len(all_events) < int(payload.get("total") or len(all_events)),
        "exported_count": len(all_events[:cap]),
    }


def compact_activity(events: list[dict[str, Any]], limit: int = 120) -> list[dict[str, Any]]:
    """Упрощённый формат для модального окна пользователей."""
    kind_map = {
        "support_ticket": "support",
        "support_message": "support",
        "registration": "system",
        "referral_join": "system",
        "referral_invite": "system",
        "referral_bonus": "balance",
        "key_created": "system",
        "key_expired": "system",
        "trial": "system",
        "broadcast": "system",
        "promo": "payment",
        "ban": "admin",
    }
    out = []
    for e in events[:limit]:
        raw_kind = e.get("kind") or "system"
        kind = kind_map.get(raw_kind, raw_kind)
        if e.get("category") == CATEGORY_ADMIN and kind not in ("admin", "ban"):
            kind = "admin"
        meta = e.get("meta") or {}
        out.append({
            "kind": kind,
            "date": e.get("ts"),
            "title": e.get("title"),
            "subtitle": e.get("subtitle"),
            "amount": e.get("amount"),
            "status": e.get("status"),
            "ticket_id": meta.get("ticket_id"),
        })
    return out
