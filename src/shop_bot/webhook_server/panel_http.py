"""HTTP helpers for the admin panel (redirects, client IP)."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import Request, url_for


def trust_proxy_headers() -> bool:
    import os

    return os.getenv('SHOPBOT_TRUST_PROXY', '0').strip().lower() in ('1', 'true', 'yes')


def client_ip_from_request(req: Request) -> str:
    if trust_proxy_headers():
        cf = (req.headers.get('CF-Connecting-IP') or '').strip()
        if cf:
            return cf
        forwarded = (req.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
        if forwarded:
            return forwarded
    return req.remote_addr or ''


def external_url_root(req: Request, *, domain_setting: str | None = None) -> str:
    """Публичный URL панели (webhooks, OAuth redirect). Приоритет: settings.domain → proxy headers → request."""
    domain = (domain_setting or '').strip().rstrip('/')
    if domain:
        if domain.startswith('http://') or domain.startswith('https://'):
            return domain.rstrip('/')
        return f'https://{domain.lstrip("/")}'
    if trust_proxy_headers():
        scheme = (req.headers.get('X-Forwarded-Proto') or req.scheme or 'https').split(',')[0].strip().lower()
        host = (req.headers.get('X-Forwarded-Host') or req.host or '').split(',')[0].strip()
    else:
        scheme = (req.scheme or 'https').split(',')[0].strip().lower()
        host = (req.host or '').split(',')[0].strip()
    if not host:
        return req.url_root.rstrip('/')
    return f'{scheme}://{host}'.rstrip('/')


def safe_redirect_target(req: Request, referrer: str | None, fallback_endpoint: str, **fallback_values) -> str:
    """Same-origin redirect only — blocks open redirects via Referer."""
    fallback = url_for(fallback_endpoint, **fallback_values)
    ref = (referrer or '').strip()
    if not ref:
        return fallback
    try:
        parsed = urlparse(ref)
    except Exception:
        return fallback
    if parsed.scheme and parsed.scheme not in ('http', 'https'):
        return fallback
    if parsed.netloc and parsed.netloc.lower() != req.host.lower():
        return fallback
    path = parsed.path or '/'
    if parsed.query:
        return f'{path}?{parsed.query}'
    return path


def safe_next_path(req: Request, next_url: str | None) -> str | None:
    """Validate ?next= for post-login redirect (same host, path only)."""
    raw = (next_url or '').strip()
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    if parsed.scheme or parsed.netloc:
        if parsed.netloc and parsed.netloc.lower() != req.host.lower():
            return None
        path = parsed.path or '/'
    else:
        path = raw if raw.startswith('/') else f'/{raw}'
    if not path.startswith('/') or path.startswith('//'):
        return None
    if parsed.query:
        return f'{path}?{parsed.query}'
    return path
