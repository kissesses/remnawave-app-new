from fastapi import APIRouter

from shop_bot.data_manager.database import get_user, get_user_keys
from shop_bot.webapp.stealthx.backend.core.deps import CurrentUserId, DbSession
from shop_bot.webapp.stealthx.backend.models import StealthxUser, Subscription
from shop_bot.webapp.stealthx.backend.schemas import UserProfileResponse

router = APIRouter(prefix="/user", tags=["stealthx-user"])


@router.get("/profile", response_model=UserProfileResponse)
def api_profile(user_id: CurrentUserId, db: DbSession):
    user = get_user(user_id)
    if not user:
        return UserProfileResponse(
            user_id=user_id,
            email=None,
            display_name=None,
            subscription_status=None,
            active_keys=0,
        )

    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.status.in_(["active", "pending"]))
        .order_by(Subscription.created_at.desc())
        .first()
    )
    keys = get_user_keys(user_id) or []
    active_keys = sum(1 for k in keys if (k.get("days_left") or 0) > 0)

    row = db.get(StealthxUser, user_id)
    return UserProfileResponse(
        user_id=user_id,
        email=user.get("auth_email"),
        display_name=(row.display_name if row else None) or user.get("username"),
        subscription_status=sub.status if sub else None,
        active_keys=active_keys,
    )
