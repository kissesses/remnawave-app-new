"""Shared referral reward helpers for bot and panel."""

from __future__ import annotations

import logging
import re
from decimal import Decimal
from typing import Any

from shop_bot.data_manager.database import get_setting
from shop_bot.data_manager.remnawave_repository import (
    add_to_balance,
    add_to_referral_balance,
    add_to_referral_balance_all,
)

logger = logging.getLogger(__name__)

WITHDRAW_CMD_RE = re.compile(
    r"^/(?P<action>approve_withdraw|decline_withdraw)(?:@[\w]+)?(?:_(?P<uid>\d+)| (?P<uid2>\d+))\s*$",
    re.IGNORECASE,
)

WITHDRAW_CMD_INCOMPLETE_RE = re.compile(
    r"^/(?P<action>approve_withdraw|decline_withdraw)(?:@[\w]+)?\s*$",
    re.IGNORECASE,
)

DEFAULT_SHARE_MESSAGE = (
    "🔥 ТВОЯ ЛИЧНАЯ СКИДКА {discount}%!\n\n"
    "Тебе открыт доступ к закрытому VPN. 🤫\n"
    "🚀 YouTube 4K | 🌐 Много стран | 🛡 Анонимность\n\n"
    "👇 ЗАБИРАЙ, ПОКА НЕ СГОРЕЛО! 👇"
)


def referrals_enabled() -> bool:
    return (get_setting("enable_referrals") or "true").strip().lower() == "true"


def notify_on_bonus() -> bool:
    val = (get_setting("referral_notify_bonus") or "true").strip().lower()
    return val in ("true", "1", "yes")


def payout_mode() -> str:
    mode = (get_setting("referral_payout_mode") or "main_balance").strip().lower()
    return mode if mode in ("main_balance", "referral_balance") else "main_balance"


def minimum_withdrawal_amount() -> float:
    try:
        return float(get_setting("minimum_withdrawal") or "100")
    except (TypeError, ValueError):
        return 100.0


def parse_withdraw_command(text: str | None) -> tuple[str, int] | None:
    """Parse /approve_withdraw_123456789 or /approve_withdraw 123456789."""
    if not text:
        return None
    m = WITHDRAW_CMD_RE.match(text.strip())
    if not m:
        return None
    uid_raw = m.group("uid") or m.group("uid2")
    if not uid_raw:
        return None
    try:
        return m.group("action").lower(), int(uid_raw)
    except (TypeError, ValueError):
        return None


def withdraw_command_help(action: str = "approve_withdraw") -> str:
    return (
        f"Формат: <code>/{action}_TELEGRAM_ID</code> "
        f"или <code>/{action} TELEGRAM_ID</code>\n"
        f"Пример: <code>/{action}_123456789</code>"
    )


def render_share_message(discount: str | int | float | None = None) -> str:
    disc = str(discount if discount is not None else (get_setting("referral_discount") or "0"))
    template = (get_setting("referral_share_message") or "").strip() or DEFAULT_SHARE_MESSAGE
    return template.replace("{discount}", disc)


def render_program_extra() -> str:
    extra = (get_setting("referral_program_extra") or "").strip()
    return f"\n\n{extra}" if extra else ""


def credit_referrer(referrer_id: int, amount: float) -> bool:
    """Credit referrer according to payout mode; always updates lifetime stats."""
    if amount <= 0:
        return False
    ok = False
    mode = payout_mode()
    if mode == "referral_balance":
        add_to_referral_balance(referrer_id, amount)
        ok = True
    else:
        ok = bool(add_to_balance(referrer_id, amount))
    try:
        add_to_referral_balance_all(referrer_id, amount)
    except Exception as exc:
        logger.warning("referral_balance_all update failed for %s: %s", referrer_id, exc)
    return ok


def compute_purchase_reward(price: float | Decimal, seller_percent: Decimal | None = None) -> Decimal:
    if seller_percent is not None and seller_percent > 0:
        return (Decimal(str(price)) * seller_percent / 100).quantize(Decimal("0.01"))
    rtype = (get_setting("referral_reward_type") or "percent_purchase").strip()
    if rtype == "fixed_purchase":
        return Decimal(str(get_setting("fixed_referral_bonus_amount") or "50")).quantize(Decimal("0.01"))
    if rtype == "percent_purchase":
        pct = Decimal(str(get_setting("referral_percentage") or "0"))
        return (Decimal(str(price)) * pct / 100).quantize(Decimal("0.01"))
    return Decimal("0")


async def maybe_notify_referrer(bot: Any, referrer_id: int, text: str) -> None:
    if not bot or not notify_on_bonus():
        return
    try:
        await bot.send_message(int(referrer_id), text)
    except Exception:
        logger.debug("referral notify failed for %s", referrer_id, exc_info=True)
