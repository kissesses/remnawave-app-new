#!/usr/bin/env bash
# Legacy alias: полная сборка WebApp (login CSS + React SPA).
# Предпочтительно: scripts/build-webapp.sh (Docker) или docker compose build.
set -euo pipefail
exec "$(dirname "$0")/build-webapp.sh"
