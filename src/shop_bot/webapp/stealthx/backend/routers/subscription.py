import json

from fastapi import APIRouter, HTTPException

from shop_bot.webapp.stealthx.backend.core.deps import CurrentUserId, DbSession
from shop_bot.webapp.stealthx.backend.models import AuditLog
from shop_bot.webapp.stealthx.backend.schemas import PlanResponse, SubscribeRequest, SubscribeResponse
from shop_bot.webapp.stealthx.backend.services.subscription_service import create_subscription, list_plans

router = APIRouter(tags=["stealthx-subscription"])


@router.get("/plans", response_model=list[PlanResponse])
def api_plans(db: DbSession):
    plans = list_plans(db)
    return [
        PlanResponse(
            id=p.id,
            slug=p.slug,
            name=p.name,
            price_usd=p.price_usd,
            popular=p.popular,
            features=json.loads(p.features or "[]"),
        )
        for p in plans
    ]


@router.post("/subscribe", response_model=SubscribeResponse)
def api_subscribe(body: SubscribeRequest, user_id: CurrentUserId, db: DbSession):
    try:
        sub, _payment = create_subscription(db, user_id, body.plan_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "Plan not found"}) from None

    db.add(AuditLog(user_id=user_id, action="subscribe", details=str(body.plan_id)))
    db.commit()

    return SubscribeResponse(
        subscription_id=sub.id,
        payment_required=True,
        message="Используйте /api/create-payment для оплаты подписки",
    )
