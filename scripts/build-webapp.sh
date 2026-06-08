#!/usr/bin/env bash
# Сборка WebApp (login CSS + React SPA) через Docker — Node.js на хосте не нужен.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${WEBAPP_BUILD_IMAGE:-node:22-alpine}"

echo "→ Building WebApp assets in Docker ($IMAGE)..."

docker run --rm \
  -v "$ROOT:/app" \
  -w /app/src/shop_bot/webapp \
  "$IMAGE" \
  sh -ec '
    npm install
    npm run build:css
    cd frontend
    npm ci
    npm run build
  '

echo "✓ Login CSS:  src/shop_bot/webapp/static/css/webapp-tailwind.css"
echo "✓ React SPA:  src/shop_bot/webapp/static/dist/"
