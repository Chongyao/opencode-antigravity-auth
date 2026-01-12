#!/bin/bash
# One-click E2E test script for opencode-antigravity-auth in Docker
# Usage: ./scripts/test-in-docker.sh

set -e

PROJECT_DIR="/home/zcy/workspace/cloned_projects/opencode-antigravity-auth"
CONTAINER_NAME="opencode-plugin-test-$$"

cleanup() {
  echo ""
  echo "==== Cleaning up ===="
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
}

trap cleanup EXIT

echo "==== Step 1: Build plugin ===="
cd "$PROJECT_DIR"
./scripts/dev-container.sh bun run build

echo ""
echo "==== Step 2: Create test container ===="
docker run -d \
  --name "$CONTAINER_NAME" \
  --network=host \
  -v "$PROJECT_DIR:/workspace:ro" \
  -v "$HOME/.config/opencode:/root/.config/opencode" \
  opencode-plugin-dev:latest \
  tail -f /dev/null

echo ""
echo "==== Step 3: Configure opencode to use local plugin ===="
docker exec "$CONTAINER_NAME" bash -c '
  mkdir -p /root/.config/opencode
  cat > /root/.config/opencode/opencode.json <<'"'"'EOF'"'"'
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
  echo "Config created:"
  cat /root/.config/opencode/opencode.json
'

echo ""
echo "==== Step 4: Verify plugin loads ===="
docker exec -e OPENCODE_ANTIGRAVITY_DEBUG=1 "$CONTAINER_NAME" bash -c '
  opencode --version
  echo "Checking if plugin loads..."
  timeout 10 opencode run "test" --model=google/antigravity-claude-sonnet-4-5 || echo "Request failed (expected if no auth)"
'

echo ""
echo "==== Step 5: Check accounts ===="
docker exec "$CONTAINER_NAME" bash -c '
  if [ -f /root/.config/opencode/antigravity-accounts.json ]; then
    echo "Accounts found:"
    cat /root/.config/opencode/antigravity-accounts.json | jq -r ".accounts[].email // \"no email\""
  else
    echo "No accounts found. You need to run: opencode auth login"
  fi
'

echo ""
echo "==== Container is ready for testing ===="
echo ""
echo "To run tests manually:"
echo "  docker exec -it $CONTAINER_NAME bash"
echo ""
echo "Inside the container:"
echo "  export OPENCODE_ANTIGRAVITY_DEBUG=2"
echo "  opencode run \"hi\" --model=google/antigravity-claude-sonnet-4-5"
echo ""
echo "To view logs:"
echo "  docker exec $CONTAINER_NAME tail -f /root/.config/opencode/antigravity-logs/antigravity-debug-*.log"
echo ""
echo "To check accounts:"
echo "  docker exec $CONTAINER_NAME cat /root/.config/opencode/antigravity-accounts.json | jq ."
echo ""
echo "Press Ctrl+C to stop and remove the container..."

# Keep container running
docker logs -f "$CONTAINER_NAME" 2>&1 | grep -v "tail" || true
