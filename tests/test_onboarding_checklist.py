from shop_bot.webhook_server.services import onboarding_checklist as oc


def test_payment_configured_yookassa():
    settings = {
        "yookassa_shop_id": "123",
        "yookassa_secret_key": "sec",
    }
    assert oc._payment_configured(settings) is True


def test_payment_configured_empty():
    assert oc._payment_configured({}) is False
