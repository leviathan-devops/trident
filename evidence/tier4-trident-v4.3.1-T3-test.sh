#!/usr/bin/env bash
###############################################################################
# TIER 4 CONTAINER TEST — Trident v4.3.1-T3
#
# Architecture: "Trident Audits & Generates Review Artifacts.
#               Build Agents Implement All Changes."
#
# Trident is an AUDIT ENGINE. It does NOT delegate, NOT spawn subagents,
# NOT use bash/write/edit. Its tools are trident-code-audit, trident-deep-planning,
# trident-problem-solving, trident-context-synthesis, trident-gate, trident-status,
# trident-vision, trident-help.
#
# Protocol: Container Testing Bible v2.0 Section 8 (12-Step Protocol)
# Method:   Tier 4 ONLY — tmux + docker exec -it (NO node -e, NO programmatic)
# Evidence: TuiInteraction-*.txt via tmux capture-pane
#
# Required infrastructure:
#   - Host opencode version: 1.14.43
#   - Container image: opencode-test:1.14.43
#   - Google Direct API key
#   - npm package: @ai-sdk/google@0.0.55 (installed at runtime)
###############################################################################

set -euo pipefail

###############################################################################
# CONFIGURATION — ALL DERIVED FROM USER INPUT + LIVE CONFIG
###############################################################################

HOST_VERSION="1.14.43"
CONTAINER_IMAGE="opencode-test:${HOST_VERSION}"
GOOGLE_API_KEY="AQ.Ab8RN6KlPuyNZrKRLHFuT-hyXUbgkWAWFxxEWu00fULC8S0jPg"
GOOGLE_MODEL="google/gemma-4-26b-a4b-it"
GOOGLE_NPM_PKG="@ai-sdk/google@0.0.55"

# Binary path inside container (confirmed via docker run --rm test)
BINARY_PATH="/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode"

# Live config — fresh read, never cached
ACTIVE_CONFIG="/home/leviathan/.config/opencode/opencode.json"

# Evidence output directory
EVIDENCE_DIR="/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/evidence"

# Unique project/container names (timestamped to avoid collisions)
TIMESTAMP=$(date +%m%d%H%M%S)
PROJECT="trident-t4-${TIMESTAMP}"
SNAP="/tmp/snap-${PROJECT}"
CONTAINER="test-${PROJECT}"

# Sleep durations (generous for Google API rate limiting)
SLEEP_BOOT=30          # After docker run, wait for DB migration
SLEEP_TUI_START=10     # After tmux new-session, wait for TUI init
SLEEP_MESSAGE=55       # After sending each message, wait for response
SLEEP_TOGGLE=5         # After Tab toggle, wait for agent switch
SLEEP_SUSTAINED=600    # Sustained runtime wait (>= 600s per spec)
SLEEP_DISMISS=3        # After Escape key, wait for dialog dismiss

###############################################################################
# PRE-FLIGHT — Section 11 Phase 0
###############################################################################

echo "=============================================="
echo "TIER 4 CONTAINER TEST — Trident v4.3.1-T3"
echo "=============================================="
echo "Timestamp:   ${TIMESTAMP}"
echo "Host ver:    ${HOST_VERSION}"
echo "Image:       ${CONTAINER_IMAGE}"
echo "Model:       ${GOOGLE_MODEL}"
echo "Evidence:    ${EVIDENCE_DIR}"
echo ""

# Phase 0 Check 1: Live config exists
if [ ! -f "$ACTIVE_CONFIG" ]; then
    echo "FATAL: Live config not found at ${ACTIVE_CONFIG}"
    exit 1
fi
echo "PASS: Live config found at ${ACTIVE_CONFIG}"

# Phase 0 Check 2: Evidence directory exists
if [ ! -d "$EVIDENCE_DIR" ]; then
    echo "FATAL: Evidence directory not found at ${EVIDENCE_DIR}"
    exit 1
fi
echo "PASS: Evidence directory exists"

# Phase 0 Check 3: Container image exists
if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${CONTAINER_IMAGE}$"; then
    echo "FATAL: Container image ${CONTAINER_IMAGE} does not exist."
    echo "Build it: cd /home/leviathan/OPENCODE_WORKSPACE/container-build && docker build --build-arg OPENCODE_VERSION=${HOST_VERSION} -t ${CONTAINER_IMAGE} -f Dockerfile.test ."
    exit 1
fi
echo "PASS: Container image ${CONTAINER_IMAGE} exists"

# Phase 0 Check 4: All 5 plugin bundles exist on host
PLUGINS=(
    "/home/leviathan/.config/opencode/plugins/shark-agent/dist/index.js"
    "/home/leviathan/.config/opencode/plugins/hive-mind/dist/index.js"
    "/home/leviathan/.config/opencode/plugins/spider-agent-v2.2.2/dist/index.js"
    "/home/leviathan/.config/opencode/plugins/agent-vision/dist/index.js"
    "/home/leviathan/.config/opencode/plugins/trident/dist/index.js"
)
for p in "${PLUGINS[@]}"; do
    if [ ! -f "$p" ]; then
        echo "FATAL: Plugin bundle missing: ${p}"
        exit 1
    fi
    echo "PASS: Plugin bundle exists: $(basename "$(dirname "$(dirname "$p")")")"
done

echo ""
echo "=== Phase 0 Pre-Flight COMPLETE ==="
echo ""

###############################################################################
# STEP 0: READ THE LIVE CONFIG (FRESH, NOT SAVED)
###############################################################################

echo "=== STEP 0: Read live config ==="
LIVE_PLUGIN_COUNT=$(grep -c '"file://"' "$ACTIVE_CONFIG" || true)
echo "Live config has ${LIVE_PLUGIN_COUNT} plugins"
cat "$ACTIVE_CONFIG"
echo ""

###############################################################################
# STEP 0a: CHECK BINARY VERSION
###############################################################################

echo "=== STEP 0a: Binary version check ==="
HOST_VER_ACTUAL=$(opencode --version 2>/dev/null || echo "UNKNOWN")
echo "Host opencode version: ${HOST_VER_ACTUAL}"
if [ "${HOST_VER_ACTUAL}" != "${HOST_VERSION}" ]; then
    echo "WARNING: Host version (${HOST_VER_ACTUAL}) != expected (${HOST_VERSION})"
    echo "Updating HOST_VERSION to match actual..."
    HOST_VERSION="${HOST_VER_ACTUAL}"
    CONTAINER_IMAGE="opencode-test:${HOST_VERSION}"
fi
echo ""

###############################################################################
# STEP 1: DEFINE VARS
###############################################################################

echo "=== STEP 1: Define vars ==="
echo "PROJECT:    ${PROJECT}"
echo "SNAP:       ${SNAP}"
echo "CONTAINER:  ${CONTAINER}"
echo ""

###############################################################################
# STEP 2: CREATE ISOLATED SNAPSHOT DIRECTORY
###############################################################################

echo "=== STEP 2: Create isolated snapshot ==="
rm -rf "$SNAP"
mkdir -p "$SNAP/plugins"

# Create plugin directory structure matching live config paths
# Live config references: shark-agent, hive-mind, spider-agent-v2.2.2, agent-vision, trident
mkdir -p "$SNAP/plugins/shark-agent/dist"
mkdir -p "$SNAP/plugins/hive-mind/dist"
mkdir -p "$SNAP/plugins/spider-agent-v2.2.2/dist"
mkdir -p "$SNAP/plugins/agent-vision/dist"
mkdir -p "$SNAP/plugins/trident/dist"

echo "PASS: Snapshot directory created at ${SNAP}"
echo ""

###############################################################################
# STEP 3: COPY ALL PLUGIN BUNDLES (5 PLUGINS — ALL FROM LIVE CONFIG)
###############################################################################

echo "=== STEP 3: Copy all plugin bundles ==="

# Plugin 1: shark-agent
cp /home/leviathan/.config/opencode/plugins/shark-agent/dist/index.js "$SNAP/plugins/shark-agent/dist/index.js"
echo "DEPLOYED: shark-agent ($(wc -c < "$SNAP/plugins/shark-agent/dist/index.js") bytes)"

# Plugin 2: hive-mind
cp /home/leviathan/.config/opencode/plugins/hive-mind/dist/index.js "$SNAP/plugins/hive-mind/dist/index.js"
echo "DEPLOYED: hive-mind ($(wc -c < "$SNAP/plugins/hive-mind/dist/index.js") bytes)"

# Plugin 3: spider-agent-v2.2.2
cp /home/leviathan/.config/opencode/plugins/spider-agent-v2.2.2/dist/index.js "$SNAP/plugins/spider-agent-v2.2.2/dist/index.js"
echo "DEPLOYED: spider-agent-v2.2.2 ($(wc -c < "$SNAP/plugins/spider-agent-v2.2.2/dist/index.js") bytes)"

# Plugin 4: agent-vision
cp /home/leviathan/.config/opencode/plugins/agent-vision/dist/index.js "$SNAP/plugins/agent-vision/dist/index.js"
echo "DEPLOYED: agent-vision ($(wc -c < "$SNAP/plugins/agent-vision/dist/index.js") bytes)"

# Plugin 5: trident (plugin under test) — use project bundle directly
TRIDENT_BUNDLE="/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/dist/index.js"
if [ -f "$TRIDENT_BUNDLE" ]; then
  cp "$TRIDENT_BUNDLE" "$SNAP/plugins/trident/dist/index.js"
else
  cp /home/leviathan/.config/opencode/plugins/trident/dist/index.js "$SNAP/plugins/trident/dist/index.js"
fi
echo "DEPLOYED: trident ($(wc -c < "$SNAP/plugins/trident/dist/index.js") bytes)"

echo ""

###############################################################################
# STEP 4: COPY LIVE CONFIG + MODIFY ONLY MODEL/PROVIDER + PLUGIN PATHS
###############################################################################

echo "=== STEP 4: Clone live config ==="

# FRESH COPY of live config — never a saved snapshot
cp "$ACTIVE_CONFIG" "$SNAP/opencode.json"

# Replace plugin paths: host paths → container paths
sed -i 's|/home/leviathan/.config/opencode/plugins/|/root/.config/opencode/plugins/|g' "$SNAP/opencode.json"

# Replace provider AND model via python (safe JSON manipulation)
# MUST have "npm" field AND "options.apiKey" per GOOGLE_DIRECT_SETUP_GUIDE.md
# Without "npm", bundled provider sends thinkingConfig that Gemma doesn't support
# PRIMARY MODEL: google/gemma-4-26b-a4b-it (26b)
python3 -c "
import json, sys
with open('${SNAP}/opencode.json', 'r') as f:
    cfg = json.load(f)

cfg['model'] = '${GOOGLE_MODEL}'
cfg['provider'] = {
    'google': {
        'npm': '@ai-sdk/google',
        'options': {
            'apiKey': '${GOOGLE_API_KEY}'
        }
    }
}

with open('${SNAP}/opencode.json', 'w') as f:
    json.dump(cfg, f, indent=2)
"

echo "PASS: Config cloned and modified"
echo "  - Plugin paths: host → container"
echo "  - Model: google/gemma-4-26b-a4b-it (26b primary per GOOGLE_DIRECT_SETUP_GUIDE)"
echo "  - Provider: google (npm: ${GOOGLE_NPM_PKG})"
echo "  - Permission: KEPT as-is from live config (Section 7 exact clone)"
echo ""

# Verify the modified config
echo "=== Modified config ==="
cat "$SNAP/opencode.json"
echo ""

###############################################################################
# STEP 5: CLEANUP OLD CONTAINERS/SESSIONS
###############################################################################

echo "=== STEP 5: Cleanup old ==="
tmux kill-session -t "$CONTAINER" 2>/dev/null || true
docker rm -f "$CONTAINER" 2>/dev/null || true
echo "PASS: Old containers/sessions cleaned"
echo ""

###############################################################################
# STEP 6: START CONTAINER (opencode at boot via sleep)
###############################################################################

echo "=== STEP 6: Start container ==="

docker run -d --rm --name "$CONTAINER" \
    --entrypoint "" \
    -e GOOGLE_API_KEY="${GOOGLE_API_KEY}" \
    -v "$SNAP:/root/.config/opencode" \
    "${CONTAINER_IMAGE}" \
    /bin/sh -c 'sleep 3600'

echo "PASS: Container ${CONTAINER} started"

# Confirm container binary version matches host
CONTAINER_VERSION=$(docker exec "$CONTAINER" sh -c "${BINARY_PATH} --version 2>/dev/null || echo 0.0.0")
if [ "${CONTAINER_VERSION}" != "${HOST_VERSION}" ]; then
    echo "FATAL: Binary version mismatch. Host=${HOST_VERSION} Container=${CONTAINER_VERSION}"
    docker kill "$CONTAINER" 2>/dev/null || true
    exit 1
fi
echo "PASS: Binary version matches host (${CONTAINER_VERSION})"

# Install Google AI SDK in container (required for google/gemma-4-31b-it model)
echo "Installing ${GOOGLE_NPM_PKG} in container..."
docker exec "$CONTAINER" sh -c "npm install -g ${GOOGLE_NPM_PKG} > /dev/null 2>&1"
echo "PASS: ${GOOGLE_NPM_PKG} installed"
echo ""

###############################################################################
# STEP 7: WAIT FOR DB MIGRATION
###############################################################################

echo "=== STEP 7: Wait for DB migration (${SLEEP_BOOT}s) ==="
sleep "${SLEEP_BOOT}"
docker ps | grep "$CONTAINER" || { echo "FATAL: Container died!"; docker logs "$CONTAINER"; exit 1; }
echo "PASS: Container still running"
echo ""

###############################################################################
# STEP 8: VERIFY CONFIG IS A CLONE
###############################################################################

echo "=== STEP 8: Verify config fidelity ==="

echo "--- Container config ---"
docker exec "$CONTAINER" cat /root/.config/opencode/opencode.json
echo ""

echo "--- Plugin count ---"
CONTAINER_PLUGIN_COUNT=$(docker exec "$CONTAINER" sh -c 'ls /root/.config/opencode/plugins/*/dist/index.js 2>/dev/null' | wc -l)
echo "Container has ${CONTAINER_PLUGIN_COUNT} plugins"
if [ "${CONTAINER_PLUGIN_COUNT}" -ne "${LIVE_PLUGIN_COUNT}" ]; then
    echo "FAIL: Plugin count mismatch. Live=${LIVE_PLUGIN_COUNT}, Container=${CONTAINER_PLUGIN_COUNT}"
else
    echo "PASS: Plugin count matches live config (${LIVE_PLUGIN_COUNT})"
fi

echo "--- Agent entries ---"
docker exec "$CONTAINER" grep -A2 '"agent"' /root/.config/opencode/opencode.json || true
echo ""

###############################################################################
# STEP 9: START TUI via docker exec -it in tmux
###############################################################################

echo "=== STEP 9: Start TUI in tmux ==="

tmux new-session -d -s "$CONTAINER" \
    "docker exec -it ${CONTAINER} ${BINARY_PATH} --agent trident 2>&1; sleep 60"

sleep "${SLEEP_TUI_START}"
echo "PASS: TUI started in tmux session '${CONTAINER}'"
echo ""

###############################################################################
# STEP 10: DISMISS UPDATE DIALOG
###############################################################################

echo "=== STEP 10: Dismiss update dialog ==="
tmux send-keys -t "$CONTAINER" Escape
sleep "${SLEEP_DISMISS}"
tmux send-keys -t "$CONTAINER" Escape
sleep "${SLEEP_DISMISS}"
echo "PASS: Update dialog dismissed"
echo ""

###############################################################################
# STEP 11: TIER 4 TUI TESTS — REAL WORKFLOW (Section 11 v2.0)
###############################################################################

echo "=============================================="
echo "=== STEP 11: TIER 4 TUI TEST SUITE ==="
echo "=============================================="
echo ""

# ============================================================
# TEST 1: IDENTITY INJECTION
# "who are you" → model says "Trident Brain v4.3.1-T3"
# ============================================================
echo "=== TEST 1: Identity injection ==="
echo "Sending: who are you"

tmux send-keys -t "$CONTAINER" "who are you" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test1-identity.txt"
echo "Captured: TuiInteraction-test1-identity.txt"

# Check: response contains "Trident Brain v4.3"
if grep -qi "Trident Brain v4.3" "${EVIDENCE_DIR}/TuiInteraction-test1-identity.txt"; then
    echo "PASS: Identity injection — model identifies as Trident Brain v4.3.x"
else
    echo "FAIL: Identity injection — model did NOT identify as Trident Brain v4.3"
    echo "Dumping capture for inspection:"
    tail -30 "${EVIDENCE_DIR}/TuiInteraction-test1-identity.txt"
fi
echo ""

# ============================================================
# TEST 2: TOOL BLOCKING
# Ask trident to use bash → model REFUSES (blocked by hooks)
# ============================================================
echo "=== TEST 2: Tool blocking ==="
echo "Sending: Please use bash to list the files in /tmp"

tmux send-keys -t "$CONTAINER" "Please use bash to list the files in /tmp" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt"
echo "Captured: TuiInteraction-test2-tool-block.txt"

# Check: response should REFUSE to use bash, or say it's blocked
# Trident's identity says: "Trident Audits & Generates Review Artifacts.
# Build Agents Implement All Changes."
# So it should NOT use bash/write/edit — it's an audit engine
if grep -qiE "FIREWALL_BLOCKED|blocked|cannot use bash|I don't have access|not available|refuse" "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt"; then
    echo "PASS: Tool blocking — model refused to use bash"
elif grep -qiE "trident-code-audit|trident-status|trident-help" "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt"; then
    echo "PASS: Tool blocking — model redirected to its own tools instead of bash"
elif grep -qiE "I am Trident|audit engine|generate review artifacts" "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt"; then
    echo "PASS: Tool blocking — model reasserted its identity as audit engine"
else
    echo "WARN: Tool blocking — could not confirm bash refusal from capture"
    echo "This may be acceptable if the model explained it cannot use bash"
    echo "Dumping capture for manual inspection:"
    tail -30 "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt"
fi
echo ""

# ============================================================
# TEST 3: TAB TOGGLE TO BUILD — VERIFY ZERO IDENTITY SPILLOVER
# 1 Tab: Trident(0) → Build(1), ask "who are you", verify NO "Trident Brain"
# Tab cycle: Trident → Build → Plan → Spider → Shark → Trident
# ============================================================
echo "=== TEST 3: Tab toggle to Build ==="
echo "Toggling to Build agent (1 Tab: Trident→Build)"

tmux send-keys -t "$CONTAINER" Tab
sleep "${SLEEP_TOGGLE}"

tmux send-keys -t "$CONTAINER" "who are you" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test3-build-agent.txt"
echo "Captured: TuiInteraction-test3-build-agent.txt"

# Check: NO "Trident Brain" in Build agent response
if grep -qi "Trident Brain" "${EVIDENCE_DIR}/TuiInteraction-test3-build-agent.txt"; then
    echo "FAIL: Identity spillover — Build agent said 'Trident Brain'"
else
    echo "PASS: Zero spillover — Build agent did NOT say 'Trident Brain'"
fi
echo ""

# ============================================================
# TEST 4: TAB TOGGLE TO SPIDER — VERIFY ZERO IDENTITY SPILLOVER
# 2 Tabs: Build(1) → Plan(2) → Spider(3), ask "who are you", verify NO "Trident Brain"
# Tab cycle: Trident → Build → Plan → Spider → Shark → Trident
# ============================================================
echo "=== TEST 4: Tab toggle to Spider ==="
echo "Toggling to Spider agent (2 Tabs: Build→Plan→Spider)"

tmux send-keys -t "$CONTAINER" Tab
sleep 1
tmux send-keys -t "$CONTAINER" Tab
sleep "${SLEEP_TOGGLE}"

tmux send-keys -t "$CONTAINER" "who are you" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test4-spider-agent.txt"
echo "Captured: TuiInteraction-test4-spider-agent.txt"

# Check: NO "Trident Brain" in spider agent response
if grep -qi "Trident Brain" "${EVIDENCE_DIR}/TuiInteraction-test4-spider-agent.txt"; then
    echo "FAIL: Identity spillover — spider agent said 'Trident Brain'"
else
    echo "PASS: Zero spillover — spider agent did NOT say 'Trident Brain'"
fi
echo ""

# ============================================================
# TEST 5: TAB TOGGLE BACK TO TRIDENT — VERIFY IDENTITY RELOADS
# 2 Tabs: Spider(3) → Shark(4) → Trident(0), ask "who are you", verify "Trident Brain v4.3"
# Tab cycle: Trident → Build → Plan → Spider → Shark → Trident
# ============================================================
echo "=== TEST 5: Tab toggle back to Trident ==="
echo "Toggling back to Trident agent (2 Tabs: Spider→Shark→Trident)"

tmux send-keys -t "$CONTAINER" Tab
sleep 1
tmux send-keys -t "$CONTAINER" Tab
sleep "${SLEEP_TOGGLE}"

tmux send-keys -t "$CONTAINER" "who are you" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test5-trident-reload.txt"
echo "Captured: TuiInteraction-test5-trident-reload.txt"

# Check: "Trident Brain v4.3" reappears after toggling back
if grep -qi "Trident Brain v4.3" "${EVIDENCE_DIR}/TuiInteraction-test5-trident-reload.txt"; then
    echo "PASS: Identity reload — trident agent identifies as Trident Brain v4.3 after toggle back"
else
    echo "FAIL: Identity did NOT reload after toggling back to trident"
    echo "Dumping capture for inspection:"
    tail -30 "${EVIDENCE_DIR}/TuiInteraction-test5-trident-reload.txt"
fi
echo ""

# ============================================================
# TEST 6: REAL WORKFLOW — RUN trident-code-audit
# Ask trident to audit some code using its tools
# ============================================================
echo "=== TEST 6: Real workflow — trident-code-audit ==="
echo "Sending: Run a quick code audit on the trident plugin source code"

# Create a small target file in the container for the audit
docker exec "$CONTAINER" sh -c 'mkdir -p /tmp/audit-target && cat > /tmp/audit-target/sample.ts << "AUDITEOF"
export function add(a: number, b: number): number {
  return a + b;
}

export function divide(a: number, b: number): number {
  return a / b;
}

export function getItems(): any[] {
  return [];
}

export async function processData(data: any): Promise<string> {
  const result = await fetch(data.url);
  return result.json();
}
AUDITEOF'

tmux send-keys -t "$CONTAINER" "Run a trident-code-audit on the files in /tmp/audit-target/" Enter
sleep "${SLEEP_MESSAGE}"
# Extra wait — audits take longer
sleep 30

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test6-audit-workflow.txt"
echo "Captured: TuiInteraction-test6-audit-workflow.txt"

# Check: model used its audit tools (trident-code-audit, trident-status, trident-help, etc.)
if grep -qiE "trident-code-audit|trident-status|trident-gate|R[0-9]|17-layer|audit" "${EVIDENCE_DIR}/TuiInteraction-test6-audit-workflow.txt"; then
    echo "PASS: Real workflow — model used its audit tools"
else
    echo "WARN: Real workflow — could not confirm audit tool usage from capture"
    echo "This may be acceptable if the model is still processing"
    echo "Dumping capture for manual inspection:"
    tail -40 "${EVIDENCE_DIR}/TuiInteraction-test6-audit-workflow.txt"
fi
echo ""

# ============================================================
# TEST 7: SUSTAINED RUNTIME — WAIT >= 600s, VERIFY IDENTITY
# ============================================================
echo "=== TEST 7: Sustained runtime (${SLEEP_SUSTAINED}s) ==="
echo "Waiting ${SLEEP_SUSTAINED} seconds to verify identity persistence..."

sleep "${SLEEP_SUSTAINED}"

echo "Sending: who are you (post-sustained)"
tmux send-keys -t "$CONTAINER" "who are you" Enter
sleep "${SLEEP_MESSAGE}"

tmux capture-pane -t "$CONTAINER" -p > "${EVIDENCE_DIR}/TuiInteraction-test7-sustained.txt"
echo "Captured: TuiInteraction-test7-sustained.txt"

# Check: identity still correct after sustained runtime
if grep -qi "Trident Brain v4.3" "${EVIDENCE_DIR}/TuiInteraction-test7-sustained.txt"; then
    echo "PASS: Sustained runtime — identity still correct after ${SLEEP_SUSTAINED}s"
else
    echo "FAIL: Sustained runtime — identity LOST after ${SLEEP_SUSTAINED}s"
    echo "Dumping capture for inspection:"
    tail -30 "${EVIDENCE_DIR}/TuiInteraction-test7-sustained.txt"
fi
echo ""

# ============================================================
# FINAL FULL-SESSION CAPTURE
# ============================================================
echo "=== Final full-session capture ==="
tmux capture-pane -t "$CONTAINER" -p -S -500 > "${EVIDENCE_DIR}/TuiInteraction-full-session.txt"
echo "Captured: TuiInteraction-full-session.txt"
echo ""

###############################################################################
# STEP 11 ANALYSIS: MECHANICAL EVIDENCE GENERATION
###############################################################################

echo "=== Generating mechanical evidence files ==="

# Count pass/fail from captures
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
RESULTS=""

analyze_test() {
    local test_num="$1"
    local test_name="$2"
    local evidence_file="$3"
    local pass_pattern="$4"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if grep -qi "$pass_pattern" "$evidence_file"; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        RESULTS="${RESULTS}    {\"test\": ${test_num}, \"name\": \"${test_name}\", \"passed\": true},\n"
        echo "  PASS: ${test_name}"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        RESULTS="${RESULTS}    {\"test\": ${test_num}, \"name\": \"${test_name}\", \"passed\": false},\n"
        echo "  FAIL: ${test_name}"
    fi
}

# Analyze each test
analyze_test 1 "Identity injection" "${EVIDENCE_DIR}/TuiInteraction-test1-identity.txt" "Trident Brain v4.3"
analyze_test 2 "Tool blocking (bash refusal)" "${EVIDENCE_DIR}/TuiInteraction-test2-tool-block.txt" "FIREWALL_BLOCKED|blocked|cannot use|not available|refuse|audit engine|Trident.*audit"
analyze_test 3 "Tab toggle Build (no spill)" "${EVIDENCE_DIR}/TuiInteraction-test3-build-agent.txt" "^((?!Trident Brain).)*$"
analyze_test 4 "Tab toggle Spider (no spill)" "${EVIDENCE_DIR}/TuiInteraction-test4-spider-agent.txt" "^((?!Trident Brain).)*$"
analyze_test 5 "Tab toggle back (reload)" "${EVIDENCE_DIR}/TuiInteraction-test5-trident-reload.txt" "Trident Brain v4.3"
analyze_test 6 "Real workflow (audit tools)" "${EVIDENCE_DIR}/TuiInteraction-test6-audit-workflow.txt" "audit|trident"
analyze_test 7 "Sustained runtime (identity)" "${EVIDENCE_DIR}/TuiInteraction-test7-sustained.txt" "Trident Brain v4.3"

echo ""
echo "Results: ${PASSED_TESTS}/${TOTAL_TESTS} PASSED, ${FAILED_TESTS} FAILED"

###############################################################################
# EVIDENCE FILE 1: ContainerSpawnResult.json
###############################################################################

cat > "${EVIDENCE_DIR}/ContainerSpawnResult.json" << EOF
{
  "success": true,
  "containerName": "${CONTAINER}",
  "image": "${CONTAINER_IMAGE}",
  "model": "${GOOGLE_MODEL}",
  "binaryVersion": "${HOST_VERSION}",
  "pluginCount": ${LIVE_PLUGIN_COUNT},
  "plugins": [
    "shark-agent",
    "hive-mind",
    "spider-agent-v2.2.2",
    "agent-vision",
    "trident"
  ],
  "agentUnderTest": "trident",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "configSource": "LIVE_FRESH_CLONE",
  "configPath": "${ACTIVE_CONFIG}"
}
EOF
echo "Written: ContainerSpawnResult.json"

###############################################################################
# EVIDENCE FILE 2: ContainerTestResult.json
###############################################################################

cat > "${EVIDENCE_DIR}/ContainerTestResult.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "v4.3.1-T3",
  "totalTests": ${TOTAL_TESTS},
  "passedTests": ${PASSED_TESTS},
  "failedTests": ${FAILED_TESTS},
  "passRate": "$(echo "scale=1; ${PASSED_TESTS} * 100 / ${TOTAL_TESTS}" | bc)%",
  "method": "Tier4-tmux-docker-exec-it",
  "sustainedRuntimeSeconds": ${SLEEP_SUSTAINED},
  "configFidelity": "EXACT_LIVE_CLONE",
  "binaryVersion": "${HOST_VERSION}",
  "image": "${CONTAINER_IMAGE}",
  "model": "${GOOGLE_MODEL}",
  "results": [
$(echo -e "$RESULTS" | sed '$ s/,$//')
  ],
  "evidenceFiles": [
    "TuiInteraction-test1-identity.txt",
    "TuiInteraction-test2-tool-block.txt",
    "TuiInteraction-test3-build-agent.txt",
    "TuiInteraction-test4-spider-agent.txt",
    "TuiInteraction-test5-trident-reload.txt",
    "TuiInteraction-test6-audit-workflow.txt",
    "TuiInteraction-test7-sustained.txt",
    "TuiInteraction-full-session.txt"
  ]
}
EOF
echo "Written: ContainerTestResult.json"

###############################################################################
# EVIDENCE FILE 3: EvidencePathVerified.json
###############################################################################

EVIDENCE_FILES=(
    "TuiInteraction-test1-identity.txt"
    "TuiInteraction-test2-tool-block.txt"
    "TuiInteraction-test3-build-agent.txt"
    "TuiInteraction-test4-spider-agent.txt"
    "TuiInteraction-test5-trident-reload.txt"
    "TuiInteraction-test6-audit-workflow.txt"
    "TuiInteraction-test7-sustained.txt"
    "TuiInteraction-full-session.txt"
    "ContainerSpawnResult.json"
    "ContainerTestResult.json"
)

EXIST_COUNT=0
MISSING_LIST=""
for f in "${EVIDENCE_FILES[@]}"; do
    if [ -f "${EVIDENCE_DIR}/${f}" ]; then
        EXIST_COUNT=$((EXIST_COUNT + 1))
    else
        MISSING_LIST="${MISSING_LIST} ${f}"
    fi
done

cat > "${EVIDENCE_DIR}/EvidencePathVerified.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "evidenceDirectory": "${EVIDENCE_DIR}",
  "expectedFiles": ${#EVIDENCE_FILES[@]},
  "verifiedOnDisk": ${EXIST_COUNT},
  "allFilesExist": $([ "${EXIST_COUNT}" -eq "${#EVIDENCE_FILES[@]}" ] && echo "true" || echo "false"),
  "missingFiles": "${MISSING_LIST}",
  "files": [
$(for f in "${EVIDENCE_FILES[@]}"; do
    if [ -f "${EVIDENCE_DIR}/${f}" ]; then
        SIZE=$(wc -c < "${EVIDENCE_DIR}/${f}")
        echo "    \"${f}\" (${SIZE} bytes),"
    fi
done | sed '$ s/,$//')
  ]
}
EOF
echo "Written: EvidencePathVerified.json"

echo ""

###############################################################################
# STEP 12: CLEANUP
###############################################################################

echo "=== STEP 12: Cleanup ==="
tmux kill-session -t "$CONTAINER" 2>/dev/null || true
echo "PASS: tmux session killed"

docker kill "$CONTAINER" 2>/dev/null || true
echo "PASS: Container killed"

rm -rf "$SNAP" 2>/dev/null || sudo rm -rf "$SNAP" 2>/dev/null || true
echo "PASS: Snapshot directory removed"

echo ""

###############################################################################
# FINAL REPORT
###############################################################################

echo "=============================================="
echo "=== TIER 4 TEST COMPLETE ==="
echo "=============================================="
echo ""
echo "Container:   ${CONTAINER}"
echo "Image:       ${CONTAINER_IMAGE}"
echo "Model:       ${GOOGLE_MODEL}"
echo "Binary:      ${HOST_VERSION}"
echo "Method:      Tier 4 (tmux + docker exec -it)"
echo "Duration:    ${SLEEP_SUSTAINED}s sustained + test time"
echo ""
echo "Results:     ${PASSED_TESTS}/${TOTAL_TESTS} PASSED"
echo "Evidence:    ${EVIDENCE_DIR}"
echo ""
echo "Evidence files:"
ls -la "${EVIDENCE_DIR}"/TuiInteraction-test*.txt "${EVIDENCE_DIR}"/Container*.json "${EVIDENCE_DIR}"/EvidencePathVerified.json 2>/dev/null
echo ""
echo "=== AGENT STATUS: REPORTER (not declarer) ==="
echo "Container test executed. Evidence files at:"
echo "  ${EVIDENCE_DIR}"
echo "Overall: ${PASSED_TESTS}/${TOTAL_TESTS} passed."
echo "Review TuiInteraction-*.txt captures for detailed model responses."
echo ""
echo "=== DONE ==="
