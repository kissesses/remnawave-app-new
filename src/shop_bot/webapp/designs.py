"""WebApp cabinet design catalog and config helpers."""

from __future__ import annotations

import json

WEBAPP_DESIGN_IDS = (
    "classic",
    "ios",
    "desktop",
    "stealth",
    "stealth-glass",
    "glass-hub",
    "nova",
    "pref-classic",
    "pref-macos",
    "pref-macos-v2",
    "pref-glass-stealth",
    "aurum",
)

WEBAPP_DESIGNS: list[dict[str, str]] = [
    {
        "id": "classic",
        "label": "Prism",
        "desc": "Современный glass-кабинет с нижней навигацией",
        "icon": "diamond",
        "accent": "#10b981",
        "group": "premium",
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
        "desc": "Bento-mosaic: асимметричная сетка плиток",
        "icon": "dashboard",
        "accent": "#3b82f6",
    },
    {
        "id": "nova",
        "label": "Nova",
        "desc": "Snap-deck: листайте полноэкранные слайды",
        "icon": "view_carousel",
        "accent": "#6366f1",
    },
    {
        "id": "pref-classic",
        "label": "Ledger",
        "desc": "Выписка-тimeline: чек подписки и drawer-меню",
        "icon": "receipt_long",
        "accent": "#10b981",
    },
    {
        "id": "pref-macos",
        "label": "Aqua",
        "desc": "Menu bar + окно Subscription.app и Dock",
        "icon": "laptop_mac",
        "accent": "#0a84ff",
    },
    {
        "id": "pref-macos-v2",
        "label": "Stage",
        "desc": "Левый rail + горизонтальные snap-панели",
        "icon": "view_sidebar",
        "accent": "#0a84ff",
    },
    {
        "id": "pref-glass-stealth",
        "label": "Void",
        "desc": "Орбитальное меню и стеклянные shards",
        "icon": "blur_circular",
        "accent": "#e4e4e7",
    },
    {
        "id": "aurum",
        "label": "Aurum",
        "desc": "Luxury fintech: gold, glass KPI и pass-карта подписки",
        "icon": "diamond",
        "accent": "#c9a962",
    },
]

DEFAULT_ENABLED_DESIGNS = ",".join(WEBAPP_DESIGN_IDS)

WEBAPP_SHARED_CSS = (
    "webapp-ui-tokens.css",
    "webapp-shell.css",
    "webapp-design-bridge.css",
    "webapp-cabinet.css",
    "webapp-pages-v3.css",
    "webapp-modals.css",
)

WEBAPP_THEME_CSS: dict[str, str] = {
    "classic": "webapp-prism.css",
    "ios": "webapp-ios.css",
    "desktop": "webapp-desktop.css",
    "stealth": "webapp-stealth.css",
    "stealth-glass": "webapp-stealth-glass.css",
    "glass-hub": "webapp-glass-hub.css",
    "nova": "webapp-nova.css",
    "pref-classic": "webapp-pref-classic.css",
    "pref-macos": "webapp-pref-macos.css",
    "pref-macos-v2": "webapp-pref-macos-v2.css",
    "pref-glass-stealth": "webapp-pref-glass-stealth.css",
    "aurum": "webapp-aurum.css",
}

WEBAPP_THEME_JS: dict[str, str] = {
    "classic": "webapp-prism.js",
    "glass-hub": "webapp-glass-hub.js",
    "nova": "webapp-nova.js",
    "pref-classic": "webapp-pref-classic.js",
    "pref-macos": "webapp-pref-macos.js",
    "pref-macos-v2": "webapp-pref-macos-v2.js",
    "pref-glass-stealth": "webapp-pref-glass-stealth.js",
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
    seen_js: set[str] = set()
    for theme_js in WEBAPP_THEME_JS.values():
        if theme_js not in seen_js:
            seen_js.add(theme_js)
            lines.append(f'<script defer src="/static/js/{theme_js}"></script>')
    lines.append('<script defer src="/static/js/webapp-theme-manager.js"></script>')
    return "\n    ".join(lines)
