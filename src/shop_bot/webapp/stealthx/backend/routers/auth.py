from fastapi import APIRouter

from shop_bot.webapp.stealthx.backend.core.deps import CurrentUserId, DbSession
from shop_bot.webapp.stealthx.backend.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from shop_bot.webapp.stealthx.backend.services.auth_service import (
    login_user,
    logout_user,
    refresh_tokens,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["stealthx-auth"])


@router.post("/register", response_model=TokenResponse)
def api_register(body: RegisterRequest, db: DbSession):
    return register_user(db, body)


@router.post("/login", response_model=TokenResponse)
def api_login(body: LoginRequest, db: DbSession):
    return login_user(db, body)


@router.post("/jwt/logout")
def api_jwt_logout(db: DbSession, user_id: CurrentUserId):
    return logout_user(db, user_id)


@router.post("/refresh", response_model=TokenResponse)
def api_refresh(body: RefreshRequest, db: DbSession):
    return refresh_tokens(db, body.refresh_token)
