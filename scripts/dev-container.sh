#!/bin/bash
# Development container script for opencode-antigravity-auth
# Usage: ./scripts/dev-container.sh [command]
# Example: ./scripts/dev-container.sh bun test
#          ./scripts/dev-container.sh opencode --version

set -e

PROJECT_DIR="/home/zcy/workspace/cloned_projects/opencode-antigravity-auth"
OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
AUTH_FILE="$HOME/.local/share/opencode/auth.json"

MOUNT_ARGS="-v $PROJECT_DIR:/workspace"

PROXY_ARGS=""
[ -n "$http_proxy" ] && PROXY_ARGS="$PROXY_ARGS -e http_proxy=$http_proxy"
[ -n "$https_proxy" ] && PROXY_ARGS="$PROXY_ARGS -e https_proxy=$https_proxy"
[ -n "$HTTP_PROXY" ] && PROXY_ARGS="$PROXY_ARGS -e HTTP_PROXY=$HTTP_PROXY"
[ -n "$HTTPS_PROXY" ] && PROXY_ARGS="$PROXY_ARGS -e HTTPS_PROXY=$HTTPS_PROXY"
[ -n "$no_proxy" ] && PROXY_ARGS="$PROXY_ARGS -e no_proxy=$no_proxy"
[ -n "$NO_PROXY" ] && PROXY_ARGS="$PROXY_ARGS -e NO_PROXY=$NO_PROXY"

# Mount entire opencode config dir (includes opencode.json, antigravity-accounts.json, etc.)
if [ -d "$OPENCODE_CONFIG_DIR" ]; then
  MOUNT_ARGS="$MOUNT_ARGS -v $OPENCODE_CONFIG_DIR:/root/.config/opencode"
fi

if [ -f "$AUTH_FILE" ]; then
  MOUNT_ARGS="$MOUNT_ARGS -v $AUTH_FILE:/root/.local/share/opencode/auth.json:ro"
fi

if [ $# -eq 0 ]; then
  exec docker run -it --rm --network=host $PROXY_ARGS $MOUNT_ARGS -w /workspace opencode-plugin-dev:latest bash
else
  docker run --rm --network=host $PROXY_ARGS $MOUNT_ARGS -w /workspace opencode-plugin-dev:latest "$@"
fi
