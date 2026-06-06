from __future__ import annotations

import asyncio
import logging

from flask import current_app

from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)


def handle_promo_after_payment(metadata: dict) -> None:
    try:
        promo_code = (metadata.get('promo_code') or '').strip()
    except Exception:
        promo_code = ''
    if not promo_code:
        return
    try:
        user_id = int(metadata.get('user_id') or 0)
    except Exception:
        user_id = 0
    try:
        applied_amount = float(metadata.get('promo_discount') or 0)
    except Exception:
        applied_amount = 0.0
    order_id = metadata.get('payment_id') or metadata.get('transaction_id') or None

    promo_info = None
    availability_error = None
    try:
        promo_info = rw_repo.redeem_promo_code(promo_code, user_id, applied_amount=applied_amount, order_id=order_id)
    except Exception as e:
        logger.warning(f"Промо: не удалось активировать код {promo_code}: {e}")

    if promo_info is None:
        try:
            _, availability_error = rw_repo.check_promo_code_available(promo_code, user_id)
        except Exception as e:
            logger.warning(f"Промо: не удалось повторно проверить доступность для {promo_code}: {e}")

    should_deactivate = False
    user_limit_reached = False
    if promo_info:
        try:
            limit_total = promo_info.get('usage_limit_total') or 0
            used_total = promo_info.get('used_total') or 0
            if limit_total and used_total >= limit_total:
                should_deactivate = True
        except Exception:
            pass
        try:
            limit_user = promo_info.get('usage_limit_per_user') or 0
            user_used = promo_info.get('user_used_count') or 0
            if limit_user and user_used >= limit_user:
                user_limit_reached = True
        except Exception:
            pass
    else:
        if availability_error == "total_limit_reached":
            should_deactivate = True
        if availability_error == "user_limit_reached":
            user_limit_reached = True

    deact_ok = False
    if should_deactivate:
        try:
            deact_ok = rw_repo.update_promo_code_status(promo_code, is_active=False)
        except Exception as e:
            logger.warning(f"Промо: не удалось деактивировать код {promo_code}: {e}")
            deact_ok = False

    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        loop = current_app.config.get('EVENT_LOOP')
        try:
            admin_ids = list(rw_repo.get_admin_ids() or [])
        except Exception:
            admin_ids = []
        if bot and loop and loop.is_running() and admin_ids:
            if should_deactivate:
                status_msg = "Код отключён." if deact_ok else "Не удалось отключить код — проверьте панель."
            elif user_limit_reached:
                status_msg = "Достигнут лимит на пользователя; код остаётся активным для остальных."
            elif availability_error:
                status_msg = f"Статус: {availability_error}."
            else:
                status_msg = "Лимит не достигнут, код остаётся активным."
            text = (
                f"🎟 <b>Промокод использован</b>\n\n"
                f"🎫 Код: <code>{promo_code}</code>\n"
                f"👤 Пользователь: <code>{user_id}</code>\n"
                f"💰 Скидка: <b>{applied_amount:.2f} RUB</b>\n"
                f"📃 Статус: {status_msg}"
            )
            for aid in admin_ids:
                try:
                    asyncio.run_coroutine_threadsafe(bot.send_message(int(aid), text, parse_mode='HTML'), loop)
                except Exception:
                    continue
    except Exception:
        pass
