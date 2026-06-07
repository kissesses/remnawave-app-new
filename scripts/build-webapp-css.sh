#!/usr/bin/env bash
# Build precompiled Tailwind CSS for WebApp (run in CI or locally with Node.js).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../src/shop_bot/webapp" && pwd)"
cd "$ROOT"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found — install Node.js or run: docker run --rm -v \"$ROOT:/app\" -w /app node:22-alpine sh -c 'npm install && npm run build:css'" >&2
  exit 1
fi
npm install
npm run build:css
echo "Built: $ROOT/static/css/webapp-tailwind.css ($(wc -c < static/css/webapp-tailwind.css) bytes)"
