from shop_bot.security import kv_store


def test_memory_set_get_pop(monkeypatch):
    monkeypatch.setattr(kv_store, "_get_redis", lambda: None)
    kv_store._MEMORY.clear()
    kv_store.set_value("test:key", "42", ttl=60)
    assert kv_store.get_value("test:key") == "42"
    assert kv_store.pop_value("test:key") == "42"
    assert kv_store.get_value("test:key") is None


def test_pending_marker_empty_value(monkeypatch):
    monkeypatch.setattr(kv_store, "_get_redis", lambda: None)
    kv_store._MEMORY.clear()
    kv_store.set_pending_marker("webapp:auth:abc", ttl=60)
    assert kv_store.get_value("webapp:auth:abc") == ""
