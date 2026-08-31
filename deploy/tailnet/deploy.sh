#!/usr/bin/env bash
set -euo pipefail

: "${TAILSCALE_REQUIRED:=1}"

if [[ "${TAILSCALE_REQUIRED}" == "1" ]] && ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI is required on the deployment host" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Create .env from .env.example and add runtime secrets before deployment." >&2
  exit 1
fi

docker compose -f docker-compose.tailnet.yml up -d --build

if [[ "${TAILSCALE_REQUIRED}" == "1" ]]; then
  tailscale serve --bg 3000
  tailscale serve status
fi

echo "NeoFLGPT Parallel is running on localhost:3000 and served privately through the tailnet."
