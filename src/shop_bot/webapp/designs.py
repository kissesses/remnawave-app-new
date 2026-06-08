"""WebApp cabinet design catalog and config helpers."""

from __future__ import annotations

import json

WEBAPP_DESIGN_IDS = ("aurum",)

WEBAPP_DESIGNS: list[dict[str, str]] = [
    {
        "id": "aurum",
        "label": "Aurum",
        "desc": "Luxury fintech: gold, glass KPI и pass-карта подписки",
        "icon": "diamond",
        "accent": "#c9a962",
    },
]

DEFAULT_ENABLED_DESIGNS = "aurum"

WEBAPP_SHARED_CSS = (
    "webapp-ui-tokens.css",
    "webapp-shell.css",
    "webapp-design-bridge.css",
    "webapp-cabinet.css",
    "webapp-pages-v3.css",
    "webapp-modals.css",
)

WEBAPP_THEME_CSS: dict[str, str] = {
    "aurum": "webapp-aurum.css",
}

WEBAPP_THEME_JS: dict[str, str] = {
    "aurum": "webapp-aurum.js",
}


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
    return result or ["aurum"]


def build_design_config(settings: dict | None, user_id: int | None = None) -> dict:
    settings = settings or {}
    enabled = parse_enabled_designs(settings.get("webapp_enabled_designs"))
    default = (settings.get("webapp_default_design") or "aurum").strip()
    if default not in WEBAPP_DESIGN_IDS:
        default = "aurum"
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
    lines = [f'<link rel="stylesheet" href="/static/css/{name}" />' for name in WEBAPP_SHARED_CSS]
    theme_file = WEBAPP_THEME_CSS.get(default_design)
    if theme_file:
        lines.append(f'<link rel="stylesheet" href="/static/css/{theme_file}" />')
    return "\n    ".join(lines)


def build_design_scripts(default_design: str) -> str:
    lines = [
        '<script defer src="/static/js/webapp-perf-bootstrap.js"></script>',
        '<script defer src="/static/js/webapp-theme-kit.js"></script>',
        '<script defer src="/static/js/webapp-core.js"></script>',
        '<script defer src="/static/js/webapp-shop.js"></script>',
        '<script defer src="/static/js/webapp-cabinet.js"></script>',
    ]
    theme_js = WEBAPP_THEME_JS.get(default_design)
    if theme_js:
        lines.append(f'<script defer src="/static/js/{theme_js}"></script>')
    lines.append('<script defer src="/static/js/webapp-theme-manager.js"></script>')
    return "\n    ".join(lines)
