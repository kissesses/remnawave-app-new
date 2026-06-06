import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
from hmac import compare_digest

from flask import current_app, jsonify, request

from shop_bot.bot import handlers
from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager.remnawave_repository import (
    find_and_complete_pending_transaction,
    find_and_complete_ton_transaction,
    get_setting,
)
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('webhooks', __name__)

_PAYMENT_ID_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _verify_ton_webhook_secret() -> bool:
    secret = (get_setting("ton_webhook_secret") or "").strip()
    if not secret:
        logger.error("TON webhook: ton_webhook_secret не настроен")
        return False
    provided = (
        request.args.get("secret")
        or request.headers.get("X-Webhook-Secret")
        or request.headers.get("Authorization")
        or ""
    ).strip()
    if provided.lower().startswith("bearer "):
        provided = provided[7:].strip()
    return bool(provided and compare_digest(provided, secret))


@panel_ctx.csrf.exempt
@bp.route('/heleket-webhook', methods=['POST'])
def heleket_webhook_handler():
    """
    Обработка вебхука от Heleket.
    Ожидается POST запрос с JSON телом.
    Заголовки:
        sign: подпись запроса (md5(base64(json_body) + api_key))
    Тело (пример):
    {
        "order_id": "...",
        "amount": "...",
        "currency": "...",
        "status": "PAID",
        "description": "..." (наш metadata json)
    }
    """
    try:
        raw_data = request.get_data()
        
        headers_dict = dict(request.headers)
        logger.info(f"Вебхук Heleket заголовки: {headers_dict}")
        
        signature = request.headers.get("sign") or request.headers.get("Sign") or request.headers.get("SIGN") or ""
        
        api_key = (get_setting("heleket_api_key") or "").strip()
        if not api_key:
            logger.error("Вебхук Heleket: API ключ не настроен")
            return jsonify({"error": "Configuration error"}), 500
        
        base64_body = base64.b64encode(raw_data).decode()
        expected_sign = hashlib.md5((base64_body + api_key).encode()).hexdigest()
        
        if not compare_digest(signature, expected_sign):
            logger.warning(f"Вебхук Heleket: Неверная подпись. Получено: '{signature}', Ожидалось: '{expected_sign}'")
            return jsonify({"error": "Invalid signature"}), 403
        try:
            data = json.loads(raw_data)
        except json.JSONDecodeError:
            logger.error("Вебхук Heleket: Некорректный JSON")
            return jsonify({"error": "Invalid JSON"}), 400
            
        logger.info(f"Данные вебхука Heleket: {data}")
        
        description_raw = data.get("description", "")
        metadata = {}
        if description_raw:
            try:
                metadata = json.loads(description_raw)
            except Exception:
                logger.warning(f"Вебхук Heleket: Не удалось разобрать JSON описания: {description_raw}")
        
        payment_id = data.get("order_id")
        status = str(data.get("status", "")).lower()

        if payment_id: 
            if status not in ['paid', 'confirm_check', 'success']:
                logger.warning(f"Вебхук Heleket: Платеж {payment_id} имеет статус '{status}' (не оплачен). Игнорируем.")
                return jsonify({"state": 0, "message": "Ignored non-paid status"}), 200

            meta_from_db = find_and_complete_pending_transaction(payment_id)
            
            if meta_from_db:
                logger.info(f"Вебхук Heleket: Транзакция {payment_id} найдена и завершена.")
                
                bot = panel_ctx.bot_controller.get_bot_instance()
                loop = current_app.config.get('EVENT_LOOP')
                
                if bot and loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        handlers.process_successful_payment(bot, meta_from_db),
                        loop
                    )
                    logger.info(f"Вебхук Heleket: Запланирована обработка платежа для {payment_id}")
                else:
                    logger.error("Вебхук Heleket: Цикл событий или экземпляр бота не готовы")
                    
                panel_ctx.handle_promo_after_payment(meta_from_db)
                
            else:
                logger.warning(f"Вебхук Heleket: Транзакция {payment_id} не найдена или уже завершена.")
        
        return jsonify({"state": 0, "message": "OK"}), 200

    except Exception as e:
        logger.error(f"Вебхук Heleket: Внутренняя ошибка: {e}", exc_info=True)
        return jsonify({"error": "Internal error"}), 500

@panel_ctx.csrf.exempt
@bp.route('/yookassa-webhook', methods=['POST'])
def yookassa_webhook_handler():
    try:
        event_json = request.json or {}
        if event_json.get("event") != "payment.succeeded":
            return 'OK', 200

        shop_id = (get_setting("yookassa_shop_id") or "").strip()
        secret_key = (get_setting("yookassa_secret_key") or "").strip()
        if not shop_id or not secret_key:
            logger.warning("YooKassa webhook: учётные данные не настроены")
            return 'Forbidden', 403

        payment_obj = event_json.get("object", {}) or {}
        payment_id = payment_obj.get("id")
        if not payment_id:
            return 'OK', 200

        try:
            from yookassa import Configuration as YookassaConfiguration, Payment as YookassaPayment
            YookassaConfiguration.account_id = shop_id
            YookassaConfiguration.secret_key = secret_key
            verified = YookassaPayment.find_one(payment_id)
            if not verified or getattr(verified, "status", None) != "succeeded":
                logger.warning("YooKassa webhook: payment %s not succeeded in API", payment_id)
                return 'OK', 200
            verified_meta = dict(getattr(verified, "metadata", None) or {})
        except Exception as exc:
            logger.error("YooKassa webhook: verification failed for %s: %s", payment_id, exc)
            return 'Forbidden', 403

        local_payment_id = str(verified_meta.get("payment_id") or "").strip()
        if not local_payment_id:
            logger.warning("YooKassa webhook: missing payment_id in verified metadata for %s", payment_id)
            return 'OK', 200

        metadata = find_and_complete_pending_transaction(local_payment_id)
        if not metadata:
            logger.warning("YooKassa webhook: pending tx not found for %s", local_payment_id)
            return 'OK', 200

        bot = panel_ctx.bot_controller.get_bot_instance()
        payment_processor = handlers.process_successful_payment
        if bot is not None and payment_processor is not None:
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(payment_processor(bot, metadata), loop)
            else:
                logger.error("YooKassa вебхук: цикл событий недоступен!")
        return 'OK', 200
    except Exception as e:
        logger.error(f"Ошибка в обработчике вебхука YooKassa: {e}", exc_info=True)
        return 'Error', 500
    

@panel_ctx.csrf.exempt
@bp.route('/test-webhook', methods=['GET', 'POST'])
def test_webhook():
    """Debug-only webhook probe."""
    if os.getenv('SHOPBOT_DEBUG') != '1':
        return 'Not Found', 404
    if request.method == 'GET':
        return f"Webhook server is running! Time: {get_msk_time()}"
    return f"POST received! Data: {request.get_json() or request.form.to_dict()}"


@panel_ctx.csrf.exempt
@bp.route('/debug-all', methods=['GET', 'POST', 'PUT', 'DELETE'])
def debug_all_requests():
    """Debug-only request echo."""
    if os.getenv('SHOPBOT_DEBUG') != '1':
        return 'Not Found', 404
    logger.debug("Received %s request to /debug-all", request.method)
    return {
        "method": request.method,
        "headers": dict(request.headers),
        "form": request.form.to_dict(),
        "json": request.get_json(silent=True),
        "args": request.args.to_dict(),
        "timestamp": get_msk_time().isoformat()
    }

@panel_ctx.csrf.exempt
@bp.route('/yoomoney-webhook', methods=['POST'])
def yoomoney_webhook_handler():
    """ЮMoney HTTP уведомление (кнопка/ссылка p2p). Подпись: sha1(notification_type&operation_id&amount&currency&datetime&sender&codepro&notification_secret&label)."""
    logger.info("🔔 Получен webhook от ЮMoney")
    
    try:
        form = request.form
        logger.info(f"📋 Данные webhook: {dict(form)}")
        
        required = [
            'notification_type', 'operation_id', 'amount', 'currency', 'datetime', 'sender', 'codepro', 'label', 'sha1_hash'
        ]
        if not all(k in form for k in required):
            logger.warning(f"❌ Отсутствуют обязательные поля. Доступно: {list(form.keys())}")
            return 'Bad Request', 400
        

        notification_type = form.get('notification_type', '')
        logger.info(f"📝 Тип уведомления: {notification_type}")
        if notification_type != 'p2p-incoming':
            logger.info(f"⏭️  Игнорируем тип уведомления: {notification_type}")
            return 'OK', 200
        

        codepro = form.get('codepro', '')
        if codepro.lower() == 'true':
            logger.info("🧪 Игнорируем тестовый платеж (codepro=true)")
            return 'OK', 200
        
        secret = get_setting('yoomoney_secret') or ''
        signature_str = "&".join([
            form.get('notification_type',''),
            form.get('operation_id',''),
            form.get('amount',''),
            form.get('currency',''),
            form.get('datetime',''),
            form.get('sender',''),
            form.get('codepro',''),
            secret,
            form.get('label',''),
        ])
        expected = hashlib.sha1(signature_str.encode('utf-8')).hexdigest()
        provided = (form.get('sha1_hash') or '').lower()
        if expected != provided:
            logger.warning("🔐 Неверная подпись")
            return 'Forbidden', 403
        

        payment_id = form.get('label')
        if not payment_id:
            logger.warning("🏷️  Пустой label")
            return 'OK', 200
        
        logger.info(f"💰 Обрабатываем платеж: {payment_id}")
        metadata = find_and_complete_pending_transaction(payment_id)
        if not metadata:
            logger.warning(f"❌ Метаданные не найдены для платежа: {payment_id}")
            return 'OK', 200
        
        logger.info(f"✅ Найдены метаданные для платежа {payment_id}: пользователь={metadata.get('user_id')}, сумма={metadata.get('price')}")
        bot = panel_ctx.bot_controller.get_bot_instance()
        loop = current_app.config.get('EVENT_LOOP')
        payment_processor = handlers.process_successful_payment
        if bot and loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(payment_processor(bot, metadata), loop)
            logger.info(f"🚀 Запущена обработка платежа: {payment_id}")
        else:
            logger.error("❌ Бот или цикл событий недоступен")
        return 'OK', 200
    except Exception as e:
        logger.error(f"💥 Ошибка в webhook ЮMoney: {e}", exc_info=True)
        return 'Error', 500

@panel_ctx.csrf.exempt
@bp.route('/cryptobot-webhook', methods=['POST'])
def cryptobot_webhook_handler():
    try:
        raw_body = request.get_data()
        api_token = (get_setting("cryptobot_token") or "").strip()
        signature = request.headers.get("crypto-pay-api-signature") or ""
        if api_token:
            secret = hashlib.sha256(api_token.encode()).digest()
            expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
            if not compare_digest(expected, signature):
                logger.warning("CryptoBot webhook: invalid signature")
                return 'Forbidden', 403
        else:
            logger.warning("CryptoBot webhook: token not configured")
            return 'Forbidden', 403

        request_data = json.loads(raw_body.decode("utf-8") if raw_body else "{}")
        
        if request_data and request_data.get('update_type') == 'invoice_paid':
            payload_data = request_data.get('payload', {})
            
            payload_string = payload_data.get('payload')
            
            if not payload_string:
                logger.warning("CryptoBot вебхук: Получен оплаченный invoice, но payload пустой.")
                return 'OK', 200

            parts = payload_string.split(':')
            if len(parts) < 10 or not _PAYMENT_ID_UUID_RE.match(parts[0]):
                logger.error(f"CryptoBot вебхук: некорректный формат payload: {payload_string}")
                return 'Error', 400

            payment_id = parts[0]
            metadata = find_and_complete_pending_transaction(payment_id)
            if not metadata:
                logger.warning(f"CryptoBot вебхук: транзакция {payment_id} не найдена или уже завершена")
                return 'OK', 200
            
            bot = panel_ctx.bot_controller.get_bot_instance()
            loop = current_app.config.get('EVENT_LOOP')
            payment_processor = handlers.process_successful_payment

            if bot and loop and loop.is_running():
                try:
                    panel_ctx.handle_promo_after_payment(metadata)
                except Exception:
                    pass
                asyncio.run_coroutine_threadsafe(payment_processor(bot, metadata), loop)
            else:
                logger.error("CryptoBot вебхук: не удалось обработать платёж — бот или цикл событий не запущены.")

        return 'OK', 200
        
    except Exception as e:
        logger.error(f"Ошибка в обработчике вебхука CryptoBot: {e}", exc_info=True)
        return 'Error', 500
    

    

@panel_ctx.csrf.exempt
@bp.route('/ton-webhook', methods=['POST'])
def ton_webhook_handler():
    try:
        if not _verify_ton_webhook_secret():
            return 'Forbidden', 403

        data = request.json or {}
        logger.info(f"Получен вебхук TonAPI: {data}")

        wallet_address = (get_setting("ton_wallet_address") or "").strip()
        if not wallet_address:
            logger.error("TON webhook: ton_wallet_address не настроен")
            return 'Forbidden', 403

        if 'tx_id' in data:
            account_id = (data.get('account_id') or '').strip()
            if account_id and account_id != wallet_address:
                logger.warning("TON webhook: account_id %s не совпадает с кошельком", account_id)
                return 'OK', 200

            for tx in data.get('in_progress_txs', []) + data.get('txs', []):
                in_msg = tx.get('in_msg')
                if in_msg and in_msg.get('decoded_comment'):
                    payment_id = in_msg['decoded_comment'].strip()
                    if not _PAYMENT_ID_UUID_RE.match(payment_id):
                        continue
                    amount_nano = int(in_msg.get('value', 0))
                    amount_ton = float(amount_nano / 1_000_000_000)

                    metadata = find_and_complete_ton_transaction(payment_id, amount_ton)
                    
                    if metadata:
                        logger.info(f"TON Payment successful for payment_id: {payment_id}")
                        bot = panel_ctx.bot_controller.get_bot_instance()
                        loop = current_app.config.get('EVENT_LOOP')
                        payment_processor = handlers.process_successful_payment

                        if bot and loop and loop.is_running():
                            asyncio.run_coroutine_threadsafe(payment_processor(bot, metadata), loop)
        
        return 'OK', 200
    except Exception as e:
        logger.error(f"Ошибка в обработчике вебхука TonAPI: {e}", exc_info=True)
        return 'Error', 500

@panel_ctx.csrf.exempt
@bp.route('/platega-webhook', methods=['POST'])
def platega_webhook_handler():
    """Обработчик webhook от Platega"""
    try:
        
        merchant_id = request.headers.get('X-MerchantId')
        secret = request.headers.get('X-Secret')
        
        expected_merchant = get_setting('platega_merchant_id')
        expected_secret = get_setting('platega_api_key')
        
        if not expected_merchant or not expected_secret:
            logger.warning("Platega webhook: настройки не заданы")
            return 'OK', 200
        
        if merchant_id != expected_merchant or secret != expected_secret:
            logger.warning(f"Platega webhook: неверные учетные данные. Получено: merchant_id={merchant_id}")
            return 'Forbidden', 403
        
        data = request.json
        logger.info(f"Platega webhook получен: {data}")
        
        
        status = data.get('status')
        if status == 'CONFIRMED':
            
            payment_id = data.get('payload')
            
            if not payment_id:
                logger.warning("Platega webhook: отсутствует payload (payment_id)")
                return 'OK', 200
            
            
            metadata = find_and_complete_pending_transaction(payment_id)
            if metadata:
                logger.info(f"Platega: найдены метаданные для платежа {payment_id}")
                
                bot = panel_ctx.bot_controller.get_bot_instance()
                loop = current_app.config.get('EVENT_LOOP')
                payment_processor = handlers.process_successful_payment
                
                if bot and loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        payment_processor(bot, metadata), 
                        loop
                    )
                    logger.info(f"Platega: платеж {payment_id} обработан")
                else:
                    logger.error("Platega webhook: бот или цикл событий недоступен")
            else:
                logger.warning(f"Platega webhook: метаданные не найдены для платежа {payment_id}")
        elif status == 'CANCELED':
            logger.info(f"Platega webhook: платеж отменен, ID={data.get('id')}")
        else:
            logger.info(f"Platega webhook: получен статус {status}")
        
        return 'OK', 200
    except Exception as e:
        logger.error(f"Ошибка в обработчике вебхука Platega: {e}", exc_info=True)
        return 'Error', 500

