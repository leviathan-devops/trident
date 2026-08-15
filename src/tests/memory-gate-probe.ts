// THE MEMORY-READ LEXICON PROBE — re-exports the classifier for the tests
// (the hook uses the lexicon directly). THE INTENT-SAVVY DECISION: the
// classifyMemoryRead state machine (the bible §1.2 — the matcher detects,
// the machine decides).
import { classifyMemoryRead } from '../firewalls/memory-read-lexicon.ts';

export function detectMemoryBomb(command: string): boolean {
  return classifyMemoryRead(command).action === 'BLOCK';
}
