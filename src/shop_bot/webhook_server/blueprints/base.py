"""Blueprint that preserves unprefixed endpoint names (e.g. login_page, not auth.login_page)."""

from __future__ import annotations

from flask import Blueprint as FlaskBlueprint
from flask.sansio.blueprints import BlueprintSetupState
from flask.sansio.scaffold import _endpoint_from_view_func


class UnprefixedBlueprintSetupState(BlueprintSetupState):
    def add_url_rule(self, rule, endpoint=None, view_func=None, **options):
        if self.url_prefix is not None:
            if rule:
                rule = "/".join((self.url_prefix.rstrip("/"), rule.lstrip("/")))
            else:
                rule = self.url_prefix
        options.setdefault("subdomain", self.subdomain)
        if endpoint is None:
            endpoint = _endpoint_from_view_func(view_func)  # type: ignore[arg-type]
        defaults = self.url_defaults
        if "defaults" in options:
            defaults = dict(defaults, **options.pop("defaults"))
        self.app.add_url_rule(rule, endpoint, view_func, defaults=defaults, **options)


class Blueprint(FlaskBlueprint):
    def make_setup_state(self, app, options, first_registration=False):
        return UnprefixedBlueprintSetupState(self, app, options, first_registration)
