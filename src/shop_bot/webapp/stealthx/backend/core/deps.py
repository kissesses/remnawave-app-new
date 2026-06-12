from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from shop_bot.data_manager.database import get_admin_ids
from shop_bot.webapp.stealthx.backend.core.database import get_db
from shop_bot.webapp.stealthx.backend.core.jwt import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> int:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Unauthorized"})
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail={"ok": False, "error": "Invalid token"}) from None


def require_admin(user_id: Annotated[int, Depends(get_current_user_id)]) -> int:
    if user_id not in get_admin_ids():
        raise HTTPException(status_code=403, detail={"ok": False, "error": "Forbidden"})
    return user_id


DbSession = Annotated[Session, Depends(get_db)]
CurrentUserId = Annotated[int, Depends(get_current_user_id)]
AdminUserId = Annotated[int, Depends(require_admin)]
