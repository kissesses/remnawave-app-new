from shop_bot.data_manager import panel_audit_notify as pan


def test_should_notify_skips_audit_export(monkeypatch):
    monkeypatch.setattr(
        pan,
        "get_setting",
        lambda key: "1" if key == "notifications_admin_audit_enabled" else "0",
    )
    assert pan.should_notify_action("audit.export") is False


def test_should_notify_blocks_db_query_by_default(monkeypatch):
    monkeypatch.setattr(
        pan,
        "get_setting",
        lambda key: "1" if key == "notifications_admin_audit_enabled" else "0",
    )
    assert pan.should_notify_action("db.query") is False


def test_should_notify_allows_db_query_when_enabled(monkeypatch):
    def fake_get(key):
        if key == "notifications_admin_audit_enabled":
            return "1"
        if key == "notifications_admin_audit_include_sql":
            return "1"
        return "0"

    monkeypatch.setattr(pan, "get_setting", fake_get)
    assert pan.should_notify_action("db.query") is True
