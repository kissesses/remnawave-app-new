"""Security helpers for Mail Studio (HTML sanitization, CTA URLs, rate limits)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from shop_bot.data_manager.remnawave_repository import get_setting
from shop_bot.security.rate_store import allow_action

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CTA_VAR_RE = re.compile(r"^\{\{\s*(\w+)\s*\}\}$")

MAIL_TEST_LIMIT_PER_ADMIN = 5
MAIL_TEST_LIMIT_PER_IP = 10
MAIL_TEST_WINDOW_SEC = 900

ALLOWED_TAGS = frozenset({
    "p", "br", "strong", "em", "b", "i", "u", "s",
    "div", "span", "table", "thead", "tbody", "tr", "th", "td",
    "a", "code", "hr", "blockquote",
})

ALLOWED_ATTRIBUTES: dict[str, list[str]] = {
    "*": ["style", "class", "role", "cellpadding", "cellspacing", "border", "width", "align"],
    "a": ["href", "title", "style", "target", "rel"],
    "table": ["style", "role", "cellpadding", "cellspacing", "border", "width"],
    "td": ["style", "colspan", "rowspan", "align", "valign"],
    "th": ["style", "colspan", "rowspan", "align", "valign"],
    "tr": ["style"],
    "div": ["style"],
    "span": ["style"],
    "p": ["style"],
    "code": ["style"],
}

ALLOWED_CSS_PROPERTIES = frozenset({
    "color", "background", "background-color", "font-size", "font-weight", "font-family",
    "text-align", "line-height", "letter-spacing", "text-decoration",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "border", "border-radius", "border-collapse", "border-bottom", "border-top",
    "border-left", "border-right", "border-color", "border-width", "border-style",
    "display", "width", "height", "max-width", "min-width", "overflow",
    "vertical-align", "white-space", "box-shadow",
})

AUDIT_ACTION_LABELS: dict[str, str] = {
    "mail_templates.save": "Шаблон почты — сохранение",
    "mail_templates.reset": "Шаблон почты — сброс",
    "mail_templates.test": "Шаблон почты — тестовая отправка",
}


def _bleach_clean(html: str) -> str:
    try:
        import bleach
        from bleach.css_sanitizer import CSSSanitizer
    except ImportError:
        logger.warning("bleach not installed, stripping tags coarsely")
        return _fallback_strip_html(html)

    css = CSSSanitizer(allowed_css_properties=list(ALLOWED_CSS_PROPERTIES))

    def _attr_filter(tag: str, name: str, value: str) -> bool:
        if name == "href" and tag == "a":
            return validate_cta_url(value) is not None
        allowed = ALLOWED_ATTRIBUTES.get(tag, []) + ALLOWED_ATTRIBUTES.get("*", [])
        return name in allowed

    cleaned = bleach.clean(
        html or "",
        tags=list(ALLOWED_TAGS),
        attributes=_attr_filter,
        css_sanitizer=css,
        strip=True,
        strip_comments=True,
    )
    return cleaned


def _fallback_strip_html(html: str) -> str:
    """Minimal fallback if bleach is missing."""
    out = re.sub(r"(?is)<script[^>]*>.*?</script>", "", html or "")
    out = re.sub(r"(?is)<style[^>]*>.*?</style>", "", out)
    out = re.sub(r"(?is)<iframe[^>]*>.*?</iframe>", "", out)
    return out


def sanitize_html_body(html: str) -> str:
    return _bleach_clean(html or "")


def _allowed_hosts() -> set[str]:
    hosts: set[str] = set()
    domain = (get_setting("domain") or "").strip().lower()
    if domain:
        hosts.add(domain.lstrip("https://").lstrip("http://").split("/")[0])
    try:
        from shop_bot.data_manager.remnawave_repository import get_webapp_settings

        webapp = get_webapp_settings() or {}
        domen = (webapp.get("webapp_domen") or "").strip()
        if domen:
            parsed = urlparse(domen if "://" in domen else f"https://{domen}")
            if parsed.hostname:
                hosts.add(parsed.hostname.lower())
    except Exception:
        pass
    return hosts


def _normalize_cta_placeholder(raw: str) -> str | None:
    """Allow {{var}} placeholders in cta_url before variable substitution at render."""
    m = _CTA_VAR_RE.match((raw or "").strip())
    if not m:
        return None
    return f"{{{{{m.group(1)}}}}}"


def validate_cta_url(url: str, *, strict_host: bool = False) -> str | None:
    """Return normalized https URL, {{var}} placeholder, empty string, or None if invalid."""
    raw = (url or "").strip()
    if not raw:
        return ""
    placeholder = _normalize_cta_placeholder(raw)
    if placeholder is not None:
        return placeholder
    parsed = urlparse(raw)
    if parsed.scheme not in ("https",):
        return None
    if parsed.username or parsed.password:
        return None
    host = (parsed.hostname or "").lower()
    if not host:
        return None
    if parsed.scheme == "javascript" or raw.lower().startswith(("javascript:", "data:", "vbscript:")):
        return None
    if strict_host and _allowed_hosts() and host not in _allowed_hosts():
        return None
    path = parsed.path or ""
    query = f"?{parsed.query}" if parsed.query else ""
    return f"https://{host}{path}{query}"


def normalize_template_fields(fields: dict[str, Any]) -> tuple[dict[str, str], str | None]:
    """Sanitize text fields; return (clean_fields, error_message)."""
    out: dict[str, str] = {}
    for key in ("subject", "headline", "preheader", "cta_label"):
        if key in fields:
            val = str(fields.get(key) or "")
            out[key] = val.replace("\x00", "").strip()[:500]

    if "body" in fields:
        body = str(fields.get("body") or "")
        if len(body) > 120_000:
            return out, "Тело шаблона слишком большое (макс. 120 000 символов)"
        out["body"] = sanitize_html_body(body)

    if "cta_url" in fields:
        cta = str(fields.get("cta_url") or "").strip()
        if cta:
            normalized = validate_cta_url(cta, strict_host=False)
            if normalized is None:
                return out, "Ссылка кнопки: только https:// без javascript: и data:"
            out["cta_url"] = normalized
        else:
            out["cta_url"] = ""

    return out, None


def normalize_footer(footer: str) -> tuple[str, str | None]:
    val = str(footer or "").strip()
    if len(val) > 8_000:
        return "", "Подвал слишком длинный (макс. 8000 символов)"
    return sanitize_html_body(val), None


def audit_details(
    action: str,
    *,
    template_id: str,
    before: dict[str, str] | None = None,
    after: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "template_id": template_id,
        "action": action,
    }
    if before is not None:
        payload["before"] = _field_snapshot(before)
    if after is not None:
        payload["after"] = _field_snapshot(after)
    if extra:
        payload.update(extra)
    return payload


def _field_snapshot(fields: dict[str, str]) -> dict[str, Any]:
    body = fields.get("body") or ""
    return {
        "subject_len": len(fields.get("subject") or ""),
        "headline_len": len(fields.get("headline") or ""),
        "body_len": len(body),
        "cta_url_set": bool((fields.get("cta_url") or "").strip()),
        "preheader_len": len(fields.get("preheader") or ""),
    }


def check_mail_test_rate_limit(*, admin_id: int | None, ip: str | None) -> str | None:
    if admin_id is not None:
        key = f"mail-test:admin:{admin_id}"
        if not allow_action(key, limit=MAIL_TEST_LIMIT_PER_ADMIN, window=MAIL_TEST_WINDOW_SEC):
            return (
                f"Лимит тестовых писем: не более {MAIL_TEST_LIMIT_PER_ADMIN} "
                f"за {MAIL_TEST_WINDOW_SEC // 60} мин на администратора"
            )
    if ip:
        key = f"mail-test:ip:{ip.strip()}"
        if not allow_action(key, limit=MAIL_TEST_LIMIT_PER_IP, window=MAIL_TEST_WINDOW_SEC):
            return "Слишком много тестовых писем с этого IP. Попробуйте позже."
    return None


def validate_test_recipient(email: str) -> str | None:
    addr = (email or "").strip().lower()
    if not addr or not _EMAIL_RE.match(addr):
        return None
    return addr


def humanize_audit_entry(entry: dict[str, Any]) -> dict[str, Any]:
    action = entry.get("action") or ""
    label = AUDIT_ACTION_LABELS.get(action, action)
    summary = ""
    raw = entry.get("details")
    if raw:
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(data, dict):
                summary = _summarize_audit_details(action, data)
            else:
                summary = str(raw)[:200]
        except (json.JSONDecodeError, TypeError):
            summary = str(raw)[:200]
    return {**entry, "action_label": label, "summary": summary or label}


def _summarize_audit_details(action: str, data: dict[str, Any]) -> str:
    tid = data.get("template_id") or "—"
    if action == "mail_templates.save":
        after = data.get("after") or {}
        before = data.get("before") or {}
        parts = [f"шаблон {tid}"]
        if after.get("body_len") is not None:
            parts.append(f"тело {after.get('body_len')} симв.")
        if before.get("body_len") != after.get("body_len"):
            parts.append(f"было {before.get('body_len', 0)}")
        if data.get("sanitized"):
            parts.append("HTML очищен")
        return " · ".join(parts)
    if action == "mail_templates.reset":
        return f"сброс: {tid}"
    if action == "mail_templates.test":
        to = data.get("to") or "—"
        ok = "OK" if data.get("ok") else "ошибка"
        return f"{tid} → {to} ({ok})"
    return json.dumps(data, ensure_ascii=False)[:180]
