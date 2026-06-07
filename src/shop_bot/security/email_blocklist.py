"""Email validation for signup — ported from STEALTHNET signup-protection."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

Reason = Literal["domain_blocked", "pattern_blocked", "tld_reserved", "invalid_format"]

BUILTIN_EMAIL_BLOCKLIST: tuple[str, ...] = (
    "example.com",
    "example.net",
    "example.org",
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.info",
    "guerrillamail.biz",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamailblock.com",
    "sharklasers.com",
    "10minutemail.com",
    "10minutemail.net",
    "20minutemail.com",
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "tempmailo.com",
    "tempmail.net",
    "tempmailaddress.com",
    "tempm.com",
    "throwawaymail.com",
    "throwaway.email",
    "trashmail.com",
    "trashmail.net",
    "trashmail.io",
    "yopmail.com",
    "yopmail.net",
    "yopmail.fr",
    "getnada.com",
    "nada.email",
    "maildrop.cc",
    "dispostable.com",
    "fakeinbox.com",
    "mintemail.com",
    "tempinbox.com",
    "spambox.us",
    "incognitomail.com",
    "mytemp.email",
    "mt2014.com",
    "mt2015.com",
    "mvrht.com",
    "spamavert.com",
    "spamgourmet.com",
    "discard.email",
    "gufum.com",
    "tmpmail.org",
    "tmpmail.net",
    "tmpeml.com",
    "moakt.cc",
    "moakt.com",
    "moakt.ws",
    "emltmp.com",
    "emaildrop.io",
    "harakirimail.com",
    "spam4.me",
    "anonbox.net",
    "deadaddress.com",
    "test.com",
    "test.org",
    "test.net",
)

RESERVED_TLDS: tuple[str, ...] = (
    ".test",
    ".invalid",
    ".localhost",
    ".local",
    ".example",
)

BUILTIN_EMAIL_PATTERN_BLOCKLIST: tuple[re.Pattern[str], ...] = (
    re.compile(r"^test_[a-f0-9]{6,}@", re.I),
    re.compile(r"^test\d{6,}@", re.I),
    re.compile(r"^bot_?\d+@", re.I),
    re.compile(r"^[a-z]{1,3}\d{8,}@", re.I),
)


@dataclass(frozen=True)
class EmailValidationResult:
    ok: bool
    reason: Reason | None = None
    domain: str | None = None


def parse_domain_blocklist(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [
        part.strip().lower()
        for part in re.split(r"[\s,;]+", raw)
        if part.strip() and "." in part.strip()
    ]


def parse_pattern_blocklist(raw: str | None) -> list[re.Pattern[str]]:
    if not raw or not raw.strip():
        return []
    patterns: list[re.Pattern[str]] = []
    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        try:
            patterns.append(re.compile(trimmed, re.I))
        except re.error:
            continue
    return patterns


def _is_domain_blocked(domain: str, custom_list: list[str]) -> bool:
    merged = [d.lower() for d in BUILTIN_EMAIL_BLOCKLIST] + custom_list
    if domain in merged:
        return True
    for blocked in merged:
        if domain.endswith("." + blocked):
            return True
    return False


def _is_reserved_tld(domain: str) -> bool:
    return any(domain.endswith(tld) for tld in RESERVED_TLDS)


def validate_email_for_signup(
    email: str,
    *,
    custom_domain_blocklist: str | None = None,
    custom_pattern_blocklist: str | None = None,
) -> EmailValidationResult:
    trimmed = email.strip().lower()
    at = trimmed.rfind("@")
    if at < 1 or at == len(trimmed) - 1:
        return EmailValidationResult(ok=False, reason="invalid_format")

    domain = trimmed[at + 1 :]
    if _is_reserved_tld(domain):
        return EmailValidationResult(ok=False, reason="tld_reserved", domain=domain)

    custom_domains = parse_domain_blocklist(custom_domain_blocklist)
    if _is_domain_blocked(domain, custom_domains):
        return EmailValidationResult(ok=False, reason="domain_blocked", domain=domain)

    for pat in BUILTIN_EMAIL_PATTERN_BLOCKLIST:
        if pat.search(trimmed):
            return EmailValidationResult(ok=False, reason="pattern_blocked", domain=domain)
    for pat in parse_pattern_blocklist(custom_pattern_blocklist):
        if pat.search(trimmed):
            return EmailValidationResult(ok=False, reason="pattern_blocked", domain=domain)

    return EmailValidationResult(ok=True, domain=domain)


def normalize_email(email: str) -> str:
    trimmed = email.strip().lower()
    at = trimmed.rfind("@")
    if at < 1:
        return trimmed
    local = trimmed[:at]
    domain = trimmed[at + 1 :]
    plus = local.find("+")
    clean_local = local[:plus] if plus > 0 else local
    if domain in ("gmail.com", "googlemail.com"):
        clean_local = clean_local.replace(".", "")
    return f"{clean_local}@{domain}"


def signup_rejection_message(reason: Reason | None) -> str:
    mapping = {
        "domain_blocked": "Регистрация с этого почтового домена запрещена.",
        "pattern_blocked": "Этот адрес не прошёл проверку безопасности.",
        "tld_reserved": "Указан недопустимый почтовый домен.",
        "invalid_format": "Некорректный формат email.",
    }
    return mapping.get(reason or "invalid_format", "Email не принят.")
