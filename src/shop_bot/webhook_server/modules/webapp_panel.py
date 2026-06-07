"""WebApp Studio — meta, health, preview, deploy helpers."""
from __future__ import annotations

import html
import json
import re
import socket
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from shop_bot.webapp.designs import WEBAPP_DESIGN_IDS, WEBAPP_DESIGNS, parse_enabled_designs

DESIGN_GROUPS: list[dict[str, str]] = [
    {"id": "all", "label": "Все"},
    {"id": "classic", "label": "Классика"},
    {"id": "mobile", "label": "Mobile"},
    {"id": "desktop", "label": "Desktop"},
    {"id": "stealth", "label": "Stealth"},
    {"id": "glass", "label": "Glass"},
]

DESIGN_GROUP_MAP: dict[str, str] = {
    "classic": "classic",
    "ios": "mobile",
    "desktop": "desktop",
    "stealth": "stealth",
    "stealth-glass": "stealth",
    "glass-hub": "glass",
}

DESIGN_LABELS: dict[str, str] = {d["id"]: d["label"] for d in WEBAPP_DESIGNS}
DESIGN_DESCS: dict[str, str] = {d["id"]: d["desc"] for d in WEBAPP_DESIGNS}
DESIGN_ACCENTS: dict[str, str] = {d["id"]: d["accent"] for d in WEBAPP_DESIGNS}
DESIGN_ICONS: dict[str, str] = {d["id"]: d["icon"] for d in WEBAPP_DESIGNS}

_DOMAIN_RE = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
_HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _truthy(raw: Any) -> bool:
    return str(raw or "").strip().lower() in ("1", "true", "yes", "on")


def normalize_domain(raw: str | None) -> str:
    d = (raw or "").strip().lower()
    d = d.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
    return d


def normalize_accent(raw: str | None) -> str:
    v = (raw or "").strip()
    if not v:
        return ""
    if not v.startswith("#"):
        v = f"#{v}"
    return v if _HEX_COLOR_RE.match(v) else ""


def normalize_ab_percent(raw: Any) -> int:
    try:
        n = int(str(raw or "0").strip())
    except (TypeError, ValueError):
        n = 0
    return max(0, min(50, n))


def parse_design_stats(raw: str | None) -> dict[str, int]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {str(k): int(v) for k, v in data.items() if str(k) in WEBAPP_DESIGN_IDS}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def webapp_public_url(webapp: dict | None, fallback_port: int = 8000) -> str:
    webapp = webapp or {}
    domain = normalize_domain(webapp.get("webapp_domen"))
    if domain:
        return f"https://{domain}"
    return f"http://127.0.0.1:{fallback_port}"


def tg_deeplink(bot_username: str | None, startapp: str = "cabinet") -> str:
    user = re.sub(r"[^A-Za-z0-9_]", "", (bot_username or "bot").strip().lstrip("@")) or "bot"
    return f"https://t.me/{user}?startapp={startapp}"


def _port_open(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _dns_resolves(domain: str) -> tuple[bool, str | None]:
    if not domain:
        return False, None
    try:
        return True, socket.gethostbyname(domain)
    except OSError:
        return False, None


def _ssl_info(domain: str, timeout: float = 3.0) -> dict[str, Any]:
    if not domain:
        return {"ok": False, "reason": "no_domain"}
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert() or {}
        not_after = cert.get("notAfter")
        days_left = None
        expires = None
        if not_after:
            expires_dt = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            expires = expires_dt.strftime("%d.%m.%Y")
            days_left = max(0, (expires_dt - datetime.now(timezone.utc)).days)
        issuer = ""
        org = cert.get("issuer")
        if isinstance(org, (list, tuple)):
            for item in org:
                if isinstance(item, (list, tuple)) and len(item) >= 2 and item[0] == "organizationName":
                    issuer = str(item[1])
                    break
        return {
            "ok": True,
            "expires": expires,
            "days_left": days_left,
            "issuer": issuer,
            "warn": days_left is not None and days_left < 14,
        }
    except Exception as exc:
        return {"ok": False, "reason": str(exc)[:120]}


def _http_probe(url: str, timeout: float = 3.0) -> dict[str, Any]:
    if not url:
        return {"ok": False, "status": None}
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Remnawave-WebApp-Health/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": resp.getcode()}
    except urllib.error.HTTPError as exc:
        return {"ok": True, "status": exc.code}
    except Exception:
        return {"ok": False, "status": None}


def _webapp_health_probe() -> dict[str, Any]:
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/health",
            method="GET",
            headers={"User-Agent": "Remnawave-WebApp-Health/1.0"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            if resp.getcode() != 200:
                return {}
            import json as _json

            data = _json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict):
                return {"uptime_sec": data.get("uptime_sec"), "service_ok": bool(data.get("ok"))}
    except Exception:
        return {}
    return {}


def check_health(webapp: dict | None) -> dict[str, Any]:
    webapp = webapp or {}
    domain = normalize_domain(webapp.get("webapp_domen"))
    local_up = _port_open("127.0.0.1", 8000)
    dns_ok, dns_ip = _dns_resolves(domain)
    ssl_data = _ssl_info(domain) if domain else {"ok": False, "reason": "no_domain"}
    public_url = webapp_public_url(webapp)
    http_data = _http_probe(public_url) if domain else {"ok": local_up, "status": 200 if local_up else None}
    runtime = _webapp_health_probe() if local_up else {}

    return {
        "port_local": {"ok": local_up, "label": ":8000"},
        "dns": {"ok": dns_ok, "ip": dns_ip, "domain": domain or None},
        "ssl": ssl_data,
        "http": http_data,
        "public_url": public_url,
        "uptime_sec": runtime.get("uptime_sec"),
        "service_ok": runtime.get("service_ok", local_up),
    }


def generate_nginx_config(domain: str, upstream: str = "remnawave-app:8000") -> str:
    domain = normalize_domain(domain) or "lk.example.com"
    return f"""server {{
    listen 80;
    listen [::]:80;
    server_name {domain};

    location / {{
        proxy_pass http://{upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }}
}}

# После проверки: certbot --nginx -d {domain}
"""


def _build_alerts(webapp: dict, health: dict, enabled_designs: list[str]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    enabled = _truthy(webapp.get("webapp_enable"))
    domain = normalize_domain(webapp.get("webapp_domen"))

    if enabled and not domain:
        alerts.append({
            "level": "warn",
            "text": "WebApp включён, но домен не задан — пользователи не смогут открыть кабинет по HTTPS.",
        })
    if enabled and domain and not health.get("dns", {}).get("ok"):
        alerts.append({
            "level": "warn",
            "text": f"DNS для {domain} не резолвится — проверьте A-запись.",
        })
    if enabled and not enabled_designs:
        alerts.append({
            "level": "bad",
            "text": "Не выбран ни один дизайн кабинета — будет использован classic.",
        })
    ssl = health.get("ssl") or {}
    if enabled and domain and ssl.get("ok") and ssl.get("warn"):
        alerts.append({
            "level": "warn",
            "text": f"SSL-сертификат истекает через {ssl.get('days_left')} дн.",
        })
    if enabled and not health.get("port_local", {}).get("ok"):
        alerts.append({
            "level": "warn",
            "text": "Порт :8000 не отвечает — перезапустите бота после включения WebApp.",
        })
    return alerts


def build_webapp_meta(
    webapp: dict | None,
    settings: dict | None = None,
    *,
    bot_username: str = "",
) -> dict[str, Any]:
    webapp = dict(webapp or {})
    settings = settings or {}
    enabled_designs = parse_enabled_designs(webapp.get("webapp_enabled_designs"))
    default_design = (webapp.get("webapp_default_design") or "classic").strip()
    if default_design not in WEBAPP_DESIGN_IDS:
        default_design = enabled_designs[0] if enabled_designs else "classic"
    health = check_health(webapp)
    enabled = _truthy(webapp.get("webapp_enable"))
    domain = normalize_domain(webapp.get("webapp_domen"))
    stats = parse_design_stats(webapp.get("webapp_design_stats"))
    total_picks = sum(stats.values()) if stats else 0
    popular = max(stats, key=stats.get) if stats else default_design

    from shop_bot.webapp.studio_config import parse_content_overrides, parse_health_history, parse_module_order
    from shop_bot.webhook_server.modules.webapp_runtime import build_webapp_analytics

    platform_analytics = build_webapp_analytics(webapp)
    module_order = parse_module_order(webapp.get("webapp_module_order"))
    content_overrides = parse_content_overrides(webapp.get("webapp_content_overrides"))
    health_history = parse_health_history(webapp.get("webapp_health_history"))
    maintenance_until = (webapp.get("webapp_maintenance_until") or "").strip()

    design_options = []
    for d in WEBAPP_DESIGNS:
        design_options.append({
            "id": d["id"],
            "label": d["label"],
            "desc": d["desc"],
            "icon": d["icon"],
            "accent": d["accent"],
            "group": DESIGN_GROUP_MAP.get(d["id"], "classic"),
            "enabled": d["id"] in enabled_designs,
            "is_default": d["id"] == default_design,
            "uses": stats.get(d["id"], 0),
        })

    return {
        "enabled": enabled,
        "title": (webapp.get("webapp_title") or "VPN").strip(),
        "domain": domain,
        "domain_display": domain or "Не задан",
        "enabled_design_count": len(enabled_designs),
        "total_designs": len(WEBAPP_DESIGNS),
        "default_design": default_design,
        "default_design_label": DESIGN_LABELS.get(default_design, default_design),
        "theme_picker": _truthy(webapp.get("webapp_theme_picker") if webapp.get("webapp_theme_picker") is not None else True),
        "tg_fullscreen": _truthy(webapp.get("tg_fullscreen")),
        "public_url": health["public_url"],
        "tg_deeplink": tg_deeplink(bot_username or settings.get("telegram_bot_username")),
        "health": health,
        "alerts": _build_alerts(webapp, health, enabled_designs),
        "design_groups": DESIGN_GROUPS,
        "design_options": design_options,
        "nginx_config": generate_nginx_config(domain),
        "modules": {
            "trial": {
                "webapp": _truthy(webapp.get("webapp_show_trial", 1)),
                "global": _truthy(settings.get("trial_enabled", "1")),
            },
            "referrals": {
                "webapp": _truthy(webapp.get("webapp_show_referrals", 1)),
                "global": _truthy(settings.get("enable_referrals")),
            },
            "howto": {
                "webapp": _truthy(webapp.get("webapp_show_howto", 1)),
                "global": bool((settings.get("howto_intro_text") or "").strip()),
            },
            "topup": {
                "webapp": _truthy(webapp.get("webapp_show_topup", 1)),
                "global": True,
            },
            "promo": {
                "webapp": _truthy(webapp.get("webapp_show_promo", 1)),
                "global": True,
            },
            "support": {
                "webapp": _truthy(webapp.get("webapp_show_support", 1)),
                "global": True,
            },
        },
        "module_order": module_order,
        "content_overrides": content_overrides,
        "maintenance_until": maintenance_until or None,
        "health_history": health_history[-24:],
        "analytics": {
            "design_stats": stats,
            "total_picks": total_picks,
            "popular_design": popular,
            "popular_label": DESIGN_LABELS.get(popular, popular),
            "users_total": platform_analytics.get("users_total", 0),
            "trial_used": platform_analytics.get("trial_used", 0),
            "keys_active": platform_analytics.get("keys_active", 0),
            "payments_30d": platform_analytics.get("payments_30d", 0),
            "revenue_30d": platform_analytics.get("revenue_30d", 0),
        },
        "ab": {
            "design_b": (webapp.get("webapp_ab_design_b") or "").strip(),
            "percent": normalize_ab_percent(webapp.get("webapp_ab_percent")),
        },
    }


def render_preview_html(
    design_id: str,
    *,
    device: str = "mobile",
    title: str = "VPN",
    logo: str = "",
    accent: str = "",
) -> str:
    if design_id not in WEBAPP_DESIGN_IDS:
        design_id = "classic"
    device = "desktop" if device == "desktop" else "mobile"
    accent = normalize_accent(accent) or DESIGN_ACCENTS.get(design_id, "#0a84ff")
    label = DESIGN_LABELS.get(design_id, design_id)
    title_e = html.escape(title or "VPN")
    logo_e = html.escape(logo or "")
    accent_e = html.escape(accent)

    frame_w = "960px" if device == "desktop" else "390px"
    frame_h = "520px" if device == "desktop" else "680px"

    bg_styles = {
        "classic": "background:linear-gradient(180deg,#171717,#0a0a0a)",
        "ios": "background:linear-gradient(180deg,#111,#000);padding-bottom:52px",
        "desktop": "background:#111;display:grid;grid-template-columns:220px 1fr",
        "stealth": "background:#020202 radial-gradient(circle at 70% 20%, rgba(255,35,87,.25), transparent 55%)",
        "stealth-glass": "background:linear-gradient(180deg,rgba(139,92,246,.15),#0b0f19)",
        "glass-hub": "background:linear-gradient(180deg,rgba(59,130,246,.18),#0b0e14 45%)",
    }
    body_style = bg_styles.get(design_id, bg_styles["classic"])

    logo_html = (
        f'<img src="{logo_e}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:8px">'
        if logo_e else
        f'<span style="width:28px;height:28px;border-radius:8px;background:{accent_e}33;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:{accent_e}">V</span>'
    )

    if design_id == "desktop":
        sidebar = f"""
        <aside style="background:#1a1a1a;border-right:1px solid rgba(255,255,255,.06);padding:16px 12px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">{logo_html}<strong style="font-size:13px">{title_e}</strong></div>
            <div style="height:8px;border-radius:4px;background:{accent_e}33"></div>
            <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.08)"></div>
            <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.08)"></div>
        </aside>"""
        main = """
        <main style="padding:18px;display:grid;gap:12px">
            <div style="height:72px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div style="height:96px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05)"></div>
                <div style="height:96px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05)"></div>
            </div>
        </main>"""
        layout = sidebar + main
    elif design_id == "glass-hub":
        layout = f"""
        <div style="padding:16px;display:grid;gap:12px">
            <div style="display:flex;align-items:center;gap:10px">{logo_html}<div><div style="font-size:11px;opacity:.55">Добро пожаловать</div><strong style="font-size:14px">{title_e}</strong></div></div>
            <div style="height:88px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(8px)"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div style="height:72px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)"></div>
                <div style="height:72px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)"></div>
            </div>
        </div>"""
    elif design_id == "ios":
        layout = f"""
        <div style="padding:16px;display:grid;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">{logo_html}<strong>{title_e}</strong></div>
            <div style="height:120px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)"></div>
            <div style="height:80px;border-radius:14px;background:rgba(255,255,255,.04)"></div>
        </div>
        <nav style="position:absolute;left:0;right:0;bottom:0;height:52px;background:rgba(0,0,0,.85);border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-around;align-items:center">
            <span style="width:24px;height:24px;border-radius:6px;background:{accent_e}55"></span>
            <span style="width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.12)"></span>
            <span style="width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.12)"></span>
        </nav>"""
    else:
        layout = f"""
        <div style="padding:16px;display:grid;gap:12px">
            <div style="display:flex;align-items:center;gap:10px">{logo_html}<strong style="font-size:14px">{title_e}</strong></div>
            <div style="height:110px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)"></div>
            <div style="height:64px;border-radius:12px;background:rgba(255,255,255,.04)"></div>
            <div style="height:64px;border-radius:12px;background:rgba(255,255,255,.04)"></div>
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(label)} — preview</title>
<style>
* {{ box-sizing:border-box; margin:0; padding:0; }}
body {{ min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a0a; color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
.frame {{ width:min({frame_w},100%); height:min({frame_h},92vh); border-radius:{'12px' if device == 'desktop' else '28px'}; overflow:hidden; border:1px solid rgba(255,255,255,.12); box-shadow:0 20px 60px rgba(0,0,0,.45); position:relative; {body_style} }}
.badge {{ position:fixed; top:10px; left:10px; font-size:10px; padding:4px 8px; border-radius:999px; background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.7); }}
</style>
</head>
<body>
<span class="badge">{html.escape(label)} · {device}</span>
<div class="frame">{layout}</div>
</body>
</html>"""


def tail_webapp_logs(lines: int = 80, *, level: str = "", search: str = "") -> list[str]:
    from shop_bot.webhook_server.modules.webapp_runtime import tail_webapp_logs as _tail

    entries = _tail(lines, level=level, search=search)
    return [e.get("text", "") for e in entries]
