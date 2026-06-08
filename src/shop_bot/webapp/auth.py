"""WebApp API authentication helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request

from shop_bot.data_manager import database


def extract_auth_token(request: Request) -> str | None:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token

    header_token = (request.headers.get("X-Auth-Token") or "").strip()
    if header_token:
        return header_token

    cookie_token = (request.cookies.get("auth_token") or "").strip()
    if cookie_token:
        return cookie_token

    return None


def resolve_user_from_token(token: str | None) -> dict | None:
    if not token:
        return None
    user = database.get_user_by_auth_token(token)
    if not user or user.get("is_banned"):
        return None
    return user


async def require_webapp_user(request: Request) -> dict:
    user = resolve_user_from_token(extract_auth_token(request))
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"ok": False, "error": "Unauthorized"},
        )
    return user


def authorized_user_id(user: dict, claimed_user_id: int | None = None) -> int:
    uid = int(user["telegram_id"])
    if claimed_user_id is not None and int(claimed_user_id) not in (0, uid):
        raise HTTPException(
            status_code=403,
            detail={"ok": False, "error": "Forbidden"},
        )
    return uid
