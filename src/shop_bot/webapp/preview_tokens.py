"""Short-lived tokens for WebApp Studio live preview."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

DEFAULT_TTL_SEC = 300


def _secret() -> bytes:
    key = (os.getenv("SHOPBOT_SECRET_KEY") or "webapp-studio-preview-dev").encode("utf-8")
    return key


def issue_studio_preview_token(design_id: str, *, ttl: int = DEFAULT_TTL_SEC) -> str:
    payload = {
        "design": (design_id or "classic").strip(),
        "exp": int(time.time()) + max(30, min(ttl, 900)),
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(_secret(), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw + b"." + sig).decode("ascii")


def verify_studio_preview_token(token: str, design_id: str | None = None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        blob = base64.urlsafe_b64decode(token.encode("ascii"))
        raw, sig = blob.rsplit(b".", 1)
        expected = hmac.new(_secret(), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(raw.decode("utf-8"))
        if int(payload.get("exp") or 0) < int(time.time()):
            return None
        if design_id and payload.get("design") != design_id:
            return None
        return payload
    except (ValueError, json.JSONDecodeError, TypeError):
        return None
