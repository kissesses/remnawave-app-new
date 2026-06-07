"""Tests for anti-fraud email blocklist and signal registry."""

from shop_bot.security.email_blocklist import (
    normalize_email,
    parse_domain_blocklist,
    validate_email_for_signup,
)
from shop_bot.webhook_server.services.anti_fraud import (
    DETECTORS,
    SIGNAL_DEFINITIONS,
    get_signal_detail,
)


def test_blocks_disposable_domain():
    result = validate_email_for_signup("user@mailinator.com")
    assert result.ok is False
    assert result.reason == "domain_blocked"


def test_blocks_bot_pattern():
    result = validate_email_for_signup("test_3816d0b4@gmail.com")
    assert result.ok is False
    assert result.reason == "pattern_blocked"


def test_allows_normal_email():
    result = validate_email_for_signup("user@gmail.com")
    assert result.ok is True


def test_custom_domain_blocklist():
    result = validate_email_for_signup(
        "user@evil-corp.biz",
        custom_domain_blocklist="evil-corp.biz",
    )
    assert result.ok is False
    assert result.reason == "domain_blocked"


def test_normalize_gmail_alias():
    assert normalize_email("a.b+c@gmail.com") == "ab@gmail.com"


def test_parse_domain_blocklist():
    items = parse_domain_blocklist("foo.com, bar.org\n baz.net")
    assert items == ["foo.com", "bar.org", "baz.net"]


def test_signal_registry_complete():
    assert set(DETECTORS.keys()) == set(SIGNAL_DEFINITIONS.keys())


def test_unknown_signal_returns_none():
    assert get_signal_detail("not_a_signal") is None
