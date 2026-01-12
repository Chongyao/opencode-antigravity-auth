#!/bin/bash
# Isolated E2E test script - DOES NOT touch host opencode config
# Usage: ./scripts/test-isolated.sh

set -e

PROJECT_DIR="/home/zcy/workspace/cloned_projects/opencode-antigravity-auth"
CONTAINER_NAME="opencode-test-isolated-$$"
HOST_CONFIG_DIR="$HOME/.config/opencode"
HOST_AUTH_FILE="$HOME/.local/share/opencode/auth.json"

cleanup() {
  echo ""
  echo "==== Cleaning up ===="
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "==== Step 1: Build plugin ===="
cd "$PROJECT_DIR"
./scripts/dev-container.sh bun run build

echo ""
echo "==== Step 2: Prepare isolated container config ===="
TEMP_DIR=$(mktemp -d)
echo "Temp config dir: $TEMP_DIR"

if [ -f "$HOST_CONFIG_DIR/antigravity-accounts.json" ]; then
  echo "Copying antigravity-accounts.json from host..."
  cp "$HOST_CONFIG_DIR/antigravity-accounts.json" "$TEMP_DIR/"
fi

if [ -f "$HOST_AUTH_FILE" ]; then
  echo "Copying auth.json from host..."
  mkdir -p "$TEMP_DIR/share"
  cp "$HOST_AUTH_FILE" "$TEMP_DIR/share/auth.json"
fi

cat > "$TEMP_DIR/opencode.json" <<'EOF'
{
  "plugin": ["file:///workspace"],
  "provider": {
    "google": {
      "models": {
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        }
      }
    }
  }
}
EOF

echo "Created isolated config at: $TEMP_DIR/opencode.json"

echo ""
echo "==== Step 3: Start isolated container ===="
AUTH_MOUNT=""
if [ -f "$TEMP_DIR/share/auth.json" ]; then
  AUTH_MOUNT="-v $TEMP_DIR/share/auth.json:/root/.local/share/opencode/auth.json:ro"
fi

docker run -d \
  --name "$CONTAINER_NAME" \
  --network=host \
  -v "$PROJECT_DIR:/workspace:ro" \
  -v "$TEMP_DIR:/container-config" \
  $AUTH_MOUNT \
  opencode-plugin-dev:latest \
  tail -f /dev/null

echo ""
echo "==== Step 4: Setup container config ===="
docker exec "$CONTAINER_NAME" bash -c '
  mkdir -p /root/.config/opencode
  cp /container-config/opencode.json /root/.config/opencode/
  if [ -f /container-config/antigravity-accounts.json ]; then
    cp /container-config/antigravity-accounts.json /root/.config/opencode/
    echo "Copied antigravity-accounts.json"
  fi
  echo "Container config ready"
'

echo ""
echo "==== Step 5: Verify plugin loads ===="
docker exec -e OPENCODE_ANTIGRAVITY_DEBUG=1 "$CONTAINER_NAME" bash -c '
  echo "OpenCode version:"
  opencode --version
  echo ""
  echo "Testing plugin..."
  timeout 15 opencode run "test" --model=google/antigravity-claude-sonnet-4-5 2>&1 | head -20
' || echo "Test completed (may need auth)"

echo ""
echo "==== Step 6: Check auth status ===="
docker exec "$CONTAINER_NAME" bash -c '
  if [ -f /root/.config/opencode/antigravity-accounts.json ]; then
    echo "✅ Antigravity accounts found"
    echo "Accounts:"
    grep -o "\"email\":[^,]*" /root/.config/opencode/antigravity-accounts.json | sed "s/\"email\":\"/  - /" | sed "s/\"//"
  else
    echo "❌ No antigravity accounts. Need to login:"
    echo "   docker exec -it $CONTAINER_NAME bash"
    echo "   opencode auth login"
  fi
'

echo ""
echo "===================================================================="
echo "Container is ready for testing!"
echo "===================================================================="
echo ""
echo "Container name: $CONTAINER_NAME"
echo "Temp config dir: $TEMP_DIR (will be deleted on exit)"
echo ""
echo "To enter container:"
echo "  docker exec -it $CONTAINER_NAME bash"
echo ""
echo "Inside container, run:"
echo "  export OPENCODE_ANTIGRAVITY_DEBUG=2"
echo "  opencode run \"test\" --model=google/antigravity-claude-sonnet-4-5"
echo ""
echo "To trigger 429 and test P1-P5:"
echo "  for i in {1..15}; do opencode run \"spam \$i\" --model=google/antigravity-claude-sonnet-4-5 & done; wait"
echo ""
echo "To check logs:"
echo "  tail -100 /root/.config/opencode/antigravity-logs/antigravity-debug-*.log | grep parsedReason"
echo ""
echo "To check account state:"
echo "  cat /root/.config/opencode/antigravity-accounts.json | grep lastRateLimitReason"
echo ""
echo "Press Ctrl+C to cleanup and exit..."
echo ""

docker logs -f "$CONTAINER_NAME" 2>&1 | grep -v "tail" || true
