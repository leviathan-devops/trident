// SHADOW INFRA FORK — tool-scoped index (v5.1.0)
// The sidecar's agent-side entry (watcher/engine/task-state/decision/blind-spots)
// is STRIPPED at the tool scope (see src/shadow-stripped/ for the archive).
// This index re-exports what the tool backend consumes from the forked harness.
export { opencodeStreamFn, convertToOpenAi, convertToOpenAiTool, buildPrompt } from './sidecar/core.js';
export type { PiModel, PiAgentMessage, PiContent, PiStreamResult, PiStopReason } from './sidecar/pi-agent.js';
export { QualityGate } from './sidecar/quality-gate.js';
export { LedgerWriter } from './sidecar/ledger.js';
