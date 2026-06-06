"""Скрытая страница входа в панель — decoy, hotkey, клики, секретный URL."""
from __future__ import annotations

import html
import re
import secrets
from typing import Any

from flask import Response, make_response
from flask_wtf.csrf import generate_csrf

from shop_bot.webhook_server.modules.stealth_decoy_games import GAME_DECOY_PRESETS
from shop_bot.webhook_server.modules.stealth_decoy_pages import (
    DECOY_GROUP_LABELS,
    DECOY_GROUP_ORDER,
    PAGE_DECOY_PRESETS,
)

DECOY_PRESETS: dict[str, dict[str, str]] = {}
for _preset in (PAGE_DECOY_PRESETS, GAME_DECOY_PRESETS):
    DECOY_PRESETS.update(_preset)

DEFAULT_DECOY = '502_nginx'
_HOTKEY_RE = re.compile(r'^(ctrl|shift|alt)(\+(ctrl|shift|alt))*\+[a-z0-9]$', re.I)
def is_enabled(settings: dict[str, Any] | None) -> bool:
    return (settings or {}).get('stealth_login_enabled', '0') == '1'


def _flag(settings: dict[str, Any] | None, key: str, default: str = '1') -> bool:
    raw = (settings or {}).get(key, default)
    return str(raw).strip().lower() not in ('0', 'false', 'no', '')


def normalize_hotkey(raw: str | None) -> str:
    v = (raw or 'ctrl+b').strip().lower()
    if not _HOTKEY_RE.match(v):
        return 'ctrl+b'
    return v


def parse_hotkey(hotkey: str | None) -> dict[str, Any]:
    parts = normalize_hotkey(hotkey).split('+')
    hk_key = next((p for p in parts if p not in ('ctrl', 'shift', 'alt')), 'b')
    js_parts = []
    if 'ctrl' in parts:
        js_parts.append('e.ctrlKey')
    if 'shift' in parts:
        js_parts.append('e.shiftKey')
    if 'alt' in parts:
        js_parts.append('e.altKey')
    return {
        'key': hk_key,
        'js_cond': '&&'.join(js_parts) if js_parts else 'true',
        'display': '+'.join(p.capitalize() for p in parts),
    }


def normalize_decoy(raw: str | None) -> str:
    key = (raw or DEFAULT_DECOY).strip()
    return key if key in DECOY_PRESETS else DEFAULT_DECOY


def normalize_clicks_count(raw: str | None) -> int:
    try:
        n = int(str(raw or '4').strip())
    except (TypeError, ValueError):
        n = 4
    return max(2, min(12, n))


def normalize_clicks_window_ms(raw: str | None) -> int:
    try:
        n = int(str(raw or '2000').strip())
    except (TypeError, ValueError):
        n = 2000
    return max(500, min(10000, n))


def normalize_history_path(raw: str | None) -> str:
    p = (raw or '/').strip() or '/'
    if not p.startswith('/'):
        p = '/' + p
    if len(p) > 64:
        p = p[:64]
    return p


def normalize_secret_param(raw: str | None) -> str:
    p = (raw or '').strip()
    if not p:
        return ''
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_-]{0,31}$', p):
        return ''
    return p


def normalize_secret_value(raw: str | None) -> str:
    v = (raw or '').strip()
    if not v:
        return ''
    if len(v) < 4 or len(v) > 64:
        return ''
    if not re.match(r'^[a-zA-Z0-9_-]+$', v):
        return ''
    return v


def secret_query_match(settings: dict[str, Any] | None, args) -> bool:
    param = normalize_secret_param((settings or {}).get('stealth_login_secret_param'))
    value = normalize_secret_value((settings or {}).get('stealth_login_secret_value'))
    if not param or not value:
        return False
    return (args.get(param) or '').strip() == value


def get_config(settings: dict[str, Any] | None) -> dict[str, Any]:
    s = settings or {}
    decoy = normalize_decoy(s.get('stealth_login_decoy'))
    preset = DECOY_PRESETS[decoy]
    param = normalize_secret_param(s.get('stealth_login_secret_param'))
    secret_val = normalize_secret_value(s.get('stealth_login_secret_value'))
    return {
        'enabled': is_enabled(s),
        'hotkey': normalize_hotkey(s.get('stealth_login_hotkey')),
        'hotkey_parsed': parse_hotkey(s.get('stealth_login_hotkey')),
        'hotkey_enabled': _flag(s, 'stealth_login_hotkey_enabled', '1'),
        'clicks_enabled': _flag(s, 'stealth_login_clicks_enabled', '1'),
        'clicks_count': normalize_clicks_count(s.get('stealth_login_clicks_count')),
        'clicks_window_ms': normalize_clicks_window_ms(s.get('stealth_login_clicks_window_ms')),
        'decoy': decoy,
        'decoy_label': preset['label'],
        'history_path': normalize_history_path(s.get('stealth_login_history_path')),
        'secret_param': param,
        'secret_value': secret_val,
        'secret_configured': bool(param and secret_val),
    }


def build_settings_meta(settings: dict[str, Any] | None, login_url: str) -> dict[str, Any]:
    cfg = get_config(settings)
    unlock_parts = []
    if cfg['hotkey_enabled']:
        unlock_parts.append(f"комбинация {cfg['hotkey_parsed']['display']}")
    if cfg['clicks_enabled']:
        unlock_parts.append(f"{cfg['clicks_count']} клика за {cfg['clicks_window_ms'] // 1000} с")
    if cfg['secret_configured']:
        unlock_parts.append('секретный URL')
    has_unlock = bool(unlock_parts)

    def _decoy_option(decoy_id: str, preset: dict[str, str]) -> dict[str, str]:
        group = preset.get('group', 'errors')
        return {
            'id': decoy_id,
            'label': preset['label'],
            'group': group,
            'status': str(preset.get('status', '200')),
            'kind': 'game' if group == 'games' else 'page',
        }

    grouped: list[dict[str, Any]] = []
    for group in DECOY_GROUP_ORDER:
        options = [
            _decoy_option(k, v)
            for k, v in DECOY_PRESETS.items()
            if v.get('group', 'errors') == group
        ]
        if options:
            grouped.append({
                'id': group,
                'label': DECOY_GROUP_LABELS.get(group, group),
                'options': options,
            })

    return {
        **{k: v for k, v in cfg.items() if k not in ('secret_value',)},
        'secret_value': '',
        'login_url': login_url,
        'secret_url': '',
        'unlock_summary': ', '.join(unlock_parts) if unlock_parts else 'не настроено',
        'has_unlock': has_unlock,
        'decoy_options': [_decoy_option(k, v) for k, v in DECOY_PRESETS.items()],
        'decoy_option_groups': grouped,
    }


def render_decoy_preview_html(decoy_id: str | None) -> str:
    """Minimal HTML document for admin preview iframe (no unlock script)."""
    decoy = normalize_decoy(decoy_id)
    preset = DECOY_PRESETS[decoy]
    title = html.escape(preset['title'])
    return (
        f'<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="robots" content="noindex,nofollow">'
        f'<title>{title}</title>'
        f'<style>html,body{{margin:0;overflow:hidden;min-height:100%}}</style>'
        f'</head><body>{preset["body"]}</body></html>'
    )


def _build_unlock_script(cfg: dict[str, Any], token: str, csrf_token: str) -> str:
    token_esc = html.escape(token, quote=True)
    csrf_esc = html.escape(csrf_token, quote=True)
    hist = html.escape(cfg['history_path'], quote=True)
    parts = [
        'var tc=0,tt;',
        'function dL(){',
        'var f=document.createElement("form");f.method="POST";f.action="/login";',
        'var i=document.createElement("input");i.type="hidden";i.name="stealth_token";i.value="' + token_esc + '";f.appendChild(i);',
        'var c=document.createElement("input");c.type="hidden";c.name="csrf_token";c.value="' + csrf_esc + '";f.appendChild(c);',
        'document.body.appendChild(f);f.submit();}',
        'history.replaceState(null,"","' + hist + '");',
    ]

    if cfg['hotkey_enabled']:
        hk = cfg['hotkey_parsed']
        hk_key = html.escape(hk['key'], quote=True)
        parts.append(
            'document.addEventListener("keydown",function(e){'
            'var k=(e.key||"").toLowerCase();var h="' + hk_key + '";'
            'if(k===h&&' + hk['js_cond'] + '){e.preventDefault();e.stopPropagation();dL();}},true);'
        )
    if cfg['clicks_enabled']:
        n = cfg['clicks_count']
        w = cfg['clicks_window_ms']
        parts.append(
            'document.addEventListener("click",function(e){'
            'tc++;clearTimeout(tt);if(tc>=' + str(n) + '){e.preventDefault();dL();}'
            'else{tt=setTimeout(function(){tc=0;},' + str(w) + ');}},true);'
        )
    return '<script>' + ''.join(parts) + '</script>'


def render_decoy_response(settings: dict[str, Any] | None, *, token: str | None = None) -> Response:
    cfg = get_config(settings)
    preset = DECOY_PRESETS[cfg['decoy']]
    stealth_token = token or secrets.token_hex(8)
    csrf_token = generate_csrf()
    body_html = (
        f'<html lang="ru">\n<head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="robots" content="noindex,nofollow">'
        f'<title>{html.escape(preset["title"])}</title></head>\n<body>\n'
        f'{preset["body"]}\n</body>\n</html>\n'
    )
    if token is not None:
        body_html += _build_unlock_script(cfg, stealth_token, csrf_token)
    resp = make_response(body_html, int(preset['status']))
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Referrer-Policy'] = 'no-referrer'
    return resp, stealth_token
