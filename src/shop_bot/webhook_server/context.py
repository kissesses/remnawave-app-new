"""Shared panel application context for blueprints and middleware."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from shop_bot.support_bot_controller import SupportBotController


@dataclass
class PanelContext:
    bot_controller: Any = None
    support_bot_controller: SupportBotController = field(default_factory=SupportBotController)
    webapp_exists: bool = False
    flask_app: Any = None
    csrf: Any = None

    # Populated during app factory initialization
    login_required: Callable = lambda f: f
    get_common_template_data: Callable[[], dict] = dict
    audit: Callable[..., None] = lambda *args, **kwargs: None
    client_ip: Callable[[], str] = lambda: ""
    is_setup_complete: Callable[[], bool] = lambda: True
    needs_mandatory_totp_setup: Callable[[], bool] = lambda: False
    totp_flow_redirect: Callable[..., Any] = lambda **kwargs: None
    handle_promo_after_payment: Callable[[dict], None] = lambda _metadata: None
    get_time_remaining_str: Callable[[Any], str] = lambda _expiry: ""
    qr_data_uri: Callable[[str], str] = lambda _text: ""
    static_css: Callable[[str], str] = lambda _path: ""
    complete_panel_login: Callable[..., None] = lambda *args, **kwargs: None
    finalize_login: Callable[..., None] = lambda *args, **kwargs: None
    safe_redirect: Callable[..., Any] = lambda referrer, endpoint, **kw: None


panel_ctx = PanelContext()
