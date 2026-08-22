#!/usr/bin/env bash
set -euo pipefail

# Rebuild the three safe preview captures without opening a real browser profile.
# The first view uses the application's fictitious example mode and the second is a static
# verification page. No live account or company lookup is used.

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${FISCAL_CAPTURE_IMAGE:-mcr.microsoft.com/playwright/python:latest}"
chromium="${FISCAL_CAPTURE_CHROMIUM:-/ms-playwright/chromium-1129/chrome-linux/chrome}"
output_dir="/work/outreach/peer-preview/assets"

capture() {
  local url="$1"
  local output="$2"
  docker run --rm \
    --volume "${repo_dir}:/work:ro" \
    --volume "${repo_dir}/outreach/peer-preview/assets:${output_dir}" \
    "$image" \
    "$chromium" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --disable-web-security \
    --allow-file-access-from-files \
    --hide-scrollbars \
    --window-size=1280,1000 \
    --virtual-time-budget=5000 \
    --screenshot="${output_dir}/${output}" \
    "$url"
}

capture "file:///work/perfil.html?exemplo=1" "04-perfil-exemplo.png"
capture "file:///work/verificar.html" "06-verificacao.png"

printf '%s\n' 'captured=2 source=fixtures-demo'
