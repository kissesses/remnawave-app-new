import time
import asyncio
import logging
import re
import hashlib
from shop_bot.security.rate_store import clear_failure, is_locked, record_failure
from flask import request
from aiogram import Router, F
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

logger = logging.getLogger(__name__)

BANNED_DATA = {
    'ips': {},
    'ua_hashes': {}
}

FAILED_LOGIN_DATA: dict[str, dict] = {}
MAX_FAILED_LOGINS = 5
LOGIN_LOCK_SECONDS = 900


def is_login_locked(ip: str | None) -> bool:
    if not ip:
        return False
    return is_locked(f"panel-login:{ip}")


def record_failed_login(ip: str | None) -> None:
    if not ip:
        return
    record_failure(
        f"panel-login:{ip}",
        max_failures=MAX_FAILED_LOGINS,
        lock_seconds=LOGIN_LOCK_SECONDS,
    )
    logger.warning("Failed panel login from IP %s", ip)


def clear_failed_logins(ip: str | None) -> None:
    if ip:
        clear_failure(f"panel-login:{ip}")


MAX_TOTP_LOGIN_FAILURES = 5
TOTP_LOGIN_LOCK_SECONDS = 900


def _totp_login_lock_key(ip: str | None, admin_id: int | None) -> str | None:
    if not ip or admin_id is None:
        return None
    return f"panel-totp-login:{ip}:{int(admin_id)}"


def is_totp_login_locked(ip: str | None, admin_id: int | None) -> bool:
    key = _totp_login_lock_key(ip, admin_id)
    return bool(key and is_locked(key))


def record_failed_totp_login(ip: str | None, admin_id: int | None) -> None:
    key = _totp_login_lock_key(ip, admin_id)
    if not key:
        return
    record_failure(
        key,
        max_failures=MAX_TOTP_LOGIN_FAILURES,
        lock_seconds=TOTP_LOGIN_LOCK_SECONDS,
    )
    record_failed_login(ip)
    logger.warning("Failed panel TOTP login from IP %s admin_id=%s", ip, admin_id)


def clear_totp_login_failures(ip: str | None, admin_id: int | None) -> None:
    key = _totp_login_lock_key(ip, admin_id)
    if key:
        clear_failure(key)


MAX_STEPUP_TOTP_FAILURES = 5
STEPUP_TOTP_LOCK_SECONDS = 900


def _stepup_totp_lock_key(admin_id: int | None, ip: str | None) -> str | None:
    if admin_id is None or not ip:
        return None
    return f"stepup-totp:{int(admin_id)}:{ip}"


def is_stepup_totp_locked(admin_id: int | None, ip: str | None) -> bool:
    key = _stepup_totp_lock_key(admin_id, ip)
    return bool(key and is_locked(key))


def record_failed_stepup_totp(admin_id: int | None, ip: str | None) -> None:
    key = _stepup_totp_lock_key(admin_id, ip)
    if not key:
        return
    record_failure(
        key,
        max_failures=MAX_STEPUP_TOTP_FAILURES,
        lock_seconds=STEPUP_TOTP_LOCK_SECONDS,
    )
    logger.warning("Failed DB step-up TOTP admin_id=%s ip=%s", admin_id, ip)


def clear_stepup_totp_failures(admin_id: int | None, ip: str | None) -> None:
    key = _stepup_totp_lock_key(admin_id, ip)
    if key:
        clear_failure(key)


MAX_INVITE_REDEEM_FAILURES = 5
INVITE_REDEEM_LOCK_SECONDS = 900


def is_invite_redeem_locked(ip: str | None) -> bool:
    if not ip:
        return False
    return is_locked(f"panel-invite:{ip}")


def record_failed_invite_redeem(ip: str | None) -> None:
    if not ip:
        return
    record_failure(
        f"panel-invite:{ip}",
        max_failures=MAX_INVITE_REDEEM_FAILURES,
        lock_seconds=INVITE_REDEEM_LOCK_SECONDS,
    )
    logger.warning("Failed invite redeem from IP %s", ip)


def clear_failed_invite_redeems(ip: str | None) -> None:
    if ip:
        clear_failure(f"panel-invite:{ip}")


def is_blocked(ip, ua):
    now = time.time()
    if ip in BANNED_DATA['ips']:
        if now < BANNED_DATA['ips'][ip]:
            return True
        else:
            del BANNED_DATA['ips'][ip]
    
    ua_hash = hashlib.md5(ua.encode()).hexdigest()[:12]
    if ua_hash in BANNED_DATA['ua_hashes']:
        if now < BANNED_DATA['ua_hashes'][ua_hash]:
            return True
        else:
            del BANNED_DATA['ua_hashes'][ua_hash]
            
    return False

def block_access(ip, ua_hash, duration_sec=300):
    now = time.time()
    expire = now + duration_sec
    BANNED_DATA['ips'][ip] = expire
    BANNED_DATA['ua_hashes'][ua_hash] = expire
    logger.info(f"Blocked IP {ip} and UA hash {ua_hash} for {duration_sec}s")

def parse_ua(ua):
    os_info = "Unknown OS"
    engine = "Unknown Engine"
    
    if "iPhone" in ua: os_info = "iPhone"
    elif "iPad" in ua: os_info = "iPad"
    elif "Android" in ua:
        v = re.search(r"Android ([\d.]+)", ua)
        os_info = f"Android {v.group(1)}" if v else "Android"
    elif "Windows NT 10.0" in ua: os_info = "Windows 10/11"
    elif "Windows NT 6.3" in ua: os_info = "Windows 8.1"
    elif "Windows NT 6.1" in ua: os_info = "Windows 7"
    elif "Macintosh" in ua: os_info = "macOS"
    elif "Linux" in ua: os_info = "Linux"
    
    if "AppleWebKit" in ua: engine = "WebKit"
    elif "Gecko" in ua and "Firefox" in ua: engine = "Gecko"
    elif "Trident" in ua: engine = "Trident"
    elif "Chrome" in ua: engine = "Blink"
    
    return os_info, engine

def format_security_msg(title, info):
    os_info, engine = parse_ua(info.get('ua', ''))
    
    lines = [title]
    if info.get('msg'):
        lines.append(info['msg'])
    lines.append("")
    
    is_success = "Успешный вход" in title
    
    mapping = [
        ('🛰 <b>iP:</b>', info.get('ip')),
        ('🔎 <b>Реальный ip:</b>', info.get('real_ip')),
        ('💻 <b>ОС и версия:</b>', os_info),
        ('📃 <b>Движок браузера:</b>', engine),
        ('🗽 <b>Метод запроса:</b>', info.get('method')), 
    ]
    if not is_success:
        mapping.append(('👤 <b>Введеный логин:</b>', info.get('user')))
        mapping.append(('🔐 <b>Пароль:</b>', '•••••••• (скрыт)'))
        
    mapping.extend([
        ('🌐 <b>UserAgent:</b>', info.get('ua')),
    ])
    
    for label, val in mapping:
        if val:
            if 'UserAgent:' in label:
                lines.append(f"{label}\n<blockquote><code>{val}</code></blockquote>")
            else:
                lines.append(f"{label} <code>{val}</code>")
            
    if info.get('footer'):
        lines.append("")
        lines.append(info['footer'])
        
    return "\n".join(lines)

async def send_notification(bot, chat_id, text, reply_markup=None):
    try:
        await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup, parse_mode="HTML")
    except Exception as e:
        logger.error(f"Security notify error: {e}")

def notify_admin(bot, loop, admin_id, title, info, is_alert=False):
    text = format_security_msg(title, info)
    kb = None

    if is_alert:
        kb = InlineKeyboardBuilder()
        kb.button(text="✅ Да", callback_data="sec_it_was_me")
        ua_hash = hashlib.md5(info.get('ua', '').encode()).hexdigest()[:12]
        kb.button(text="❌ Нет", callback_data=f"sec_block:{info.get('ip')}:{ua_hash}")
        kb.adjust(2)
        kb = kb.as_markup()

    try:
        from shop_bot.data_manager import telegram_notify as tg_notify
        tg_notify.send_notification_sync(
            bot, loop, tg_notify.CATEGORY_AUTH, text, reply_markup=kb,
        )
    except Exception as exc:
        logger.error("Security notify error: %s", exc)
        if bot and admin_id:
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(send_notification(bot, admin_id, text, kb), loop)
            else:
                try:
                    asyncio.run(send_notification(bot, admin_id, text, kb))
                except Exception:
                    pass

    try:
        from shop_bot.data_manager import smtp_mailer
        smtp_mailer.send_security_notification(title, info)
    except Exception as exc:
        logger.error("SMTP security notify error: %s", exc)

def get_security_router():
    router = Router()
    
    @router.callback_query(F.data == "sec_it_was_me")
    async def handle_was_me(callback: CallbackQuery):
        from shop_bot.data_manager.database import get_setting
        admin_id = int(get_setting("admin_telegram_id") or 0)
        if admin_id and callback.from_user.id != admin_id:
            await callback.answer("Недостаточно прав", show_alert=True)
            return
        await callback.message.edit_text(callback.message.text + "\n\n✅ <i>Подтверждено владельцем.</i>", reply_markup=None)
        await callback.answer("Принято")

    @router.callback_query(F.data.startswith("sec_block:"))
    async def handle_block(callback: CallbackQuery):
        from shop_bot.data_manager.database import get_setting
        admin_id = int(get_setting("admin_telegram_id") or 0)
        if admin_id and callback.from_user.id != admin_id:
            await callback.answer("Недостаточно прав", show_alert=True)
            return
        try:
            parts = callback.data.split(":")
            if len(parts) >= 3:
                ip = parts[1]
                ua_hash = parts[2]
                
                block_access(ip, ua_hash)
                
                text = callback.message.text
                

                new_header = "🟡  <b>ЗАБЛОКИРОВАН</b>\n<blockquote>iP и UserAgent заблокированы, если даже пользователь поменяет ip все равно будет блокирован по UserAgent</blockquote>\n"
                new_footer = f"\n🚫 IP {ip} заблокирован на 5 минут."
                

                lines = text.split('\n')
                data_lines = []
                capture = False
                
                for line in lines:

                    if any(x in line for x in ["iP:", "ОС и версия:", "Движок браузера:", "Метод запроса:", "UserAgent:", "Введеный логин:", "Введеный пароль:", "Реальный ip:"]):

                        if "iP:" in line: line = line.replace("iP:", "<b>iP:</b>").replace(line.split("iP:")[1], f" <code>{line.split('iP:')[1].strip()}</code>")
                        elif "ОС и версия:" in line: line = line.replace("ОС и версия:", "<b>ОС и версия:</b>").replace(line.split("ОС и версия:")[1], f" <code>{line.split('ОС и версия:')[1].strip()}</code>")
                        elif "Движок браузера:" in line: line = line.replace("Движок браузера:", "<b>Движок браузера:</b>").replace(line.split("Движок браузера:")[1], f" <code>{line.split('Движок браузера:')[1].strip()}</code>")
                        elif "Метод запроса:" in line: line = line.replace("Метод запроса:", "<b>Метод запроса:</b>").replace(line.split("Метод запроса:")[1], f" <code>{line.split('Метод запроса:')[1].strip()}</code>")
                        elif "Введеный логин:" in line: line = line.replace("Введеный логин:", "<b>Введеный логин:</b>").replace(line.split("Введеный логин:")[1], f" <code>{line.split('Введеный логин:')[1].strip()}</code>")
                        elif "Введеный пароль:" in line: line = line.replace("Введеный пароль:", "<b>Введеный пароль:</b>").replace(line.split("Введеный пароль:")[1], f" <code>{line.split('Введеный пароль:')[1].strip()}</code>")
                        elif "Реальный ip:" in line: line = line.replace("Реальный ip:", "<b>Реальный ip:</b>").replace(line.split("Реальный ip:")[1], f" <code>{line.split('Реальный ip:')[1].strip()}</code>")
                        elif "UserAgent:" in line:
                            ua_val = line.split("UserAgent:")[1].replace("<code>", "").replace("</code>", "").strip()
                            line = f"<b>UserAgent:</b>\n<blockquote><code>{ua_val}</code></blockquote>"
                        
                        data_lines.append(line)

                
                final_text = new_header + "\n" + "\n".join(data_lines) + new_footer
                
                await callback.message.edit_text(final_text, reply_markup=None, parse_mode="HTML")
                await callback.answer("Доступ заблокирован")
            else:
                await callback.answer("Ошибка данных", show_alert=True)
                
        except Exception as e:
            logger.error(f"Block handle error: {e}")
            await callback.answer("Ошибка обработки", show_alert=True)
    
    return router
