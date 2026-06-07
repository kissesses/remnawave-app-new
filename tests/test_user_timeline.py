from shop_bot.webhook_server.services import user_timeline as ut


def test_matches_filters_category():
    event = {"category": ut.CATEGORY_PAYMENTS, "title": "Pay", "ts": "2026-06-07 12:00:00"}
    assert ut._matches_filters(event, category=ut.CATEGORY_PAYMENTS, q="", date_from="", date_to="")
    assert not ut._matches_filters(event, category=ut.CATEGORY_KEYS, q="", date_from="", date_to="")


def test_matches_filters_search_query():
    event = {"category": ut.CATEGORY_SYSTEM, "title": "Промокод SUMMER", "subtitle": "", "description": "", "badges": []}
    assert ut._matches_filters(event, category=ut.CATEGORY_ALL, q="summer", date_from="", date_to="")


def test_export_user_timeline_not_found(monkeypatch):
    monkeypatch.setattr(ut, "get_user", lambda _uid: None)
    payload = ut.export_user_timeline(999999)
    assert payload["ok"] is False
