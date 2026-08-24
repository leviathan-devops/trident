#!/bin/bash
set -e
CONTAINER=${1:-trident-test}
IMAGE="runtime-grade-container-sandbox:master"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Deploying Trident v4.4.2 to container: $CONTAINER"

docker kill $CONTAINER 2>/dev/null || true
docker rm $CONTAINER 2>/dev/null || true

docker run -d --name $CONTAINER \
  -e OPENCODE_GO_API_KEY="sk-PLACEHOLDER-ZEN-KEY-5" \
  $IMAGE timeout 7200 bash -c 'while true; do sleep 60; done'

docker exec $CONTAINER bash -c "apt-get update -qq && apt-get install -y -qq tmux > /dev/null 2>&1"
docker exec $CONTAINER mkdir -p /root/.config/opencode/plugins/trident/dist
docker exec $CONTAINER mkdir -p /root/.local/share/opencode

docker cp "$SCRIPT_DIR/dist/index.js" $CONTAINER:/root/.config/opencode/plugins/trident/dist/index.js
docker cp "$SCRIPT_DIR/config/config.json" $CONTAINER:/root/.config/opencode/config.json
docker cp "$SCRIPT_DIR/config/auth.json" $CONTAINER:/root/.config/opencode/auth.json

# Write local share auth (critical — opencode reads from here)
docker exec $CONTAINER bash -c 'cat > /root/.local/share/opencode/auth.json << '"'"'INNEREOF'"'"'
{"opencode-go":{"type":"api","key":"sk-PLACEHOLDER-ZEN-KEY-5"}}
INNEREOF'

EXPECTED_SHA=$(cat "$SCRIPT_DIR/dist/sha256.txt")
ACTUAL_SHA=$(docker exec $CONTAINER sha256sum /root/.config/opencode/plugins/trident/dist/index.js | awk '{print $1}')

if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  echo "❌ SHA mismatch!"
  exit 1
fi

echo "✅ SHA256 verified: $ACTUAL_SHA"
echo "✅ tmux installed"
echo "✅ Plugin deployed"
echo "✅ Config + auth deployed (both .config and .local/share)"
echo ""
echo "Launch: docker exec -d $CONTAINER tmux new-session -d -s tui 'OPENCODE_SKIP_UPDATE=1 /usr/local/bin/opencode --agent trident'"
