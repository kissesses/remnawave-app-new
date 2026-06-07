from shop_bot.data_manager import telegram_notify as tg


def test_parse_chat_id_negative_supergroup():
    assert tg.parse_chat_id("-1003907207135") == -1003907207135


def test_parse_chat_id_empty():
    assert tg.parse_chat_id("") is None
    assert tg.parse_chat_id(None) is None


def test_effective_thread_id_general_topic():
    assert tg.effective_thread_id(1) is None
    assert tg.effective_thread_id(42) == 42


def test_category_topic_keys_include_admin():
    assert tg.CATEGORY_TOPIC_KEYS[tg.CATEGORY_ADMIN] == "notifications_topic_admin"
