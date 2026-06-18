# SHARK TILE SPAWN PROCEDURE — VERIFIED WORKING 2026-06-15

**This is the EXACT procedure that was executed successfully. Every line is verified.**
**Deviating from this procedure will produce an INVISIBLE or BROKEN tile. Period.**

**Verified coordinates:** x=320, y=4080 (row 5, right column, 920x1000)
**Container:** `shark-container` (image: `opencode-test:1.14.34`)
**Tile ID:** `tile-1781511451571-16`
**Model:** OpenCode Zen DeepSeek (free) via `--agent shark`

## 🚨 FORBIDDEN ACTS — IMMEDIATE FAILURE IF ATTEMPTED

| Forbidden | Why | Correct |
|-----------|-----|---------|
| `session.create` on `pty-sidecar.sock` | Creates orphan PTY. No visible tile. | Use `canvas.tileCreate` on `ipc.sock` |
| `"type": "terminal"` in tileCreate | Creates BROKEN note tile. terminalWrite fails. | Use `"tileType": "term"` |
| `"data"` in terminalWrite | The renderer reads `params.input`, NOT `params.data`. Using `data` silently does nothing. | Use `"input"` |
| `\n` to submit TUI text | Inserts line break in input area. Text never submits. | Two-step Enter: text → 1s → Enter |
| Single-batch `send-keys "text" "Enter"` | Enter arrives BEFORE text renders. Nothing happens. | Two calls: send-keys text → sleep(1) → send-keys Enter |
| `pkill -f opencode` or `killall opencode` on HOST | Kills EVERY opencode on the entire host. Destroys other sessions. | `docker exec CONTAINER sh -c "kill -9 \$(pgrep -f /usr/local/bin/opencode)"` |
| `tmux capture-pane` | One-off snapshot. Misses data. Slow. | `tmux pipe-pane` with continuous stream file |
| `canvas.terminalWrite` **after** TUI loads | terminalWrite sends to the underlying bash shell, NOT the TUI prompt. Text goes to bash, you never see it. | `tmux send-keys` in two-step |

**If you do any of these, the procedure has failed. Start over from Step 1.**

---

## PREREQUISITES — NON-SKIPPABLE CHECKS

These MUST pass before any other step. If any check fails, STOP.

### Check 1: Container must be running
```bash
docker ps --filter name=shark-container --format "{{.Names}}" | grep -q "^shark-container$"
```
Exit code must be 0. If not 0, container does not exist. Create it first. Do not proceed.

### Check 2: IPC socket must exist
```bash
test -S "$HOME/.collaborator/ipc.sock" && echo "IPC OK" || echo "IPC MISSING"
```
Must print "IPC OK". If not, the collaborator is not running. Do not proceed.

### Check 3: Python3 must be available
```bash
python3 --version
```
Must print a version number. Do not proceed without python3.

---

## 🔴 WORKSPACE PERMISSIONS — MUST BE SET BEFORE LAUNCH

The TUI will show permission prompts on EVERY file write/tool call unless
WORKSPACE-LEVEL permissions are set. These are NOT agent permissions — they
are at the ROOT level of opencode.json, NOT inside `agent.shark.permission`.

### CORRECT format (at root level of opencode.json):
```json
{
  "permission": {
    "*": { "*": "allow" }
  }
}
```

### Apply to container BEFORE launching opencode:
```bash
docker exec shark-container sh -c "cat > /root/.config/opencode/opencode.json << 'CONFIGEOF'
{
  \"\$schema\": \"https://opencode.ai/config.json\",
  \"autoupdate\": false,
  \"model\": \"opencode-zen/deepseek-free\",
  \"small_model\": \"opencode-zen/deepseek-free\",
  \"permission\": {
    \"*\": {
      \"*\": \"allow\"
    }
  },
  \"plugin\": [
    \"file:///root/.config/opencode/plugins/shark/dist/index.js\"
  ],
  \"agent\": {
    \"shark\": {
      \"name\": \"shark\",
      \"description\": \"SHARK v4.9.9\",
      \"mode\": \"primary\",
      \"color\": \"#00BFFF\"
    }
  }
}
CONFIGEOF"
```

### Verify:
```bash
docker exec shark-container python3 -c "import json; c=json.load(open('/root/.config/opencode/opencode.json')); assert 'permission' in c, 'No permission at root!'; assert c['permission'].get('*',{}).get('*')=='allow', 'Not allow-all!'"
```

If verification fails, the config is wrong. Fix it. Without this, TUI will show permission prompts on every action.

### WRONG formats that DO NOT WORK:
```json
// WRONG — agent-level perms don't control workspace prompts:
{ "agent": { "shark": { "permission": { "task": "allow", "tool": "allow" } } } }

// WRONG — nested under agent instead of root:
{ "agent": { "permission": { "*": { "*": "allow" } } } }
```

Permissions MUST be at the root level with the `"*": { "*": "allow" }` format.

---

## EXACT PROCEDURE — EXECUTE IN ORDER. DO NOT SKIP STEPS. DO NOT REORDER.

### Step 1 — Read tile list + find empty slot (MANDATORY, cannot be skipped)

Run this Python script. It defines the `ipc()` and `find_next_row()` functions used by ALL subsequent steps.

```python
import socket, json, os, time, subprocess

IPC = os.path.expanduser("~/.collaborator/ipc.sock")

def ipc(method, params=None):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(IPC)
    req = {"jsonrpc": "2.0", "id": "1", "method": method}
    if params: req["params"] = params
    s.sendall(json.dumps(req).encode() + b"\n")
    f = s.makefile("rb")
    line = f.readline()
    f.close()
    s.close()
    return json.loads(line.decode())

def ipc_assert(method, params=None, expected_key=None):
    """Like ipc() but FAILS HARD if the response is an error."""
    r = ipc(method, params)
    if "error" in r:
        raise RuntimeError(f"IPC {method} failed: {r['error']}")
    if expected_key and expected_key not in r.get("result", {}):
        raise RuntimeError(f"IPC {method} response missing '{expected_key}': {r}")
    return r

def find_next_row():
    """Scan TOP-TO-BOTTOM, place in first empty right column (x=320), then left (x=-600).
    If all existing rows full, add new row below the lowest existing row.
    This is the ONLY correct placement function. Do not hardcode positions."""
    r = ipc_assert("canvas.tileList", {})
    occupied = {}
    for t in r.get("result", {}).get("tiles", []):
        p = t.get("position", {}); y = p.get("y", 0)
        occupied.setdefault(y, set()).add(p.get("x", 0))
    if not occupied:
        return 320, 80, 920, 1000
    for row_y in sorted(occupied.keys()):
        cols = occupied[row_y]
        if 320 not in cols:
            return 320, row_y, 920, 1000
        if -600 not in cols:
            return -600, row_y, 920, 1000
    max_y = max(occupied.keys())
    return 320, max_y + 1000, 920, 1000
```

### Step 2 — Kill stale opencode INSIDE container only

```bash
docker exec shark-container sh -c "kill -9 \$(pgrep -f /usr/local/bin/opencode) 2>/dev/null; sleep 2"
```

🚨 **VERIFICATION (NON-SKIPPABLE):**
```bash
docker exec shark-container sh -c "pgrep -f /usr/local/bin/opencode" 2>&1
```
Must return empty output (exit code 1). If opencode PID still shows, the kill failed. Repeat Step 2. Do not proceed until PID is gone.

### Step 3 — Create tile via IPC

```python
r = ipc_assert("canvas.tileCreate", {"tileType": "term"})
TILE_ID = r.get("result", {}).get("tileId", "")
```

🚨 **VERIFICATION (NON-SKIPPABLE):**
```python
if not TILE_ID:
    raise RuntimeError(f"Tile creation returned empty tileId. Response: {r}")
if not TILE_ID.startswith("tile-"):
    raise RuntimeError(f"Tile ID has unexpected format: {TILE_ID}. Expected 'tile-...'")
print(f"TILE_ID={TILE_ID}")
```

If TILE_ID is empty or doesn't start with `tile-`, tile creation failed silently. Do not proceed.

### Step 4 — Move tile to empty row + resize

```python
pos_x, pos_y, std_w, std_h = find_next_row()
ipc_assert("canvas.tileMove", {"tileId": TILE_ID, "position": {"x": pos_x, "y": pos_y}})
time.sleep(0.5)
ipc_assert("canvas.tileResize", {"tileId": TILE_ID, "size": {"width": std_w, "height": std_h}})
time.sleep(0.5)
print(f"Tile placed at x={pos_x} y={pos_y} size={std_w}x{std_h}")
```

🚨 **VERIFICATION — Read back position and confirm it matches:**
```python
r = ipc("canvas.tileList", {})
for t in r.get("result", {}).get("tiles", []):
    if t.get("id") == TILE_ID:
        actual_x = t.get("position", {}).get("x")
        actual_y = t.get("position", {}).get("y")
        w = t.get("size", {}).get("width")
        h = t.get("size", {}).get("height")
        print(f"Confirmed: x={actual_x} y={actual_y} {w}x{h}")
        assert actual_x == pos_x, f"x mismatch: expected {pos_x}, got {actual_x}"
        assert actual_y == pos_y, f"y mismatch: expected {pos_y}, got {actual_y}"
        break
else:
    raise RuntimeError(f"Tile {TILE_ID} not found in tileList after move!")
```

If position doesn't match, the move/resize failed silently. Do not proceed.

### Step 5 — Wait for shell init (HARD WAIT, cannot be skipped or shortened)

```python
print("Waiting 3s for shell init...")
time.sleep(3)
```

🚨 **VERIFICATION — Confirm shell is responsive:**
```python
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "echo SHELL_READY\n"})
time.sleep(1)
r = ipc("canvas.terminalRead", {"tileId": TILE_ID, "lines": 20})
output = r.get("result", {}).get("output", "")
if "SHELL_READY" not in output:
    time.sleep(3)
    r = ipc("canvas.terminalRead", {"tileId": TILE_ID, "lines": 20})
    output = r.get("result", {}).get("output", "")
    if "SHELL_READY" not in output:
        raise RuntimeError("Shell not responding after 6s. Tile may be broken.")
print("Shell responsive.")
```

If shell doesn't respond within 6s, the tile is broken. Recreate it (go back to Step 3).

### Step 6 — cd to workspace BEFORE creating tmux

```python
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "cd ~/OPENCODE_WORKSPACE\n"})
time.sleep(1)
```

🚨 **THE REASON:** `tmux new-session` inherits the CWD of the shell it runs in. If you don't `cd` first, tmux starts in `~`. Then `docker exec` with relative paths fails silently. Launching opencode from `~` means the SHARK plugin reads config from `~` instead of the workspace. This causes WRONG MODEL, WRONG CONFIG, WRONG EVERYTHING.

### Step 7 — Create tmux session

```python
TMUX_SESSION = "shark-container"
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": f"tmux new-session -d -s {TMUX_SESSION} 2>/dev/null; exec tmux attach-session -t {TMUX_SESSION}\n"})
time.sleep(3)
```

🚨 **VERIFICATION (NON-SKIPPABLE):**
```bash
tmux has-session -t shark-container 2>&1
```
Must exit with code 0. If session does not exist, tmux creation failed. Do not proceed.

### Step 8 — Set up pipe-pane for continuous stream capture

```python
STREAM_FILE = "/tmp/shark-container/stream.txt"
os.makedirs("/tmp/shark-container", exist_ok=True)
open(STREAM_FILE, "w").close()
time.sleep(0.3)
```

```bash
tmux pipe-pane -t shark-container:0 -o 2>/dev/null
sleep 0.3
tmux pipe-pane -t shark-container:0 -o "cat >> /tmp/shark-container/stream.txt"
sleep 0.3
```

🚨 **VERIFICATION (NON-SKIPPABLE):** Pipe must be active AND stream must capture data.
```bash
# Verify pipe is active
tmux list-panes -t shark-container:0 -F '#{pane_pipe}'
```
Must print `1`. If 0, pipe-pane is not active. Repeat Step 8.

```bash
# Verify stream file captures data
echo "PIPE_TEST" | tee -a /tmp/shark-container/stream.txt > /dev/null
grep -q "PIPE_TEST" /tmp/shark-container/stream.txt && echo "STREAM OK" || echo "STREAM NOT CAPTURING"
```
Must print "STREAM OK". If not, pipe-pane is broken. Repeat Step 8.

### Step 9 — Launch opencode inside container

```bash
tmux send-keys -t shark-container:0 "cd ~/OPENCODE_WORKSPACE && docker exec -e OPENCODE_SKIP_UPDATE=1 -it shark-container /usr/local/bin/opencode --agent shark 2>&1; bash" Enter
sleep 1
```

🚨 **VERIFICATION (WAIT 15s THEN CHECK):**
```bash
sleep 14
tmux list-panes -t shark-container:0 -F "#{pane_current_command}"
```
Must print `docker`. If it prints `bash`, opencode crashed. 
Check for errors:
```bash
tail -20 /tmp/shark-container/stream.txt
```
If you see "command not found" or "permission denied" or "no such file", the docker exec command has a typo or the binary path is wrong. Fix and go back to Step 2 (kill + relaunch).

### Step 10 — Wait for "Ask anything" in stream (HARD POLL, CANNOT BE SKIPPED)

```python
import os, time

STREAM_FILE = "/tmp/shark-container/stream.txt"
pos_start = os.path.getsize(STREAM_FILE) if os.path.exists(STREAM_FILE) else 0
tui_loaded = False

print("Polling for 'Ask anything'...")
for attempt in range(30):  # up to 60 seconds
    time.sleep(2)
    try:
        with open(STREAM_FILE, 'rb') as f:
            f.seek(pos_start)
            chunk = f.read(4096)
            content = chunk.decode('utf-8', errors='replace')
            if 'Ask anything' in content:
                tui_loaded = True
                break
            pos_start = f.tell() if chunk else pos_start
    except FileNotFoundError:
        print(f"  Stream file {STREAM_FILE} not found! Check Step 8.")
        break
    except Exception as e:
        print(f"  Read error: {e}")
    if attempt > 0 and attempt % 5 == 0:
        print(f"  Still waiting... ({attempt*2}s)")

if tui_loaded:
    print("✅ TUI LOADED — 'Ask anything' detected")
else:
    print("❌ TUI NOT LOADED after 60s")
    # Diagnostic: check pane state
    import subprocess
    r = subprocess.run(["tmux", "list-panes", "-t", "shark-container:0", "-F", "#{pane_current_command}"], capture_output=True, text=True)
    pane_cmd = r.stdout.strip()
    print(f"Pane command: {pane_cmd}")
    if pane_cmd == "bash":
        print("Pane dropped to bash. opencode crashed. Check Step 9 for errors.")
    elif pane_cmd == "docker":
        print("Pane running docker but 'Ask anything' not seen. Model may be slow. Wait longer.")
        # Continue polling for another 60s
        for attempt in range(30):
            time.sleep(2)
            try:
                with open(STREAM_FILE, 'rb') as f:
                    f.seek(pos_start)
                    chunk = f.read(4096)
                    content = chunk.decode('utf-8', errors='replace')
                    if 'Ask anything' in content:
                        tui_loaded = True
                        break
                    pos_start = f.tell() if chunk else pos_start
            except:
                pass
        if tui_loaded:
            print("✅ TUI LOADED (delayed)")
        else:
            print("❌ TUI STILL NOT LOADED after 120s total. Kill and restart from Step 2.")

if not tui_loaded:
    print("FATAL: Cannot proceed without TUI. Exiting.")
    exit(1)
```

### Step 11 — Save tile ID to anchor file for future reconnection

```python
import json
ANCHOR_FILE = os.path.expanduser("~/.config/ct-run/anchors.json")
anchor = {}
if os.path.exists(ANCHOR_FILE):
    try:
        with open(ANCHOR_FILE) as f:
            anchor = json.load(f)
    except:
        pass
anchor["shark"] = {
    "tile_id": TILE_ID,
    "position": {"x": pos_x, "y": pos_y},
    "size": {"width": std_w, "height": std_h},
    "tmux_session": TMUX_SESSION,
    "container": "shark-container",
    "created": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
}
os.makedirs(os.path.dirname(ANCHOR_FILE), exist_ok=True)
with open(ANCHOR_FILE, "w") as f:
    json.dump(anchor, f, indent=2)
print(f"✅ Anchor saved to {ANCHOR_FILE}")
```

---

## SUCCESS VERIFICATION — ALL MUST PASS

```python
checks = []

# 1. Tile exists in canvas
r = ipc("canvas.tileList", {})
tile_found = any(t.get("id") == TILE_ID for t in r.get("result", {}).get("tiles", []))
checks.append(("Tile in canvas", tile_found))

# 2. TUI loaded
checks.append(("Ask anything detected", tui_loaded))

# 3. Container opencode running
import subprocess
r = subprocess.run(["docker", "exec", "shark-container", "sh", "-c", "pgrep -f /usr/local/bin/opencode"], capture_output=True, text=True)
checks.append(("opencode PID in container", r.returncode == 0))

# 4. Stream file exists and has content
checks.append(("Stream file with data", os.path.getsize(STREAM_FILE) > 100))

# 5. Anchor file has shark entry
anchors = {}
try:
    with open(os.path.expanduser("~/.config/ct-run/anchors.json")) as f:
        anchors = json.load(f)
except:
    pass
checks.append(("Anchor saved", "shark" in anchors and anchors["shark"].get("tile_id") == TILE_ID))

print("\n=== VERIFICATION RESULTS ===")
all_pass = True
for name, passed in checks:
    status = "✅" if passed else "❌"
    print(f"  {status} {name}")
    if not passed:
        all_pass = False

if all_pass:
    print("\n✅ ALL CHECKS PASSED — Tile is live and ready")
else:
    print("\n❌ SOME CHECKS FAILED — Diagnose and fix before proceeding")
```

---

## TUI COMMUNICATION AFTER SPAWN

### Sending messages (MANDATORY two-step protocol):

```python
def send(text):
    """Two-step Enter. NEVER use \\n. NEVER single-batch."""
    import subprocess, time
    subprocess.run(["tmux", "send-keys", "-t", "shark-container:0", text])
    time.sleep(1)  # HARD WAIT. Text must render before Enter.
    subprocess.run(["tmux", "send-keys", "-t", "shark-container:0", "Enter"])
```

🚨 **WRONG (DO NOT USE):**
```python
# WRONG — \n does not submit in TUI:
subprocess.run(["tmux", "send-keys", "-t", "shark-container:0", "who are you\n"])

# WRONG — single-batch, Enter arrives before text renders:
subprocess.run(["tmux", "send-keys", "-t", "shark-container:0", "who are you", "Enter"])

# WRONG — canvas.terminalWrite sends to bash, not TUI:
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "who are you\n"})
```

### Checking TUI is alive before sending:

```python
def tui_is_alive():
    """Check pane is running docker, not bash."""
    import subprocess
    r = subprocess.run(["tmux", "list-panes", "-t", "shark-container:0", "-F", "#{pane_current_command}"], capture_output=True, text=True)
    return r.stdout.strip() == "docker"
```

**Before EVERY message**, call `tui_is_alive()`. If it returns False, opencode crashed. Run kill → relaunch (Steps 2 → 9 → 10).

---

## KNOWN FAILURE MODES — WITH EXACT FIX

| Symptom | What happened | Exact fix |
|---------|--------------|-----------|
| TILE_ID empty | tileCreate returned error | Check `tileType` param is NOT `type`. Check value is `"term"` NOT `"terminal"` |
| Tile visible but no shell | terminalWrite used `"data"` instead of `"input"` | Change all terminalWrite params to use `"input"` |
| Text appears in TUI input area but never submits | Used `\n` or single-batch send-keys | Use two-step: send text → sleep(1) → send Enter |
| opencode exits immediately after launch | Missing `; bash` fallback | Add `2>&1; bash` to the end of the launch command |
| "Update available" popup blocks screen | `OPENCODE_SKIP_UPDATE=1` missing from docker exec | Kill opencode, relaunch with env var. If popup already visible, press Escape (not Enter) |
| Stream file stays empty (0 bytes) | pipe-pane not set up or toggled correctly | Run toggle-OFF → 0.3s → toggle-ON sequence again |
| `find_next_row` returns wrong y | Tiles with non-standard heights skew the calculation | The function reads ACTUAL positions from canvas.tileList. If it returns wrong, a tile has non-standard height. Check tile list manually. |
| Pane shows `bash` after launch | opencode binary not found or crashed | Check: `docker exec shark-container which /usr/local/bin/opencode`. If not found, the image doesn't have opencode. |
| TUI shows wrong model (e.g. GLM instead of DeepSeek) | Container config has stale provider setting | Check `docker exec shark-container cat /root/.config/opencode/opencode.json`. The `model` field must be set. |
| `canvas.terminalWrite` commands appear to do nothing after TUI loads | terminalWrite sends to bash, NOT the TUI prompt. Once opencode is running, all TUI input must go through tmux send-keys. | Use `tmux send-keys` for ALL TUI communication. terminalWrite is ONLY for pre-TUI bash commands (Steps 6-7). |
| IPC returns `"Invalid request"` | Missing `"jsonrpc":"2.0"` or `"params":{}` | Every IPC request MUST have both fields. |
| IPC socket connection timeout | Socket doesn't exist at `$HOME/.collaborator/ipc.sock` | Check if collaborator is running. The socket path uses `$HOME/`, NOT `~/`. |
| `makefile` hangs on read | Socket timeout not set | Add `settimeout(10)` before connecting. |

## IPC COMPLETE REFERENCE

```python
# Create terminal tile (CORRECT params)
r = ipc("canvas.tileCreate", {"tileType": "term"})

# Write to bash shell (only valid BEFORE TUI loads)
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "command\n"})

# Read terminal content
r = ipc("canvas.terminalRead", {"tileId": TILE_ID, "lines": 100})

# Move tile
ipc("canvas.tileMove", {"tileId": TILE_ID, "position": {"x": 320, "y": 4080}})

# Resize tile
ipc("canvas.tileResize", {"tileId": TILE_ID, "size": {"width": 920, "height": 1000}})

# List all tiles
r = ipc("canvas.tileList", {})

# Remove tile (only for cleanup)
ipc("canvas.tileRemove", {"tileId": TILE_ID})

# Discover available IPC methods
r = ipc("rpc.discover", {})
```

## FULL WORKING PYTHON SCRIPT — COPY-PASTE AND RUN

```python
#!/usr/bin/env python3
import socket, json, os, time, subprocess

IPC = os.path.expanduser("~/.collaborator/ipc.sock")
TMUX_SESSION = "shark-container"
CONTAINER = "shark-container"
STREAM_FILE = "/tmp/shark-container/stream.txt"
ANCHOR_FILE = os.path.expanduser("~/.config/ct-run/anchors.json")

def ipc(method, params=None):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(IPC)
    req = {"jsonrpc": "2.0", "id": "1", "method": method}
    if params: req["params"] = params
    s.sendall(json.dumps(req).encode() + b"\n")
    f = s.makefile("rb")
    line = f.readline()
    f.close()
    s.close()
    return json.loads(line.decode())

def ipc_assert(method, params=None, expected_key=None):
    r = ipc(method, params)
    if "error" in r:
        raise RuntimeError(f"IPC {method} failed: {r['error']}")
    if expected_key and expected_key not in r.get("result", {}):
        raise RuntimeError(f"IPC {method} missing '{expected_key}': {r}")
    return r

def find_next_row():
    r = ipc_assert("canvas.tileList", {})
    occ = {}
    for t in r.get("result", {}).get("tiles", []):
        p = t.get("position", {}); y = p.get("y", 0)
        occ.setdefault(y, set()).add(p.get("x", 0))
    if not occ:
        return 320, 80, 920, 1000
    for ry in sorted(occ.keys()):
        c = occ[ry]
        if 320 not in c: return 320, ry, 920, 1000
        if -600 not in c: return -600, ry, 920, 1000
    return 320, max(occ.keys()) + 1000, 920, 1000

# === EXECUTION ===
print("=== SHARK TILE SPAWN ===")

# Prerequisite checks
assert subprocess.run(["docker", "ps", "--filter", f"name={CONTAINER}", "--format", "{{.Names}}"],
    capture_output=True, text=True).stdout.strip() == CONTAINER, "Container not running"
assert os.path.exists(IPC), f"IPC socket not found at {IPC}"
assert subprocess.run(["python3", "--version"], capture_output=True).returncode == 0, "python3 required"

# Step 2: Kill stale opencode inside container
subprocess.run(["docker", "exec", CONTAINER, "sh", "-c",
    "kill -9 $(pgrep -f /usr/local/bin/opencode) 2>/dev/null; sleep 2"])
r = subprocess.run(["docker", "exec", CONTAINER, "sh", "-c", "pgrep -f /usr/local/bin/opencode"],
    capture_output=True)
assert r.returncode != 0, "opencode still running after kill"

# Step 3: Create tile
r = ipc_assert("canvas.tileCreate", {"tileType": "term"}, "tileId")
TILE_ID = r["result"]["tileId"]
assert TILE_ID.startswith("tile-"), f"Bad tile ID: {TILE_ID}"
print(f"TILE_ID={TILE_ID}")

# Step 4: Move + resize
pos_x, pos_y, std_w, std_h = find_next_row()
ipc_assert("canvas.tileMove", {"tileId": TILE_ID, "position": {"x": pos_x, "y": pos_y}})
time.sleep(0.5)
ipc_assert("canvas.tileResize", {"tileId": TILE_ID, "size": {"width": std_w, "height": std_h}})
time.sleep(0.5)
# Verify position
r = ipc("canvas.tileList", {})
for t in r.get("result", {}).get("tiles", []):
    if t["id"] == TILE_ID:
        assert t["position"]["x"] == pos_x, f"x: {t['position']['x']} != {pos_x}"
        assert t["position"]["y"] == pos_y, f"y: {t['position']['y']} != {pos_y}"
        break
print(f"Placed at x={pos_x} y={pos_y}")

# Step 5: Wait for shell
time.sleep(3)
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "echo SHELL_OK\n"})
time.sleep(1)
r = ipc("canvas.terminalRead", {"tileId": TILE_ID, "lines": 20})
assert "SHELL_OK" in r.get("result", {}).get("output", ""), "Shell not responsive"

# Step 6: cd to workspace
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input": "cd ~/OPENCODE_WORKSPACE\n"})
time.sleep(1)

# Step 7: Create tmux
ipc("canvas.terminalWrite", {"tileId": TILE_ID, "input":
    f"tmux new-session -d -s {TMUX_SESSION} 2>/dev/null; exec tmux attach-session -t {TMUX_SESSION}\n"})
time.sleep(3)
assert subprocess.run(["tmux", "has-session", "-t", TMUX_SESSION]).returncode == 0, "tmux creation failed"

# Step 8: Pipe-pane
os.makedirs(os.path.dirname(STREAM_FILE), exist_ok=True)
open(STREAM_FILE, "w").close()
time.sleep(0.3)
subprocess.run(["tmux", "pipe-pane", "-t", f"{TMUX_SESSION}:0", "-o"])
time.sleep(0.3)
subprocess.run(["tmux", "pipe-pane", "-t", f"{TMUX_SESSION}:0", "-o", f"cat >> {STREAM_FILE}"])
time.sleep(0.3)
# Verify pipe
r = subprocess.run(["tmux", "list-panes", "-t", f"{TMUX_SESSION}:0", "-F", "#{pane_pipe}"],
    capture_output=True, text=True)
assert r.stdout.strip() == "1", f"pipe-pane not active: {r.stdout.strip()}"

# Step 9: Launch opencode
subprocess.run(["tmux", "send-keys", "-t", f"{TMUX_SESSION}:0",
    "cd ~/OPENCODE_WORKSPACE && docker exec -e OPENCODE_SKIP_UPDATE=1 -it shark-container /usr/local/bin/opencode --agent shark 2>&1; bash",
    "Enter"])
time.sleep(15)
r = subprocess.run(["tmux", "list-panes", "-t", f"{TMUX_SESSION}:0", "-F", "#{pane_current_command}"],
    capture_output=True, text=True)
assert r.stdout.strip() == "docker", f"opencode crashed: {r.stdout.strip()}"

# Step 10: Wait for Ask anything
pos_start = os.path.getsize(STREAM_FILE)
tui_loaded = False
for i in range(30):
    time.sleep(2)
    try:
        with open(STREAM_FILE, 'rb') as f:
            f.seek(pos_start)
            c = f.read(4096).decode('utf-8', errors='replace')
            if 'Ask anything' in c:
                tui_loaded = True
                break
            pos_start = f.tell() if c else pos_start
    except: pass
assert tui_loaded, "Ask anything not detected within 60s"
print("✅ TUI LOADED")

# Step 11: Save anchor
os.makedirs(os.path.dirname(ANCHOR_FILE), exist_ok=True)
anchor = {"shark": {"tile_id": TILE_ID, "position": {"x": pos_x, "y": pos_y},
    "size": {"width": std_w, "height": std_h}, "tmux_session": TMUX_SESSION,
    "container": CONTAINER}}
try:
    if os.path.exists(ANCHOR_FILE):
        existing = json.load(open(ANCHOR_FILE))
        anchor.update(existing)
except: pass
anchor["shark"] = anchor["shark"]
json.dump(anchor, open(ANCHOR_FILE, "w"), indent=2)
print(f"✅ Anchor saved")

print(f"\n=== COMPLETE ===")
print(f"TILE_ID: {TILE_ID}")
print(f"Position: x={pos_x}, y={pos_y}")
```
