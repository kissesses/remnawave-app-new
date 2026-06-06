"""SMTP mail delivery for panel notifications."""

from __future__ import annotations

import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable

from shop_bot.data_manager.remnawave_repository import get_setting

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def parse_recipients(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[\s,;]+", raw.strip())
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        email = part.strip().lower()
        if not email or email in seen:
            continue
        if _EMAIL_RE.match(email):
            seen.add(email)
            out.append(email)
    return out


def is_enabled() -> bool:
    return _truthy(get_setting("smtp_enabled"))


def _notify_login_enabled() -> bool:
    return _truthy(get_setting("smtp_notify_login"))


def _notify_monitoring_enabled() -> bool:
    return _truthy(get_setting("smtp_notify_monitoring"))


def get_config(overrides: dict | None = None) -> dict:
    port_raw = (get_setting("smtp_port") or "587").strip()
    try:
        port = int(port_raw or 587)
    except ValueError:
        port = 587
    encryption = (get_setting("smtp_encryption") or "starttls").strip().lower()
    if encryption not in {"starttls", "ssl", "none"}:
        encryption = "starttls"
    cfg = {
        "enabled": is_enabled(),
        "host": (get_setting("smtp_host") or "").strip(),
        "port": port,
        "username": (get_setting("smtp_username") or "").strip(),
        "password": (get_setting("smtp_password") or "").strip(),
        "from_email": (get_setting("smtp_from_email") or "").strip(),
        "from_name": (get_setting("smtp_from_name") or "").strip(),
        "encryption": encryption,
        "recipients": parse_recipients(get_setting("smtp_notify_emails")),
    }
    if not overrides:
        return cfg

    if "smtp_enabled" in overrides:
        cfg["enabled"] = _truthy(str(overrides.get("smtp_enabled")))
    if overrides.get("smtp_host") is not None:
        cfg["host"] = str(overrides.get("smtp_host") or "").strip()
    if overrides.get("smtp_port") is not None:
        try:
            cfg["port"] = int(str(overrides.get("smtp_port") or "587"))
        except ValueError:
            cfg["port"] = 587
    if overrides.get("smtp_username") is not None:
        cfg["username"] = str(overrides.get("smtp_username") or "").strip()
    if overrides.get("smtp_password"):
        cfg["password"] = str(overrides.get("smtp_password") or "").strip()
    if overrides.get("smtp_from_email") is not None:
        cfg["from_email"] = str(overrides.get("smtp_from_email") or "").strip()
    if overrides.get("smtp_from_name") is not None:
        cfg["from_name"] = str(overrides.get("smtp_from_name") or "").strip()
    if overrides.get("smtp_encryption") is not None:
        enc = str(overrides.get("smtp_encryption") or "starttls").strip().lower()
        if enc in {"starttls", "ssl", "none"}:
            cfg["encryption"] = enc
    if overrides.get("smtp_notify_emails") is not None:
        cfg["recipients"] = parse_recipients(str(overrides.get("smtp_notify_emails") or ""))
    return cfg


def is_configured() -> bool:
    cfg = get_config()
    return bool(cfg["enabled"] and cfg["host"] and cfg["from_email"] and cfg["recipients"])


def html_to_plain(text: str) -> str:
    if not text:
        return ""
    out = text
    out = re.sub(r"(?i)<br\s*/?>", "\n", out)
    out = re.sub(r"(?i)</p>", "\n", out)
    out = re.sub(r"(?i)</blockquote>", "\n", out)
    out = re.sub(r"<[^>]+>", "", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def send_mail(
    *,
    to: Iterable[str],
    subject: str,
    text: str,
    html: str | None = None,
    config: dict | None = None,
) -> tuple[bool, str]:
    recipients = [r.strip().lower() for r in to if (r or "").strip()]
    if not recipients:
        return False, "Не указаны получатели"

    cfg = config or get_config()
    if not cfg.get("enabled"):
        return False, "SMTP отключён"
    if not cfg["host"]:
        return False, "Не указан SMTP-сервер"
    if not cfg["from_email"]:
        return False, "Не указан адрес отправителя"

    from_name = cfg["from_name"] or "Remnawave App"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, cfg["from_email"]))
    msg["To"] = ", ".join(recipients)
    if html:
        msg.set_content(text or html_to_plain(html))
        msg.add_alternative(html, subtype="html")
    else:
        msg.set_content(text)

    try:
        if cfg["encryption"] == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=30, context=context) as smtp:
                if cfg["username"]:
                    smtp.login(cfg["username"], cfg["password"])
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as smtp:
                smtp.ehlo()
                if cfg["encryption"] == "starttls":
                    context = ssl.create_default_context()
                    smtp.starttls(context=context)
                    smtp.ehlo()
                if cfg["username"]:
                    smtp.login(cfg["username"], cfg["password"])
                smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        logger.warning("SMTP authentication failed for host %s", cfg["host"])
        return False, "Ошибка авторизации SMTP — проверьте логин и пароль"
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        logger.warning("SMTP send failed: %s", exc)
        return False, f"Не удалось отправить письмо: {exc}"

    return True, "Письмо отправлено"


def _render_and_send(template_id: str, to: Iterable[str], ctx: dict) -> tuple[bool, str]:
    from shop_bot.data_manager import smtp_templates

    rendered = smtp_templates.render_message(template_id, ctx, brand=_brand_name())
    if not rendered:
        return False, "Шаблон не найден"
    subject, plain, html_doc = rendered
    return send_mail(to=to, subject=subject, text=plain, html=html_doc)


def send_test_mail(to: str | None = None, overrides: dict | None = None) -> tuple[bool, str]:
    target = (to or "").strip().lower()
    cfg = get_config(overrides)
    cfg["enabled"] = True
    if not cfg["host"]:
        return False, "Укажите SMTP-сервер"
    if not cfg["from_email"]:
        return False, "Укажите email отправителя"
    if not target:
        target = cfg["recipients"][0] if cfg["recipients"] else ""
    if not target:
        return False, "Укажите email получателя или список адресов уведомлений"

    from shop_bot.data_manager import smtp_templates

    rendered = smtp_templates.render_message("smtp_test", {"brand": _brand_name()})
    if not rendered:
        return False, "Шаблон теста не найден"
    subject, plain, html_doc = rendered
    return send_mail(to=[target], subject=subject, text=plain, html=html_doc, config=cfg)


def send_security_notification(title: str, info: dict) -> int:
    if not is_enabled() or not _notify_login_enabled():
        return 0
    cfg = get_config()
    if not cfg["recipients"]:
        return 0

    from shop_bot.data_manager import smtp_templates

    title_plain = html_to_plain(title) or "Уведомление безопасности"
    ctx = {
        "title": title_plain,
        "security_body": smtp_templates._security_body_for_email(title, info),
    }
    rendered = smtp_templates.render_message("login_security", ctx, brand=_brand_name())
    if not rendered:
        return 0
    subject, plain, html_doc = rendered
    ok, _ = send_mail(to=cfg["recipients"], subject=subject, text=plain, html=html_doc)
    return len(cfg["recipients"]) if ok else 0


def send_monitoring_alert(scope: str, name: str, issues: list[dict], level: str) -> int:
    if not is_enabled() or not _notify_monitoring_enabled():
        return 0
    cfg = get_config()
    if not cfg["recipients"]:
        return 0

    from shop_bot.data_manager.db.connection import get_msk_time
    from shop_bot.data_manager import smtp_templates

    if level == "critical":
        header = "КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ"
    else:
        header = "ПРЕДУПРЕЖДЕНИЕ"

    if scope == "local":
        obj_name = f"Панель ({name})"
    elif scope == "host":
        obj_name = f"Хост {name}"
    elif scope == "target":
        obj_name = f"SSH-цель {name}"
    else:
        obj_name = f"{scope}:{name}"

    ctx = {
        "alert_level": header,
        "object_name": obj_name,
        "timestamp": get_msk_time().strftime("%d.%m.%Y %H:%M:%S"),
        "issues_html": smtp_templates.issues_html_from_list(issues),
    }
    rendered = smtp_templates.render_message("monitoring_alert", ctx, brand=_brand_name())
    if not rendered:
        return 0
    subject, plain, html_doc = rendered
    ok, _ = send_mail(to=cfg["recipients"], subject=subject, text=plain, html=html_doc)
    return len(cfg["recipients"]) if ok else 0


def _brand_name() -> str:
    return (get_setting("panel_brand_title") or "Remnawave App").strip()


def password_reset_enabled() -> bool:
    return is_enabled() and _truthy(get_setting("smtp_notify_password_reset"))


def key_expiry_enabled() -> bool:
    return is_enabled() and _truthy(get_setting("smtp_notify_key_expiry"))


def payment_receipt_enabled() -> bool:
    return is_enabled() and _truthy(get_setting("smtp_notify_payment_receipt"))


def _user_facing_configured() -> bool:
    cfg = get_config()
    return bool(cfg["enabled"] and cfg["host"] and cfg["from_email"])


def _webapp_url() -> str:
    domain = (get_setting("domain") or "").strip()
    if domain:
        return f"https://{domain.lstrip('https://').lstrip('http://').rstrip('/')}"
    try:
        from shop_bot.data_manager.remnawave_repository import get_webapp_settings

        webapp = get_webapp_settings() or {}
        domen = (webapp.get("webapp_domen") or "").strip()
        if domen:
            return domen if domen.startswith("http") else f"https://{domen}"
    except Exception:
        pass
    return ""


def _field(val: str | None, fallback: str = "—") -> str:
    s = (val or "").strip()
    return s if s else fallback


def send_password_reset_code(to_email: str, code: str) -> tuple[bool, str]:
    if not password_reset_enabled() or not _user_facing_configured():
        return False, "SMTP для сброса пароля не настроен"
    return _render_and_send(
        "password_reset",
        [to_email],
        {"code": code, "valid_minutes": "10"},
    )


def send_key_expiry_reminder(
    to_email: str,
    *,
    time_left_label: str,
    expiry_str: str,
    host_name: str | None = None,
) -> tuple[bool, str]:
    if not key_expiry_enabled() or not _user_facing_configured():
        return False, "SMTP для напоминаний не настроен"
    return _render_and_send(
        "key_expiry",
        [to_email],
        {
            "time_left": time_left_label,
            "expiry_date": expiry_str,
            "host_name": _field(host_name),
            "webapp_url": _webapp_url(),
        },
    )


def send_payment_receipt(
    to_email: str,
    *,
    action: str,
    amount_rub: float,
    payment_method: str | None,
    plan_name: str | None = None,
    host_name: str | None = None,
    months: int | None = None,
    payment_id: str | None = None,
    expiry_str: str | None = None,
) -> tuple[bool, str]:
    if not payment_receipt_enabled() or not _user_facing_configured():
        return False, "SMTP для чеков не настроен"
    action_label = {
        "new": "Покупка подписки",
        "extend": "Продление подписки",
        "top_up": "Пополнение баланса",
    }.get(action, "Оплата")
    return _render_and_send(
        "payment_receipt",
        [to_email],
        {
            "action_label": action_label,
            "amount": f"{amount_rub:.2f}",
            "payment_method": _field(payment_method),
            "plan_name": _field(plan_name),
            "host_name": _field(host_name),
            "months": f"{months} мес." if months else "—",
            "payment_id": _field(payment_id),
            "expiry_date": _field(expiry_str),
        },
    )


def try_send_payment_receipt_for_metadata(metadata: dict, *, expiry_str: str | None = None) -> bool:
    if not payment_receipt_enabled():
        return False
    try:
        uid = int(metadata.get("user_id") or 0)
    except (TypeError, ValueError):
        return False
    from shop_bot.data_manager.remnawave_repository import get_user, get_plan_by_id

    user = get_user(uid) or {}
    to_email = (
        (metadata.get("customer_email") or "").strip()
        or (user.get("auth_email") or "").strip()
    ).lower()
    if not to_email or not _EMAIL_RE.match(to_email):
        return False
    action = (metadata.get("action") or "").strip()
    if action not in {"new", "extend", "top_up"}:
        return False
    plan_name = None
    plan_id = metadata.get("plan_id")
    if plan_id:
        plan = get_plan_by_id(int(plan_id))
        if plan:
            plan_name = plan.get("plan_name")
    ok, err = send_payment_receipt(
        to_email,
        action=action,
        amount_rub=float(metadata.get("price") or 0),
        payment_method=metadata.get("payment_method"),
        plan_name=plan_name,
        host_name=metadata.get("host_name") or metadata.get("host"),
        months=int(metadata.get("months") or 0) or None,
        payment_id=(metadata.get("payment_id") or metadata.get("transaction_id") or "") or None,
        expiry_str=expiry_str,
    )
    if not ok:
        logger.warning("Payment receipt email failed for %s: %s", to_email, err)
    return ok
