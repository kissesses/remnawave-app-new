#!/usr/bin/env bash
# Production deploy STEALTHX (standalone, образ GHCR, без сборки).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${STEALTHX_ENV_FILE:-.env}"
COMPOSE_FILE="${STEALTHX_COMPOSE_FILE:-docker-compose.stealthx.prod.yml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating $ENV_FILE from .env.stealthx.production.example"
  cp .env.stealthx.production.example "$ENV_FILE"
  echo ""
  echo "⚠️  Заполните секреты в ${ENV_FILE}:"
  echo "   SHOPBOT_SECRET_KEY, SHOPBOT_MASTER_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD, STEALTHX_JWT_SECRET"
  echo "   SHOPBOT_RP_ID, SHOPBOT_RP_ORIGIN (ваш домен)"
  echo "   Затем: ./scripts/docker-stealthx-prod-up.sh"
  exit 1
fi

required_keys=(
  SHOPBOT_SECRET_KEY
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  STEALTHX_JWT_SECRET
)
missing=0
for key in "${required_keys[@]}"; do
  val="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' \"' || true)"
  if [[ -z "$val" ]]; then
    echo "⚠️  Задайте ${key} в ${ENV_FILE}"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

echo "→ Pull image..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

echo "→ Starting production stack..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "✓ STEALTHX production запущен"
echo "  Landing:  https://\${SHOPBOT_RP_ID:-your-domain}/  (через nginx → :8000)"
echo "  Local:    http://127.0.0.1:8000/"
echo "  Cabinet:  http://127.0.0.1:8000/app"
echo "  Panel:    http://127.0.0.1:1337/login"
echo "  Health:   curl http://127.0.0.1:8000/health"
echo ""
echo "Логи: docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} logs -f remnawave-app"
echo "Nginx:  src/shop_bot/webapp/stealthx/deploy/nginx/stealthx.conf"
