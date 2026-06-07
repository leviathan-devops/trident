# Context Survival Mechanism

> How agent context persists across sessions, survives compaction, and enables coherent multi-session execution.

---

## Table of Contents

1. [Identity Persistence Mechanism](#1-identity-persistence-mechanism)
2. [Session-Keyed State](#2-session-keyed-state)
3. [Evidence Store Singleton Lifecycle](#3-evidence-store-singleton-lifecycle)
4. [Merkle Chain Continuity](#4-merkle-chain-continuity)
5. [Compaction Survivability](#5-compaction-survivability)
6. [Key Files That MUST Be Preserved](#6-key-files-that-must-be-preserved)
7. [Restart Procedure After Compaction](#7-restart-procedure-after-compaction)
8. [Failure Modes & Recovery](#8-failure-modes--recovery)

---

## 1. Identity Persistence Mechanism

### System.transform SCAN+REPLACE

The identity layer operates via a two-phase transformation pipeline at session init:

```
Phase 1: SCAN
  Walk every file in runtime/ directory.
  Extract all @trident-identity marker comments.
  Build identity fingerprint (agent name, version, mode, layer).

Phase 2: REPLACE
  Overwrite identity block in system prompt preamble.
  Inject current session_id, iteration, evidence root hash.
```

### Per-Turn Override

Each turn carries an `identity_override` fragment appended to the system prompt:

| Field | Source | Refresh |
|---|---|---|
| `session_id` | `crypto.randomUUID()` at session start | Per-session |
| `iteration` | Incrementing counter in state machine | Per-turn |
| `current_layer` | FSM active node label | Per-turn |
| `evidence_root` | Merkle chain tip hash | Per-phase |

The override ensures that even if the base identity block is stale, per-turn context is always current.

### Identity Assertion

Before any tool call, the firewall asserts:

```
identity.session_id == state.session_id
identity.iteration == state.iteration
```

If mismatch detected → `IDENTITY_DRIFT` fault → forced re-hydration.

---

## 2. Session-Keyed State

### Map<string, AgentState>

All agent state is stored in a flat `Map<string, AgentState>` keyed by `session_id`:

```typescript
interface AgentState {
  fsm: FiniteStateMachine;
  evidence: EvidenceStoreRef;
  merkleRoot: string;
  iteration: number;
  createdAt: Date;
  lastActive: Date;
  metadata: Record<string, unknown>;
}
```

### State Entry Lifecycle

| Phase | Action | Persistence |
|---|---|---|
| Session start | `Map.set(session_id, new AgentState(...))` | In-memory + disk |
| Per-turn | Update `iteration`, `lastActive` | In-memory |
| Phase complete | Persist `merkleRoot`, snapshot FSM | Disk write |
| Session end | Archive to evidence store | Evidence DB |
| Compaction | Prune entries older than TTL | Disk cleanup |

### Lookup

```typescript
function ensureSession(session_id: string): AgentState {
  return stateMap.get(session_id) ?? hydrateFromDisk(session_id);
}
```

On cache miss, falls back to `hydrateFromDisk()` which reads the last evidence snapshot.

---

## 3. Evidence Store Singleton Lifecycle

### Singleton Pattern

The evidence store is a process-level singleton:

```typescript
class EvidenceStore {
  private static instance: EvidenceStore;
  private db: BetterSqlite3.Database;
  // ...
}
```

### Lifecycle

```
INIT ──► LOAD ──► ACTIVE ──► FLUSH ──► ARCHIVE
  │         │         │          │
  │         │         │          └── Write evidence.db to disk
  │         │         └────────────── In-memory operations
  │         └─────────────────────────── Load from disk
  └─────────────────────────────────────── Create empty store
```

### Persistence Guarantees

| Event | Action | Durability |
|---|---|---|
| Evidence written | WAL append | fsync |
| Phase complete | Full checkpoint | fsync |
| Session end | Archive to `evidence/archive/` | Copy + fsync |
| Crash recovery | WAL replay on next init | Automatic |

### Thread Safety

All evidence operations use `BetterSqlite3` which is serialized. Reads and writes are sequential within the Node.js event loop.

---

## 4. Merkle Chain Continuity

### Chain Structure

```
Block 0 (genesis) ← Block 1 ← Block 2 ← ... ← Block N (tip)
```

Each block contains:

```typescript
interface MerkleBlock {
  index: number;
  timestamp: number;
  phaseId: string;
  prevHash: string;
  evidenceHashes: string[];
  root: string; // SHA256 of (prevHash + JSON.stringify(evidenceHashes))
}
```

### Continuity Across Sessions

| Session | Last Block | First Block | Continuity Check |
|---|---|---|---|
| Session A | Block 42 | Block 43 | `prevHash == Block 42.root` |
| Session B | Block 127 | Block 128 | `prevHash == Block 127.root` |

On session start:
1. Read the last committed block from evidence store
2. Create a new block with `prevHash = lastBlock.root`
3. If there is a gap (e.g., manual intervention), set `prevHash = "RESEED:<session_id>"` and log warning

### Verification

```typescript
function verifyChain(): boolean {
  return chain.every((block, i) => {
    if (i === 0) return true;
    const expected = sha256(chain[i-1].root + JSON.stringify(block.evidenceHashes));
    return block.root === expected;
  });
}
```

---

## 5. Compaction Survivability

### What Survives Compaction

| Artifact | Survives? | Storage |
|---|---|---|
| Identity fingerprint | Yes | `identity.md` on disk |
| Evidence store | Yes (archived) | `evidence/archive/` |
| Merkle chain | Yes (last 100 blocks) | `evidence/merkle.json` |
| FSM snapshots | Yes (last 3) | `state/fsm-snapshot-*.json` |
| Session index | Yes | `state/sessions.json` |
| Build artifacts | Yes | `dist/`, `bundle/` |
| Test results | Yes | `evidence/` |

### What Needs Re-Hydration

| Artifact | Lost? | Re-Hydration Source |
|---|---|---|
| Per-turn conversation history | Yes | Not preserved |
| In-memory FSM current node | Yes | Reconstructed from last snapshot |
| Runtime caches | Yes | Regenerated on next run |
| Temporary files | Yes | None needed |

### Compaction Trigger

| Trigger | Threshold | Action |
|---|---|---|
| Evidence DB size | > 50 MB | Archive + vacuum |
| Session count | > 1000 | Prune sessions older than 30 days |
| Merkle chain length | > 1000 blocks | Prune to last 100 |
| FSM snapshots | > 10 | Keep last 3 |
| Log files | > 500 MB | Rotate |

---

## 6. Key Files That MUST Be Preserved

### Critical (loss = mission failure)

```
evidence/
├── evidence.db              # Primary evidence store
├── archive/                 # Archived evidence snapshots
├── merkle.json              # Merkle chain (last 100 blocks)
└── manifest.json            # Evidence manifest

state/
├── sessions.json            # Session index
├── fsm-snapshot-latest.json # Latest FSM state
└── identity.md              # Agent identity

runtime/
├── index.js                 # Compiled bundle
├── config.json              # Active configuration
└── plugin-manifest.json     # Plugin dependencies
```

### Important (loss = degraded operation)

```
docs/
├── ARCHITECTURE.md          # Architecture reference
├── BUILD_SPEC.md            # Build specification
└── CHANGE_LOG.md            # Change history

context/
├── AGENTS.md                # Agent behavior rules
└── CONTEXT_SURVIVAL.md      # This document
```

### Ephemeral (loss = no impact)

```
logs/
temp/
node_modules/
.cache/
```

---

## 7. Restart Procedure After Compaction

### Automated Restart Sequence

```
Step 1:  Verify evidence store integrity
         └── sha256sum evidence.db || CORRUPT → restore from archive

Step 2:  Load Merkle chain
         └── verifyChain() || FAIL → rebuild from archive

Step 3:  Reconstruct FSM state
         └── Read fsm-snapshot-latest.json
         └── Deserialize into FiniteStateMachine instance
         └── Validate consistency with evidence store

Step 4:  Re-hydrate session index
         └── Read sessions.json
         └── Verify each session_id has evidence anchor

Step 5:  Initialize identity
         └── Read identity.md
         └── Assert identity matches expected
         └── Generate new per-turn override

Step 6:  Resume execution
         └── Enter FSM at 'RESTORED' pseudo-state
         └── Evaluate next gate
         └── Continue from last completed phase
```

### Manual Restart (if automated fails)

```bash
# Step 1: Check evidence integrity
node scripts/verify-evidence.js

# Step 2: Restore from latest archive
cp -r evidence/archive/$(ls -t evidence/archive/ | head -1)/* evidence/

# Step 3: Rebuild Merkle chain
node scripts/rebuild-merkle.js

# Step 4: Reconstruct FSM (interactive)
node scripts/reconstruct-fsm.js --interactive

# Step 5: Resume
node runtime/index.js --resume
```

---

## 8. Failure Modes & Recovery

| Failure Mode | Detection | Recovery |
|---|---|---|
| Evidence DB corruption | SHA256 mismatch on load | Restore from archive + replay WAL |
| Merkle chain break | `verifyChain()` returns false | Rebuild from evidence store |
| FSM snapshot stale | Iteration mismatch > 100 | Reconstruct from last valid snapshot |
| Session index lost | `sessions.json` missing | Rebuild from evidence manifest |
| Identity drift | Firewall assertion failure | Re-init from identity.md |
| Compaction data loss | Evidence count drop > 10% | Halt compaction, restore from backup |

### Recovery Priority

```
1. Evidence integrity (most valuable)
2. Merkle chain continuity (trust chain)
3. FSM state (execution position)
4. Session index (lookup capability)
5. Identity (self-awareness)
```

---

*Last updated: 2026-06-08*
*Total lines: ~180*
