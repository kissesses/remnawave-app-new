#!/usr/bin/env bash
# Generate GitHub Release body from CHANGELOG for a given tag (e.g. v1.0.5)
set -euo pipefail

TAG="${1:-}"
REPO="${GITHUB_REPOSITORY:-kissesses/remnawave-app}"

if [[ -z "$TAG" ]]; then
  echo "Usage: release-notes.sh <tag>" >&2
  exit 1
fi

VERSION="${TAG#v}"
export RELEASE_TAG="$TAG"
export GITHUB_REPOSITORY="$REPO"
CHANGELOG="docs/releases/CHANGELOG.md"
PRODUCT="Remnawave App"
IMAGE="ghcr.io/kissesses/remnawave-app"
INSTALL_REPO="kissesses/remnawave-app"

export CHANGELOG PRODUCT IMAGE INSTALL_REPO

if [[ ! -f "$CHANGELOG" ]]; then
  echo "# 🚀 ${PRODUCT} ${TAG}"
  echo
  echo "See commit history for details."
  exit 0
fi

python3 - "$VERSION" "$CHANGELOG" <<'PY'
import os, re, sys

version = sys.argv[1]
path = sys.argv[2]
product = os.environ["PRODUCT"]
repo = os.environ.get("GITHUB_REPOSITORY", "kissesses/remnawave-app")
image = os.environ["IMAGE"]
install_repo = os.environ["INSTALL_REPO"]
tag = os.environ.get("RELEASE_TAG", f"v{version}")

text = open(path, encoding="utf-8").read()

header_re = rf"## \[{re.escape(version)}\][^\n]*"
match = re.search(
    rf"{header_re}\n(.*?)(?=\n## \[|\Z)",
    text,
    re.DOTALL,
)
if not match:
    print(f"# 🚀 {product} {tag}\n\nNo changelog entry found for `{version}`.\n")
    sys.exit(0)

header_line = re.search(header_re, text)
header = header_line.group(0) if header_line else f"## [{version}]"
codename = ""
if "·" in header:
    codename = header.split("·", 1)[1].strip()

title = f"# 🚀 {product} {tag}"
if codename:
    title += f" — {codename}"

print(title)
print()

body = match.group(1).strip()
body = re.sub(r"\n---\s*$", "", body).strip()

quote = re.match(r"^>\s*(.+?)(?:\n\n|\Z)", body, re.DOTALL)
if quote:
    print(f"> {quote.group(1).strip()}\n")
    body = body[quote.end():].strip()

def extract_section(name: str) -> str:
    m = re.search(
        rf"^### {re.escape(name)}\s*\n(.*?)(?=^### |\Z)",
        body,
        re.MULTILINE | re.DOTALL,
    )
    return m.group(1).strip() if m else ""

en = extract_section("EN")
ru = extract_section("RU")

if en or ru:
    if en:
        print("## 🇬🇧 EN\n")
        print(en)
        print()
    if ru:
        print("## 🇷🇺 RU\n")
        print(ru)
        print()
else:
    print(body)
    print()

print("---\n")
print("## 📦 Docker\n")
print("```bash")
print(f"docker pull {image}:{version}")
print(f"docker pull {image}:latest")
print("```\n")
print("## 🚀 Quick install\n")
print("```bash")
print("mkdir /opt/remnawave-app && cd /opt/remnawave-app")
print(f"curl -o docker-compose.yml https://raw.githubusercontent.com/{install_repo}/main/docker-compose.yml")
print(f"curl -o .env https://raw.githubusercontent.com/{install_repo}/main/.env.example")
print("# Secrets: docs/INSTALL.md · docker compose pull && docker compose up -d")
print("```\n")
print("## 📋 Full changelog\n")
print(f"[CHANGELOG.md](https://github.com/{repo}/blob/main/docs/releases/CHANGELOG.md)")
PY
