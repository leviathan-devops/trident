# State of Consciousness (SOC) Preservation

> How agent state is serialized, deserialized, recovered across sessions, and the patterns/anti-patterns of stateful agent execution.

---

## Table of Contents

1. [Agent State Serialization](#1-agent-state-serialization)
2. [Deserialization & Hydration](#2-deserialization--hydration)
3. [Orchestrator State Machine Recovery](#3-orchestrator-state-machine-recovery)
4. [FSM State Preservation](#4-fsm-state-preservation)
5. [Cross-Session Identity Continuity](#5-cross-session-identity-continuity)
6. [Error Recovery & Rollback](#6-error-recovery--rollback)
7. [Snapshot/Restore Patterns](#7-snapshotrestore-patterns)
8. [Pitfalls & Anti-Patterns](#8-pitfalls--anti-patterns)

---

## 1. Agent State Serialization

### State Shape

The serializable agent state is defined as:

```typescript
interface SerializableAgentState {
  version: string;                    // Schema version for migration
  sessionId: string;                  // Unique session identifier
  timestamp: string;                  // ISO-8601 serialization time
  fsm: {
    currentNode: string;              // Active FSM node label
    history: string[];                // Node visitation order
    phase: number;                    // Current phase number
    iteration: number;                // Within-phase iteration
  };
  evidence: {
    rootHash: string;                 // Merkle chain tip
    count: number;                    // Total evidence entries
    lastUpdated: string;              // ISO-8601
  };
  identity: {
    agentName: string;                // e.g. "trident"
    version: string;                  // e.g. "v4.3.1-T3"
    mode: string;                     // e.g. "CODE_REVIEW"
    layer: number;                    // Current audit layer (1-17)
  };
  metadata: Record<string, unknown>;  // Extension point
}
```

### Serialization Pipeline

```
AgentState ──► JSON.stringify ──► Compress (gzip) ──► Base64 encode ──► File
     │
     ├── Full serialization (all fields) → state/full-snapshot.json.gz
     ├── Delta serialization (changed fields only) → state/delta-snapshot.json.gz
     └── Metadata only (identity + phase) → state/metadata.json
```

### Garbage Collection

Snapshots older than 7 days are pruned. The last 3 full snapshots and last 10 delta snapshots are always retained regardless of age.

---

## 2. Deserialization & Hydration

### Hydration Pipeline

```
File ──► Read ──► Base64 decode ──► Decompress (gunzip) ──► JSON.parse ──► AgentState
     │
     └── Validate ──► Schema check ──► Version migration ──► Consistency check
```

### Version Migration

| From | To | Migration |
|---|---|---|
| v4.3.0 | v4.3.1 | Add `phase` field to FSM state |
| v4.3.1 | v4.3.1-T1 | Add `metadata` field |
| v4.3.1-T1 | v4.3.1-T2 | Add `evidence.lastUpdated` |
| v4.3.1-T2 | v4.3.1-T3 | No migration needed |

```typescript
function migrateState(state: Partial<AgentState>, fromVersion: string): AgentState {
  const migrations = {
    'v4.3.0': (s) => ({ ...s, fsm: { ...s.fsm, phase: 0 } }),
    'v4.3.1': (s) => ({ ...s, metadata: {} }),
    'v4.3.1-T1': (s) => ({ ...s, evidence: { ...s.evidence, lastUpdated: new Date().toISOString() } }),
  };
  return applyMigrations(state, fromVersion, migrations);
}
```

### Fallback Chain

On hydration failure:

```
Primary snapshot ──► ERROR? ──► Fallback to previous full snapshot
     │                              │
     │                              └── ERROR? ──► Fallback to metadata-only
     │                                              │
     │                                              └── ERROR? ──► Fresh init
     └── SUCCESS ──► Continue execution
```

---

## 3. Orchestrator State Machine Recovery

### Orchestrator FSM

```
             ┌─────────────────────────────────────────────┐
             │                                             │
             ▼                                             │
INIT ──► BOOT ──► LOAD_CONTEXT ──► RESUME ──► EXECUTE ──► COMPLETE
  │       │            │              │           │
  │       │            │              │           └──► ERROR ──► ROLLBACK
  │       │            │              └──► PAUSE ──► RESUME
  │       │            └──► REHYDRATE
  │       └──► RECONFIGURE
  └──► ABORT
```

### Recovery Points

| FSM Node | Can Recover? | Recovery Source |
|---|---|---|
| INIT | Yes | Config only |
| BOOT | Yes | Config + identity.md |
| LOAD_CONTEXT | Yes | Session index + evidence |
| RESUME | Yes | FSM snapshot |
| EXECUTE | Partial | Last evidence commit |
| COMPLETE | Yes | Nothing needed |
| ERROR | Yes | Error context |
| ROLLBACK | Yes | Previous snapshot |
| PAUSE | Yes | FSM snapshot |

### Recovery Decision Matrix

| Current State | Desired State | Action |
|---|---|---|
| ERROR | RESUME | Rollback to last safe checkpoint |
| PAUSE | RESUME | Load FSM snapshot, continue |
| EXECUTE | RESUME | Replay last incomplete phase |
| INIT | RESUME | Full re-hydration |
| Unknown | RESUME | Fall back to INIT → full re-hydration |

---

## 4. FSM State Preservation

### Snapshot Format

FSM snapshots are stored as individual JSON files:

```
state/
├── fsm-snapshot-latest.json      # Symlink to most recent
├── fsm-snapshot-2026-06-08T01.json
├── fsm-snapshot-2026-06-08T02.json
├── fsm-snapshot-2026-06-08T03.json
└── fsm-snapshot-2026-06-07T23.json  # Retained (within limit)
```

### Snapshot Content

```json
{
  "schema": "v1",
  "fsm": {
    "currentNode": "EXECUTE",
    "history": ["INIT", "BOOT", "LOAD_CONTEXT", "RESUME", "EXECUTE"],
    "phase": 6,
    "iteration": 42,
    "stack": [
      { "node": "EXECUTE", "entered": "2026-06-08T02:15:00Z", "depth": 0 },
      { "node": "SUB_TASK", "entered": "2026-06-08T02:15:05Z", "depth": 1 }
    ]
  },
  "checkpoint": {
    "lastEvidenceHash": "abc123...",
    "lastSuccessfulAction": "Gate evaluation passed",
    "pendingActions": ["Verify bundle integrity", "Run anti-cheat"]
  }
}
```

### Preservation Guarantees

| Event | Snapshot Taken? | File |
|---|---|---|
| Phase transition | Yes | `fsm-snapshot-{timestamp}.json` |
| Evidence commit | Yes | Same file, updated |
| Error | Yes (pre-rollback) | `fsm-snapshot-error-{timestamp}.json` |
| Manual pause | Yes | `fsm-snapshot-pause-{timestamp}.json` |
| Compaction | No (prune old) | `fsm-snapshot-latest.json` always kept |

---

## 5. Cross-Session Identity Continuity

### Identity Chain

```
Session N                    Session N+1                   Session N+2
┌──────────────┐            ┌──────────────┐              ┌──────────────┐
│ identity.md  │──reads──►  │ identity.md  │──reads──►    │ identity.md  │
│ session: N   │            │ session: N+1 │              │ session: N+2 │
│ merkle: X    │            │ merkle: Y    │              │ merkle: Z    │
└──────────────┘            └──────────────┘              └──────────────┘
     │                            │                              │
     │ evidence_anchor: N         │ evidence_anchor: N+1         │ evidence_anchor: N+2
     ▼                            ▼                              ▼
┌──────────────┐            ┌──────────────┐              ┌──────────────┐
│ Evidence DB  │            │ Evidence DB  │              │ Evidence DB  │
│ (archive N)  │            │ (archive N+1)│              │ (archive N+2)│
└──────────────┘            └──────────────┘              └──────────────┘
```

### Continuity Assertions

On session start, the following must match:

| Assertion | Source | Target |
|---|---|---|
| Agent name | `identity.md` | `config.json` |
| Agent version | `identity.md` | `CHANGE_LOG.md` most recent entry |
| Last merkle root | `identity.md` | `evidence/merkle.json` tip |
| Session count | `identity.md` | `state/sessions.json` length |

---

## 6. Error Recovery & Rollback

### Error Classification

| Severity | Examples | Recovery |
|---|---|---|
| FATAL | Evidence DB corruption, FSM deserialization failure | Restore from archive, full re-init |
| ERROR | Gate evaluation failure, tool call timeout | Retry with backoff |
| WARNING | Merkle chain gap, session index stale | Log, continue |
| INFO | Minor cache miss, expected retry | No action needed |

### Rollback Strategy

```
ERROR DETECTED
    │
    ├──► ROLLBACK_TO_CHECKPOINT
    │       │
    │       ├── Load last successful FSM snapshot
    │       ├── Revert evidence to checkpoint state
    │       ├── Replay pending actions with backoff
    │       └── If retry succeeds ──► RESUME
    │
    ├──► ROLLBACK_TO_PHASE_START
    │       │
    │       ├── Load phase-start FSM snapshot
    │       ├── Clear all evidence for current phase
    │       ├── Restart phase from beginning
    │       └── If phase completes ──► ADVANCE
    │
    └──► FULL_REHYDRATE
            │
            ├── Load from latest archive
            ├── Rebuild Merkle chain
            ├── Reconstruct FSM from evidence
            └── If successful ──► RESUME else ──► ABORT
```

### Backoff Schedule

| Retry # | Delay |
|---|---|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6+ | 30s (cap) |

---

## 7. Snapshot/Restore Patterns

### Recommended Patterns

| Pattern | Use Case | Implementation |
|---|---|---|
| Phase boundary | After each phase completes | Full serialization to `fsm-snapshot-{phase}.json` |
| Pre-flight | Before destructive operations | Delta serialization to `fsm-snapshot-pre-{op}.json` |
| Periodic | Every N iterations | Full serialization to `fsm-snapshot-auto-{ts}.json` |
| On-error | Immediately when error detected | Full serialization to `fsm-snapshot-error-{ts}.json` |

### Restore Patterns

| Pattern | Use Case | Implementation |
|---|---|---|
| Latest | Normal resume | Load `fsm-snapshot-latest.json` |
| Phase restart | Rollback to phase start | Load `fsm-snapshot-{phase}.json` |
| Pre-op undo | Undo destructive operation | Load `fsm-snapshot-pre-{op}.json` |
| Archive | Recover from data loss | Load from `evidence/archive/` |

---

## 8. Pitfalls & Anti-Patterns

### Critical Anti-Patterns

| # | Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|---|
| 1 | Single snapshot file | Corruption kills all state | Keep multiple snapshots (current, previous, archive) |
| 2 | No schema versioning | Silent data corruption on version change | Always version the schema, use migration functions |
| 3 | In-memory only state | Process crash loses everything | Persist to disk every N iterations or on phase boundary |
| 4 | Async state writes without flush | Race condition: read before write completes | Always `await` and verify write before proceeding |
| 5 | Concurrent snapshot writes | Corrupted JSON from interleaved writes | Use write locks or append-only log |
| 6 | Ignoring WAL state on crash | Recovered state is stale | Always replay WAL on boot |
| 7 | Snapshot before evidence | FSM points to evidence that doesn't exist yet | Snapshot AFTER evidence commit |
| 8 | No identity continuity check | Session N+1 uses Session N's identity | Verify identity.md on every session start |
| 9 | Overwriting archive | Irrecoverable data loss | Use timestamped archive files, never overwrite |
| 10 | Skipping rollback testing | Rollback path never executed in production | Run rollback tests in CI |

### Common Mistakes and Fixes

```
Mistake:  Storing FSM snapshots in /tmp
Fix:      Use persistent storage at state/fsm-snapshot-{ts}.json

Mistake:  Keeping all snapshots forever  
Fix:      Prune to last 3 full + 10 delta snapshots

Mistake:  Using JSON.stringify without error handling
Fix:      Wrap in try/catch, validate output size

Mistake:  No integrity check on load  
Fix:      Always verify SHA256 checksum after deserialization

Mistake:  Assuming evidence store is always consistent
Fix:      Run consistency check before every snapshot
```

---

*Last updated: 2026-06-08*
*Total lines: ~200*
