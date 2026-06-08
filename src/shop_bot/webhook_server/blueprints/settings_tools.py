"""Settings tab API routes (broadcast, promo, logs, webapp)."""

from __future__ import annotations

import re

from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('settings_tools', __name__)


def clean_ansi(text):
    if not text:
        return ""
    ansi_escape = re.compile(
        r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])|\x1B\(B|\x1B\][0-2];[^\x07]*\x07"
    )
    return ansi_escape.sub("", text)


import os
import json
import asyncio
import logging
import uuid
import threading
from datetime import datetime, timezone, timedelta
from flask import render_template, request, jsonify, current_app, flash, redirect, url_for, session
from werkzeug.utils import secure_filename
from aiogram.types import FSInputFile
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter, TelegramAPIError
from shop_bot.webhook_server.modules.broadcast_presets import get_broadcast_presets_payload
from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager.db.broadcast import (
    REASON_LABELS,
    STATUS_LABELS,
    create_broadcast_run,
    finish_broadcast_run,
    get_broadcast_deliveries,
    get_broadcast_delivery_stats,
    get_broadcast_run,
    list_broadcast_runs,
    save_broadcast_deliveries,
)

logger = logging.getLogger(__name__)

def get_msk_time() -> datetime:
    return datetime.now(timezone(timedelta(hours=3)))

def parse_expire_dt(expire_at) -> datetime:
    if not expire_at: return None
    try:
        if isinstance(expire_at, (int, float)):
            return datetime.fromtimestamp(expire_at / 1000, tz=timezone.utc)
        if isinstance(expire_at, str):
            if expire_at.isdigit():
                return datetime.fromtimestamp(int(expire_at) / 1000, tz=timezone.utc)
            try:
                dt = datetime.fromisoformat(expire_at.replace('Z', '+00:00'))
            except ValueError:
                dt = datetime.strptime(expire_at, "%Y-%m-%d %H:%M:%S")
            
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone(timedelta(hours=3)))
            return dt
    except: pass
    return None

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm'}
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'modules', 'img')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

broadcast_progress = {}
broadcast_lock = threading.Lock()
scheduler = None

# ===== ПРОВЕРКА ДОПУСТИМОГО ФАЙЛА =====
# Проверяет, имеет ли файл разрешенное расширение
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
# ===== Конец функции allowed_file =====

def _resolve_broadcast_media_path(filename: str) -> str | None:
    """Resolve uploaded broadcast media path safely (no path traversal)."""
    if not filename:
        return None
    safe_name = secure_filename(os.path.basename(filename))
    if not safe_name or safe_name in (".", ".."):
        return None
    base = os.path.realpath(UPLOAD_FOLDER)
    candidate = os.path.realpath(os.path.join(UPLOAD_FOLDER, safe_name))
    if not candidate.startswith(base + os.sep):
        return None
    return candidate if os.path.isfile(candidate) else None
# ===== Конец функции _resolve_broadcast_media_path =====

# ===== ОПРЕДЕЛЕНИЕ ТИПА МЕДИА =====
# Возвращает тип контента (фото, анимация, видео) на основе расширения
def get_media_type(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    if ext in {'png', 'jpg', 'jpeg'}: return 'photo'
    if ext == 'gif': return 'animation'
    if ext in {'mp4', 'webm'}: return 'video'
    return None
# ===== Конец функции get_media_type =====

# ===== ПОЛУЧЕНИЕ SSH СЕРВЕРА =====
# Извлекает данные хоста или SSH-цели по имени
def get_bot_instance_safe():
    from shop_bot.webhook_server.context import panel_ctx
    bot = panel_ctx.bot_controller.get_bot_instance() if panel_ctx.bot_controller else None
    if not bot:
        return None, (jsonify({'ok': False, 'error': 'Основной бот не запущен. Запустите его в панели управления и повторите попытку.'}), 503)
    return bot, None
# ===== Конец функции get_bot_instance_safe =====

# ===== ПОЛУЧЕНИЕ ID АДМИНИСТРАТОРА =====
# Извлекает Telegram ID администратора из базы данных
def get_admin_id_safe():
    admin_id = rw_repo.get_setting('admin_telegram_id')
    if not admin_id: return None, (jsonify({'ok': False, 'error': 'ID администратора не настроен'}), 400)
    return admin_id, None
# ===== Конец функции get_admin_id_safe =====

# ===== ВАЛИДАЦИЯ ПАРАМЕТРОВ ПРОМОКОДА =====
# Проверяет корректность введенных данных для создания промокода
def validate_promo_params(form_data):
    try:
        promo_type = form_data.get('promo_type', 'discount')
        discount_type = form_data.get('discount_type', 'percent')
        discount_value = form_data.get('discount_value')
        reward_value = form_data.get('reward_value')
        usage_limit_total = form_data.get('usage_limit_total')
        usage_limit_per_user = form_data.get('usage_limit_per_user')
        valid_from = form_data.get('valid_from')
        valid_until = form_data.get('valid_until')
        description = form_data.get('description', '')

        discount_percent = None
        discount_amount = None
        reward_val_int = 0

        if promo_type == 'discount':
            if not discount_value: return None, (jsonify({'ok': False, 'error': 'Значение скидки обязательно'}), 400)
            try: discount_value = float(discount_value)
            except ValueError: return None, (jsonify({'ok': False, 'error': 'Некорректное значение скидки'}), 400)
            if discount_value <= 0: return None, (jsonify({'ok': False, 'error': 'Скидка должна быть положительной'}), 400)
            
            discount_percent = discount_value if discount_type == 'percent' else None
            discount_amount = discount_value if discount_type == 'fixed' else None
        elif promo_type == 'universal':
            if not reward_value: return None, (jsonify({'ok': False, 'error': 'Значение бонуса (дни) обязательно'}), 400)
            try: reward_val_int = int(reward_value)
            except ValueError: return None, (jsonify({'ok': False, 'error': 'Некорректное значение бонуса'}), 400)
            if reward_val_int <= 0: return None, (jsonify({'ok': False, 'error': 'Бонус должен быть положительным'}), 400)
        elif promo_type == 'balance':
            balance_value = form_data.get('balance_value')
            if not balance_value: return None, (jsonify({'ok': False, 'error': 'Сумма пополнения обязательна'}), 400)
            try: reward_val_int = int(balance_value)
            except ValueError: return None, (jsonify({'ok': False, 'error': 'Некорректная сумма пополнения'}), 400)
            if reward_val_int <= 0: return None, (jsonify({'ok': False, 'error': 'Сумма должна быть положительной'}), 400)

        usage_limit_total_int = int(usage_limit_total) if usage_limit_total else None
        usage_limit_per_user_int = int(usage_limit_per_user) if usage_limit_per_user else None
        
        valid_from_dt = datetime.fromisoformat(valid_from) if valid_from else None
        valid_until_dt = datetime.fromisoformat(valid_until) if valid_until else None

        return {
            'promo_type': promo_type,
            'reward_value': reward_val_int,
            'discount_percent': discount_percent,
            'discount_amount': discount_amount,
            'usage_limit_total': usage_limit_total_int,
            'usage_limit_per_user': usage_limit_per_user_int,
            'valid_from': valid_from_dt,
            'valid_until': valid_until_dt,
            'description': description
        }, None
    except Exception as e: return None, (jsonify({'ok': False, 'error': str(e)}), 400)
# ===== Конец функции validate_promo_params =====

# ===== СОХРАНЕНИЕ РЕЗУЛЬТАТОВ РАССЫЛКИ =====
# Записывает статистику последней рассылки в базу данных (МСК)
def save_broadcast_results(
    sent, failed, skipped, blocked_bot=0, deactivated=0, added_to_banned=0, removed_from_banned=0,
    blocked_bot_ids=None, deactivated_ids=None,
):
    try:
        moscow_time = get_msk_time()
        
        results = {
            'sent': sent,
            'failed': failed,
            'skipped': skipped,
            'blocked_bot': blocked_bot,
            'deactivated': deactivated,
            'added_to_banned': added_to_banned,
            'removed_from_banned': removed_from_banned,
            'blocked_bot_ids': list(dict.fromkeys(blocked_bot_ids or [])),
            'deactivated_ids': list(dict.fromkeys(deactivated_ids or [])),
            'timestamp': moscow_time.isoformat()
        }
        rw_repo.set_other_value('newsletter', json.dumps(results, ensure_ascii=False))
    except Exception as e: logger.error(f"Не удалось сохранить результаты рассылки: {e}")
# ===== Конец функции save_broadcast_results =====

# ===== ЗАГРУЗКА РЕЗУЛЬТАТОВ РАССЫЛКИ =====
# Получает данные статистики последней рассылки
def load_broadcast_results():
    try:
        data = rw_repo.get_other_value('newsletter')
        if data:
            results = json.loads(data)
            # Обеспечиваем наличие новых полей в старых записях
            default_fields = {
                'sent': 0, 'failed': 0, 'skipped': 0, 
                'blocked_bot': 0, 'deactivated': 0, 
                'added_to_banned': 0, 'removed_from_banned': 0,
                'blocked_bot_ids': [], 'deactivated_ids': [],
                'timestamp': None
            }
            return {**default_fields, **results}
    except Exception as e: logger.error(f"Не удалось загрузить результаты рассылки: {e}")
    return {
        'sent': 0, 'failed': 0, 'skipped': 0, 
        'blocked_bot': 0, 'deactivated': 0, 
        'added_to_banned': 0, 'removed_from_banned': 0,
        'blocked_bot_ids': [], 'deactivated_ids': [],
        'timestamp': None
    }
# ===== Конец функции load_broadcast_results =====
    
# ===== ПОЛУЧЕНИЕ СПИСКА ЗАБАНЕННЫХ =====
def get_banned_users_data():
    try:
        data = rw_repo.get_other_value('id_newsletter')
        if data: return json.loads(data)
    except Exception as e: logger.error(f"Error loading id_newsletter: {e}")
    return {"count": 0, "id": []}
# ===== Конец функции get_banned_users_data =====

# ===== СОХРАНЕНИЕ СПИСКА ЗАБАНЕННЫХ =====
def save_banned_users_data(banned_ids):
    try:
        unique_ids = list(set(banned_ids))
        data = {"count": len(unique_ids), "id": unique_ids}
        rw_repo.set_other_value('id_newsletter', json.dumps(data, ensure_ascii=False))
    except Exception as e: logger.error(f"Error saving id_newsletter: {e}")
# ===== Конец функции save_banned_users_data =====

# ===== ОБОГАЩЕНИЕ СПИСКА ЗАБЛОКИРОВАВШИХ =====
def enrich_blocked_users(user_ids):
    users = []
    for uid in user_ids or []:
        try:
            uid_int = int(uid)
        except (TypeError, ValueError):
            continue
        row = rw_repo.database.get_user(uid_int) or {}
        users.append({
            'telegram_id': uid_int,
            'username': (row.get('username') or '').strip(),
            'is_banned': bool(row.get('is_banned')),
            'registration_date': row.get('registration_date'),
            'total_spent': float(row.get('total_spent') or 0),
            'in_database': bool(row),
        })
    return users
# ===== Конец функции enrich_blocked_users =====

BROADCAST_MODE_LABELS = {
    'all': 'Все пользователи',
    'with_keys': 'С активными ключами',
    'expired_keys': 'С истекшими ключами',
    'expiring_keys': 'Истекающие ключи',
    'without_trial': 'Не использовали пробный',
    'not_used_trial': 'Не использовали пробный',
    'test': 'Тест (админ)',
}


def _record_broadcast_delivery(deliveries, user_id, status, reason=None, error_detail=None):
    deliveries.append({
        'telegram_id': user_id,
        'status': status,
        'reason': reason,
        'error_detail': (error_detail or '')[:500] or None,
    })


def _personalize_broadcast_text(text: str, user: dict) -> str:
    """Подстановка переменных в текст рассылки (HTML сохраняется)."""
    if not text:
        return text
    raw_username = (user.get('username') or '').strip().lstrip('@')
    display = f'@{raw_username}' if raw_username else 'друг'
    return (
        text.replace('{username}', display)
        .replace('{user}', display)
        .replace('{name}', display)
    )


def _serialize_broadcast_run(row: dict) -> dict:
    mode = row.get('mode') or 'all'
    return {
        'id': row.get('id'),
        'started_at': row.get('started_at'),
        'finished_at': row.get('finished_at'),
        'mode': mode,
        'mode_label': BROADCAST_MODE_LABELS.get(mode, mode),
        'skip_banned': bool(row.get('skip_banned')),
        'text_preview': row.get('text_preview') or '',
        'total_recipients': int(row.get('total_recipients') or 0),
        'sent_count': int(row.get('sent_count') or 0),
        'failed_count': int(row.get('failed_count') or 0),
        'skipped_count': int(row.get('skipped_count') or 0),
        'blocked_bot_count': int(row.get('blocked_bot_count') or 0),
        'deactivated_count': int(row.get('deactivated_count') or 0),
    }

# ===== АСИНХРОННАЯ ОТПРАВКА РАССЫЛКИ =====
async def send_broadcast_async(bot, users, text, media_path=None, media_type=None, buttons=None, mode='all', task_id=None, skip_banned=False, broadcast_id=None):
    sent, failed, skipped, total = 0, 0, 0, len(users)
    blocked_bot, deactivated = 0, 0
    added_to_banned, removed_from_banned = 0, 0
    blocked_bot_ids, deactivated_ids = [], []
    deliveries = []
    history_id = broadcast_id or task_id

    banned_data = get_banned_users_data()
    initial_banned_set = set(banned_data.get('id', []))
    banned_set = initial_banned_set.copy()

    if history_id:
        try:
            create_broadcast_run(
                history_id,
                mode=mode,
                skip_banned=skip_banned,
                text_preview=text,
                total_recipients=total,
            )
        except Exception as e:
            logger.error("Не удалось создать запись истории рассылки %s: %s", history_id, e)

    if task_id:
        with broadcast_lock:
            broadcast_progress[task_id] = {
                'status': 'running', 'total': total, 'sent': 0, 'failed': 0, 'skipped': 0,
                'blocked_bot': 0, 'deactivated': 0, 'added_to_banned': 0, 'removed_from_banned': 0,
                'blocked_bot_ids': [], 'deactivated_ids': [],
                'broadcast_id': history_id,
                'progress': 0, 'start_time': get_msk_time().isoformat()
            }

    for index, user in enumerate(users):
        user_id = user.get('telegram_id')
        if not user_id:
            continue

        if skip_banned and user_id in banned_set:
            skipped += 1
            _record_broadcast_delivery(deliveries, user_id, 'skipped', 'skip_banned_list')
            if task_id:
                with broadcast_lock:
                    if task_id in broadcast_progress:
                        broadcast_progress[task_id].update({'skipped': skipped, 'progress': int((index + 1) / total * 100)})
            continue

        if user.get('is_banned', False):
            skipped += 1
            _record_broadcast_delivery(deliveries, user_id, 'skipped', 'user_banned')
            if user_id not in initial_banned_set:
                banned_set.add(user_id)
                added_to_banned += 1
            if task_id:
                with broadcast_lock:
                    if task_id in broadcast_progress:
                        broadcast_progress[task_id].update({'skipped': skipped, 'added_to_banned': added_to_banned, 'progress': int((index + 1) / total * 100)})
            continue

        try:
            message_text = _personalize_broadcast_text(text, user)
            keyboard = None
            if buttons:
                from aiogram.utils.keyboard import InlineKeyboardBuilder
                from aiogram.types import InlineKeyboardButton
                builder = InlineKeyboardBuilder()
                style_map = {'red': 'danger', 'green': 'success', 'blue': 'primary'}
                for btn in buttons:
                    btn_text = btn.get('text', '').strip()
                    btn_type = btn.get('type', 'url')
                    if not btn_text:
                        continue
                    btn_kwargs = {'text': btn_text}
                    btn_color = btn.get('color', '').strip()
                    if btn_color and btn_color in style_map:
                        btn_kwargs['style'] = style_map[btn_color]
                    if btn_type == 'promo':
                        promo_val = btn.get('value', '').strip()
                        btn_kwargs['callback_data'] = f"promo_uni:{promo_val}" if promo_val else "promo_uni"
                    else:
                        btn_url = btn.get('url', '').strip()
                        if btn_url and (btn_url.startswith('http://') or btn_url.startswith('https://')):
                            btn_kwargs['url'] = btn_url
                        else:
                            continue
                    try:
                        builder.add(InlineKeyboardButton(**btn_kwargs))
                    except Exception:
                        btn_kwargs.pop('style', None)
                        builder.add(InlineKeyboardButton(**btn_kwargs))
                builder.adjust(1)
                keyboard = builder.as_markup() if builder.export() else None

            if media_path and media_type:
                media_file = FSInputFile(media_path)
                if media_type == 'photo':
                    await bot.send_photo(chat_id=user_id, photo=media_file, caption=message_text, parse_mode='HTML', reply_markup=keyboard)
                elif media_type == 'video':
                    await bot.send_video(chat_id=user_id, video=media_file, caption=message_text, parse_mode='HTML', reply_markup=keyboard)
                elif media_type == 'animation':
                    await bot.send_animation(chat_id=user_id, animation=media_file, caption=message_text, parse_mode='HTML', reply_markup=keyboard)
            else:
                await bot.send_message(chat_id=user_id, text=message_text, parse_mode='HTML', reply_markup=keyboard)

            sent += 1
            _record_broadcast_delivery(deliveries, user_id, 'sent')
            if user_id in initial_banned_set:
                banned_set.discard(user_id)
                removed_from_banned += 1
            await asyncio.sleep(0.05)

        except TelegramForbiddenError as e:
            failed += 1
            error_msg = str(e).lower()
            reason = 'forbidden_other'
            if "bot was blocked by the user" in error_msg:
                blocked_bot += 1
                reason = 'blocked_bot'
                if user_id not in blocked_bot_ids:
                    blocked_bot_ids.append(user_id)
            elif "user is deactivated" in error_msg:
                deactivated += 1
                reason = 'deactivated'
                if user_id not in deactivated_ids:
                    deactivated_ids.append(user_id)
            _record_broadcast_delivery(deliveries, user_id, 'failed', reason, str(e))
            if user_id not in initial_banned_set:
                banned_set.add(user_id)
                added_to_banned += 1

        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            failed += 1
            _record_broadcast_delivery(deliveries, user_id, 'failed', 'rate_limit', str(e))
        except Exception as e:
            failed += 1
            _record_broadcast_delivery(deliveries, user_id, 'failed', 'error', str(e))
            if user_id not in initial_banned_set:
                banned_set.add(user_id)
                added_to_banned += 1

        if task_id and ((index + 1) % 10 == 0 or (index + 1) == total):
            with broadcast_lock:
                if task_id in broadcast_progress:
                    broadcast_progress[task_id].update({
                        'sent': sent, 'failed': failed, 'skipped': skipped,
                        'blocked_bot': blocked_bot, 'deactivated': deactivated,
                        'added_to_banned': added_to_banned, 'removed_from_banned': removed_from_banned,
                        'blocked_bot_ids': blocked_bot_ids.copy(),
                        'deactivated_ids': deactivated_ids.copy(),
                        'progress': int((index + 1) / total * 100)
                    })

    if task_id:
        with broadcast_lock:
            if task_id in broadcast_progress:
                broadcast_progress[task_id].update({
                    'status': 'completed', 'sent': sent, 'failed': failed, 'skipped': skipped,
                    'blocked_bot': blocked_bot, 'deactivated': deactivated,
                    'added_to_banned': added_to_banned, 'removed_from_banned': removed_from_banned,
                    'blocked_bot_ids': blocked_bot_ids.copy(),
                    'deactivated_ids': deactivated_ids.copy(),
                    'progress': 100, 'end_time': get_msk_time().isoformat()
                })

    save_broadcast_results(
        sent, failed, skipped, blocked_bot, deactivated, added_to_banned, removed_from_banned,
        blocked_bot_ids=blocked_bot_ids, deactivated_ids=deactivated_ids,
    )
    save_banned_users_data(list(banned_set))

    stats = {
        'sent': sent, 'failed': failed, 'skipped': skipped,
        'blocked_bot': blocked_bot, 'deactivated': deactivated,
        'added_to_banned': added_to_banned, 'removed_from_banned': removed_from_banned,
        'blocked_bot_ids': blocked_bot_ids, 'deactivated_ids': deactivated_ids,
    }

    if history_id:
        try:
            save_broadcast_deliveries(history_id, deliveries)
            finish_broadcast_run(history_id, stats)
        except Exception as e:
            logger.error("Не удалось сохранить историю рассылки %s: %s", history_id, e)

    if media_path and os.path.exists(media_path):
        try:
            os.remove(media_path)
            logger.info("Медиафайл удален: %s", media_path)
        except Exception as e:
            logger.error("Не удалось удалить медиафайл %s: %s", media_path, e)

    return stats

# ===== СОХРАНЕНИЕ НАСТРОЕК WEBAPP =====
@bp.route('/settings/webapp/save', methods=['POST'])
@panel_ctx.login_required
def webapp_save():
    if not _user_can_webapp_edit():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    try:
        from shop_bot.webapp.designs import WEBAPP_DESIGN_IDS, parse_enabled_designs

        enable = request.form.get('enable') == 'true'
        tg_fullscreen = request.form.get('tg_fullscreen') == 'true'
        theme_picker = request.form.get('theme_picker') == 'true'
        title = request.form.get('title', '').strip()
        domen = request.form.get('domen', '').strip()
        logo = request.form.get('logo', '').strip()
        icon = request.form.get('icon', '').strip()
        default_design = (request.form.get('default_design') or 'aurum').strip()
        enabled_raw = request.form.getlist('webapp_design_enabled')
        enabled = [d for d in enabled_raw if d in WEBAPP_DESIGN_IDS]
        if not enabled:
            enabled = ['aurum']
        if default_design not in WEBAPP_DESIGN_IDS or default_design not in enabled:
            default_design = enabled[0]
        enabled_str = ','.join(parse_enabled_designs(','.join(enabled)))
        ab_design_b = (request.form.get('ab_design_b') or '').strip()
        if ab_design_b and ab_design_b not in WEBAPP_DESIGN_IDS:
            ab_design_b = ''
        try:
            ab_percent = max(0, min(50, int(request.form.get('ab_percent') or 0)))
        except (TypeError, ValueError):
            ab_percent = 0

        module_order_raw = (request.form.get('module_order') or '').strip()
        content_overrides_raw = (request.form.get('content_overrides') or '').strip()
        maintenance_until = (request.form.get('maintenance_until') or '').strip()

        rw_repo.update_webapp_settings(
            webapp_title=title,
            webapp_domen=domen,
            webapp_enable=1 if enable else 0,
            webapp_logo=logo,
            webapp_icon=icon,
            tg_fullscreen=1 if tg_fullscreen else 0,
            webapp_default_design=default_design,
            webapp_enabled_designs=enabled_str,
            webapp_theme_picker=1 if theme_picker else 0,
            webapp_maintenance_text=(request.form.get('maintenance_text') or '').strip(),
            webapp_welcome_text=(request.form.get('welcome_text') or '').strip(),
            webapp_accent_color=(request.form.get('accent_color') or '').strip(),
            webapp_show_trial=1 if request.form.get('show_trial') == 'true' else 0,
            webapp_show_referrals=1 if request.form.get('show_referrals') == 'true' else 0,
            webapp_show_howto=1 if request.form.get('show_howto') == 'true' else 0,
            webapp_show_topup=1 if request.form.get('show_topup') == 'true' else 0,
            webapp_show_promo=1 if request.form.get('show_promo') == 'true' else 0,
            webapp_show_support=1 if request.form.get('show_support') == 'true' else 0,
            webapp_ab_design_b=ab_design_b,
            webapp_ab_percent=ab_percent,
            webapp_module_order=module_order_raw or None,
            webapp_content_overrides=content_overrides_raw or None,
            webapp_maintenance_until=maintenance_until or None,
            webapp_menu_button=1 if request.form.get('menu_button') == 'true' else 0,
            webapp_menu_button_text=(request.form.get('menu_button_text') or '').strip() or None,
            webapp_miniapp_buttons=1 if request.form.get('miniapp_buttons') == 'true' else 0,
        )
        panel_ctx.audit('webapp.save', {'enabled': enable, 'domain': domen, 'designs': enabled_str})
        menu_sync = None
        controller = getattr(panel_ctx, 'bot_controller', None)
        if controller and hasattr(controller, 'sync_telegram_menu_button'):
            menu_sync = controller.sync_telegram_menu_button()
        return jsonify({'ok': True, 'message': 'Настройки WebApp сохранены', 'menu_sync': menu_sync})
    except Exception as e:
        logger.error(f"Ошибка сохранения настроек Webapp: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута webapp_save =====

@bp.route('/settings/webapp/sync-menu-button', methods=['POST'])
@panel_ctx.login_required
def webapp_sync_menu_button():
    if not _user_can_webapp_edit():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    controller = getattr(panel_ctx, 'bot_controller', None)
    if not controller or not hasattr(controller, 'sync_telegram_menu_button'):
        return jsonify({'ok': False, 'error': 'bot_controller_unavailable'}), 503
    result = controller.sync_telegram_menu_button()
    panel_ctx.audit('webapp.menu_sync', result)
    status = 200 if result.get('ok') or result.get('skipped') else 502
    return jsonify({'ok': bool(result.get('ok')), 'result': result}), status

@bp.route('/settings/webapp/health.json', methods=['GET'])
@panel_ctx.login_required
def webapp_health():
    if not _user_can_webapp():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    from shop_bot.webhook_server.modules import webapp_panel
    from shop_bot.webhook_server.modules.webapp_runtime import append_health_snapshot

    webapp = rw_repo.get_webapp_settings() or {}
    health = webapp_panel.check_health(webapp)
    controller = getattr(panel_ctx, 'bot_controller', None)
    if controller and hasattr(controller, 'get_webapp_status'):
        runtime = controller.get_webapp_status() or {}
        if runtime.get('uptime_sec') is not None:
            health['uptime_sec'] = runtime.get('uptime_sec')
        health['process_running'] = runtime.get('running')
    history = append_health_snapshot(webapp, health)
    return jsonify({'ok': True, 'health': health, 'history': history[-24:]})


@bp.route('/settings/webapp/meta.json', methods=['GET'])
@panel_ctx.login_required
def webapp_meta():
    if not _user_can_webapp():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    from shop_bot.webhook_server.modules import webapp_panel

    webapp = rw_repo.get_webapp_settings() or {}
    settings = rw_repo.get_all_settings() or {}
    meta = webapp_panel.build_webapp_meta(
        webapp,
        settings,
        bot_username=(settings.get('telegram_bot_username') or '').strip().lstrip('@'),
    )
    return jsonify({'ok': True, 'meta': meta})


@bp.route('/settings/webapp/preview/<design_id>', methods=['GET'])
@panel_ctx.login_required
def webapp_preview(design_id: str):
    if not _user_can_webapp():
        return 'Forbidden', 403
    from flask import make_response
    from urllib.parse import urlencode
    import urllib.error
    import urllib.request

    from shop_bot.webapp.designs import WEBAPP_DESIGN_IDS
    from shop_bot.webapp.preview_tokens import issue_studio_preview_token
    from shop_bot.webhook_server.modules import webapp_panel

    if design_id not in WEBAPP_DESIGN_IDS:
        return 'Not found', 404
    device = (request.args.get('device') or 'mobile').strip().lower()
    title = (request.args.get('title') or '').strip()
    logo = (request.args.get('logo') or '').strip()
    accent = (request.args.get('accent') or '').strip()
    use_mock = request.args.get('mock') == '1'
    webapp = rw_repo.get_webapp_settings() or {}
    if not title:
        title = (webapp.get('webapp_title') or 'VPN').strip()
        logo = logo or (webapp.get('webapp_logo') or '').strip()
        accent = accent or (webapp.get('webapp_accent_color') or '').strip()

    if not use_mock and webapp_panel.check_health(webapp).get('port_local', {}).get('ok'):
        try:
            token = issue_studio_preview_token(design_id)
            params = urlencode({
                'token': token,
                'design': design_id,
                'device': device,
                'title': title,
                'logo': logo,
                'accent': accent,
            })
            req = urllib.request.Request(
                f'http://127.0.0.1:8000/studio-preview?{params}',
                headers={'User-Agent': 'Remnawave-WebApp-Studio/1.0'},
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = resp.read().decode('utf-8')
            out = make_response(body)
            out.headers['Content-Type'] = 'text/html; charset=utf-8'
            out.headers['Cache-Control'] = 'private, no-cache'
            out.headers['X-Frame-Options'] = 'SAMEORIGIN'
            return out
        except (urllib.error.URLError, TimeoutError, OSError):
            pass

    body = webapp_panel.render_preview_html(
        design_id,
        device=device,
        title=title,
        logo=logo,
        accent=accent,
    )
    resp = make_response(body)
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    resp.headers['Cache-Control'] = 'private, no-cache'
    resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return resp


@bp.route('/settings/webapp/logs.json', methods=['GET'])
@panel_ctx.login_required
def webapp_logs():
    if not _user_can_webapp():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    from shop_bot.webhook_server.modules.webapp_runtime import export_webapp_logs_text, tail_webapp_logs

    try:
        lines = int(request.args.get('lines', 80))
    except ValueError:
        lines = 80
    level = (request.args.get('level') or '').strip()
    search = (request.args.get('q') or request.args.get('search') or '').strip()
    entries = tail_webapp_logs(lines, level=level, search=search)
    if request.args.get('format') == 'txt':
        from flask import Response
        return Response(
            export_webapp_logs_text(entries),
            mimetype='text/plain; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=webapp.log'},
        )
    return jsonify({'ok': True, 'entries': entries, 'lines': [e.get('text', '') for e in entries]})


@bp.route('/settings/webapp/restart', methods=['POST'])
@panel_ctx.login_required
def webapp_restart():
    if not _user_can_webapp_edit():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    from shop_bot.webhook_server.modules.webapp_runtime import restart_webapp_service

    result = restart_webapp_service()
    if result.get('ok'):
        panel_ctx.audit('webapp.restart', {'running': result.get('running')})
    status = 200 if result.get('ok') else 500
    return jsonify(result), status


@bp.route('/settings/webapp/analytics.json', methods=['GET'])
@panel_ctx.login_required
def webapp_analytics():
    if not _user_can_webapp():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    from shop_bot.webhook_server.modules.webapp_runtime import build_webapp_analytics

    webapp = rw_repo.get_webapp_settings() or {}
    return jsonify({'ok': True, 'analytics': build_webapp_analytics(webapp)})


WEBAPP_UPLOAD_FOLDER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    'webapp', 'static', 'img', 'uploads',
)
os.makedirs(WEBAPP_UPLOAD_FOLDER, exist_ok=True)
WEBAPP_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'}


def _allowed_webapp_image(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in WEBAPP_IMAGE_EXTENSIONS


@bp.route('/settings/webapp/upload', methods=['POST'])
@panel_ctx.login_required
def webapp_upload():
    if not _user_can_webapp_edit():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    try:
        if 'file' not in request.files:
            return jsonify({'ok': False, 'error': 'Файл не предоставлен'}), 400
        file = request.files['file']
        if not file.filename:
            return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400
        if not _allowed_webapp_image(file.filename):
            return jsonify({'ok': False, 'error': 'Недопустимый тип файла'}), 400

        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(WEBAPP_UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        public_path = f"/static/img/uploads/{unique_filename}"
        webapp = rw_repo.get_webapp_settings() or {}
        from shop_bot.webhook_server.modules.webapp_panel import webapp_public_url

        absolute_url = f"{webapp_public_url(webapp)}{public_path}"
        asset_type = (request.form.get('asset') or 'logo').strip().lower()
        panel_ctx.audit('webapp.upload', {'asset': asset_type, 'file': unique_filename})
        return jsonify({
            'ok': True,
            'path': public_path,
            'url': absolute_url,
            'asset': asset_type,
        })
    except Exception as e:
        logger.error(f"Ошибка загрузки WebApp asset: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


def _user_can_webapp() -> bool:
    from flask import session
    from shop_bot.data_manager.panel_rbac import allows_permission, normalize_permission_levels

    if session.get('panel_is_superadmin'):
        return True
    levels = session.get('panel_permission_levels') or normalize_permission_levels(
        session.get('panel_permissions') or []
    )
    return allows_permission(levels, 'other_webapp', require_edit=False)


def _user_can_webapp_edit() -> bool:
    from flask import session
    from shop_bot.data_manager.panel_rbac import allows_permission, normalize_permission_levels

    if session.get('panel_is_superadmin'):
        return True
    levels = session.get('panel_permission_levels') or normalize_permission_levels(
        session.get('panel_permissions') or []
    )
    return allows_permission(levels, 'other_webapp', require_edit=True)

# ===== ШАБЛОНЫ РАССЫЛКИ (Broadcast Studio) =====
@bp.route('/settings/broadcast/presets')
@panel_ctx.login_required
def broadcast_presets():
    try:
        payload = get_broadcast_presets_payload()
        data = rw_repo.get_other_value('theme_newsletter')
        custom = json.loads(data) if data else {}
        return jsonify({'ok': True, **payload, 'custom': custom})
    except Exception as e:
        logger.error(f"Ошибка получения шаблонов рассылки: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


# ===== СТАТИСТИКА РАССЫЛКИ =====
# Собирает данные о пользователях и ключах для формирования отчета рассылки
@bp.route('/settings/broadcast/stats')
@panel_ctx.login_required
def broadcast_stats():
    try:
        all_keys = rw_repo.database.get_all_keys() or []
        total_keys_active, total_keys_expired = 0, 0
        expiring_counts = {1: 0, 3: 0, 5: 0, 10: 0}
        now = get_msk_time()
        
        for key in all_keys:
            expire_at_val = key.get('expire_at')
            expire_dt = parse_expire_dt(expire_at_val)
            
            if not expire_at_val:
                total_keys_active += 1
            elif expire_dt:
                if expire_dt > now:
                    total_keys_active += 1
                    days_rem = (expire_dt - now).days
                    for day_limit in [1, 3, 5, 10]:
                        if days_rem <= day_limit:
                            expiring_counts[day_limit] += 1
                else:
                    total_keys_expired += 1
            else:
                total_keys_active += 1
        
        all_users = rw_repo.database.get_all_users() or []
        total_users = len(all_users)
        users_without_trial = sum(1 for u in all_users if not u.get('trial_used', 0))
        
        last_results = load_broadcast_results()
        banned_data = get_banned_users_data()
        banned_count = banned_data.get('count', 0)
        
        return jsonify({
            'ok': True, 
            'total_users': total_users, 
            'users_with_keys': total_keys_active,
            'users_with_expired_keys': total_keys_expired, 
            'users_without_trial': users_without_trial,
            'expiring_counts': expiring_counts,
            'last_results': last_results,
            'banned_count': banned_count
        })
    except Exception as e:
        logger.error(f"Ошибка получения статистики рассылки: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_stats =====

# ===== СПИСОК ЗАБЛОКИРОВАВШИХ БОТА =====
@bp.route('/settings/broadcast/blocked-users', methods=['GET'])
@panel_ctx.login_required
def broadcast_blocked_users():
    try:
        scope = (request.args.get('scope') or 'last').strip().lower()
        if scope == 'all':
            banned_data = get_banned_users_data()
            user_ids = banned_data.get('id', [])
            source = 'all_banned'
        elif scope == 'deactivated':
            last_results = load_broadcast_results()
            user_ids = last_results.get('deactivated_ids') or []
            source = 'last_deactivated'
        else:
            last_results = load_broadcast_results()
            user_ids = last_results.get('blocked_bot_ids') or []
            source = 'last_blocked'
        return jsonify({
            'ok': True,
            'scope': scope,
            'source': source,
            'count': len(user_ids),
            'users': enrich_blocked_users(user_ids),
        })
    except Exception as e:
        logger.error(f"Ошибка получения списка заблокировавших: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_blocked_users =====

# ===== ИСТОРИЯ РАССЫЛОК =====
@bp.route('/settings/broadcast/history', methods=['GET'])
@panel_ctx.login_required
def broadcast_history_list():
    try:
        limit = min(max(int(request.args.get('limit', 30)), 1), 100)
        runs = [_serialize_broadcast_run(row) for row in list_broadcast_runs(limit)]
        return jsonify({'ok': True, 'items': runs})
    except Exception as e:
        logger.error(f"Ошибка получения истории рассылок: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@bp.route('/settings/broadcast/history/<broadcast_id>', methods=['GET'])
@panel_ctx.login_required
def broadcast_history_detail(broadcast_id):
    try:
        run = get_broadcast_run(broadcast_id)
        if not run:
            return jsonify({'ok': False, 'error': 'Рассылка не найдена'}), 404

        page = max(int(request.args.get('page', 1)), 1)
        per_page = min(max(int(request.args.get('per_page', 50)), 1), 200)
        status = (request.args.get('status') or 'all').strip()
        reason = (request.args.get('reason') or 'all').strip()
        search = (request.args.get('q') or '').strip()

        deliveries, total = get_broadcast_deliveries(
            broadcast_id,
            page=page,
            per_page=per_page,
            status=status,
            reason=reason,
            search=search or None,
        )
        breakdown = get_broadcast_delivery_stats(broadcast_id)

        return jsonify({
            'ok': True,
            'run': _serialize_broadcast_run(run),
            'deliveries': deliveries,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': max(1, (total + per_page - 1) // per_page),
            'breakdown': breakdown,
            'reason_labels': REASON_LABELS,
            'status_labels': STATUS_LABELS,
        })
    except Exception as e:
        logger.error(f"Ошибка получения деталей рассылки {broadcast_id}: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роутов broadcast_history =====

# ===== ОЧИСТКА СПИСКА ЗАБАНЕННЫХ =====
@bp.route('/settings/broadcast/clear-banned', methods=['POST'])
@panel_ctx.login_required
def broadcast_clear_banned():
    try:
        save_banned_users_data([])
        return jsonify({'ok': True, 'message': 'Список забаненных пользователей очищен'})
    except Exception as e:
        logger.error(f"Ошибка очистки списка забаненных: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_clear_banned =====

# ===== УДАЛЕНИЕ ЗАБАНЕННЫХ ПОЛЬЗОВАТЕЛЕЙ ИЗ БД =====
@bp.route('/settings/broadcast/delete-banned-users', methods=['POST'])
@panel_ctx.login_required
def broadcast_delete_banned_users():
    try:
        banned_data = get_banned_users_data()
        banned_ids = banned_data.get('id', [])
        if not banned_ids:
            return jsonify({'ok': True, 'message': 'Нет пользователей для удаления', 'deleted': 0})
        
        deleted_count = 0
        for uid in banned_ids:
            if rw_repo.delete_user(uid):
                deleted_count += 1
        
        save_banned_users_data([])
        
        return jsonify({'ok': True, 'message': f'Успешно удалено {deleted_count} пользователей', 'deleted': deleted_count})
    except Exception as e:
        logger.error(f"Ошибка удаления забаненных пользователей: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_delete_banned_users =====

# ===== ПРЕДПРОСМОТР РАССЫЛКИ =====
# Отправляет тестовое сообщение администратору для проверки внешнего вида
@bp.route('/settings/broadcast/preview', methods=['POST'])
@panel_ctx.login_required
def broadcast_preview():
    try:
        text, buttons_json, media_filename = request.form.get('text', ''), request.form.get('buttons', '[]'), request.form.get('media_filename', '')
        buttons = json.loads(buttons_json) if buttons_json else []
        
        admin_id, error = get_admin_id_safe()
        if error: return error
        
        bot, error = get_bot_instance_safe()
        if error: return error
        
        keyboard = None
        if buttons:
            from aiogram.utils.keyboard import InlineKeyboardBuilder
            from aiogram.types import InlineKeyboardButton
            builder = InlineKeyboardBuilder()
            style_map = {'red': 'danger', 'green': 'success', 'blue': 'primary'}
            for btn in buttons:
                btn_text = btn.get('text', '').strip()
                btn_type = btn.get('type', 'url')
                if not btn_text: continue
                
                btn_kwargs = {'text': btn_text}
                btn_color = btn.get('color', '').strip()
                if btn_color and btn_color in style_map:
                    btn_kwargs['style'] = style_map[btn_color]
                
                if btn_type == 'promo':
                    promo_val = btn.get('value', '').strip()
                    btn_kwargs['callback_data'] = f"promo_uni:{promo_val}" if promo_val else "promo_uni"
                else:
                    btn_url = btn.get('url', '').strip()
                    if btn_url and (btn_url.startswith('http://') or btn_url.startswith('https://')):
                        btn_kwargs['url'] = btn_url
                    else:
                        continue
                try:
                    builder.add(InlineKeyboardButton(**btn_kwargs))
                except Exception:
                    btn_kwargs.pop('style', None)
                    builder.add(InlineKeyboardButton(**btn_kwargs))
            builder.adjust(1)
            keyboard = builder.as_markup() if builder.export() else None
        
        media_path, media_type = None, None
        if media_filename:
            media_path = _resolve_broadcast_media_path(media_filename)
            if media_path: media_type = get_media_type(media_filename)
        
        loop = current_app.config.get('EVENT_LOOP')
        if not loop or not loop.is_running():
            return jsonify({'ok': False, 'error': 'Сервис временно недоступен. Перезапустите приложение и повторите попытку.'}), 503
        
        admin_user = {'username': '', 'telegram_id': int(admin_id)}
        try:
            admin_row = next((u for u in (rw_repo.get_all_users() or []) if int(u.get('telegram_id') or 0) == int(admin_id)), None)
            if admin_row:
                admin_user = admin_row
        except Exception:
            pass

        async def send_preview():
            preview_text = f"{_personalize_broadcast_text(text, admin_user)}\n\n📨 <b>Предпросмотр</b>"
            if media_path and media_type:
                media_file = FSInputFile(media_path)
                if media_type == 'photo': await bot.send_photo(chat_id=int(admin_id), photo=media_file, caption=preview_text, parse_mode='HTML', reply_markup=keyboard)
                elif media_type == 'video': await bot.send_video(chat_id=int(admin_id), video=media_file, caption=preview_text, parse_mode='HTML', reply_markup=keyboard)
                elif media_type == 'animation': await bot.send_animation(chat_id=int(admin_id), animation=media_file, caption=preview_text, parse_mode='HTML', reply_markup=keyboard)
            else: await bot.send_message(chat_id=int(admin_id), text=preview_text, parse_mode='HTML', reply_markup=keyboard)
        
        asyncio.run_coroutine_threadsafe(send_preview(), loop).result(timeout=10)
        return jsonify({'ok': True, 'message': 'Предпросмотр отправлен администратору'})
    except Exception as e:
        logger.error(f"Ошибка отправки предпросмотра: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_preview =====

# ===== ЗАГРУЗКА МЕДИА ДЛЯ РАССЫЛКИ =====
# Загружает файл изображения или видео на сервер для последующей рассылки
@bp.route('/settings/broadcast/upload', methods=['POST'])
@panel_ctx.login_required
def broadcast_upload():
    try:
        if 'file' not in request.files: return jsonify({'ok': False, 'error': 'Файл не предоставлен'}), 400
        file = request.files['file']
        if file.filename == '': return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400
        if not allowed_file(file.filename): return jsonify({'ok': False, 'error': 'Недопустимый тип файла'}), 400
        
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        
        media_type = get_media_type(filename)
        return jsonify({'ok': True, 'filename': unique_filename, 'media_type': media_type, 'path': filepath})
    except Exception as e:
        logger.error(f"Ошибка загрузки медиа: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_upload =====

# ===== ЗАПУСК МАССОВОЙ РАССЫЛКИ =====
# Формирует список получателей и запускает асинхронный процесс отправки
@bp.route('/settings/broadcast/send', methods=['POST'])
@panel_ctx.login_required
def broadcast_send():
    try:
        text, mode, buttons_json, media_filename = request.form.get('text', ''), request.form.get('mode', 'all'), request.form.get('buttons', '[]'), request.form.get('media_filename', '')
        skip_banned = request.form.get('skip_banned') == 'true'
        
        buttons = json.loads(buttons_json) if buttons_json else []
        if not text: return jsonify({'ok': False, 'error': 'Текст обязателен'}), 400
        
        bot, error = get_bot_instance_safe()
        if error: return error
        
        all_users = rw_repo.get_all_users() or []
        
        if mode == 'test':
            admin_id, error = get_admin_id_safe()
            if error: return error
            all_users = [{'telegram_id': int(admin_id), 'is_banned': False}]
        elif mode == 'with_keys':
            filtered_users = []
            for user in all_users:
                user_id = user.get('telegram_id')
                keys = rw_repo.get_keys_for_user(user_id) or []
                has_active_key = False
                for key in keys:
                    expire_dt = parse_expire_dt(key.get('expire_at'))
                    if expire_dt and expire_dt > get_msk_time():
                        has_active_key = True
                        break
                if has_active_key: filtered_users.append(user)
            all_users = filtered_users
        elif mode == 'expired_keys':
            filtered_users = []
            for user in all_users:
                user_id = user.get('telegram_id')
                keys = rw_repo.get_keys_for_user(user_id) or []
                has_active_key, has_expired_key = False, False
                for key in keys:
                    expire_dt = parse_expire_dt(key.get('expire_at'))
                    if expire_dt:
                        now = get_msk_time()
                        if expire_dt > now:
                            has_active_key = True
                            break
                        else:
                            has_expired_key = True
                if not has_active_key and has_expired_key: filtered_users.append(user)
            all_users = filtered_users
        elif mode == 'expiring_keys':
            expiring_days = request.form.get('expiring_days', '3')
            try: days_threshold = int(expiring_days)
            except ValueError: days_threshold = 3
            
            filtered_users = []
            for user in all_users:
                user_id = user.get('telegram_id')
                keys = rw_repo.get_keys_for_user(user_id) or []
                has_expiring_key = False
                for key in keys:
                    expire_dt = parse_expire_dt(key.get('expire_at'))
                    if expire_dt:
                        now = get_msk_time()
                        days_until_expiry = (expire_dt - now).days
                        if 0 <= days_until_expiry <= days_threshold:
                            has_expiring_key = True
                            break
                if has_expiring_key: filtered_users.append(user)
            all_users = filtered_users
        elif mode == 'not_used_trial':
            all_users = [u for u in all_users if not u.get('trial_used', 0)]
        elif mode == 'without_trial':
            filtered_users = []
            for user in all_users:
                user_id = user.get('telegram_id')
                keys = rw_repo.get_keys_for_user(user_id) or []
                has_trial_key = any(
                    str(k.get('key_email') or '').lower().startswith('trial_')
                    for k in keys
                )
                if not has_trial_key:
                    filtered_users.append(user)
            all_users = filtered_users
        
        if skip_banned:
            banned_data = get_banned_users_data()
            banned_ids = set(banned_data.get('id', []))
            all_users = [u for u in all_users if u.get('telegram_id') not in banned_ids]
        
        media_path, media_type = None, None
        if media_filename:
            media_path = _resolve_broadcast_media_path(media_filename)
            if media_path: media_type = get_media_type(media_filename)
        
        loop = current_app.config.get('EVENT_LOOP')
        if not loop or not loop.is_running():
            return jsonify({'ok': False, 'error': 'Сервис временно недоступен. Перезапустите приложение и повторите попытку.'}), 503
        
        task_id = str(uuid.uuid4())
        asyncio.run_coroutine_threadsafe(
            send_broadcast_async(
                bot, all_users, text, media_path, media_type, buttons, mode, task_id, skip_banned,
                broadcast_id=task_id,
            ),
            loop,
        )
        return jsonify({'ok': True, 'task_id': task_id, 'total_users': len(all_users)})
    except Exception as e:
        logger.error(f"Ошибка запуска рассылки: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_send =====

# =====СТАТУС ТЕКУЩЕЙ РАССЫЛКИ =====
# Возвращает текущий прогресс выполнения активной задачи рассылки
@bp.route('/settings/broadcast/status/<task_id>', methods=['GET'])
@panel_ctx.login_required
def broadcast_status(task_id):
    with broadcast_lock:
        if task_id not in broadcast_progress: return jsonify({'ok': False, 'error': 'Задача не найдена'}), 404
        progress = broadcast_progress[task_id].copy()
    return jsonify({'ok': True, 'progress': progress})
# ===== Конец роута broadcast_status =====

# ===== УДАЛЕНИЕ МЕДИАФАЙЛА РАССЫЛКИ =====
# Удаляет временный файл медиа с сервера
@bp.route('/settings/broadcast/delete-media/<filename>', methods=['DELETE'])
@panel_ctx.login_required
def broadcast_delete_media(filename):
    try:
        filepath = _resolve_broadcast_media_path(filename)
        if not filepath:
            return jsonify({'ok': False, 'error': 'Недопустимый файл'}), 400
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'ok': True})
        return jsonify({'ok': False, 'error': 'Файл не найден'}), 404
    except Exception as e:
        logger.error(f"Ошибка удаления медиафайла: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/settings/themes/save', methods=['POST'])
@panel_ctx.login_required
def broadcast_themes_save():
    logger.info("Route /settings/themes/save called")
    try:
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        if not title or not content:
            return jsonify({'ok': False, 'error': 'Название и сообщение обязательны'}), 400
        
        data = rw_repo.get_other_value('theme_newsletter')
        themes = json.loads(data) if data else {}
        
        if len(themes) >= 5 and title not in themes:
            return jsonify({'ok': False, 'error': 'Максимум 5 шаблонов'}), 400
        
        themes[title] = content
        rw_repo.set_other_value('theme_newsletter', json.dumps(themes, ensure_ascii=False))
        logger.info(f"Theme '{title}' saved successfully")
        return jsonify({'ok': True, 'message': 'Шаблон сохранен'})
    except Exception as e:
        logger.error(f"Ошибка сохранения шаблона: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/settings/themes/list')
@panel_ctx.login_required
def broadcast_themes_list():
    logger.info("Route /settings/themes/list called")
    try:
        data = rw_repo.get_other_value('theme_newsletter')
        themes = json.loads(data) if data else {}
        return jsonify({'ok': True, 'themes': themes})
    except Exception as e:
        logger.error(f"Ошибка получения списка шаблонов: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
@bp.route('/settings/themes/delete', methods=['POST'])
@panel_ctx.login_required
def broadcast_themes_delete():
    try:
        title = request.form.get('title', '').strip()
        if not title:
            return jsonify({'ok': False, 'error': 'Название обязательно'}), 400
        
        data = rw_repo.get_other_value('theme_newsletter')
        themes = json.loads(data) if data else {}
        
        if title in themes:
            del themes[title]
            rw_repo.set_other_value('theme_newsletter', json.dumps(themes, ensure_ascii=False))
            return jsonify({'ok': True, 'message': 'Шаблон удален'})
        return jsonify({'ok': False, 'error': 'Шаблон не найден'}), 404
    except Exception as e:
        logger.error(f"Ошибка удаления шаблона: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута broadcast_delete_media =====

# ===== СПИСОК ПРОМОКОДОВ =====
# Возвращает список всех существующих промокодов
@bp.route('/settings/promo/list')
@panel_ctx.login_required
def promo_list():
    try:
        promos = rw_repo.list_promo_codes(include_inactive=True)
        return jsonify({'ok': True, 'promos': promos})
    except Exception as e:
        logger.error(f"Ошибка получения списка промокодов: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_list =====

# ===== СВОДКА ПО ПРОМОКОДАМ =====
def _promo_stats_summary(promos: list) -> dict:
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)
    by_type = {'discount': 0, 'universal': 0, 'balance': 0}
    active = inactive = expired = expiring_soon = depleted = 0
    total_redemptions = 0

    for p in promos:
        ptype = (p.get('promo_type') or 'discount').lower()
        if ptype in by_type:
            by_type[ptype] += 1
        total_redemptions += int(p.get('used_total') or 0)

        is_active = bool(p.get('is_active'))
        if is_active:
            active += 1
        else:
            inactive += 1

        valid_until = p.get('valid_until')
        if valid_until:
            try:
                vu = datetime.fromisoformat(str(valid_until).replace('Z', '+00:00'))
                if vu.tzinfo is None:
                    vu = vu.replace(tzinfo=timezone.utc)
                if vu < now:
                    expired += 1
                elif vu <= soon:
                    expiring_soon += 1
            except (TypeError, ValueError):
                pass

        limit = p.get('usage_limit_total')
        used = int(p.get('used_total') or 0)
        if limit and used >= int(limit):
            depleted += 1

    hot = []
    urgent = []
    for p in promos:
        st = p.get('promo_type') or 'discount'
        used = int(p.get('used_total') or 0)
        item = {
            'code': p.get('code'),
            'promo_type': st,
            'used_total': used,
            'reward_label': _promo_reward_label(p),
            'is_active': bool(p.get('is_active')),
        }
        vu = p.get('valid_until')
        if vu and bool(p.get('is_active')):
            try:
                end = datetime.fromisoformat(str(vu).replace('Z', '+00:00'))
                if end.tzinfo is None:
                    end = end.replace(tzinfo=timezone.utc)
                if now < end <= soon:
                    urgent.append(item)
            except (TypeError, ValueError):
                pass
        if bool(p.get('is_active')):
            hot.append({**item, 'score': used})

    hot.sort(key=lambda x: x['score'], reverse=True)

    from shop_bot.data_manager.database import get_setting
    spotlight = (get_setting('promo_spotlight_code') or '').strip().upper()

    return {
        'total': len(promos),
        'active': active,
        'inactive': inactive,
        'expired': expired,
        'expiring_soon': expiring_soon,
        'depleted': depleted,
        'total_redemptions': total_redemptions,
        'by_type': by_type,
        'spotlight': spotlight,
        'hot_promos': hot[:5],
        'urgent_promos': urgent[:5],
    }


def _promo_reward_label(p: dict) -> str:
    t = (p.get('promo_type') or 'discount').lower()
    if t == 'universal':
        return f"+{p.get('reward_value') or 0} дн."
    if t == 'balance':
        return f"+{p.get('reward_value') or 0} ₽"
    if p.get('discount_percent'):
        return f"{p.get('discount_percent')}%"
    if p.get('discount_amount'):
        return f"{p.get('discount_amount')} ₽"
    return '—'


@bp.route('/settings/promo/stats')
@panel_ctx.login_required
def promo_stats():
    try:
        promos = rw_repo.list_promo_codes(include_inactive=True)
        return jsonify({'ok': True, 'stats': _promo_stats_summary(promos)})
    except Exception as e:
        logger.error(f"Ошибка сводки промокодов: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_stats =====

# ===== SPOTLIGHT (главный промокод для продвижения) =====
@bp.route('/settings/promo/spotlight', methods=['POST'])
@panel_ctx.login_required
def promo_spotlight():
    try:
        from shop_bot.data_manager.database import get_setting, update_setting

        code = request.form.get('code', '')
        if not code and request.is_json:
            payload = request.get_json(silent=True) or {}
            code = payload.get('code', '')
        code = str(code or '').strip().upper()
        if code:
            if not rw_repo.get_promo_code(code):
                return jsonify({'ok': False, 'error': 'Промокод не найден'}), 404
        update_setting('promo_spotlight_code', code)
        return jsonify({'ok': True, 'spotlight': code})
    except Exception as e:
        logger.error(f"Ошибка spotlight промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_spotlight =====

# ===== СПИСОК АКТИВАЦИЙ ПРОМОКОДА =====
@bp.route('/settings/promo/usages/<code>')
@panel_ctx.login_required
def promo_usages(code):
    try:
        usages = rw_repo.get_promo_code_usages(code)
        return jsonify({'ok': True, 'usages': usages})
    except Exception as e:
        logger.error(f"Ошибка получения активаций промокода {code}: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_usages =====

# ===== СОЗДАНИЕ ПРОМОКОДА =====
# Генерирует или сохраняет новый промокод с заданными параметрами
@bp.route('/settings/promo/create', methods=['POST'])
@panel_ctx.login_required
def promo_create():
    try:
        code = request.form.get('code', '').strip().upper()
        if not code:
            import string, random
            code = ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(8))
        
        params, error = validate_promo_params(request.form)
        if error: return error
        
        admin_id, error = get_admin_id_safe()
        created_by = int(admin_id) if not error else None
        
        if rw_repo.create_promo_code(code=code, created_by=created_by, **params):
            return jsonify({'ok': True, 'code': code, 'message': 'Промокод успешно создан'})
        return jsonify({'ok': False, 'error': 'Такой код уже существует'}), 400
    except ValueError as e: return jsonify({'ok': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Ошибка создания промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_create =====

# ===== ДУБЛИРОВАНИЕ ПРОМОКОДА =====
@bp.route('/settings/promo/duplicate/<code>', methods=['POST'])
@panel_ctx.login_required
def promo_duplicate(code):
    try:
        import string
        import random

        source = rw_repo.get_promo_code(code)
        if not source:
            return jsonify({'ok': False, 'error': 'Промокод не найден'}), 404

        new_code = (request.form.get('code') or '').strip().upper()
        if not new_code:
            base = (code or 'PROMO')[:4]
            new_code = f"{base}{''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))}"

        admin_id, error = get_admin_id_safe()
        created_by = int(admin_id) if not error else None

        valid_from = source.get('valid_from')
        valid_until = source.get('valid_until')
        if valid_from and isinstance(valid_from, str):
            try:
                valid_from = datetime.fromisoformat(valid_from)
            except ValueError:
                valid_from = None
        if valid_until and isinstance(valid_until, str):
            try:
                valid_until = datetime.fromisoformat(valid_until)
            except ValueError:
                valid_until = None

        if rw_repo.create_promo_code(
            code=new_code,
            created_by=created_by,
            discount_percent=source.get('discount_percent'),
            discount_amount=source.get('discount_amount'),
            promo_type=source.get('promo_type') or 'discount',
            reward_value=int(source.get('reward_value') or 0),
            usage_limit_total=source.get('usage_limit_total'),
            usage_limit_per_user=source.get('usage_limit_per_user'),
            valid_from=valid_from,
            valid_until=valid_until,
            description=(source.get('description') or '') + ' (копия)',
        ):
            return jsonify({'ok': True, 'code': new_code, 'message': 'Промокод скопирован'})
        return jsonify({'ok': False, 'error': 'Такой код уже существует'}), 400
    except ValueError as e:
        return jsonify({'ok': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Ошибка дублирования промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_duplicate =====

# ===== ПЕРЕКЛЮЧЕНИЕ СТАТУСА ПРОМОКОДА =====
# Активирует или деактивирует промокод
@bp.route('/settings/promo/toggle/<code>', methods=['POST'])
@panel_ctx.login_required
def promo_toggle(code):
    try:
        promo = rw_repo.get_promo_code(code)
        if not promo: return jsonify({'ok': False, 'error': 'Промокод не найден'}), 404
        
        new_status = not promo.get('is_active', 1)
        if rw_repo.update_promo_code_status(code, is_active=new_status):
            return jsonify({'ok': True, 'is_active': new_status})
        return jsonify({'ok': False, 'error': 'Не удалось обновить статус'}), 500
    except Exception as e:
        logger.error(f"Ошибка переключения статуса промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_toggle =====

# ===== УДАЛЕНИЕ ПРОМОКОДА =====
# Полностью удаляет промокод из базы данных
@bp.route('/settings/promo/delete/<code>', methods=['DELETE'])
@panel_ctx.login_required
def promo_delete(code):
    try:
        if rw_repo.delete_promo_code(code):
            return jsonify({'ok': True, 'message': 'Промокод успешно удален'})
        return jsonify({'ok': False, 'error': 'Промокод не найден'}), 404
    except Exception as e:
        logger.error(f"Ошибка удаления промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_delete =====

# ===== ОБНОВЛЕНИЕ ПРОМОКОДА =====
# Пересоздает промокод с новыми параметрами (сохраняя сам код)
@bp.route('/settings/promo/update/<code>', methods=['POST'])
@panel_ctx.login_required
def promo_update(code):
    try:
        params, error = validate_promo_params(request.form)
        if error: return error
        
        if rw_repo.update_promo_code_params(code=code, **params):
            return jsonify({'ok': True, 'message': 'Промокод успешно обновлен'})
        return jsonify({'ok': False, 'error': 'Не удалось обновить промокод'}), 500
    except Exception as e:
        logger.error(f"Ошибка обновления промокода: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута promo_update =====




# ===== СТРИМИНГ ЛОГОВ БОТА =====
# Обеспечивает передачу логов в реальном времени через SSE (Server-Sent Events)
@bp.route('/settings/logs/stream')
@panel_ctx.login_required
def logs_stream():
    def generate():
        import subprocess, shutil, time, socket, http.client
        tail_lines = "100"
        
        if os.name == 'nt':
            yield f"data: [INFO] --- Windows Logs Simulation Mode ---\n\n"
            while True:
                yield f": heartbeat {get_msk_time().isoformat()}\n\n"
                time.sleep(2)
            return

        cli_cmd = ['docker-compose', 'logs', '-f', f'--tail={tail_lines}'] if shutil.which('docker-compose') else (['docker', 'compose', 'logs', '-f', f'--tail={tail_lines}'] if shutil.which('docker') else None)
        
        if cli_cmd and os.path.exists('/root/remnawave-app'):
            yield f"data: [INFO] Docker CLI найден. Попытка стриминга через команду...\n\n"
            try:
                process = subprocess.Popen(cli_cmd, cwd='/root/remnawave-app', stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
                buf = b''
                while True:
                    chunk = process.stdout.read(1)
                    if not chunk:
                        if buf:
                            text = buf.decode('utf-8', errors='replace')
                            cleaned = clean_ansi(text)
                            if cleaned.rstrip():
                                yield f"data: {cleaned.rstrip()}\n\n"
                        break
                    if chunk == b'\n':
                        text = buf.decode('utf-8', errors='replace')
                        buf = b''
                        cleaned = clean_ansi(text)
                        if cleaned.rstrip():
                            yield f"data: {cleaned.rstrip()}\n\n"
                    elif chunk == b'\r':
                        text = buf.decode('utf-8', errors='replace')
                        buf = b''
                        cleaned = clean_ansi(text)
                        if cleaned.rstrip():
                            yield f"data: \x01CR\x01{cleaned.rstrip()}\n\n"
                    else:
                        buf += chunk
                process.stdout.close()
                yield f"data: [EXIT] Процесс CLI завершен.\n\n"
                return 
            except Exception as e: yield f"data: [WARN] Ошибка CLI: {e}. Пробуем Docker Socket...\n\n"
        
        socket_path = '/var/run/docker.sock'
        if os.path.exists(socket_path):
            yield f"data: [INFO] Docker socket найден в {socket_path}. Подключение...\n\n"
            try:
                hostname = socket.gethostname()
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.connect(socket_path)
                
                request = f"GET /containers/{hostname}/logs?stdout=1&stderr=1&follow=1&tail={tail_lines} HTTP/1.1\r\nHost: localhost\r\n\r\n"
                sock.sendall(request.encode('ascii'))
                
                fp = sock.makefile('rb')
                while True:
                    line = fp.readline()
                    if line in (b'\r\n', b'\n', b''): break
                    
                while True:
                    header = fp.read(8)
                    if not header or len(header) < 8: break
                    import struct
                    payload_size = struct.unpack('>I', header[4:])[0]
                    if payload_size > 0:
                        payload = fp.read(payload_size)
                        if not payload: break
                        try:
                            text = payload.decode('utf-8', errors='replace')
                            cleaned = clean_ansi(text)
                            cleaned = cleaned.replace('\r\n', '\n')
                            segments = cleaned.split('\n')
                            for seg in segments:
                                if '\r' in seg:
                                    parts = seg.split('\r')
                                    last_part = parts[-1]
                                    if last_part.rstrip():
                                        yield f"data: \x01CR\x01{last_part.rstrip()}\n\n"
                                elif seg.rstrip():
                                    yield f"data: {seg.rstrip()}\n\n"
                        except: pass
                sock.close()
                yield f"data: [EXIT] Стрим через сокет завершен.\n\n"
                return
            except Exception as e: yield f"data: [ERROR] Ошибка подключения к сокету: {e}\n\n"
        else: yield f"data: [WARN] Docker socket не найден в {socket_path}.\n\n"

        log_files = ['logs/bot.log', 'bot.log']
        found_log = False
        for log_file in log_files:
            if os.path.exists(log_file):
                found_log = True
                yield f"data: [INFO] Чтение локального файла логов: {log_file}\n\n"
                try:
                    from collections import deque
                    with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                        for line in deque(f, int(tail_lines)): yield f"data: {line.strip()}\n\n"
                        f.seek(0, os.SEEK_END)
                        while True:
                            line = f.readline()
                            if not line:
                                yield f": heartbeat {get_msk_time().isoformat()}\n\n"
                                time.sleep(5)
                                continue
                            yield f"data: {line.strip()}\n\n"
                except Exception as e: yield f"data: [ERROR] Ошибка чтения файла: {e}\n\n"
                break
        
        if not found_log: yield f"data: [WARN] Методы получения логов недоступны.\n\n"

    response = current_app.response_class(generate(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Content-Type'] = 'text/event-stream; charset=utf-8'
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Connection'] = 'keep-alive'
    return response
# ===== Конец роута logs_stream =====

# ===== ИСТОРИЯ ЛОГОВ =====
# Возвращает последние N строк логов из Docker или локальных файлов
@bp.route('/settings/logs/history')
@panel_ctx.login_required
def logs_history():
    try:
        lines_count = int(request.args.get('lines', 50))
        lines_count = min(lines_count, 200) # Принудительное ограничение
        offset = int(request.args.get('offset', 0))
    except ValueError: return jsonify({'ok': False, 'error': 'Некорректные параметры'})

    import subprocess, shutil
    if shutil.which('docker-compose') or shutil.which('docker'):
        total_fetch = offset + lines_count
        cli_cmd = ['docker-compose', 'logs', f'--tail={total_fetch}'] if shutil.which('docker-compose') else ['docker', 'compose', 'logs', f'--tail={total_fetch}']
            
        if cli_cmd and os.path.exists('/root/remnawave-app'):
            try:
                result = subprocess.run(cli_cmd, cwd='/root/remnawave-app', capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    all_lines = result.stdout.splitlines()
                    target_lines = all_lines[:len(all_lines) - offset]
                    chunk = target_lines[-lines_count:] if lines_count < len(target_lines) else target_lines
                    return jsonify({'ok': True, 'lines': chunk})
            except Exception as e: logger.error(f"Ошибка получения истории из Docker: {e}")

    log_files = ['logs/bot.log', 'bot.log']
    for log_file in log_files:
        if os.path.exists(log_file):
            try: 
                with open(log_file, 'r', encoding='utf-8', errors='replace') as f: all_lines = f.readlines()
                target_lines = all_lines[:len(all_lines) - offset]
                chunk = target_lines[-lines_count:] if lines_count < len(target_lines) else target_lines
                return jsonify({'ok': True, 'lines': [l.rstrip() for l in chunk]})
            except Exception as e: return jsonify({'ok': False, 'error': str(e)})

    return jsonify({'ok': False, 'error': 'Логи недоступны'})
# ===== Конец роута logs_history =====

# ===== ОЧИСТКА ЛОГОВ (ЛОКАЛЬНЫХ ИЛИ DOCKER) =====
# Пытается очистить локальные файлы логов или логи контейнера Docker
@bp.route('/settings/logs/clear', methods=['POST'])
@panel_ctx.login_required
def logs_clear():
    try:
        import subprocess
        cleared_any, log_files = False, ['logs/bot.log', 'bot.log']
        for log_file in log_files:
            if os.path.exists(log_file):
                try:
                    with open(log_file, 'w', encoding='utf-8') as f: pass
                    logger.info(f"Локальный лог {log_file} очищен"); cleared_any = True
                except Exception as e: logger.error(f"Не удалось очистить {log_file}: {e}")
        
        if cleared_any: return jsonify({'ok': True, 'message': 'Локальные логи успешно очищены'})
        if os.name == 'nt':
            logger.info("Обнаружена Windows, имитация очистки логов")
            return jsonify({'ok': True, 'message': 'Логи очищены (имитация)'})
        
        result = subprocess.run("truncate -s 0 /var/lib/docker/containers/*/*-json.log", shell=True, capture_output=True, text=True)
        if result.returncode == 0: return jsonify({'ok': True, 'message': 'Логи Docker успешно очищены'})
        return jsonify({'ok': False, 'error': f"Ошибка: {result.stderr or 'Доступ запрещен'}"}), 500
    except Exception as e:
        logger.error(f"Ошибка очистки логов: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута logs_clear =====

# ===== ПЕРЕЗАПУСК БОТА =====
# Выполняет полный перезапуск сервиса через docker-compose или завершает процесс
@bp.route('/settings/restart', methods=['POST'])
@panel_ctx.login_required
def logs_restart():
    from shop_bot.data_manager import panel_stepup as ps

    admin_id = session.get('panel_admin_id')
    if ps.required_stepup_method(admin_id or 0) and not ps.has_valid_stepup(ps.SCOPE_DESTRUCTIVE):
        return jsonify({
            'ok': False,
            'error': 'stepup_required',
            'message': 'Подтвердите 2FA перед перезапуском сервиса',
        }), 403
    try:
        import subprocess
        cmd = None
        compose_args = None
        try:
            subprocess.run(["docker-compose", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            compose_args = ["docker-compose", "restart"]
        except FileNotFoundError:
            try:
                subprocess.run(["docker", "compose", "version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                compose_args = ["docker", "compose", "restart"]
            except FileNotFoundError:
                pass

        if not compose_args:
            logger.warning("Docker CLI не найден. Используется выход из процесса для перезапуска.")
            def suicide():
                import time
                time.sleep(1)
                logger.critical("Выполнение самозавершения через os._exit(1)")
                os._exit(1)
            threading.Thread(target=suicide).start()
            return jsonify({'ok': True, 'message': 'Перезапускаем процесс...'})

        subprocess.Popen(compose_args, shell=False)
        return jsonify({'ok': True, 'message': 'Команда перезапуска отправлена. Подождите 10-20 секунд.'})
    except Exception as e:
        logger.error(f"Ошибка перезапуска бота: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500
# ===== Конец роута logs_restart =====


@bp.route('/settings/workspace/prefs', methods=['GET'])
@panel_ctx.login_required
def workspace_prefs_get():
    import json
    from flask import jsonify, session
    from shop_bot.data_manager.remnawave_repository import get_setting

    admin_id = session.get('panel_admin_id') or session.get('panel_login') or 'default'
    key = f'panel_workspace_prefs_{admin_id}'
    raw = get_setting(key)
    if not raw:
        return jsonify({'ok': True, 'prefs': None})
    try:
        return jsonify({'ok': True, 'prefs': json.loads(raw)})
    except Exception:
        return jsonify({'ok': True, 'prefs': None})


@bp.route('/settings/workspace/prefs', methods=['POST'])
@panel_ctx.login_required
def workspace_prefs_save():
    import json
    from flask import jsonify, request, session
    from shop_bot.data_manager.remnawave_repository import update_setting

    data = request.get_json(silent=True) or {}
    prefs = data.get('prefs')
    if prefs is None or not isinstance(prefs, dict):
        return jsonify({'ok': False, 'error': 'invalid prefs'}), 400
    admin_id = session.get('panel_admin_id') or session.get('panel_login') or 'default'
    key = f'panel_workspace_prefs_{admin_id}'
    try:
        update_setting(key, json.dumps(prefs, ensure_ascii=False))
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
