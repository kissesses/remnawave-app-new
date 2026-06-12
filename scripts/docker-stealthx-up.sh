#!/usr/bin/env bash
# Быстрый запуск STEALTHX через Docker (standalone, без Remnawave Panel).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${STEALTHX_ENV_FILE:-.env.stealthx}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating $ENV_FILE from .env.stealthx.example"
  cp .env.stealthx.example "$ENV_FILE"
  echo ""
  echo "⚠️  Отредактируйте $ENV_FILE: задайте POSTGRES_PASSWORD, REDIS_PASSWORD, SHOPBOT_SECRET_KEY"
  echo "   Затем снова: ./scripts/docker-stealthx-up.sh"
  exit 1
fi

missing=0
for key in POSTGRES_PASSWORD REDIS_PASSWORD SHOPBOT_SECRET_KEY; do
  val="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' \"' || true)"
  if [[ -z "$val" || "$val" == "change-me"* || "$val" == "generate"* ]]; then
    echo "⚠️  Задайте ${key} в ${ENV_FILE}"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

COMPOSE_FILE="${STEALTHX_COMPOSE_FILE:-docker-compose.stealthx.yml}"
echo "→ docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d --build"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo ""
echo "✓ STEALTHX запущен"
echo "  Landing:  http://127.0.0.1:8000/"
echo "  Cabinet:  http://127.0.0.1:8000/app"
echo "  Panel:    http://127.0.0.1:1337/login"
echo "  Health:   curl http://127.0.0.1:8000/health"
echo ""
echo "Логи: docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} logs -f remnawave-app"
