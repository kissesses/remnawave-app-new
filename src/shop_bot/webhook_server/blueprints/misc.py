"""Miscellaneous routes (legacy URL redirects)."""

from flask import redirect, request, url_for

from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('misc', __name__)


@bp.route('/other')
@panel_ctx.login_required
def other_legacy_redirect():
    """Redirect old /other?tab= URLs to per-tab settings pages."""
    tab = (request.args.get('tab') or 'broadcast').strip()
    return redirect(url_for('settings_tab_page', tab=tab))
