from fastapi import APIRouter, Query

from shop_bot.data_manager.database import get_all_users
from shop_bot.webapp.stealthx.backend.core.deps import AdminUserId, DbSession
from shop_bot.webapp.stealthx.backend.models import Payment, Subscription

router = APIRouter(prefix="/admin", tags=["stealthx-admin"])


@router.get("/users")
def api_admin_users(
    _admin: AdminUserId,
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    users = get_all_users() or []
    slice_users = users[offset : offset + limit]
    return {
        "ok": True,
        "total": len(users),
        "users": [
            {
                "user_id": u.get("telegram_id"),
                "username": u.get("username"),
                "email": u.get("auth_email"),
                "balance": u.get("balance"),
                "is_banned": u.get("is_banned"),
            }
            for u in slice_users
        ],
    }


@router.get("/stats")
def api_admin_stats(_admin: AdminUserId, db: DbSession):
    users = get_all_users() or []
    subs = db.query(Subscription).filter(Subscription.status == "active").count()
    revenue = (
        db.query(Payment)
        .filter(Payment.status == "completed")
        .with_entities(Payment.amount_usd)
        .all()
    )
    total_revenue = sum(r[0] for r in revenue) if revenue else 0.0
    return {
        "ok": True,
        "users_count": len(users),
        "active_subscriptions": subs,
        "revenue_usd": round(total_revenue, 2),
    }
