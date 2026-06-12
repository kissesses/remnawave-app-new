import hashlib

from fastapi import HTTPException
from sqlalchemy.orm import Session

from shop_bot.data_manager.database import (
    create_user_by_email,
    get_user_by_email,
    verify_user_email_password,
)
from shop_bot.webapp.stealthx.backend.core.jwt import create_access_token, create_refresh_token, decode_token
from shop_bot.webapp.stealthx.backend.models import AuditLog, StealthxUser
from shop_bot.webapp.stealthx.backend.schemas import LoginRequest, RegisterRequest, TokenResponse


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _issue_tokens(db: Session, user_id: int) -> TokenResponse:
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    user = db.get(StealthxUser, user_id)
    if user:
        user.jwt_refresh_hash = _hash_refresh(refresh)
        db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh, user_id=user_id)


def register_user(db: Session, body: RegisterRequest) -> TokenResponse:
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail={"ok": False, "error": "Email already registered"})

    user = create_user_by_email(body.email, body.password)
    if not user:
        raise HTTPException(status_code=500, detail={"ok": False, "error": "Registration failed"})

    if body.display_name:
        row = db.get(StealthxUser, user["telegram_id"])
        if row:
            row.display_name = body.display_name
            db.commit()

    db.add(AuditLog(user_id=user["telegram_id"], action="register", details=body.email))
    db.commit()
    return _issue_tokens(db, user["telegram_id"])


def login_user(db: Session, body: LoginRequest) -> TokenResponse:
    user = get_user_by_email(body.email)
    if not user or not verify_user_email_password(user, body.password):
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Invalid credentials"})
    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail={"ok": False, "error": "Banned"})

    db.add(AuditLog(user_id=user["telegram_id"], action="login", details=body.email))
    db.commit()
    return _issue_tokens(db, user["telegram_id"])


def logout_user(db: Session, user_id: int) -> dict:
    user = db.get(StealthxUser, user_id)
    if user:
        user.jwt_refresh_hash = None
        db.commit()
    db.add(AuditLog(user_id=user_id, action="logout"))
    db.commit()
    return {"ok": True}


def refresh_tokens(db: Session, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Invalid refresh token"}) from None

    user = db.get(StealthxUser, user_id)
    if not user or not user.jwt_refresh_hash:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Session expired"})
    if user.jwt_refresh_hash != _hash_refresh(refresh_token):
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Invalid refresh token"})

    return _issue_tokens(db, user_id)
