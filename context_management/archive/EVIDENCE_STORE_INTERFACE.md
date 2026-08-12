# Evidence Store Interface

## Implementation
File: `src/evidence/evidence-store.ts`

## Singleton Pattern (CRITICAL)
`getEvidenceStore()` returns a SINGLETON. Evidence accumulates across cycles.
Never call `new EvidenceStore()` — always use `getEvidenceStore()`.

## Interface

```typescript
interface EvidenceStore {
  // Add an evidence entry (appends to Merkle chain)
  add(eventType: string, payload: unknown): void;
  
  // Check if pass rate meets threshold
  meetsThreshold(threshold: number): boolean;
  
  // Get current pass rate (0.0 to 1.0)
  getPassRate(): number;
  
  // Verify Merkle chain integrity (no tampered entries)
  verifyChain(): { valid: boolean; brokenLinks: number };
  
  // Get all entries
  getAll(): EvidenceEntry[];
  
  // Persist to disk
  flush(): void;
}

// Usage in God Loop:
import { getEvidenceStore } from '../evidence/evidence-store.js';

const store = getEvidenceStore();
store.add('AUDIT_COMPLETE', { findings: 248, score: 45 });
store.add('WAVE_DISPATCHED', { wave: 1, agents: 5 });
store.add('WAVE_COLLECTED', { wave: 1, trusted: true });

// Evidence gate check:
if (!store.meetsThreshold(0.96)) {
  // Re-dispatch wave
}

// Chain verification:
const chainResult = store.verifyChain();
if (!chainResult.valid) {
  // Evidence tampered — quarantine
}
```

## Persistence
Evidence is persisted to `.trident/god-loop/evidence.json` on each `flush()` call.
In-memory array with file persistence. No SQLite (removed during development for simplicity).

## Merkle Chain
Each entry includes a SHA-256 hash of: previous hash + current payload.
This creates a tamper-evident chain. Any modification breaks all subsequent hashes.
The model cannot lie to a hash. The model cannot talk its way past a gate that compares two SHA-256 digests.
