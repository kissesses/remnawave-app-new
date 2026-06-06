"""Telegram bot message templates — storage and rendering."""

from __future__ import annotations

import html
import json
import logging
import re
from copy import deepcopy
from typing import Any

from shop_bot.data_manager.remnawave_repository import get_setting, update_setting

logger = logging.getLogger(__name__)

SETTING_KEY = "bot_messages_json"
_VAR_RE = re.compile(r"\{(\w+)\}")

TEMPLATE_IDS = (
    "purchase_success",
    "subscription_expiry",
    "welcome",
    "welcome_return",
    "onboarding_not_subscribed",
    "onboarding_check_failed",
    "onboarding_fallback",
    "topup_prompt",
    "topup_success",
    "topup_amount_accepted",
    "payment_processing",
    "payment_key_not_found",
    "admin_purchase",
    "admin_topup",
    "trial_select_host",
    "trial_preparing",
    "trial_already_used",
    "trial_no_hosts",
    "trial_server_error",
    "trial_failed",
    "referral_new_signup",
    "referral_start_bonus",
    "spam_blocked",
    "payment_error_generic",
    "payment_plan_not_found",
    "payment_stars_unavailable",
    "payment_invoice_error",
    "payment_yoomoney_config",
)

TEMPLATE_META: dict[str, dict[str, Any]] = {
    "purchase_success": {
        "label": "Ключ готов / продлён",
        "icon": "celebration",
        "audience": "user",
        "category": "purchase",
        "desc": "После успешной оплаты или триала",
        "vars": ["action_text", "key_number", "expiry_date", "key_email", "connection_string"],
    },
    "subscription_expiry": {
        "label": "Истечение подписки",
        "icon": "schedule",
        "audience": "user",
        "category": "subscription",
        "desc": "Напоминание из планировщика",
        "vars": ["time_left", "expiry_date"],
    },
    "welcome": {
        "label": "Welcome / onboarding",
        "icon": "waving_hand",
        "audience": "user",
        "category": "onboarding",
        "desc": "Первый вход: канал и terms",
        "vars": ["channel_line", "terms_line"],
    },
    "welcome_return": {
        "label": "С возвращением",
        "icon": "emoji_people",
        "audience": "user",
        "category": "onboarding",
        "desc": "Повторный /start после онбординга",
        "vars": ["user_name"],
    },
    "onboarding_not_subscribed": {
        "label": "Не подписан на канал",
        "icon": "campaign",
        "audience": "user",
        "category": "onboarding",
        "desc": "Alert при проверке подписки",
        "vars": [],
    },
    "onboarding_check_failed": {
        "label": "Ошибка проверки канала",
        "icon": "error",
        "audience": "user",
        "category": "onboarding",
        "desc": "Бот не админ канала",
        "vars": [],
    },
    "onboarding_fallback": {
        "label": "Завершите регистрацию",
        "icon": "info",
        "audience": "user",
        "category": "onboarding",
        "desc": "Сообщение во время онбординга",
        "vars": [],
    },
    "topup_prompt": {
        "label": "Ввод суммы пополнения",
        "icon": "account_balance_wallet",
        "audience": "user",
        "category": "topup",
        "desc": "Экран начала пополнения",
        "vars": [],
    },
    "topup_success": {
        "label": "Баланс пополнен",
        "icon": "payments",
        "audience": "user",
        "category": "topup",
        "desc": "После успешного top-up",
        "vars": ["amount", "balance"],
    },
    "topup_amount_accepted": {
        "label": "Сумма принята",
        "icon": "check_circle",
        "audience": "user",
        "category": "topup",
        "desc": "Перед выбором способа оплаты",
        "vars": ["amount"],
    },
    "payment_processing": {
        "label": "Оплата принята",
        "icon": "hourglass_top",
        "audience": "user",
        "category": "purchase",
        "desc": "Формирование конфигурации",
        "vars": ["host_name"],
    },
    "payment_key_not_found": {
        "label": "Ключ не найден",
        "icon": "vpn_key_off",
        "audience": "user",
        "category": "purchase",
        "desc": "Ошибка продления",
        "vars": [],
    },
    "admin_purchase": {
        "label": "Новая оплата",
        "icon": "point_of_sale",
        "audience": "admin",
        "category": "admin",
        "desc": "Уведомление админу о покупке/продлении",
        "vars": [
            "user_id", "username", "host_name", "plan_name", "months",
            "payment_method", "amount", "action_label", "today_rub", "today_crypto",
            "promo_block",
        ],
    },
    "admin_topup": {
        "label": "Пополнение баланса",
        "icon": "account_balance",
        "audience": "admin",
        "category": "admin",
        "desc": "Уведомление админу о top-up",
        "vars": ["user_id", "username", "payment_method", "amount"],
    },
    "trial_select_host": {
        "label": "Выбор сервера триала",
        "icon": "dns",
        "audience": "user",
        "category": "trial",
        "desc": "Список локаций для пробного периода",
        "vars": [],
    },
    "trial_preparing": {
        "label": "Создание триала",
        "icon": "progress_activity",
        "audience": "user",
        "category": "trial",
        "desc": "Процесс генерации ключа",
        "vars": ["days", "host_name"],
    },
    "trial_already_used": {
        "label": "Триал уже использован",
        "icon": "block",
        "audience": "user",
        "category": "trial",
        "desc": "Alert при повторной активации",
        "vars": [],
    },
    "trial_no_hosts": {
        "label": "Нет серверов для триала",
        "icon": "cloud_off",
        "audience": "user",
        "category": "trial",
        "desc": "Нет доступных хостов",
        "vars": [],
    },
    "trial_server_error": {
        "label": "Ошибка сервера триала",
        "icon": "warning",
        "audience": "user",
        "category": "trial",
        "desc": "Не удалось сгенерировать конфиг",
        "vars": [],
    },
    "trial_failed": {
        "label": "Сбой триала",
        "icon": "error",
        "audience": "user",
        "category": "trial",
        "desc": "Общая ошибка создания триала",
        "vars": [],
    },
    "referral_new_signup": {
        "label": "Новый реферал",
        "icon": "group_add",
        "audience": "user",
        "category": "referral",
        "desc": "Уведомление рефереру",
        "vars": ["display_name", "user_id"],
    },
    "referral_start_bonus": {
        "label": "Бонус за регистрацию",
        "icon": "redeem",
        "audience": "user",
        "category": "referral",
        "desc": "Fixed start bonus рефереру",
        "vars": ["user_name", "user_id", "bonus_amount"],
    },
    "spam_blocked": {
        "label": "Анти-спам блок",
        "icon": "shield",
        "audience": "user",
        "category": "system",
        "desc": "Временная блокировка за flood",
        "vars": ["block_seconds"],
    },
    "payment_error_generic": {
        "label": "Ошибка оплаты",
        "icon": "credit_card_off",
        "audience": "user",
        "category": "payment",
        "desc": "Общее сообщение об ошибке",
        "vars": ["message"],
    },
    "payment_plan_not_found": {
        "label": "Тариф не найден",
        "icon": "inventory_2",
        "audience": "user",
        "category": "payment",
        "desc": "План удалён из системы",
        "vars": [],
    },
    "payment_stars_unavailable": {
        "label": "Stars недоступны",
        "icon": "star",
        "audience": "user",
        "category": "payment",
        "desc": "Telegram Stars выключены",
        "vars": [],
    },
    "payment_invoice_error": {
        "label": "Ошибка счёта",
        "icon": "receipt_long",
        "audience": "user",
        "category": "payment",
        "desc": "Не удалось создать invoice",
        "vars": [],
    },
    "payment_yoomoney_config": {
        "label": "YooMoney не настроен",
        "icon": "settings",
        "audience": "user",
        "category": "payment",
        "desc": "Ошибка конфигурации кошелька",
        "vars": [],
    },
}

_RAW_VARS = frozenset({"connection_string", "promo_block", "channel_line", "terms_line"})


def _defaults() -> dict[str, str]:
    return {
        "purchase_success": (
            "🎉 <b>Ваш ключ #{key_number} {action_text}!</b>\n\n"
            "📅 <b>Сроки действия:</b>\n"
            "⏳ <b>Действует до: {expiry_date}</b>\n"
            "💌 <b>ID ключа:</b> <code>{key_email}</code>\n\n"
            "🗽 <b>Ваш ключ:</b>\n"
            "<code>{connection_string}</code>"
        ),
        "subscription_expiry": (
            "⚠️ <b>Внимание!</b>\n\n"
            "Срок действия вашей подписки истекает через <b>{time_left}</b>.\n"
            "Дата окончания: <b>{expiry_date}</b>\n\n"
            "Продлите подписку, чтобы не остаться без доступа к VPN!"
        ),
        "welcome": (
            "<b>Добро пожаловать!</b>\n"
            "{channel_line}\n"
            "{terms_line}\n"
            "\nПосле этого нажмите кнопку ниже."
        ),
        "welcome_return": "👋 С возвращением, <b>{user_name}</b>!",
        "onboarding_not_subscribed": (
            "❌ Вы еще не подписались на канал. Пожалуйста, подпишитесь и попробуйте снова."
        ),
        "onboarding_check_failed": (
            "⚠️ Не удалось проверить подписку. Убедитесь, что бот является администратором канала."
        ),
        "onboarding_fallback": (
            "⚠️ Пожалуйста, выполните требуемые действия и нажмите кнопку в сообщении выше для продолжения."
        ),
        "topup_prompt": (
            "💰 <b>Пополнение баланса</b>\n\n"
            "Введите сумму пополнения в рублях:\n"
            "🔹 Минимум: 10 RUB\n"
            "🔹 Максимум: 100 000 RUB"
        ),
        "topup_success": (
            "✅ <b>Баланс пополнен!</b>\n"
            "Сумма: <code>{amount}</code>\n"
            "Текущий баланс: <code>{balance}</code>"
        ),
        "topup_amount_accepted": "✅ Сумма принята: {amount} RUB\n\nВыберите способ оплаты:",
        "payment_processing": "⏳ <b>Оплата принята!</b>\nФормируем конфигурацию на сервере «{host_name}»...",
        "payment_key_not_found": "❌ Ключ для продления не найден.",
        "admin_purchase": (
            "📥 <b>Новая оплата</b>\n"
            "👤 Пользователь: <code>{user_id}</code>\n"
            "💌 Username: {username}\n"
            "🌍 Локация: <b>{host_name}</b>\n"
            "📦 Тариф: {plan_name} ({months} мес.)\n"
            "💳 Метод: {payment_method}\n"
            "💰 Сумма: {amount} RUB\n"
            "⚙️ Тип: {action_label}\n\n"
            "<blockquote>💵 Касса за сегодня ₽: {today_rub} RUB\n"
            "💎 Касса за сегодня $: {today_crypto} RUB</blockquote>"
            "{promo_block}"
        ),
        "admin_topup": (
            "📥 <b>Пополнение баланса</b>\n"
            "👤 Пользователь: <code>{user_id}</code>\n"
            "💌 Username: {username}\n"
            "💳 Метод: {payment_method}\n"
            "💰 Сумма: {amount} RUB\n"
            "⚙️ Тип: ➕ Баланс ‼️"
        ),
        "trial_select_host": (
            "🎁 <b>Бесплатный пробный период</b>\n\n"
            "Выберите сервер, на котором хотите протестировать наш сервис:"
        ),
        "trial_preparing": (
            "⚙️ <b>Подготовка конфигурации...</b>\n"
            "Создаю бесплатный доступ на {days} дня на сервере «{host_name}»"
        ),
        "trial_already_used": "⚠️ Вы уже активировали пробный период ранее.",
        "trial_no_hosts": (
            "😔 К сожалению, сейчас нет свободных серверов для пробного периода. Попробуйте позже."
        ),
        "trial_server_error": (
            "❌ <b>Ошибка сервера</b>\nНе удалось сгенерировать конфигурацию. Попробуйте выбрать другой сервер."
        ),
        "trial_failed": (
            "⚠️ <b>Произошла ошибка</b>\nНе удалось завершить создание пробного ключа."
        ),
        "referral_new_signup": (
            "🎉 <b>У вас новый реферал!</b>\n"
            "📃 user: {display_name} / id: <code>{user_id}</code>\n\n"
            "Спасибо, что делитесь нашим сервисом!"
        ),
        "referral_start_bonus": (
            "🎁 <b>Начисление за приглашение!</b>\n"
            "Новый пользователь: {user_name} (ID: {user_id})\n"
            "Бонус: <code>{bonus_amount}</code>"
        ),
        "spam_blocked": (
            "⛔️ <b>Обнаружен спам!</b>\n\n"
            "❌ <i>Пожалуйста, не отправляйте команды слишком часто.</i>\n\n"
            "⏳ <b>Блокировка:</b> {block_seconds} секунд\n"
            "💡 <i>Я смогу вам ответить через {block_seconds} секунд.</i>"
        ),
        "payment_error_generic": "❌ {message}",
        "payment_plan_not_found": "❌ Ошибка: Тариф не найден в системе.",
        "payment_stars_unavailable": "⚠️ Оплата через Telegram Stars временно недоступна.",
        "payment_invoice_error": "❌ Ошибка при создании счета. Попробуйте другой метод.",
        "payment_yoomoney_config": "❌ Ошибка конфигурации YooMoney. Обратитесь к администратору.",
    }


def _load_raw() -> dict[str, dict[str, str]]:
    raw = get_setting(SETTING_KEY) or ""
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError):
        logger.warning("bot_messages_json: invalid JSON, using defaults")
        return {}


def get_template_text(template_id: str) -> str:
    if template_id not in TEMPLATE_IDS:
        return ""
    stored = _load_raw().get(template_id, {})
    if isinstance(stored, dict) and (stored.get("text") or "").strip():
        return str(stored["text"])
    return _defaults().get(template_id, "")


def get_all_templates() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for tid in TEMPLATE_IDS:
        out[tid] = {"text": get_template_text(tid)}
    return out


def get_template(template_id: str) -> dict[str, str] | None:
    if template_id not in TEMPLATE_IDS:
        return None
    return {"text": get_template_text(template_id)}


def save_template(template_id: str, text: str) -> tuple[bool, str | None]:
    if template_id not in TEMPLATE_IDS:
        return False, "Неизвестный шаблон"
    body = (text or "").strip()
    if not body:
        return False, "Текст не может быть пустым"
    if len(body) > 4096:
        return False, "Текст длиннее 4096 символов (лимит Telegram)"
    stored = _load_raw()
    stored[template_id] = {"text": body}
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


def render_vars(text: str, ctx: dict[str, Any]) -> str:
    if not text:
        return ""

    def repl(match: re.Match) -> str:
        key = match.group(1)
        val = ctx.get(key)
        if val is None or val == "":
            return ""
        if key in _RAW_VARS:
            return str(val)
        return html.escape(str(val), quote=False)

    return _VAR_RE.sub(repl, text)


def render(template_id: str, ctx: dict[str, Any] | None = None) -> str:
    if template_id not in TEMPLATE_IDS:
        return ""
    text = get_template_text(template_id)
    rendered = render_vars(text, ctx or {})
    rendered = re.sub(r"\n{3,}", "\n\n", rendered).strip()
    return rendered


def sample_context(template_id: str) -> dict[str, Any]:
    samples: dict[str, dict[str, Any]] = {
        "purchase_success": {
            "action_text": "готов",
            "key_number": "1",
            "expiry_date": "04.06 18:30",
            "key_email": "user@bot",
            "connection_string": "vless://example-uuid@host:443?type=tcp#ShopBot",
        },
        "subscription_expiry": {
            "time_left": "24 часа",
            "expiry_date": "05.06.2026 в 12:00",
        },
        "welcome": {
            "channel_line": "Для доступа к функциям, пожалуйста, подпишитесь на наш канал.\n",
            "terms_line": (
                "Также необходимо принять "
                "<a href='https://example.com/terms'>Условия использования</a> и "
                "<a href='https://example.com/privacy'>Политику конфиденциальности</a>.\n"
            ),
        },
        "welcome_return": {"user_name": "Alex"},
        "topup_success": {"amount": "500.00 RUB", "balance": "1250.00 RUB"},
        "topup_amount_accepted": {"amount": "500.00"},
        "payment_processing": {"host_name": "Germany"},
        "admin_purchase": {
            "user_id": "123456789",
            "username": "@demo_user",
            "host_name": "Germany",
            "plan_name": "Premium",
            "months": "3",
            "payment_method": "Карта",
            "amount": "599.00",
            "action_label": "Новый ключ ➕",
            "today_rub": "12,450.00",
            "today_crypto": "850.00",
            "promo_block": "\n🎟 Промокод: <code>SALE10</code> (-50.00 RUB)",
        },
        "admin_topup": {
            "user_id": "123456789",
            "username": "@demo_user",
            "payment_method": "СБП",
            "amount": "500.00",
        },
        "trial_preparing": {"days": "3", "host_name": "Netherlands"},
        "referral_new_signup": {"display_name": "@friend", "user_id": "987654321"},
        "referral_start_bonus": {
            "user_name": "Friend Name",
            "user_id": "987654321",
            "bonus_amount": "20.00 RUB",
        },
        "spam_blocked": {"block_seconds": "30"},
        "payment_error_generic": {"message": "Некорректная сумма. Начните процесс заново."},
    }
    return deepcopy(samples.get(template_id, {}))
