#!/usr/bin/env bash
# Generate GitHub Release body from docs/CHANGELOG.md for a given tag (e.g. v1.0.1)
set -euo pipefail

TAG="${1:-}"
CHANGELOG="${2:-docs/CHANGELOG.md}"

if [[ -z "$TAG" ]]; then
  echo "Usage: release-notes.sh <tag> [changelog-file]" >&2
  exit 1
fi

VERSION="${TAG#v}"
export RELEASE_TAG="$TAG"
export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-kissesses/remnawave-app}"

if [[ ! -f "$CHANGELOG" ]]; then
  echo "🚀 Release ${TAG}"
  echo
  echo "See commit history for details."
  exit 0
fi

python3 - "$VERSION" "$CHANGELOG" <<'PY'
import os, re, sys

version = sys.argv[1]
path = sys.argv[2]
text = open(path, encoding="utf-8").read()

pattern = rf"## \[{re.escape(version)}\][^\n]*\n(.*?)(?=\n## \[|\Z)"
match = re.search(pattern, text, re.DOTALL)
if not match:
    pattern = rf"## {re.escape(version)}[^\n]*\n(.*?)(?=\n## |\Z)"
    match = re.search(pattern, text, re.DOTALL)
if not match:
    print(f"# 🚀 Release v{version}\n\nNo changelog entry found for `{version}`.\n")
else:
    body = match.group(1).strip()
    print(f"# 🛍️ Remnawave App v{version}\n")
    print("> Публичный клиентский репозиторий · maintainer stack: [rw-shop](https://github.com/kissesses/rw-shop)\n")
    print(body)

repo = os.environ.get("GITHUB_REPOSITORY", "kissesses/remnawave-app")
print("\n---\n")
print("## 📸 Screenshots\n")
print(f"[docs/screenshots](https://github.com/{repo}/tree/main/docs/screenshots)\n")
print("\n---\n")
print("## 🚀 Быстрая установка\n")
print("```bash")
print("mkdir /opt/remnawave-app && cd /opt/remnawave-app")
print("curl -o docker-compose.yml https://raw.githubusercontent.com/kissesses/remnawave-app/main/docker-compose.yml")
print("curl -o .env https://raw.githubusercontent.com/kissesses/remnawave-app/main/.env.example")
print("# Секреты: docs/INSTALL.md · docker compose pull && docker compose up -d")
print("```\n")
print("## 📋 Changelog\n")
print(f"[CHANGELOG.md](https://github.com/{repo}/blob/main/docs/CHANGELOG.md)")
PY
