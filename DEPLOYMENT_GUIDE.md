# DEPLOYMENT GUIDE - TRIDENT v4.3.1-T3

**Format:** Hermes Deployment Protocol  
**Target:** opencode plugin host  
**Image:** opencode-test:1.14.43  
**Model:** google/gemma-4-26b-a4b-it  

---

## 1. Pull Container Image

```bash
docker pull opencode-test:1.14.43
```

Verify image:
```bash
docker images opencode-test:1.14.43
# Expected: REPOSITORY          TAG          IMAGE ID       CREATED       SIZE
#            opencode-test       1.14.43      <hash>         <date>       ~1.2GB
```

## 2. Install Plugin Bundle

```bash
# Ensure target directory exists
mkdir -p ~/.config/opencode/plugins/trident

# Copy the bundled plugin
cp dist/index.js ~/.config/opencode/plugins/trident/dist/index.js

# Verify integrity
sha256sum ~/.config/opencode/plugins/trident/dist/index.js
# Expected: ebbdb342222bbb33285a0a95333d37dc3a8a8e2d4049d3b6e52b576bdfc0f8da
```

## 3. Configure opencode.json

Create or edit `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "google/gemma-4-26b-a4b-it",
  "provider": {
    "google": {
      "npm": "@ai-sdk/google",
      "options": {
        "apiKey": "YOUR_GOOGLE_API_KEY_HERE"
      }
    }
  },
  "plugin": [
    "file:///home/leviathan/.config/opencode/plugins/shark-agent/dist/index.js",
    "file:///home/leviathan/.config/opencode/plugins/hive-mind/dist/index.js",
    "file:///home/leviathan/.config/opencode/plugins/spider-agent-v2.2.2/dist/index.js",
    "file:///home/leviathan/.config/opencode/plugins/agent-vision/dist/index.js",
    "file:///home/leviathan/.config/opencode/plugins/trident/dist/index.js"
  ],
  "agent": {
    "shark": {"color": "#228B22"},
    "spider": {"color": "#DC2626"},
    "trident": {}
  },
  "permission": {"*": {"*": "allow"}},
  "autoupdate": false
}
```

**IMPORTANT:** Trident must be listed LAST in the plugin array to ensure all hooks are registered after sibling plugins.

## 4. Model Configuration

| Parameter | Value |
|-----------|-------|
| Model ID | `google/gemma-4-26b-a4b-it` |
| Provider Package | `@ai-sdk/google` |
| API Key Env Var | `GOOGLE_API_KEY` |
| Temperature | 0.1 (recommended for audit tasks) |
| Max Tokens | 4096 (minimum for full audit output) |

Set the API key:
```bash
export GOOGLE_API_KEY="your-key-here"
# Or add to ~/.bashrc for persistence
```

## 5. Plugin Loading Order

Plugins load in array order. The loading sequence matters:

```
1. shark-agent        <- Registers Shark tools + identity
2. hive-mind          <- Shared memory subsystem
3. spider-agent-v2.2  <- Spider pipeline tools
4. agent-vision       <- VLM analysis capability
5. trident            <- MUST BE LAST - depends on all above
```

**Why Trident must be last:**
- Trident's system.transform hook must override identities registered by earlier plugins
- Trident's blocking layer must be the final authority on tool access
- Trident's agent gating depends on knowing all registered agents

## 6. Verification Steps Post-Deployment

### Step 1: Check Plugin Loaded
```bash
opencode --version
# Expected: Trident Brain v4.3.1-T3 - T3 Algorithmic Intelligence
```

### Step 2: Verify Tools Registered
```bash
# Start opencode, then run:
/help
# Verify trident-* tools appear in tool list
```

### Step 3: Run Identity Check
```bash
# In opencode session:
who are you
# Expected: "Trident Brain v4.3.1-T3 - T3 Algorithmic Intelligence"
```

### Step 4: Verify Audit Tool
```bash
/trident-status
# Expected: Mode: IDLE, Layer: 1/17, Status: IDLE
```

### Step 5: Test Tool Blocking
```bash
# Try running a blocked tool directly
# Expected: Identity-gated error with carrier verification message
```

### Step 6: Verify Tab Cycle
```bash
# Cycle through tabs via Ctrl+Tab
# Expected: Trident(0) -> Build(1) -> Plan(2) -> Shark(3) -> Spider(4)
```

### Step 7: Run Container Test Suite (Optional)
```bash
# Inside test container:
cd /opencode && npm test
# Expected: 7/7 PASS
```

## 7. Rollback Procedure

### Rollback to Previous Version
```bash
# 1. Remove current plugin
rm -rf ~/.config/opencode/plugins/trident

# 2. Restore previous version from backup
cp /path/to/backup/trident-v4.3.0/dist/index.js ~/.config/opencode/plugins/trident/dist/index.js

# 3. Verify rollback
sha256sum ~/.config/opencode/plugins/trident/dist/index.js
# Compare with previous manifest checksum

# 4. Restart opencode session
# The previous version will be loaded on next startup
```

### Full Rollback to No Trident
```bash
# 1. Remove Trident from plugin config
# Edit ~/.config/opencode/opencode.json
# Remove the trident plugin entry from "plugin" array

# 2. Remove plugin files
rm -rf ~/.config/opencode/plugins/trident

# 3. Restart opencode
# Trident will no longer be loaded
```

## 8. Troubleshooting

### Issue: Plugin fails to load
```
Error: Cannot find module '@opencode-ai/plugin'
```
**Fix:** Ensure opencode is up to date and all dependencies are installed:
```bash
npm update -g opencode
```

### Issue: Identity not showing
```
who are you -> "opencode" (not Trident)
```
**Fix:** Check plugin loading order - Trident must be LAST. Also verify:
- `system.transform` hook is registered (check terminal logs on startup)
- SCAN markers are present in bundle: `grep "Trident Brain" dist/index.js`

### Issue: Tools not registering
```
/trident-status -> Unknown command
```
**Fix:** Check bundle integrity:
```bash
sha256sum ~/.config/opencode/plugins/trident/dist/index.js
# Must match manifest checksum
```

### Issue: Blocking layer not working
```
bash tool executes despite being blocked
```
**Fix:** Verify:
- BLOCKED_TOOLS list contains "bash"
- tool.before hook is registered before any other tool hook
- No other plugin overwrites the tool.before handler

### Issue: Container test fails
```
test-trident-t4-0608015324 not found
```
**Fix:** Re-pull and re-spawn:
```bash
docker pull opencode-test:1.14.43
docker run -d --name test-trident-t4-0608015324 opencode-test:1.14.43 sleep infinity
docker cp dist/index.js test-trident-t4-0608015324:/opencode/plugins/trident/dist/index.js
```

### Issue: Cross-agent identity collision
```
Spider identity shows "Trident Brain"
```
**Fix:** Verify system.transform SCAN markers include all 5 agent types. Check carrier verification logic in `gating/carrier.ts`.

### Issue: Persistent state across sessions
```
Previous session evidence appears in new session
```
**Fix:** Run evidence clear:
```bash
# In opencode session:
/trident-gate action=evaluate layer=R15
# This triggers state cleanup
```

---

*For additional support, refer to COMPLETION_REPORT.md for known issues and known issue workarounds.*
