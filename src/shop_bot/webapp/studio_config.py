"""Shared WebApp Studio config parsers (runtime + panel)."""

from __future__ import annotations

import json

DEFAULT_MODULE_ORDER = ["trial", "referrals", "howto", "topup", "promo", "support"]


def parse_module_order(raw: str | None) -> list[str]:
    if not raw:
        return list(DEFAULT_MODULE_ORDER)
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            known = set(DEFAULT_MODULE_ORDER)
            result = [str(x) for x in data if str(x) in known]
            return result or list(DEFAULT_MODULE_ORDER)
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return list(DEFAULT_MODULE_ORDER)


def parse_content_overrides(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items() if v is not None}
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return {}


def parse_health_history(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)][-168:]
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return []
