"""WebApp cabinet design catalog and config helpers."""

from __future__ import annotations

import json

WEBAPP_DESIGN_IDS = ("classic", "ios", "desktop", "stealth", "stealth-glass", "glass-hub")

WEBAPP_DESIGNS: list[dict[str, str]] = [
    {
        "id": "classic",
        "label": "Классический",
        "desc": "Стандартный макет без изменений",
        "icon": "palette",
        "accent": "#10b981",
    },
    {
        "id": "ios",
        "label": "Mobile",
        "desc": "Мобильный стиль с нижней панелью",
        "icon": "auto_awesome",
        "accent": "#10b981",
    },
    {
        "id": "desktop",
        "label": "Desktop",
        "desc": "Широкий макет для компьютера",
        "icon": "desktop_windows",
        "accent": "#6366f1",
    },
    {
        "id": "stealth",
        "label": "Stealth",
        "desc": "Неоновая мини-аппа с сеткой и 3 вкладками",
        "icon": "shield",
        "accent": "#ff2357",
    },
    {
        "id": "stealth-glass",
        "label": "Glass",
        "desc": "Стеклянная классика с верхним меню",
        "icon": "blur_on",
        "accent": "#8b5cf6",
    },
    {
        "id": "glass-hub",
        "label": "Hub",
        "desc": "Дашборд: приветствие, подписка, баланс и рефералы",
        "icon": "dashboard",
        "accent": "#3b82f6",
    },
]

DEFAULT_ENABLED_DESIGNS = ",".join(WEBAPP_DESIGN_IDS)


def parse_enabled_designs(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        raw = DEFAULT_ENABLED_DESIGNS
    seen: set[str] = set()
    result: list[str] = []
    for part in str(raw).split(","):
        design_id = part.strip()
        if design_id in WEBAPP_DESIGN_IDS and design_id not in seen:
            seen.add(design_id)
            result.append(design_id)
    return result or ["classic"]


def build_design_config(settings: dict | None, user_id: int | None = None) -> dict:
    settings = settings or {}
    enabled = parse_enabled_designs(settings.get("webapp_enabled_designs"))
    default = (settings.get("webapp_default_design") or "classic").strip()
    if default not in WEBAPP_DESIGN_IDS:
        default = "classic"
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
    picker_enabled = True
    if picker_raw is not None:
        picker_enabled = str(picker_raw).strip().lower() in ("1", "true", "yes", "on")
    return {
        "default": default,
        "enabled": enabled,
        "pickerEnabled": picker_enabled,
    }


def build_design_config_json(settings: dict | None, user_id: int | None = None) -> str:
    return json.dumps(build_design_config(settings, user_id=user_id), ensure_ascii=False)
