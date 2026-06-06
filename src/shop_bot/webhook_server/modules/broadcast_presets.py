"""Built-in broadcast message templates for Broadcast Studio."""

from __future__ import annotations

BROADCAST_CATEGORIES = [
    {"id": "renewal", "label": "Продление", "icon": "autorenew"},
    {"id": "promo", "label": "Акции", "icon": "local_offer"},
    {"id": "onboarding", "label": "Onboarding", "icon": "waving_hand"},
    {"id": "trial", "label": "Триал", "icon": "hourglass_top"},
    {"id": "retention", "label": "Удержание", "icon": "favorite"},
    {"id": "news", "label": "Новости", "icon": "newspaper"},
    {"id": "holiday", "label": "Праздники", "icon": "celebration"},
    {"id": "referral", "label": "Рефералы", "icon": "group_add"},
    {"id": "support", "label": "Поддержка", "icon": "support_agent"},
    {"id": "maintenance", "label": "Техработы", "icon": "build"},
    {"id": "payment", "label": "Оплата", "icon": "payments"},
    {"id": "winback", "label": "Возврат", "icon": "replay"},
]

BROADCAST_PRESETS: list[dict] = [
    {
        "id": "renewal_soft",
        "category": "renewal",
        "label": "Мягкое напоминание",
        "desc": "За 3 дня до окончания подписки",
        "icon": "schedule",
        "audience": "expiring_keys",
        "text": (
            "Привет, {username}! 👋\n\n"
            "Напоминаем: срок вашего ключа скоро истекает.\n"
            "Продлите подписку заранее — доступ останется без перерывов.\n\n"
            "Откройте бота и выберите «Продлить» в меню."
        ),
    },
    {
        "id": "renewal_urgent",
        "category": "renewal",
        "label": "Срочное продление",
        "desc": "Последний день подписки",
        "icon": "warning",
        "audience": "expiring_keys",
        "text": (
            "⚠️ <b>{username}, подписка заканчивается сегодня</b>\n\n"
            "После истечения доступ к VPN будет приостановлен.\n"
            "Продлите сейчас — это займёт меньше минуты."
        ),
    },
    {
        "id": "renewal_expired",
        "category": "renewal",
        "label": "После истечения",
        "desc": "Пользователям с просроченным ключом",
        "icon": "timer_off",
        "audience": "expired_keys",
        "text": (
            "Здравствуйте, {username}!\n\n"
            "Ваш ключ больше не активен. Мы сохранили настройки — "
            "достаточно продлить подписку, и всё заработает снова.\n\n"
            "💡 <i>Нужна помощь? Напишите в поддержку через бота.</i>"
        ),
    },
    {
        "id": "renewal_bonus",
        "category": "renewal",
        "label": "Бонус за продление",
        "desc": "Мотивация вернуться с подарком",
        "icon": "redeem",
        "audience": "expired_keys",
        "text": (
            "🎁 <b>Специально для вас, {username}</b>\n\n"
            "Продлите подписку в ближайшие 48 часов — "
            "и получите дополнительные дни в подарок.\n\n"
            "Предложение действует ограниченное время."
        ),
    },
    {
        "id": "promo_discount",
        "category": "promo",
        "label": "Скидка на подписку",
        "desc": "Промо с процентом скидки",
        "icon": "percent",
        "audience": "all",
        "text": (
            "🔥 <b>Акция для {username}</b>\n\n"
            "Скидка <b>15%</b> на любой тариф — только до конца недели.\n"
            "Введите промокод в боте при оплате.\n\n"
            "<code>SALE15</code>"
        ),
    },
    {
        "id": "promo_flash",
        "category": "promo",
        "label": "Flash-распродажа",
        "desc": "Короткая акция на 24 часа",
        "icon": "bolt",
        "audience": "with_keys",
        "text": (
            "⚡ <b>24 часа — лучшая цена</b>\n\n"
            "Привет, {username}! Сегодня действует спецтариф для активных пользователей.\n"
            "Успейте оформить до полуночи."
        ),
    },
    {
        "id": "promo_new_tariff",
        "category": "promo",
        "label": "Новый тариф",
        "desc": "Анонс нового плана",
        "icon": "star",
        "audience": "all",
        "text": (
            "✨ <b>Новый тариф уже в боте</b>\n\n"
            "{username}, мы добавили план с увеличенным трафиком и приоритетными серверами.\n"
            "Посмотрите в разделе «Купить ключ»."
        ),
    },
    {
        "id": "promo_balance",
        "category": "promo",
        "label": "Бонус на баланс",
        "desc": "Пополнение баланса с бонусом",
        "icon": "account_balance_wallet",
        "audience": "all",
        "text": (
            "💰 <b>Бонус к пополнению</b>\n\n"
            "Пополните баланс от 500 ₽ — получите +10% на счёт.\n"
            "Акция для всех пользователей, включая вас, {username}."
        ),
    },
    {
        "id": "onboarding_welcome",
        "category": "onboarding",
        "label": "Добро пожаловать",
        "desc": "Первое сообщение новому пользователю",
        "icon": "emoji_people",
        "audience": "all",
        "text": (
            "👋 <b>Добро пожаловать, {username}!</b>\n\n"
            "Спасибо, что выбрали нас. В боте вы можете:\n"
            "• оформить подписку\n"
            "• попробовать бесплатный триал\n"
            "• получить инструкцию по подключению\n\n"
            "Нажмите /start, если меню не отображается."
        ),
    },
    {
        "id": "onboarding_guide",
        "category": "onboarding",
        "label": "Как подключиться",
        "desc": "Пошаговая инструкция",
        "icon": "menu_book",
        "audience": "with_keys",
        "text": (
            "📱 <b>Инструкция для {username}</b>\n\n"
            "1. Откройте раздел «Мои ключи»\n"
            "2. Скопируйте ссылку подключения\n"
            "3. Вставьте в приложение VPN\n\n"
            "Подробные гайды для iOS, Android и Windows — в разделе «Как подключить»."
        ),
    },
    {
        "id": "onboarding_first_key",
        "category": "onboarding",
        "label": "Первый ключ",
        "desc": "После покупки первой подписки",
        "icon": "vpn_key",
        "audience": "with_keys",
        "text": (
            "🎉 <b>Ключ активирован!</b>\n\n"
            "{username}, ваша подписка уже работает.\n"
            "Перейдите в «Мои ключи» — там ссылка для подключения и срок действия."
        ),
    },
    {
        "id": "trial_invite",
        "category": "trial",
        "label": "Приглашение к триалу",
        "desc": "Тем, кто ещё не пробовал",
        "icon": "science",
        "audience": "not_used_trial",
        "text": (
            "🆓 <b>Попробуйте бесплатно, {username}</b>\n\n"
            "Доступен пробный период — оцените скорость и стабильность без оплаты.\n"
            "Активируйте триал в главном меню бота."
        ),
    },
    {
        "id": "trial_ending",
        "category": "trial",
        "label": "Триал заканчивается",
        "desc": "Конверсия после триала",
        "icon": "hourglass_bottom",
        "audience": "without_trial",
        "text": (
            "⏳ <b>Триал скоро завершится</b>\n\n"
            "Привет, {username}! Чтобы не потерять доступ, оформите полную подписку.\n"
            "Все ваши настройки сохранятся автоматически."
        ),
    },
    {
        "id": "trial_convert",
        "category": "trial",
        "label": "Скидка после триала",
        "desc": "Спецпредложение после пробного",
        "icon": "loyalty",
        "audience": "without_trial",
        "text": (
            "💎 <b>Спеццена для вас</b>\n\n"
            "{username}, вы уже попробовали сервис — "
            "оформите подписку со скидкой 20% в течение 3 дней."
        ),
    },
    {
        "id": "retention_thanks",
        "category": "retention",
        "label": "Благодарность",
        "desc": "Лояльным активным клиентам",
        "icon": "volunteer_activism",
        "audience": "with_keys",
        "text": (
            "❤️ <b>Спасибо, что с нами, {username}!</b>\n\n"
            "Мы ценим ваше доверие и продолжаем улучшать сервис.\n"
            "Если есть пожелания — напишите в поддержку."
        ),
    },
    {
        "id": "retention_survey",
        "category": "retention",
        "label": "Опрос NPS",
        "desc": "Сбор обратной связи",
        "icon": "poll",
        "audience": "with_keys",
        "text": (
            "📊 <b>Оцените сервис</b>\n\n"
            "{username}, помогите нам стать лучше — "
            "ответьте на 2 вопроса в боте (раздел «Поддержка»).\n"
            "Это займёт меньше минуты."
        ),
    },
    {
        "id": "retention_vip",
        "category": "retention",
        "label": "VIP-предложение",
        "desc": "Для давних подписчиков",
        "icon": "diamond",
        "audience": "with_keys",
        "text": (
            "👑 <b>Эксклюзив для постоянных клиентов</b>\n\n"
            "Привет, {username}! Для вас открыт ранний доступ к новым локациям серверов.\n"
            "Подробности — в личном кабинете бота."
        ),
    },
    {
        "id": "news_update",
        "category": "news",
        "label": "Обновление сервиса",
        "desc": "Новые функции и улучшения",
        "icon": "upgrade",
        "audience": "all",
        "text": (
            "🚀 <b>Обновление бота</b>\n\n"
            "Мы добавили новые возможности:\n"
            "• быстрее выдача ключей\n"
            "• улучшенный личный кабинет\n"
            "• новые способы оплаты\n\n"
            "Проверьте меню — всё уже доступно, {username}."
        ),
    },
    {
        "id": "news_servers",
        "category": "news",
        "label": "Новые серверы",
        "desc": "Расширение инфраструктуры",
        "icon": "dns",
        "audience": "with_keys",
        "text": (
            "🌍 <b>Новые локации</b>\n\n"
            "Добавлены серверы в новых регионах — ниже пинг и выше скорость.\n"
            "Обновите конфиг в «Мои ключи», если используете старую ссылку."
        ),
    },
    {
        "id": "news_policy",
        "category": "news",
        "label": "Изменение условий",
        "desc": "Важное уведомление",
        "icon": "gavel",
        "audience": "all",
        "text": (
            "📋 <b>Важная информация</b>\n\n"
            "Обновили правила использования сервиса.\n"
            "Ознакомьтесь в боте: раздел «Правила».\n\n"
            "Продолжая пользоваться сервисом, вы принимаете новые условия."
        ),
    },
    {
        "id": "holiday_newyear",
        "category": "holiday",
        "label": "Новый год",
        "desc": "Праздничное поздравление",
        "icon": "ac_unit",
        "audience": "all",
        "text": (
            "🎄 <b>С Новым годом, {username}!</b>\n\n"
            "Желаем стабильного соединения и отличного настроения.\n"
            "Праздничная скидка уже ждёт вас в боте."
        ),
    },
    {
        "id": "holiday_march8",
        "category": "holiday",
        "label": "8 марта",
        "desc": "Весеннее поздравление",
        "icon": "local_florist",
        "audience": "all",
        "text": (
            "🌷 <b>С 8 марта!</b>\n\n"
            "Пусть каждый день будет таким же ярким, как весна.\n"
            "Для вас — праздничный промокод в разделе «Акции»."
        ),
    },
    {
        "id": "holiday_blackfriday",
        "category": "holiday",
        "label": "Black Friday",
        "desc": "Сезонная распродажа",
        "icon": "shopping_bag",
        "audience": "all",
        "text": (
            "🛍 <b>Black Friday</b>\n\n"
            "Максимальные скидки года — только 3 дня.\n"
            "{username}, успейте продлить или оформить подписку по лучшей цене."
        ),
    },
    {
        "id": "referral_invite",
        "category": "referral",
        "label": "Реферальная программа",
        "desc": "Пригласи друга",
        "icon": "share",
        "audience": "with_keys",
        "text": (
            "🤝 <b>Пригласите друга</b>\n\n"
            "Поделитесь реферальной ссылкой из бота — "
            "вы и друг получите бонусные дни подписки.\n\n"
            "Ваша ссылка в разделе «Рефералы»."
        ),
    },
    {
        "id": "referral_bonus",
        "category": "referral",
        "label": "Бонус за друга",
        "desc": "Начисление реферального бонуса",
        "icon": "card_giftcard",
        "audience": "with_keys",
        "text": (
            "🎁 <b>Реферальный бонус начислен!</b>\n\n"
            "{username}, ваш друг оформил подписку — "
            "дополнительные дни уже добавлены к вашему ключу."
        ),
    },
    {
        "id": "support_hours",
        "category": "support",
        "label": "Режим поддержки",
        "desc": "Изменение графика",
        "icon": "schedule",
        "audience": "all",
        "text": (
            "💬 <b>Поддержка</b>\n\n"
            "Напоминаем: мы отвечаем ежедневно с 10:00 до 22:00 (МСК).\n"
            "Оставьте обращение через бота — ответим в порядке очереди."
        ),
    },
    {
        "id": "support_faq",
        "category": "support",
        "label": "Частые вопросы",
        "desc": "Снижение нагрузки на поддержку",
        "icon": "quiz",
        "audience": "all",
        "text": (
            "❓ <b>Не работает VPN?</b>\n\n"
            "Проверьте:\n"
            "1. Срок действия ключа\n"
            "2. Актуальность ссылки подключения\n"
            "3. Интернет без VPN\n\n"
            "FAQ и инструкции — в боте, раздел «Помощь»."
        ),
    },
    {
        "id": "maintenance_planned",
        "category": "maintenance",
        "label": "Плановые работы",
        "desc": "Заранее о простое",
        "icon": "engineering",
        "audience": "all",
        "text": (
            "🔧 <b>Плановое обслуживание</b>\n\n"
            "Сегодня с 03:00 до 04:00 (МСК) возможны кратковременные перерывы.\n"
            "Приносим извинения за неудобства."
        ),
    },
    {
        "id": "maintenance_done",
        "category": "maintenance",
        "label": "Работы завершены",
        "desc": "После техобслуживания",
        "icon": "check_circle",
        "audience": "all",
        "text": (
            "✅ <b>Обслуживание завершено</b>\n\n"
            "Все системы работают в штатном режиме.\n"
            "Если заметите проблемы — напишите в поддержку."
        ),
    },
    {
        "id": "payment_reminder",
        "category": "payment",
        "label": "Незавершённая оплата",
        "desc": "Брошенная корзина",
        "icon": "shopping_cart",
        "audience": "all",
        "text": (
            "💳 <b>Оплата не завершена</b>\n\n"
            "{username}, вы начали оформление подписки, но не завершили платёж.\n"
            "Вернитесь в бот — тариф сохранён в корзине."
        ),
    },
    {
        "id": "payment_methods",
        "category": "payment",
        "label": "Новый способ оплаты",
        "desc": "Анонс платёжного метода",
        "icon": "credit_card",
        "audience": "all",
        "text": (
            "💳 <b>Новый способ оплаты</b>\n\n"
            "Теперь можно оплатить подписку удобным для вас методом.\n"
            "Все варианты — в разделе «Купить ключ»."
        ),
    },
    {
        "id": "winback_inactive",
        "category": "winback",
        "label": "Мы скучаем",
        "desc": "Возврат неактивных",
        "icon": "sentiment_dissatisfied",
        "audience": "expired_keys",
        "text": (
            "😔 <b>Мы скучаем, {username}</b>\n\n"
            "Давно не видели вас онлайн. Вернитесь — "
            "подготовили персональное предложение на продление."
        ),
    },
    {
        "id": "winback_last_chance",
        "category": "winback",
        "label": "Последний шанс",
        "desc": "Финальное предложение",
        "icon": "priority_high",
        "audience": "expired_keys",
        "text": (
            "⏰ <b>Последний шанс вернуться</b>\n\n"
            "Специальная цена на продление действует ещё 24 часа.\n"
            "После этого предложение будет недоступно."
        ),
    },
    {
        "id": "test_admin",
        "category": "news",
        "label": "Тестовая рассылка",
        "desc": "Проверка перед массовой отправкой",
        "icon": "bug_report",
        "audience": "test",
        "text": (
            "🧪 <b>Тестовое сообщение</b>\n\n"
            "Это проверка рассылки для администраторов.\n"
            "Если вы видите это — форматирование работает корректно."
        ),
    },
]


def get_broadcast_presets_payload() -> dict:
    return {
        "categories": BROADCAST_CATEGORIES,
        "presets": BROADCAST_PRESETS,
    }
