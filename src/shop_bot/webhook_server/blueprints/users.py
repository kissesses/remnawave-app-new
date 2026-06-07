import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from math import ceil

from flask import Response, current_app, flash, jsonify, redirect, render_template, request, session, url_for

from aiogram.utils.keyboard import InlineKeyboardBuilder
from shop_bot.bot import keyboards
from shop_bot.modules import remnawave_api

from shop_bot.data_manager.database import get_db_connection, get_plan_by_id, get_seller_user, get_setting
from shop_bot.data_manager.remnawave_repository import (
    adjust_user_balance,
    ban_user,
    delete_user_keys,
    get_balance,
    get_keys_counts_for_users,
    get_keys_for_user,
    get_referrals_for_user,
    get_user,
    get_user_keys,
    get_users_filter_counts,
    get_users_paginated,
    log_transaction,
    purge_user_account,
    unban_user,
)
from shop_bot.data_manager.db.support import get_user_tickets
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.modules.telegram_avatar import (
    fetch_telegram_avatar_bytes,
    get_telegram_avatar_file_url,
)

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('users', __name__)


@bp.route('/users')
@panel_ctx.login_required
def users_page():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    q = (request.args.get('q') or '').strip()
    filter_status = (request.args.get('filter') or 'all').strip().lower()
    if filter_status not in ('all', 'banned', 'pinned', 'with_keys', 'trial'):
        filter_status = 'all'
    try:
        user_counts = get_users_filter_counts()
    except Exception:
        user_counts = {'all': 0, 'banned': 0, 'pinned': 0, 'with_keys': 0, 'trial': 0}

    common_data = panel_ctx.get_common_template_data()
    return render_template(
        'users.html',
        users=[],
        current_page=page,
        total_pages=1,
        q=q,
        per_page=per_page,
        filter_status=filter_status,
        user_counts=user_counts,
        **common_data,
    )


def _enrich_users_list(users: list[dict]) -> list[dict]:
    user_ids = [u['telegram_id'] for u in users]
    try:
        keys_counts = get_keys_counts_for_users(user_ids)
    except Exception:
        keys_counts = {}
    for user in users:
        uid = user['telegram_id']
        try:
            user['balance'] = float(user.get('balance') or 0.0)
        except Exception:
            user['balance'] = 0.0
        user['keys_count'] = int(keys_counts.get(uid, 0) or 0)
        user['total_months'] = int(user.get('total_months') or 0)
        try:
            referrals = get_referrals_for_user(uid) or []
            user['referral_count'] = len(referrals)
        except Exception:
            user['referral_count'] = 0
    return users


def _render_users_list_partial(page: int, per_page: int, q: str, filter_status: str):
    users, total = get_users_paginated(
        page=page, per_page=per_page, q=q or None, filter_type=filter_status or 'all'
    )
    users = _enrich_users_list(users)
    list_html = render_template('partials/users_list.html', users=users)
    total_pages = ceil(total / per_page) if per_page else 1
    pagination_html = render_template(
        'partials/users_pagination.html',
        current_page=page,
        total_pages=total_pages,
        q=q,
        filter_status=filter_status,
    )
    return list_html, pagination_html, total


@bp.route('/users/table.partial')
@panel_ctx.login_required
def users_table_partial():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    q = (request.args.get('q') or '').strip()
    filter_status = (request.args.get('filter') or 'all').strip().lower()
    list_html, pagination_html, _ = _render_users_list_partial(page, per_page, q, filter_status)
    wants_json = 'application/json' in (request.headers.get('Accept') or '')
    if wants_json:
        return jsonify({"table_html": list_html, "pagination_html": pagination_html})
    return list_html


@bp.route('/users/<int:user_id>/avatar')
@panel_ctx.login_required
def user_avatar(user_id: int):
    """Proxy Telegram profile photo without exposing bot token in the browser."""
    payload = fetch_telegram_avatar_bytes(user_id)
    if not payload:
        return Response(status=404)
    data, content_type = payload
    return Response(
        data,
        mimetype=content_type,
        headers={'Cache-Control': 'private, max-age=3600'},
    )


@bp.route('/users/avatars/check.json', methods=['POST'])
@panel_ctx.login_required
def users_avatars_check():
    body = request.get_json(silent=True) or {}
    raw_ids = body.get('ids') or []
    available: dict[str, str] = {}
    for raw in raw_ids[:40]:
        try:
            uid = int(raw)
        except (TypeError, ValueError):
            continue
        if get_telegram_avatar_file_url(uid):
            available[str(uid)] = url_for('user_avatar', user_id=uid)
    return jsonify({'ok': True, 'avatars': available})


@bp.route('/users/<int:user_id>/keys.partial')
@panel_ctx.login_required
def user_keys_partial(user_id: int):
    try:
        keys = get_user_keys(user_id)
    except Exception:
        keys = []
    return render_template('partials/user_keys_table.html', keys=keys)


@bp.route('/users/<int:user_id>/referrals.json')
@panel_ctx.login_required
def user_referrals_json(user_id: int):
    try:
        refs = get_referrals_for_user(user_id) or []
        return jsonify({"ok": True, "items": refs, "count": len(refs)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@bp.route('/users/pagination.partial')
@panel_ctx.login_required
def users_pagination_partial():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    q = (request.args.get('q') or '').strip()
    filter_status = (request.args.get('filter') or 'all').strip().lower()
    _, total = get_users_paginated(page=page, per_page=per_page, q=q or None, filter_type=filter_status)
    total_pages = ceil(total / per_page) if per_page else 1
    return render_template(
        'partials/users_pagination.html',
        current_page=page,
        total_pages=total_pages,
        q=q,
        filter_status=filter_status,
    )

@bp.route('/users/<int:user_id>/balance/adjust', methods=['POST'])
@panel_ctx.login_required
def adjust_balance_route(user_id: int):
    try:
        delta = float(request.form.get('delta', '0') or '0')
    except ValueError:

        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify({"ok": False, "error": "invalid_amount"}), 400
        flash('Некорректная сумма изменения баланса.', 'danger')
        return redirect(url_for('users_page'))

    old_balance = get_balance(user_id)
    ok = adjust_user_balance(user_id, delta)
    if ok:
        try:
            new_balance = get_balance(user_id)
            target_user = get_user(user_id) or {}
            log_transaction(
                username=target_user.get('username') or f"@{user_id}",
                transaction_id=None,
                payment_id=f"admin-balance-{uuid.uuid4()}",
                user_id=user_id,
                status='paid',
                amount_rub=abs(float(delta)),
                amount_currency=None,
                currency_name=None,
                payment_method='Admin',
                metadata=json.dumps({
                    "action": "admin_balance_adjust",
                    "delta": float(delta),
                    "old_balance": float(old_balance or 0),
                    "new_balance": float(new_balance or 0),
                    "admin_login": session.get('panel_login') or "panel",
                    "reason": "manual_panel_adjustment"
                }, ensure_ascii=False)
            )
        except Exception as e:
            logger.warning(f"Не удалось записать историю изменения баланса для {user_id}: {e}")
    message = 'Баланс изменён.' if ok else 'Не удалось изменить баланс.'
    category = 'success' if ok else 'danger'
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": ok, "message": message})
    flash(message, category)

    try:
        if ok:
            bot = panel_ctx.bot_controller.get_bot_instance()
            if bot:
                sign = '+' if delta >= 0 else ''
                text = f"💳 Ваш баланс был изменён администратором: {sign}{delta:.2f} RUB\nТекущий баланс: {get_balance(user_id):.2f} RUB"
                loop = current_app.config.get('EVENT_LOOP')
                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(bot.send_message(chat_id=user_id, text=text), loop)
                    logger.info(f"Запланирована отправка уведомления о балансе пользователю {user_id}")
                else:

                    logger.warning("Цикл событий (EVENT_LOOP) не запущен; использую резервный asyncio.run для уведомления о балансе")
                    asyncio.run(bot.send_message(chat_id=user_id, text=text))
                try:
                    from shop_bot.data_manager import telegram_notify as tg_notify
                    admin_login = session.get('panel_login') or 'panel'
                    crm_text = (
                        f"💼 <b>Изменение баланса</b>\n"
                        f"👤 Пользователь: <code>{user_id}</code>\n"
                        f"Δ {sign}{delta:.2f} RUB → {get_balance(user_id):.2f} RUB\n"
                        f"Админ: <code>{admin_login}</code>"
                    )
                    tg_notify.send_notification_sync(bot, loop, tg_notify.CATEGORY_CRM, crm_text)
                except Exception as crm_exc:
                    logger.warning(f"CRM notify balance adjust failed: {crm_exc}")
            else:
                logger.warning("Экземпляр бота отсутствует; не могу отправить уведомление о балансе")
    except Exception as e:
        logger.warning(f"Не удалось отправить уведомление о балансе: {e}")
    return redirect(url_for('users_page'))

@bp.route('/users/<int:user_id>/balance/clear-history', methods=['POST'])
@panel_ctx.login_required
def clear_balance_history_route(user_id: int):
    """Delete all balance-related transaction history for a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM transactions 
                WHERE user_id = ? 
                AND (
                    LOWER(COALESCE(payment_method, '')) IN ('balance', 'admin')
                    OR LOWER(COALESCE(metadata, '')) LIKE '%"action": "topup"%'
                    OR LOWER(COALESCE(metadata, '')) LIKE '%"action": "top_up"%'
                    OR LOWER(COALESCE(metadata, '')) LIKE '%admin_balance_adjust%'
                    OR LOWER(COALESCE(metadata, '')) LIKE '%referral_bonus%'
                    OR LOWER(COALESCE(metadata, '')) LIKE '%referral_start_bonus%'
                )
            """, (user_id,))
            deleted_count = cursor.rowcount
            conn.commit()
        
        logger.info(f"Cleared {deleted_count} balance transactions for user {user_id}")
        return jsonify({"ok": True, "message": f"История очищена ({deleted_count} зап.)"})
    except Exception as e:
        logger.error(f"Failed to clear balance history for user {user_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/users/<int:user_id>/payments/clear-history', methods=['POST'])
@panel_ctx.login_required
def clear_payment_history_route(user_id: int):
    """Delete all external payment transaction history for a user (not balance, not topup)"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM transactions 
                WHERE user_id = ? 
                AND LOWER(COALESCE(payment_method, '')) NOT IN ('balance', 'admin')
                AND LOWER(COALESCE(metadata, '')) NOT LIKE '%admin_balance_adjust%'
                AND LOWER(COALESCE(metadata, '')) NOT LIKE '%referral_bonus%'
                AND LOWER(COALESCE(metadata, '')) NOT LIKE '%referral_start_bonus%'
            """, (user_id,))
            deleted_count = cursor.rowcount
            conn.commit()
        
        logger.info(f"Cleared {deleted_count} payment transactions for user {user_id}")
        return jsonify({"ok": True, "message": f"История очищена ({deleted_count} зап.)"})
    except Exception as e:
        logger.error(f"Failed to clear payment history for user {user_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/users/<int:user_id>/details.json')
@panel_ctx.login_required
def user_details_json(user_id: int):
    """Fetch detailed user information for the details modal"""
    try:
        
        user = get_user(user_id)
        if not user:
            return jsonify({"ok": False, "error": "user_not_found"}), 404
        
        
        referrals = get_referrals_for_user(user_id) or []
        
        
        referred_by_user = None
        if user.get('referred_by'):
            try:
                referred_by_user = get_user(user.get('referred_by'))
            except Exception:
                pass
        
        
        payment_history = []
        balance_history = []
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT transaction_id, payment_id, username, created_date, amount_rub, amount_currency, currency_name, metadata, status, payment_method
                    FROM transactions
                    WHERE user_id = ? 
                    ORDER BY created_date DESC
                    LIMIT 150
                """, (user_id,))
                rows = cursor.fetchall()
                
                def _safe_float(value, default=0.0):
                    try:
                        return float(value or default)
                    except Exception:
                        return default

                def _action_label(action, payment_method):
                    action_norm = (action or '').strip().lower()
                    method_norm = (payment_method or '').strip().lower()
                    if action_norm in ('topup', 'top_up'):
                        return 'Пополнение баланса'
                    if action_norm == 'admin_balance_adjust':
                        return 'Ручное изменение баланса'
                    if action_norm in ('referral_bonus', 'referral_start_bonus'):
                        return 'Реферальное начисление'
                    if method_norm == 'balance':
                        return 'Оплата с баланса'
                    if action_norm == 'new':
                        return 'Покупка нового ключа'
                    if action_norm == 'extend':
                        return 'Продление ключа'
                    return 'Внешняя оплата'

                def _method_label(payment_method):
                    mapping = {
                        'balance': 'Баланс',
                        'yookassa': 'ЮKassa',
                        'platega': 'Platega',
                        'platega crypto': 'Platega Crypto',
                        'cryptobot': 'CryptoBot',
                        'heleket': 'Heleket',
                        'ton connect': 'TON Connect',
                        'telegram stars': 'Telegram Stars',
                        'admin': 'Админ-панель',
                        'referral': 'Реферальный бонус',
                        'yoomoney': 'ЮMoney',
                    }
                    raw = payment_method or 'N/A'
                    return mapping.get(str(raw).strip().lower(), raw)

                def _plan_name(meta):
                    plan_name = meta.get('plan_name')
                    if plan_name:
                        return plan_name
                    plan_id = meta.get('plan_id')
                    if plan_id:
                        try:
                            plan = get_plan_by_id(int(plan_id))
                            if plan:
                                return plan.get('plan_name') or f"Тариф #{plan_id}"
                        except Exception:
                            return f"Тариф #{plan_id}"
                    return '—'

                for row in rows:
                    pm_raw = row['payment_method'] or 'N/A'
                    pm = str(pm_raw).strip().lower()
                    meta = {}
                    try:
                        meta = json.loads(row['metadata'] or '{}')
                        if not isinstance(meta, dict):
                            meta = {}
                    except Exception:
                        pass
                        
                    action = (meta.get('action') or '').strip()
                    action_norm = action.lower()
                    host_name = meta.get('host_name') or meta.get('host') or '—'
                    plan_name = _plan_name(meta)
                    amount = _safe_float(row['amount_rub'])
                    delta = _safe_float(meta.get('delta'), amount)
                    status_norm = (row['status'] or '').strip().lower()
                    is_success = status_norm in ('paid', 'completed', 'success')
                    is_topup = action_norm in ('topup', 'top_up')
                    is_admin_balance = action_norm == 'admin_balance_adjust' or pm == 'admin'
                    is_referral_bonus = action_norm in ('referral_bonus', 'referral_start_bonus')
                    is_balance_payment = pm == 'balance'

                    details = []
                    if plan_name and plan_name != '—':
                        details.append(f"Тариф: {plan_name}")
                    if host_name and host_name != '—':
                        details.append(f"Хост: {host_name}")
                    if meta.get('months'):
                        details.append(f"Месяцев: {meta.get('months')}")
                    if meta.get('key_id'):
                        details.append(f"Ключ ID: {meta.get('key_id')}")
                    if meta.get('plan_id'):
                        details.append(f"Тариф ID: {meta.get('plan_id')}")
                    if meta.get('customer_email'):
                        details.append(f"Email: {meta.get('customer_email')}")
                    if meta.get('tier_device_count'):
                        details.append(f"Устройства: {meta.get('tier_device_count')}")
                    if meta.get('tier_price'):
                        details.append(f"Доплата за устройства: {meta.get('tier_price')} RUB")
                    if meta.get('promo_code'):
                        details.append(f"Промокод: {meta.get('promo_code')}")
                    if meta.get('promo_discount'):
                        details.append(f"Скидка: {meta.get('promo_discount')} RUB")
                    if meta.get('old_balance') is not None or meta.get('new_balance') is not None:
                        details.append(f"Баланс: {meta.get('old_balance', '—')} → {meta.get('new_balance', '—')} RUB")
                    if meta.get('source_user_id'):
                        details.append(f"Источник: {meta.get('source_username') or 'N/A'} ({meta.get('source_user_id')})")
                    if meta.get('source_payment_id'):
                        details.append(f"Платёж источника: {meta.get('source_payment_id')}")
                    if meta.get('reason'):
                        details.append(f"Причина: {meta.get('reason')}")

                    base_item = {
                        'transaction_id': row['transaction_id'],
                        'payment_id': row['payment_id'],
                        'username': row['username'],
                        'date': row['created_date'],
                        'status': row['status'],
                        'payment_method': pm_raw,
                        'method_label': _method_label(pm_raw),
                        'amount': amount,
                        'amount_currency': row['amount_currency'],
                        'currency_name': row['currency_name'],
                        'action': action or None,
                        'action_label': _action_label(action, pm_raw),
                        'plan': plan_name,
                        'host': host_name,
                        'key_id': meta.get('key_id'),
                        'plan_id': meta.get('plan_id'),
                        'months': meta.get('months'),
                        'customer_email': meta.get('customer_email'),
                        'promo_code': meta.get('promo_code'),
                        'promo_discount': meta.get('promo_discount'),
                        'tier_device_count': meta.get('tier_device_count'),
                        'tier_price': meta.get('tier_price'),
                        'old_balance': meta.get('old_balance'),
                        'new_balance': meta.get('new_balance'),
                        'delta': meta.get('delta'),
                        'source_user_id': meta.get('source_user_id'),
                        'source_username': meta.get('source_username'),
                        'source_action': meta.get('source_action'),
                        'source_payment_id': meta.get('source_payment_id'),
                        'source_amount': meta.get('source_amount'),
                        'reason': meta.get('reason'),
                        'details': details,
                        'metadata': meta,
                    }
                    
                    if is_success and (is_topup or is_admin_balance or is_referral_bonus or is_balance_payment):
                        balance_item = dict(base_item)
                        if is_balance_payment:
                            balance_item['amount'] = -abs(amount)
                        elif is_admin_balance:
                            balance_item['amount'] = delta
                        else:
                            balance_item['amount'] = abs(amount)
                        balance_item['type'] = balance_item['action_label']
                        balance_history.append(balance_item)
                        
                    if not is_balance_payment and not is_admin_balance and not is_referral_bonus:
                        payment_item = dict(base_item)
                        payment_item['type'] = payment_item['action_label']
                        payment_history.append(payment_item)

        except Exception as e:
            logger.error(f"Failed to get history for user {user_id}: {e}")
        
        subscriptions = []
        subs_stats = {
            "total": 0,
            "active": 0,
            "expired": 0
        }
        try:
            keys = get_keys_for_user(user_id) or []
            subs_stats["total"] = len(keys)
            now = get_msk_time().replace(tzinfo=None)
            
            for key in keys:
                expire_at_str = key.get('expire_at')
                is_expired = False
                days_left = 0
                expire_date_fmt = 'N/A'
                
                if expire_at_str:
                    try:
                        expire_dt = datetime.strptime(str(expire_at_str), "%Y-%m-%d %H:%M:%S")
                        expire_date_fmt = expire_dt.strftime("%Y-%m-%d %H:%M:%S")
                        
                        if expire_dt > now:
                            delta = expire_dt - now
                            days_left = delta.days
                            subs_stats["active"] += 1
                        else:
                            is_expired = True
                            subs_stats["expired"] += 1
                    except Exception:
                        pass
                else:
                    subs_stats["active"] += 1
                    days_left = 9999 
                
                status_text = f"Осталось дней: {days_left}" if not is_expired else "ИСТЕК"
                
                subscriptions.append({
                    "key_id": key.get('key_id'),
                    "key": key.get('subscription_url') or key.get('access_url') or 'N/A',
                    "host_name": key.get('host_name') or 'N/A',
                    "status_text": status_text,
                    "expire_date": expire_date_fmt,
                    "is_expired": is_expired,
                    "email": key.get('email') or key.get('key_email') or 'N/A',
                    "remnawave_user_uuid": key.get('remnawave_user_uuid') or 'N/A',
                    "user_comment": key.get('comment_key') or '',
                    "admin_comment": key.get('description') or key.get('comment') or ''
                })
                
        except Exception as e:
            logger.error(f"Failed to get subscriptions for user {user_id}: {e}")

        
        try:
            user_tickets = get_user_tickets(user_id) or []
        except Exception:
            user_tickets = []

        activity: list[dict] = []
        try:
            from shop_bot.webhook_server.services.user_timeline import build_user_timeline, compact_activity
            tl = build_user_timeline(user_id, limit=150)
            if tl.get('ok'):
                activity = compact_activity(tl.get('events') or [], limit=120)
        except Exception as e:
            logger.warning('timeline compact for %s: %s', user_id, e)

        result = {
            "ok": True,
            "user": {
                "telegram_id": user.get('telegram_id'),
                "username": user.get('username'),
                "registration_date": user.get('registration_date'),
                "balance": float(user.get('balance') or 0),
                "referral_balance": float(user.get('referral_balance') or 0),
                "referral_balance_all": float(user.get('referral_balance_all') or 0),
                "total_spent": float(user.get('total_spent') or 0),
                "total_months": int(user.get('total_months') or 0),
                "trial_used": bool(user.get('trial_used')),
                "is_pinned": bool(user.get('is_pinned')),
                "is_banned": bool(user.get('is_banned')),
                "auth_email": user.get('auth_email') or '',
                "avatar_url": url_for('user_avatar', user_id=user_id)
                    if get_telegram_avatar_file_url(user_id) else None,
                "referral_code": f"ref_{user_id}",
                "referral_count": len(referrals),
                "referred_by": {
                    "telegram_id": referred_by_user.get('telegram_id') if referred_by_user else None,
                    "username": referred_by_user.get('username') if referred_by_user else None
                } if referred_by_user else None
            },
            "support_tickets": [
                {
                    "ticket_id": t.get('ticket_id'),
                    "subject": t.get('subject') or 'Без темы',
                    "status": t.get('status') or 'open',
                    "updated_at": t.get('updated_at') or t.get('created_at'),
                }
                for t in user_tickets[:10]
            ],
            "support_tickets_count": len(user_tickets),
            "payment_history": payment_history,
            "balance_history": balance_history,
            "subscriptions": subscriptions,
            "subs_stats": subs_stats,
            "activity": activity,
            "seller_info": {
                "active": bool(user.get('seller_active', 0)),
                "settings": get_seller_user(user_id) or {
                    "seller_sale": 0.0,
                    "sellr_ref": 0.0,
                    "seller_uuid": "0"
                }
            }
        }
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Failed to get user details for {user_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


@bp.route('/users/<int:user_id>/timeline')
@panel_ctx.login_required
def user_timeline_page(user_id: int):
    user = get_user(user_id)
    if not user:
        flash('Пользователь не найден', 'danger')
        return redirect(url_for('users_page'))
    avatar_url = url_for('user_avatar', user_id=user_id) if get_telegram_avatar_file_url(user_id) else None
    return render_template(
        'user_timeline.html',
        user_id=user_id,
        user=user,
        avatar_url=avatar_url,
    )


@bp.route('/users/<int:user_id>/timeline.json')
@panel_ctx.login_required
def user_timeline_json(user_id: int):
    from shop_bot.webhook_server.services.user_timeline import CATEGORIES, build_user_timeline

    category = (request.args.get('category') or 'all').strip().lower()
    q = (request.args.get('q') or '').strip()
    date_from = (request.args.get('from') or '').strip()
    date_to = (request.args.get('to') or '').strip()
    try:
        limit = min(max(int(request.args.get('limit') or 60), 1), 200)
        offset = max(int(request.args.get('offset') or 0), 0)
    except (TypeError, ValueError):
        limit, offset = 60, 0

    payload = build_user_timeline(
        user_id,
        category=category,
        q=q,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    if not payload.get('ok'):
        return jsonify(payload), 404
    payload['categories'] = CATEGORIES
    if payload.get('user'):
        payload['user']['avatar_url'] = (
            url_for('user_avatar', user_id=user_id)
            if get_telegram_avatar_file_url(user_id) else None
        )
    return jsonify(payload)


@bp.route('/users/<int:user_id>/timeline/export.json')
@panel_ctx.login_required
def user_timeline_export(user_id: int):
    from shop_bot.webhook_server.services.user_timeline import export_user_timeline

    category = (request.args.get('category') or 'all').strip().lower()
    q = (request.args.get('q') or '').strip()
    date_from = (request.args.get('from') or '').strip()
    date_to = (request.args.get('to') or '').strip()

    payload = export_user_timeline(
        user_id,
        category=category,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )
    if not payload.get('ok'):
        return jsonify(payload), 404
    return jsonify({
        'ok': True,
        'user_id': user_id,
        'exported_at': get_msk_time().strftime('%Y-%m-%d %H:%M:%S'),
        'filters': {
            'category': category,
            'q': q,
            'from': date_from,
            'to': date_to,
        },
        'events': payload.get('events') or [],
        'stats': payload.get('stats') or {},
        'total': payload.get('total'),
        'exported_count': payload.get('exported_count') or len(payload.get('events') or []),
    })


@bp.route('/users/<int:user_id>/trial/toggle', methods=['POST'])
@panel_ctx.login_required
def toggle_trial_used_route(user_id: int):
    """Toggle trial_used status for a user"""
    try:
        user = get_user(user_id)
        if not user:
            return jsonify({"ok": False, "error": "user_not_found"}), 404
        
        current_status = bool(user.get('trial_used'))
        new_status = not current_status
        
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET trial_used = ? WHERE telegram_id = ?",
                (1 if new_status else 0, user_id)
            )
            conn.commit()
        
        return jsonify({
            "ok": True,
            "trial_used": new_status,
            "message": f"Пробный период {'использован' if new_status else 'не использован'}"
        })
    except Exception as e:
        logger.error(f"Failed to toggle trial for user {user_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/users/ban/<int:user_id>', methods=['POST'])
@panel_ctx.login_required
def ban_user_route(user_id):
    ban_user(user_id)
    panel_ctx.audit('user.ban', {'user_id': user_id})
    flash(f'Пользователь {user_id} был заблокирован.', 'success')

    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        if bot:
            text = "🚫 Ваш аккаунт заблокирован администратором. Если это ошибка — напишите в поддержку."

            try:
                support = (get_setting("support_bot_username") or get_setting("support_user") or "").strip()
            except Exception:
                support = ""
            kb = InlineKeyboardBuilder()
            url: str | None = None
            if support:
                if support.startswith("@"):
                    url = f"tg://resolve?domain={support[1:]}"
                elif support.startswith("tg://"):
                    url = support
                elif support.startswith("http://") or support.startswith("https://"):
                    try:
                        part = support.split("/")[-1].split("?")[0]
                        if part:
                            url = f"tg://resolve?domain={part}"
                    except Exception:
                        url = support
                else:
                    url = f"tg://resolve?domain={support}"
            if url:
                kb.button(text="🆘 Написать в поддержку", url=url)
            else:
                kb.button(text="🆘 Поддержка", callback_data="show_help")
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    bot.send_message(chat_id=user_id, text=text, reply_markup=kb.as_markup()),
                    loop
                )
            else:
                asyncio.run(bot.send_message(chat_id=user_id, text=text, reply_markup=kb.as_markup()))
    except Exception as e:
        logger.warning(f"Не удалось отправить уведомление о бане пользователю {user_id}: {e}")

    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": True, "message": f'Пользователь {user_id} был заблокирован.'})

    return redirect(url_for('users_page'))

@bp.route('/users/toggle-block/<int:user_id>', methods=['POST'])
@panel_ctx.login_required
def toggle_block_user_route(user_id):
    user = get_user(user_id)
    if not user:
        return jsonify({"ok": False, "error": "Пользователь не найден"}), 404
    is_banned = bool(user.get('is_banned', False))
    if is_banned:
        unban_user(user_id)
        msg = f"Пользователь {user_id} разблокирован."
        res_ok = True
    else:
        ban_user(user_id)
        msg = f"Пользователь {user_id} заблокирован."
        res_ok = True
    
    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        if bot:
            if is_banned:
                text = "✅ Доступ к аккаунту восстановлен администратором."
                kb = InlineKeyboardBuilder().row(keyboards.get_main_menu_button()).as_markup()
            else:
                text = "🚫 Ваш аккаунт заблокирован администратором."
                kb = None
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(bot.send_message(chat_id=user_id, text=text, reply_markup=kb), loop)
    except Exception: pass

    return jsonify({"ok": res_ok, "message": msg, "is_banned": not is_banned})

@bp.route('/users/toggle-pin/<int:user_id>', methods=['POST'])
@panel_ctx.login_required
def toggle_pin_user_route(user_id):
    from shop_bot.data_manager.database import toggle_user_pin
    ok = toggle_user_pin(user_id)
    return jsonify({"ok": ok})

@bp.route('/users/unban/<int:user_id>', methods=['POST'])
@panel_ctx.login_required
def unban_user_route(user_id):
    unban_user(user_id)
    flash(f'Пользователь {user_id} был разблокирован.', 'success')

    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        if bot:
            kb = InlineKeyboardBuilder()
            kb.row(keyboards.get_main_menu_button())
            text = "✅ Доступ к аккаунту восстановлен администратором."
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    bot.send_message(chat_id=user_id, text=text, reply_markup=kb.as_markup()),
                    loop
                )
            else:
                asyncio.run(bot.send_message(chat_id=user_id, text=text, reply_markup=kb.as_markup()))
    except Exception as e:
        logger.warning(f"Не удалось отправить уведомление о разбане пользователю {user_id}: {e}")

    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": True, "message": f'Пользователь {user_id} был разблокирован.'})

    return redirect(url_for('users_page'))

@bp.route('/users/revoke/<int:user_id>', methods=['POST'])
@panel_ctx.login_required
def revoke_keys_route(user_id):
    keys_to_revoke = get_user_keys(user_id)
    success_count = 0
    total = len(keys_to_revoke)

    for key in keys_to_revoke:
        result = asyncio.run(remnawave_api.delete_client_on_host(key['host_name'], key['key_email']))
        if result:
            success_count += 1


    delete_user_keys(user_id)


    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        if bot:
            text = (
                "❌ Ваши VPN‑ключи были отозваны администратором.\n"
                f"Всего ключей: {total}\n"
                f"Отозвано: {success_count}"
            )
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(bot.send_message(chat_id=user_id, text=text), loop)
            else:
                asyncio.run(bot.send_message(chat_id=user_id, text=text))
    except Exception:
        pass

    message = (
        f"Все {total} ключей для пользователя {user_id} были успешно отозваны." if success_count == total
        else f"Удалось отозвать {success_count} из {total} ключей для пользователя {user_id}. Проверьте логи."
    )
    category = 'success' if success_count == total else 'warning'


    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": success_count == total, "message": message, "revoked": success_count, "total": total}), 200

    flash(message, category)
    return redirect(url_for('users_page'))

@bp.route('/users/<int:user_id>/delete', methods=['POST'])
@panel_ctx.login_required
def delete_user_route(user_id: int):
    user = get_user(user_id)
    if not user:
        return jsonify({'ok': False, 'error': 'Пользователь не найден'}), 404

    keys_to_revoke = get_user_keys(user_id)
    revoked = 0
    for key in keys_to_revoke:
        try:
            result = asyncio.run(remnawave_api.delete_client_on_host(key['host_name'], key['key_email']))
            if result:
                revoked += 1
        except Exception as e:
            logger.warning('delete user: revoke key failed %s: %s', key.get('key_id'), e)

    delete_user_keys(user_id)
    ok = purge_user_account(user_id)
    if ok:
        panel_ctx.audit('user.delete', {'user_id': user_id, 'username': user.get('username'), 'keys_revoked': revoked})
        return jsonify({
            'ok': True,
            'message': f'Пользователь {user_id} удалён из базы',
            'keys_revoked': revoked,
            'keys_total': len(keys_to_revoke),
        })
    return jsonify({'ok': False, 'error': 'Не удалось удалить пользователя'}), 500

@bp.route('/users/<int:user_id>/send-message', methods=['POST'])
@panel_ctx.login_required
def send_user_message_route(user_id):
    """Send a message to a user via bot"""
    try:
        message_text = request.form.get('message', '').strip()
        
        if not message_text:
            return jsonify({'ok': False, 'error': 'Сообщение не может быть пустым'}), 400
        
        
        bot = panel_ctx.bot_controller.get_bot_instance()
        if not bot:
            return jsonify({'ok': False, 'error': 'Бот недоступен'}), 500
        
        
        loop = current_app.config.get('EVENT_LOOP')
        if not loop or not loop.is_running():
            return jsonify({'ok': False, 'error': 'Event loop недоступен'}), 500
        
        
        async def send_message():
            try:
                await bot.send_message(chat_id=user_id, text=message_text)
                return True
            except Exception as e:
                logger.error(f"Failed to send message to user {user_id}: {e}")
                return False
        
        
        future = asyncio.run_coroutine_threadsafe(send_message(), loop)
        success = future.result(timeout=10)
        
        if success:
            logger.info(f"Message sent to user {user_id}")
            return jsonify({'ok': True, 'message': 'Сообщение успешно отправлено'})
        else:
            return jsonify({'ok': False, 'error': 'Не удалось отправить сообщение'}), 500
            
    except Exception as e:
        logger.error(f"Error sending message to user {user_id}: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
