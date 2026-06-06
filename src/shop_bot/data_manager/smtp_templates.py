"""SMTP letter templates — storage, macOS-style HTML layout, rendering."""

from __future__ import annotations

import html
import json
import logging
import re
from copy import deepcopy
from typing import Any

from shop_bot.data_manager.remnawave_repository import get_setting, update_setting

logger = logging.getLogger(__name__)

SETTING_KEY = "smtp_templates_json"
ACCENT_SETTING = "smtp_template_accent"
FOOTER_SETTING = "smtp_template_footer"

_VAR_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_RAW_HTML_VARS = frozenset({"security_body", "issues_html"})

TEMPLATE_IDS = (
    "password_reset",
    "welcome",
    "key_expiry",
    "key_issued",
    "trial_started",
    "referral_reward",
    "payment_receipt",
    "login_security",
    "monitoring_alert",
    "backup_report",
    "smtp_test",
)

TEMPLATE_META: dict[str, dict[str, Any]] = {
    "password_reset": {
        "label": "Сброс пароля",
        "icon": "lock_reset",
        "audience": "user",
        "desc": "Код восстановления WebApp",
        "vars": ["brand", "code", "valid_minutes"],
    },
    "welcome": {
        "label": "Добро пожаловать",
        "icon": "waving_hand",
        "audience": "user",
        "desc": "Первый вход в бота / кабинет",
        "vars": ["brand", "username", "webapp_url"],
    },
    "key_expiry": {
        "label": "Истечение подписки",
        "icon": "schedule",
        "audience": "user",
        "desc": "Напоминание перед окончанием ключа",
        "vars": ["brand", "time_left", "expiry_date", "host_name", "webapp_url"],
    },
    "key_issued": {
        "label": "Ключ выдан",
        "icon": "vpn_key",
        "audience": "user",
        "desc": "Новая подписка или перевыпуск",
        "vars": ["brand", "host_name", "plan_name", "expiry_date", "webapp_url"],
    },
    "trial_started": {
        "label": "Триал активирован",
        "icon": "timer",
        "audience": "user",
        "desc": "Бесплатный период включён",
        "vars": ["brand", "trial_days", "host_name", "expiry_date", "webapp_url"],
    },
    "referral_reward": {
        "label": "Реферальный бонус",
        "icon": "redeem",
        "audience": "user",
        "desc": "Начисление за приглашённого",
        "vars": ["brand", "amount", "reward_type", "balance", "webapp_url"],
    },
    "payment_receipt": {
        "label": "Чек об оплате",
        "icon": "receipt_long",
        "audience": "user",
        "desc": "Покупка, продление, пополнение",
        "vars": [
            "brand", "action_label", "amount", "payment_method", "plan_name",
            "host_name", "months", "payment_id", "expiry_date",
        ],
    },
    "login_security": {
        "label": "Вход в панель",
        "icon": "shield",
        "audience": "admin",
        "desc": "Успешные и неудачные входы",
        "vars": ["brand", "title", "security_body"],
    },
    "monitoring_alert": {
        "label": "Мониторинг ресурсов",
        "icon": "memory",
        "audience": "admin",
        "desc": "CPU, RAM, диск",
        "vars": ["brand", "alert_level", "object_name", "timestamp", "issues_html"],
    },
    "backup_report": {
        "label": "Бэкап готов",
        "icon": "backup",
        "audience": "admin",
        "desc": "Успешное резервное копирование",
        "vars": ["brand", "backup_name", "backup_size", "timestamp"],
    },
    "smtp_test": {
        "label": "Тест SMTP",
        "icon": "mark_email_read",
        "audience": "admin",
        "desc": "Проверка доставки",
        "vars": ["brand"],
    },
}


def _defaults() -> dict[str, dict[str, str]]:
    return {
        "password_reset": {
            "subject": "{{brand}} — код восстановления",
            "headline": "Восстановление доступа",
            "body": (
                "<p style=\"margin:0 0 16px;color:#636366;font-size:15px;line-height:1.5;\">"
                "Используйте код ниже для сброса пароля в личном кабинете."
                "</p>"
                "<div style=\"text-align:center;margin:24px 0;\">"
                "<span style=\"display:inline-block;padding:16px 28px;border-radius:14px;"
                "background:linear-gradient(180deg,#f5f5f7 0%,#e8e8ed 100%);"
                "font-size:28px;font-weight:700;letter-spacing:8px;color:#1c1c1e;"
                "font-family:ui-monospace,monospace;border:1px solid rgba(0,0,0,0.08);\">"
                "{{code}}</span></div>"
                "<p style=\"margin:0;font-size:13px;color:#8e8e93;\">Код действителен "
                "<strong>{{valid_minutes}}</strong> мин. Если вы не запрашивали сброс — "
                "просто удалите это письмо.</p>"
            ),
            "cta_label": "",
            "cta_url": "",
            "preheader": "Код {{code}} для сброса пароля",
        },
        "welcome": {
            "subject": "{{brand}} — добро пожаловать",
            "headline": "Рады видеть вас",
            "body": (
                "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "Здравствуйте, <strong>{{username}}</strong>! Аккаунт в "
                "<strong>{{brand}}</strong> готов — можно пользоваться VPN и личным кабинетом."
                "</p>"
                "<p style=\"margin:0;font-size:13px;color:#8e8e93;\">"
                "Если вы не регистрировались — просто удалите это письмо.</p>"
            ),
            "cta_label": "Открыть кабинет",
            "cta_url": "{{webapp_url}}",
            "preheader": "Добро пожаловать в {{brand}}",
        },
        "key_expiry": {
            "subject": "{{brand}} — подписка истекает через {{time_left}}",
            "headline": "Скоро закончится подписка",
            "body": (
                "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "Осталось <strong>{{time_left}}</strong>. Продлите доступ, чтобы VPN "
                "продолжал работать без перерыва."
                "</p>"
                "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
                "style=\"width:100%;margin:16px 0;border-collapse:separate;border-spacing:0;"
                "border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.06);\">"
                "<tr><td style=\"padding:12px 14px;background:#f5f5f7;font-size:12px;"
                "color:#8e8e93;width:40%;\">Окончание</td>"
                "<td style=\"padding:12px 14px;font-size:14px;font-weight:600;\">"
                "{{expiry_date}}</td></tr>"
                "<tr><td style=\"padding:12px 14px;background:#fafafa;font-size:12px;"
                "color:#8e8e93;\">Сервер</td>"
                "<td style=\"padding:12px 14px;font-size:14px;\">{{host_name}}</td></tr>"
                "</table>"
            ),
            "cta_label": "Открыть кабинет",
            "cta_url": "{{webapp_url}}",
            "preheader": "Подписка истекает {{time_left}}",
        },
        "key_issued": {
            "subject": "{{brand}} — ключ активирован",
            "headline": "Подписка готова",
            "body": (
                "<p style=\"margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "VPN-ключ выдан и уже работает. Детали ниже:"
                "</p>"
                "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
                "style=\"width:100%;border-collapse:separate;border-spacing:0 6px;\">"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Сервер</td>"
                "<td style=\"font-size:14px;font-weight:600;text-align:right;\">"
                "{{host_name}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Тариф</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{plan_name}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Действует до</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{expiry_date}}</td></tr>"
                "</table>"
            ),
            "cta_label": "Открыть кабинет",
            "cta_url": "{{webapp_url}}",
            "preheader": "Ключ на {{host_name}} до {{expiry_date}}",
        },
        "trial_started": {
            "subject": "{{brand}} — триал на {{trial_days}} дн.",
            "headline": "Пробный период включён",
            "body": (
                "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "Бесплатный доступ активирован на <strong>{{trial_days}}</strong> дн. "
                "Сервер: <strong>{{host_name}}</strong>."
                "</p>"
                "<p style=\"margin:0 0 12px;font-size:14px;color:#636366;\">"
                "Окончание триала: <strong>{{expiry_date}}</strong></p>"
                "<p style=\"margin:0;font-size:13px;color:#8e8e93;\">"
                "После окончания продлите подписку в кабинете, чтобы не потерять доступ.</p>"
            ),
            "cta_label": "Перейти в кабинет",
            "cta_url": "{{webapp_url}}",
            "preheader": "Триал до {{expiry_date}}",
        },
        "referral_reward": {
            "subject": "{{brand}} — бонус {{amount}} ₽",
            "headline": "Реферальное начисление",
            "body": (
                "<p style=\"margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "На баланс зачислено <strong>{{amount}} ₽</strong> "
                "({{reward_type}}).</p>"
                "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
                "style=\"width:100%;margin:8px 0;border-collapse:separate;border-spacing:0;"
                "border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.06);\">"
                "<tr><td style=\"padding:12px 14px;background:#f5f5f7;font-size:12px;"
                "color:#8e8e93;\">Текущий баланс</td>"
                "<td style=\"padding:12px 14px;font-size:16px;font-weight:700;\">"
                "{{balance}} ₽</td></tr>"
                "</table>"
            ),
            "cta_label": "Открыть кабинет",
            "cta_url": "{{webapp_url}}",
            "preheader": "+{{amount}} ₽ на баланс",
        },
        "payment_receipt": {
            "subject": "{{brand}} — {{action_label}}",
            "headline": "{{action_label}}",
            "body": (
                "<p style=\"margin:0 0 16px;font-size:15px;color:#636366;\">"
                "Спасибо за оплату. Детали транзакции:"
                "</p>"
                "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
                "style=\"width:100%;border-collapse:separate;border-spacing:0 6px;\">"
                "<tr><td style=\"font-size:12px;color:#8e8e93;padding:4px 0;\">Сумма</td>"
                "<td style=\"font-size:15px;font-weight:700;text-align:right;\">"
                "{{amount}} ₽</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Способ</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{payment_method}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Тариф</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{plan_name}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Сервер</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{host_name}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Срок</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{months}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Действует до</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{expiry_date}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">ID платежа</td>"
                "<td style=\"font-size:12px;font-family:monospace;text-align:right;\">"
                "{{payment_id}}</td></tr>"
                "</table>"
            ),
            "cta_label": "",
            "cta_url": "",
            "preheader": "{{action_label}} — {{amount}} ₽",
        },
        "login_security": {
            "subject": "{{brand}} — {{title}}",
            "headline": "{{title}}",
            "body": "<div class=\"mail-security-body\">{{security_body}}</div>",
            "cta_label": "",
            "cta_url": "",
            "preheader": "{{title}}",
        },
        "monitoring_alert": {
            "subject": "[{{alert_level}}] {{object_name}}",
            "headline": "{{alert_level}}",
            "body": (
                "<p style=\"margin:0 0 8px;font-size:14px;color:#636366;\">"
                "<strong>Объект:</strong> {{object_name}}</p>"
                "<p style=\"margin:0 0 16px;font-size:13px;color:#8e8e93;\">"
                "{{timestamp}}</p>"
                "{{issues_html}}"
                "<p style=\"margin:16px 0 0;font-size:13px;color:#8e8e93;\">"
                "Рекомендуется проверить нагрузку, место на диске и состояние сервисов.</p>"
            ),
            "cta_label": "",
            "cta_url": "",
            "preheader": "Алерт: {{object_name}}",
        },
        "backup_report": {
            "subject": "{{brand}} — бэкап «{{backup_name}}»",
            "headline": "Резервная копия создана",
            "body": (
                "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "Резервное копирование завершено успешно.</p>"
                "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
                "style=\"width:100%;border-collapse:separate;border-spacing:0 6px;\">"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Файл</td>"
                "<td style=\"font-size:13px;font-family:monospace;text-align:right;\">"
                "{{backup_name}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Размер</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{backup_size}}</td></tr>"
                "<tr><td style=\"font-size:12px;color:#8e8e93;\">Время</td>"
                "<td style=\"font-size:14px;text-align:right;\">{{timestamp}}</td></tr>"
                "</table>"
            ),
            "cta_label": "",
            "cta_url": "",
            "preheader": "Бэкап {{backup_name}} — {{backup_size}}",
        },
        "smtp_test": {
            "subject": "{{brand}} — тест почты",
            "headline": "Почта настроена",
            "body": (
                "<p style=\"margin:0;font-size:15px;line-height:1.55;color:#3a3a3c;\">"
                "Это тестовое письмо от панели управления. Если вы его читаете — "
                "SMTP работает корректно.</p>"
                "<p style=\"margin:16px 0 0;font-size:13px;color:#8e8e93;\">"
                "Шаблоны писем можно изменить в разделе "
                "<strong>Шаблоны почты</strong>.</p>"
            ),
            "cta_label": "",
            "cta_url": "",
            "preheader": "Тест SMTP",
        },
    }


def get_accent() -> str:
    raw = (get_setting(ACCENT_SETTING) or "#0A84FF").strip()
    if re.match(r"^#[0-9A-Fa-f]{6}$", raw):
        return raw
    return "#0A84FF"


def default_footer() -> str:
    return (
        "Автоматическое письмо · не отвечайте на него<br/>"
        '<span style="color:#c7c7cc;">{{brand}}</span>'
    )


def get_footer() -> str:
    raw = (get_setting(FOOTER_SETTING) or "").strip()
    return raw or default_footer()


def save_footer(footer: str) -> tuple[bool, str | None]:
    from shop_bot.data_manager.smtp_template_security import normalize_footer

    clean, err = normalize_footer(footer)
    if err:
        return False, err
    update_setting(FOOTER_SETTING, clean)
    return True, None


def reset_footer() -> None:
    update_setting(FOOTER_SETTING, "")


def _load_raw() -> dict:
    raw = get_setting(SETTING_KEY) or ""
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid %s JSON, using defaults", SETTING_KEY)
        return {}


def get_all_templates() -> dict[str, dict[str, str]]:
    stored = _load_raw()
    defaults = _defaults()
    out: dict[str, dict[str, str]] = {}
    for tid in TEMPLATE_IDS:
        base = deepcopy(defaults.get(tid, {}))
        if tid in stored and isinstance(stored[tid], dict):
            for key in ("subject", "headline", "body", "cta_label", "cta_url", "preheader"):
                if stored[tid].get(key) is not None:
                    base[key] = str(stored[tid][key])
        out[tid] = base
    return out


def get_template(template_id: str) -> dict[str, str] | None:
    if template_id not in TEMPLATE_IDS:
        return None
    return get_all_templates().get(template_id)


def save_template(template_id: str, payload: dict[str, str]) -> tuple[bool, str | None]:
    if template_id not in TEMPLATE_IDS:
        return False, "Неизвестный шаблон"
    from shop_bot.data_manager.smtp_template_security import normalize_template_fields

    clean, err = normalize_template_fields(payload)
    if err:
        return False, err
    stored = _load_raw()
    entry = stored.get(template_id, {}) if isinstance(stored.get(template_id), dict) else {}
    for key in ("subject", "headline", "body", "cta_label", "cta_url", "preheader"):
        if key in clean:
            entry[key] = clean[key]
    stored[template_id] = entry
    update_setting(SETTING_KEY, json.dumps(stored, ensure_ascii=False))
    return True, None


def reset_template(template_id: str | None = None) -> None:
    if template_id:
        if template_id not in TEMPLATE_IDS:
            return
        stored = _load_raw()
        stored.pop(template_id, None)
        update_setting(SETTING_KEY, json.dumps(stored, ensure_ascii=False))
        return
    update_setting(SETTING_KEY, "")


def save_accent(color: str) -> None:
    c = (color or "").strip()
    if re.match(r"^#[0-9A-Fa-f]{6}$", c):
        update_setting(ACCENT_SETTING, c)


def render_vars(text: str, ctx: dict[str, Any]) -> str:
    if not text:
        return ""

    def repl(match: re.Match) -> str:
        key = match.group(1)
        val = ctx.get(key)
        if val is None or val == "":
            return ""
        if key in _RAW_HTML_VARS:
            return str(val)
        return html.escape(str(val), quote=False)

    return _VAR_RE.sub(repl, text)


def _security_body_for_email(title: str, info: dict) -> str:
    from shop_bot.webhook_server.modules.security import format_security_msg

    tg_html = format_security_msg(title, info)
    out = tg_html
    out = re.sub(r"<blockquote>", '<div style="margin:8px 0;padding:10px 12px;border-left:3px solid #c7c7cc;background:#f5f5f7;border-radius:0 8px 8px 0;font-size:12px;">', out)
    out = out.replace("</blockquote>", "</div>")
    out = out.replace("<b>", "<strong>").replace("</b>", "</strong>")
    out = out.replace("<code>", '<code style="background:#f0f0f5;padding:2px 6px;border-radius:4px;font-size:12px;">')
    return out


def issues_html_from_list(issues: list[dict]) -> str:
    if not issues:
        return "<p style=\"color:#8e8e93;\">Нет деталей</p>"
    rows = []
    for issue in issues:
        rows.append(
            "<tr>"
            f"<td style=\"padding:10px 12px;font-size:13px;border-bottom:1px solid #eee;\">"
            f"{html.escape(str(issue.get('type', 'Метрика')))}</td>"
            f"<td style=\"padding:10px 12px;font-size:14px;font-weight:600;text-align:right;"
            f"border-bottom:1px solid #eee;\">"
            f"{issue.get('value', 0):.1f}%</td>"
            f"<td style=\"padding:10px 12px;font-size:12px;color:#8e8e93;text-align:right;"
            f"border-bottom:1px solid #eee;\">порог {issue.get('threshold', 0)}%</td>"
            "</tr>"
        )
    return (
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" "
        "style=\"width:100%;border-collapse:collapse;margin:8px 0;\">"
        + "".join(rows)
        + "</table>"
    )


def wrap_layout(
    *,
    headline: str,
    body_html: str,
    brand: str,
    accent: str | None = None,
    cta_label: str = "",
    cta_url: str = "",
    preheader: str = "",
    footer_html: str | None = None,
) -> str:
    acc = accent or get_accent()
    acc_soft = f"{acc}22"
    hl = html.escape(headline or brand, quote=False)
    br = html.escape(brand, quote=False)
    pre = html.escape(preheader, quote=False) if preheader else ""

    from shop_bot.data_manager.smtp_template_security import sanitize_html_body, validate_cta_url

    safe_cta = validate_cta_url((cta_url or "").strip()) if (cta_url or "").strip() else ""
    if safe_cta is None:
        safe_cta = ""

    footer_raw = get_footer() if footer_html is None else footer_html
    footer_inner = sanitize_html_body(render_vars(footer_raw, {"brand": brand}))

    cta_block = ""
    if (cta_label or "").strip() and safe_cta:
        lbl = html.escape(cta_label.strip(), quote=False)
        url = html.escape(safe_cta, quote=False)
        cta_block = (
            f'<div style="text-align:center;margin:28px 0 8px;">'
            f'<a href="{url}" style="display:inline-block;padding:12px 28px;border-radius:12px;'
            f"background:linear-gradient(180deg,{acc} 0%,{acc}dd 100%);color:#fff;"
            f'font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 4px 14px {acc}44;">'
            f"{lbl}</a></div>"
        )

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>{hl}</title>
</head>
<body style="margin:0;padding:0;background:#e8e8ed;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{pre}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(165deg,#d8d8e0 0%,#ececf1 42%,#e4e4ea 100%);min-height:100%;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 0 12px;text-align:center;">
<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff5f57;margin:0 3px;vertical-align:middle;"></span>
<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#febc2e;margin:0 3px;vertical-align:middle;"></span>
<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#28c840;margin:0 3px;vertical-align:middle;"></span>
</td></tr>
<tr><td style="background:rgba(255,255,255,0.92);border-radius:20px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 2px 4px rgba(0,0,0,0.04),0 12px 40px rgba(0,0,0,0.08);overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:4px;background:linear-gradient(90deg,{acc},{acc}99,{acc});"></td></tr>
<tr><td style="padding:28px 28px 8px;">
<div style="width:48px;height:48px;border-radius:14px;background:{acc_soft};display:inline-block;text-align:center;line-height:48px;font-size:22px;">✉️</div>
<h1 style="margin:16px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#1c1c1e;line-height:1.25;">{hl}</h1>
<p style="margin:6px 0 0;font-size:13px;color:#8e8e93;">{br}</p>
</td></tr>
<tr><td style="padding:8px 28px 28px;">
<div style="font-size:15px;line-height:1.55;color:#3a3a3c;">{body_html}</div>
{cta_block}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid rgba(0,0,0,0.06);background:linear-gradient(180deg,#fafafa 0%,#f5f5f7 100%);">
<div style="margin:0;font-size:11px;color:#aeaeb2;line-height:1.45;text-align:center;">{footer_inner}</div>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def render_from_fields(
    fields: dict[str, str],
    ctx: dict[str, Any],
    *,
    brand: str | None = None,
    accent: str | None = None,
    footer: str | None = None,
) -> tuple[str, str, str]:
    br = (brand or (get_setting("panel_brand_title") or "Remnawave App")).strip()
    full_ctx = {"brand": br, **ctx}
    subject = render_vars(fields.get("subject", ""), full_ctx).strip() or br
    headline = render_vars(fields.get("headline", ""), full_ctx).strip() or subject
    from shop_bot.data_manager.smtp_template_security import sanitize_html_body, validate_cta_url

    body_inner = sanitize_html_body(render_vars(fields.get("body", ""), full_ctx))
    cta_label = render_vars(fields.get("cta_label", ""), full_ctx).strip()
    cta_raw = render_vars(fields.get("cta_url", ""), full_ctx).strip()
    cta_valid = validate_cta_url(cta_raw) if cta_raw else ""
    cta_url = cta_valid if cta_valid is not None else ""
    preheader = render_vars(fields.get("preheader", ""), full_ctx).strip()
    html_doc = wrap_layout(
        headline=headline,
        body_html=body_inner,
        brand=br,
        accent=accent,
        cta_label=cta_label,
        cta_url=cta_url,
        preheader=preheader,
        footer_html=footer,
    )
    from shop_bot.data_manager.smtp_mailer import html_to_plain

    plain = html_to_plain(body_inner)
    if headline and headline not in plain:
        plain = f"{headline}\n\n{plain}"
    if cta_url:
        plain += f"\n\n{cta_label or 'Ссылка'}: {cta_url}"
    return subject, plain.strip(), html_doc


def render_message(
    template_id: str,
    ctx: dict[str, Any],
    *,
    brand: str | None = None,
) -> tuple[str, str, str] | None:
    """Returns (subject, plain_text, html) or None if template missing."""
    tpl = get_template(template_id)
    if not tpl:
        return None
    return render_from_fields(tpl, ctx, brand=brand)


def sample_context(template_id: str) -> dict[str, Any]:
    br = (get_setting("panel_brand_title") or "Remnawave App").strip()
    samples: dict[str, dict[str, Any]] = {
        "password_reset": {
            "brand": br, "code": "847291", "valid_minutes": "10",
        },
        "welcome": {
            "brand": br, "username": "Alex",
            "webapp_url": "https://example.com/webapp",
        },
        "key_expiry": {
            "brand": br, "time_left": "24 часа", "expiry_date": "05.06.2026 12:00",
            "host_name": "EU-01", "webapp_url": "https://example.com/webapp",
        },
        "key_issued": {
            "brand": br, "host_name": "EU-01", "plan_name": "Premium 1 мес",
            "expiry_date": "05.07.2026", "webapp_url": "https://example.com/webapp",
        },
        "trial_started": {
            "brand": br, "trial_days": "3", "host_name": "EU-01",
            "expiry_date": "07.06.2026", "webapp_url": "https://example.com/webapp",
        },
        "referral_reward": {
            "brand": br, "amount": "50.00", "reward_type": "за приглашённого",
            "balance": "150.00", "webapp_url": "https://example.com/webapp",
        },
        "payment_receipt": {
            "brand": br, "action_label": "Продление подписки", "amount": "299.00",
            "payment_method": "СБП", "plan_name": "Premium 1 мес", "host_name": "EU-01",
            "months": "1", "payment_id": "pay_8f3a2c", "expiry_date": "05.07.2026",
        },
        "login_security": {
            "brand": br, "title": "Успешный вход в панель",
            "security_body": _security_body_for_email(
                "Успешный вход в панель",
                {
                    "ip": "203.0.113.42", "real_ip": "203.0.113.42",
                    "os": "macOS 14", "browser": "Safari 17",
                    "method": "POST", "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
                },
            ),
        },
        "monitoring_alert": {
            "brand": br, "alert_level": "ПРЕДУПРЕЖДЕНИЕ", "object_name": "Панель (main)",
            "timestamp": "04.06.2026 23:00:00",
            "issues_html": issues_html_from_list([
                {"type": "CPU", "value": 87.2, "threshold": 85},
                {"type": "Диск", "value": 91.0, "threshold": 90},
            ]),
        },
        "backup_report": {
            "brand": br, "backup_name": "shopbot-2026-06-04.db.gz",
            "backup_size": "12.4 МБ", "timestamp": "04.06.2026 23:15:00",
        },
        "smtp_test": {"brand": br},
    }
    return samples.get(template_id, {"brand": br})
