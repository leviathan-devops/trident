# WIRING GUIDE - TRIDENT v4.3.1-T3

## Architecture Overview

Trident v4.3.1-T3 operates as an opencode plugin that intercepts and transforms the agent runtime at 6 hook points. The system is designed around a 3-blocking-layer architecture with identity injection, session-keyed state, and agent gating.

---

## 1. Hook Registration

Trident registers 6 hooks at plugin initialization (in `src/index.ts`):

```typescript
// Registration order matters - Trident hooks must fire after sibling plugins
plugin.registerHook('event', eventHandler);
plugin.registerHook('chat.message', chatMessageHandler);
plugin.registerHook('tool.before', toolBeforeHandler);
plugin.registerHook('tool.after', toolAfterHandler);
plugin.registerHook('system.transform', systemTransformHandler);
plugin.registerHook('messages.transform', messagesTransformHandler);
```

### Hook Execution Order

```
1. event                    <- System events, lifecycle management
2. system.transform         <- Identity injection into system prompt (FIRST transform)
3. messages.transform       <- Per-turn message identity override
4. tool.before              <- Gate check before every tool call
5. chat.message             <- Incoming message processing
6. tool.after               <- Evidence capture after tool execution
```

### Lifecycle Flow

```
Session Start
  -> event (init)
  -> system.transform (inject identity)
  -> messages.transform (ensure override)
  -> [User sends message]
    -> chat.message (process)
    -> [Agent decides tool]
      -> tool.before (gate check)
      -> [Tool executes]
      -> tool.after (capture)
    -> [Loop until response]
  -> [Turn completes]
  -> messages.transform (next turn override)
```

---

## 2. Three-Blocking-Layer Architecture

### Layer 1: BLOCKED_TOOLS (Static Block)

**File:** `src/blocking-layers.ts`  
**Purpose:** Prevent Trident from calling tools that would allow self-implementation

```typescript
const BLOCKED_TOOLS: Record<string, string[]> = {
  trident: [
    'bash',      // Cannot execute arbitrary commands
    'task',      // Cannot spawn subagents (non-trident)
    'edit',      // Cannot modify source files
    'write',     // Cannot create source files
    'glob',      // Cannot search filesystem
    'grep',      // Cannot search file contents
    'read'       // Cannot read source files
  ],
  build: [
    // Build agent has different restrictions
  ],
  plan: [
    // Plan agent restrictions
  ]
};
```

**Blocking Logic:** When `tool.before` fires:
1. Extract agent identity from tool call (carrier check)
2. Look up agent in BLOCKED_TOOLS
3. If tool is in blocked list -> return error with identity-gated message
4. If tool is not blocked -> allow execution

### Layer 2: HIVE_TOOLS (Contextual Block)

**Purpose:** Certain tools are only available when Hive context is loaded

```typescript
const HIVE_TOOLS = ['hive_context', 'hive_remember', 'hive_status'];
```

**Logic:** If agent has not loaded Hive context yet, these tools return an error guiding the agent to load Hive first.

### Layer 3: THEATRICAL (Pattern Block)

**Purpose:** Detect and block theatrical/simulated code patterns

```typescript
const THEATRICAL_PATTERNS = [
  /simulate/i,
  /mock\s+(implementation|function|call)/i,
  /fake\s+(response|data|result)/i,
  /placeholder/i,
  /TODO/i,
  /FIXME/i,
  /echo.*simulate/i,
  /echo.*mock/i,
];
```

**Logic:** When any tool output contains theatrical patterns, the blocking layer:
1. Captures the output evidence
2. Returns an error: "THEATRICAL CODE DETECTED - Blocked by LAYER 3"
3. Logs the violation for anti-cheat verification

---

## 3. Identity Injection Flow

### system.transform (SCAN+REPLACE)

**File:** `src/hooks/system-transform.ts`  
**Phase:** Session initialization

The system prompt is transformed by scanning for marker strings and replacing them with identity blocks:

```
SCAN: "TRIDENT_IDENTITY"
REPLACE: "[TRIDENT v4.3] Agent: trident | Mode: ..."

SCAN: "SHARK_IDENTITY"
REPLACE: "[SHARK v4.9] Agent: shark | Mode: ..."

SCAN: "SPIDER_IDENTITY"
REPLACE: "[SPIDER v2.2] Agent: spider | Stage: ..."

SCAN: "BUILD_IDENTITY"
REPLACE: "[BUILD] Agent: build | Mode: ..."

SCAN: "PLAN_IDENTITY"
REPLACE: "[PLAN] Agent: plan | Mode: ..."
```

**Key Fixes in v4.3.1-T3:**
- `hasIdentity()` now scans ALL markers before returning (Fix 1)
- Removed `break` after SCAN match to allow full replacement (Fix 2)
- Added WebFetch to SCAN markers list (Fix 3)

### messages.transform (Per-Turn Override)

**File:** `src/hooks/messages-transform.ts`  
**Phase:** Every message turn

After `system.transform` sets identities, `messages.transform` ensures the current agent's identity block is prepended to every assistant message.

---

## 4. Session-Keyed State Management

**File:** `src/state/manager.ts`  
**Dependency:** xstate v5.15

Each session receives a unique key generated at `event` hook time:

```typescript
const sessionKey = crypto.randomUUID();
```

State structure:
```typescript
interface SessionState {
  key: string;
  createdAt: number;
  lastActivity: number;
  evidence: Evidence[];
  blockedCalls: number;
  identity: string;
  tabIndex: number;
}
```

**Key behaviors:**
- State is isolated per session key - no cross-session leakage
- Evidence is cleared on `sessionKey` change (Fix 6)
- Stale sessions (no activity > 30 min) are garbage collected
- State is immutable - updates create new state objects

---

## 5. Agent Gating Mechanism

**File:** `src/gating/agent-gate.ts`

Each tool call is verified with a 3-factor check:

1. **Carrier Verification:** Does the tool call carry a valid agent carrier token?
2. **Role Authorization:** Is this agent type allowed to call this tool?
3. **Blocking Layer Check:** Does any of the 3 layers block this call?

```typescript
interface GateResult {
  allowed: boolean;
  reason?: string;
  layer?: 1 | 2 | 3;
  carrierValid: boolean;
}
```

**Carrier Token Format:**
```
tool.call + "::" + agentIdentity + "::" + sessionKey
```

---

## 6. Integration with Other Agents

### Trident <-> Build (Tab Index 1)
- Trident audits Build's output artifacts
- Build inherits Trident's identity gating for its tools
- No direct messaging - communication via evidence store

### Trident <-> Plan (Tab Index 2)
- Trident validates Plan's architecture decisions
- Plan's tools are registered with Trident's blocking layer awareness
- Plan inherits identity injection for system prompts

### Trident <-> Shark (Tab Index 3)
- Trident audits Shark's code for runtime grade compliance
- Shark inherits tool blocking from Trident's Layer 1
- Shark's tab cycle includes Trident-aware ordering

### Trident <-> Spider (Tab Index 4)
- Trident reviews Spider's generated code
- Spider inherits identity injection for pipeline stages
- Spider's subagent spawning is gated by Trident's tool.before

---

## 7. Dependencies on Sibling Plugins

### hive-mind (Required)
- **Purpose:** Shared memory context for cross-session knowledge
- **Tools Used:** `hive_context`, `hive_remember`, `hive_status`
- **Integration:** Trident's Layer 2 (HIVE_TOOLS) depends on hive-mind being registered
- **Failure Mode:** If hive-mind not loaded, HIVE_TOOLS layer is disabled with warning

### agent-vision (Required)
- **Purpose:** VLM analysis for visual evidence (screenshots, diagrams)
- **Tools Used:** `trident-vision` (wraps agent-vision)
- **Integration:** Trident's audit pipeline uses vision for screenshot analysis
- **Failure Mode:** If agent-vision not loaded, trident-vision tool returns error

---

## 8. Configuration Callback

**File:** `src/utils/config.ts`

Trident exposes a configuration callback that opencode calls during plugin initialization:

```typescript
export function configurePlugin(userConfig: Record<string, any>): void {
  // Override default blocking layers
  if (userConfig.blockedTools) {
    mergeBlockedTools(userConfig.blockedTools);
  }
  
  // Custom identity overrides
  if (userConfig.identity) {
    setIdentityOverride(userConfig.identity);
  }
  
  // Tab cycle configuration
  if (userConfig.tabCycle) {
    configureTabCycle(userConfig.tabCycle);
  }
  
  // Audit engine configuration
  if (userConfig.audit) {
    configureAuditEngine(userConfig.audit);
  }
}
```

Configuration is passed through `opencode.json` under the trident agent config:

```json
{
  "agent": {
    "trident": {
      "blockedTools": ["bash", "task", "edit"],
      "audit": {
        "maxLayers": 17,
        "strictMode": true
      }
    }
  }
}
```
