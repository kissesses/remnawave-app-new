"""WebApp cabinet design catalog and config helpers."""

from __future__ import annotations

import json

WEBAPP_DESIGN_IDS = ("telegram-premium", "stealthx")

WEBAPP_DESIGNS: list[dict[str, str]] = [
    {
        "id": "telegram-premium",
        "label": "Telegram Premium",
        "desc": "Минималистичный кабинет в стиле Telegram Premium",
        "icon": "verified",
        "accent": "#3390EC",
    },
    {
        "id": "stealthx",
        "label": "STEALTHX",
        "desc": "Премиальный cyberpunk VPN в стиле STEALTHX",
        "icon": "diamond",
        "accent": "#6D28FF",
    },
]

DEFAULT_ENABLED_DESIGNS = "telegram-premium"

WEBAPP_SHARED_CSS: tuple[str, ...] = ()

WEBAPP_THEME_CSS: dict[str, str] = {}

WEBAPP_THEME_JS: dict[str, str] = {}


def parse_enabled_designs(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        raw = DEFAULT_ENABLED_DESIGNS
    seen: set[str] = set()
    result: list[str] = []
    for part in str(raw).split(","):
        design_id = part.strip()
        if design_id == "aurum":
            design_id = "telegram-premium"
        if design_id in WEBAPP_DESIGN_IDS and design_id not in seen:
            seen.add(design_id)
            result.append(design_id)
    if not result:
        for legacy in ("aurum", "telegram-premium"):
            if legacy in WEBAPP_DESIGN_IDS:
                return [legacy]
        return ["telegram-premium"]
    return result


def build_design_config(settings: dict | None, user_id: int | None = None) -> dict:
    settings = settings or {}
    enabled = parse_enabled_designs(settings.get("webapp_enabled_designs"))
    default = (settings.get("webapp_default_design") or "telegram-premium").strip()
    if default not in WEBAPP_DESIGN_IDS:
        default = "telegram-premium"
    if default not in enabled:
        default = enabled[0]
    ab_b = (settings.get("webapp_ab_design_b") or "").strip()
    try:
        ab_pct = max(0, min(50, int(settings.get("webapp_ab_percent") or 0)))
    except (TypeError, ValueError):
        ab_pct = 0
    if user_id and ab_b in WEBAPP_DESIGN_IDS and ab_b in enabled and ab_pct > 0:
        if (int(user_id) % 100) < ab_pct:
            default = ab_b
    picker_raw = settings.get("webapp_theme_picker")
    picker_enabled = False
    if picker_raw is not None:
        picker_enabled = str(picker_raw).strip().lower() in ("1", "true", "yes", "on")
    return {
        "default": default,
        "enabled": enabled,
        "pickerEnabled": picker_enabled,
    }


def build_preview_design_config(settings: dict | None, design_id: str) -> dict:
    cfg = build_design_config(settings, user_id=None)
    if design_id in WEBAPP_DESIGN_IDS:
        cfg["default"] = design_id
    cfg["pickerEnabled"] = False
    return cfg


def build_preview_design_config_json(settings: dict | None, design_id: str) -> str:
    return json.dumps(build_preview_design_config(settings, design_id), ensure_ascii=False)


def build_design_config_json(settings: dict | None, user_id: int | None = None) -> str:
    return json.dumps(build_design_config(settings, user_id=user_id), ensure_ascii=False)


def resolve_default_design(settings: dict | None, user_id: int | None = None) -> str:
    return build_design_config(settings, user_id=user_id)["default"]


def build_design_stylesheets(default_design: str) -> str:
    return ""


def build_design_scripts(default_design: str) -> str:
    return '<script defer src="/static/js/telegram-web-app.js"></script>'
