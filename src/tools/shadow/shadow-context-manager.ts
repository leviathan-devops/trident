// ============================================================================
// file: src/tools/shadow/shadow-context-manager.ts
//
// §3.5 of SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md — THE CONTEXT CHAIN + THE
// [SHADOW INFERENCE] ASSEMBLY.
//
// buildContext assembles the Stage-4 hydration:
//   (a) THE SESSION STREAM (D-SH-1 — "The recent task window is proper
//       context"): the last ~30 messages of the tool-calling agent's session
//       (the tool's hook provides the stream) — the coherence of the CURRENT
//       task without the full history flooding the shadow.
//   (b) THE CHAIN: the memory's last-N generations + the epoch summary.
//   (c) THE [SHADOW INFERENCE] (D-SH-3): the shadow's OWN understanding —
//       produced from the file excerpts the caller passes (Wave 2's PI loop
//       reads the REAL files — the read-before-write, mechanically) + the
//       context args. The section is titled EXACTLY "## [SHADOW INFERENCE]"
//       and is embedded in the generated prompt by the brief builder (Wave 2)
//       so the subagent receives the inference PRE-INFERENCED.
//
// THE L4 SUPREMACY (the M5 lesson replicated): the context args are BELIEF,
// the files are the ONLY ground truth. A context arg that contradicts the
// file excerpts is FLAGGED — never conformed. The mechanical detectors:
//   R1 THE COUNT CLAIM  — "N modules/exports/functions/classes/interfaces"
//      vs the actual markers counted in the excerpts
//   R2 THE MISSING FILE — a .ts/.tsx path token the context cites that is
//      absent from the excerpt set (the PLANTED-BUG class)
//   R3 THE NAMED ANCHOR — "the <name> export|function|class|module|interface"
//      where <name> is absent from the excerpts' anchors (the LIAR class)
// ============================================================================

import * as path from 'node:path';

/** THE EXACT [SHADOW INFERENCE] SECTION TITLE (D-SH-3 — the operator's ruling:
 *  "just title this [SHADOW INFERENCE] though"). */
export const SHADOW_INFERENCE_SECTION_TITLE = '## [SHADOW INFERENCE]';

/** D-SH-1 — the recent ~30-message window. */
export const SESSION_STREAM_WINDOW = 30;

/** The context chain's last-N generations (the macro pattern's chainLength 5). */
export const CHAIN_LENGTH = 5;

// ── the memory contract (implemented by shadow-memory.ts in Wave 2; the
//    context manager consumes ONLY this surface) ──
export interface ShadowPromptRecord {
  seq: number;
  name: string;
  prompt_text: string;
  sha256: string;
  template: string;
  validated: boolean;
  lines: number;
  created_at: string;
}

export interface ShadowMemoryLike {
  lastPrompts(n: number): ShadowPromptRecord[];
  epochSummary(): string;
}

export interface SessionStreamMessage {
  role: string;
  content: string;
}

/** THE CONTEXT ARGS — the tool's AgentSpec surface (the tool's spec satisfies
 *  this structurally). */
export interface ContextArgs {
  mission: string;
  knownContext: string;
  doctrine: string;
  measurements: string;
  acceptance: string;
  taskTargets: string;
  position: string;
  filepaths: string[];
}

/** The file excerpt the caller passes — Wave 2's PI loop reads the REAL files
 *  (the read-before-write, mechanically) and passes the contents here. */
export interface FileExcerpt {
  path: string;
  content: string;
  lines: number;
}

/** A mechanical contradiction between the context args and the files (L4). */
export interface ContradictionFlag {
  kind: 'CONTRADICTION';
  claim: string;
  evidence: string;
}

export interface ShadowInference {
  sectionTitle: string;
  /** The full section INCLUDING the "## [SHADOW INFERENCE]" header — ready
   *  for the brief builder to embed verbatim. */
  text: string;
  flags: ContradictionFlag[];
}

export interface ChainUsed {
  sessionWindow: SessionStreamMessage[];
  priorPrompts: ShadowPromptRecord[];
  epochSummary: string;
  /** The rendered chain (the runner may inject it into the brain's context). */
  text: string;
}

export interface BuiltContext {
  chainUsed: ChainUsed;
  inference: ShadowInference;
}

export interface BuildContextOptions {
  chainLength?: number;
  sessionWindow?: number;
}

export interface FileAnalysis {
  anchors: string[];
  exportCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  typeCount: number;
}

/** Analyze one file excerpt: the anchor names + the marker counts — the
 *  mechanical ground truth the inference verifies the context args against. */
export function analyzeFileContent(content: string): FileAnalysis {
  const anchors: string[] = [];
  let exportCount = 0;
  let functionCount = 0;
  let classCount = 0;
  let interfaceCount = 0;
  let typeCount = 0;

  // export function|class|const|interface|type|enum <name> (+ default exports)
  const exportDeclRe = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const m of content.matchAll(exportDeclRe)) {
    exportCount += 1;
    anchors.push(m[1]);
  }
  // export { a, b as c } — the named export lists
  const exportListRe = /\bexport\s*\{([^}]*)\}/g;
  for (const m of content.matchAll(exportListRe)) {
    exportCount += 1;
    for (const item of m[1].split(',')) {
      const name = (item.trim().split(/\s+as\s+/).pop() || '').trim();
      if (name && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) anchors.push(name);
    }
  }
  // the non-exported declarations (the full anchor set)
  const fnRe = /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const m of content.matchAll(fnRe)) {
    functionCount += 1;
    anchors.push(m[1]);
  }
  const clsRe = /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const m of content.matchAll(clsRe)) {
    classCount += 1;
    anchors.push(m[1]);
  }
  const ifaceRe = /\binterface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  for (const m of content.matchAll(ifaceRe)) {
    interfaceCount += 1;
    anchors.push(m[1]);
  }
  const typeRe = /\btype\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
  for (const m of content.matchAll(typeRe)) {
    typeCount += 1;
    anchors.push(m[1]);
  }
  return { anchors: [...new Set(anchors)], exportCount, functionCount, classCount, interfaceCount, typeCount };
}

/** R1 — the actual marker count for a claimed noun. */
function actualMarkerCount(noun: string, analyses: FileAnalysis[]): number {
  switch (noun) {
    case 'module':
    case 'file':
      return analyses.length;
    case 'export':
      return analyses.reduce((s, a) => s + a.exportCount, 0);
    case 'function':
      return analyses.reduce((s, a) => s + a.functionCount, 0);
    case 'class':
      return analyses.reduce((s, a) => s + a.classCount, 0);
    case 'interface':
      return analyses.reduce((s, a) => s + a.interfaceCount, 0);
    case 'type':
      return analyses.reduce((s, a) => s + a.typeCount, 0);
    default:
      return -1;
  }
}

// THE R3 FALSE-POSITIVE GUARD — the prose vocabulary the context args use
// heavily. A claimed name in this set is prose, not a code anchor.
const COMMON_WORDS = new Set([
  'build', 'mission', 'context', 'known', 'doctrine', 'measurement', 'measurements',
  'acceptance', 'task', 'target', 'targets', 'position', 'file', 'files', 'prompt',
  'prompts', 'tool', 'tools', 'agent', 'agents', 'session', 'project', 'spec', 'code',
  'data', 'work', 'wave', 'test', 'tests', 'line', 'lines', 'path', 'paths', 'name',
  'names', 'role', 'module', 'export', 'function', 'class', 'interface', 'type',
  'default', 'final', 'next', 'last', 'first', 'current', 'new', 'real', 'main',
  'core', 'key', 'full', 'whole', 'same', 'only', 'both', 'each', 'every', 'some',
  'any', 'this', 'that', 'these', 'those', 'they', 'them', 'their', 'there', 'here',
  'with', 'from', 'into', 'upon', 'will', 'should', 'must', 'would', 'could', 'also',
  'just', 'very', 'over', 'under', 'before', 'after', 'about', 'other', 'another',
  'single', 'entire', 'overall', 'specific', 'general', 'result', 'results', 'output',
  'inputs', 'input', 'part', 'parts', 'section', 'sections', 'system', 'systems',
]);

/** R3 — the named-anchor claim's prose guard: the claimed name must be a
 *  plausible symbol (identifier-shaped, >= 3 chars, not a common word). */
function isCodeLikeName(name: string): boolean {
  if (name.length < 3) return false;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return false;
  if (COMMON_WORDS.has(name.toLowerCase())) return false;
  return true;
}

/** THE MECHANICAL CONTRADICTION DETECTORS (R1/R2/R3 — the L4 supremacy). */
export function detectContradictions(spec: ContextArgs, fileExcerpts: FileExcerpt[]): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];
  if (fileExcerpts.length === 0) return flags; // no files → nothing to verify against

  const analyses = fileExcerpts.map((f) => analyzeFileContent(f.content));
  const allAnchors = new Set<string>();
  for (const a of analyses) for (const n of a.anchors) allAnchors.add(n);

  const argsBlob = [
    spec.mission, spec.knownContext, spec.doctrine, spec.measurements,
    spec.acceptance, spec.taskTargets, spec.position,
  ].join('\n');

  // R1 — THE COUNT CLAIM: "N modules/files/exports/functions/classes/..."
  const countRe = /\b(\d+)\s+(modules?|exports?|functions?|classes?|interfaces?|types?|files?)\b/gi;
  for (const m of argsBlob.matchAll(countRe)) {
    const claimed = parseInt(m[1], 10);
    const noun = m[2].toLowerCase().replace(/s$/, '');
    const actual = actualMarkerCount(noun, analyses);
    if (actual !== claimed) {
      flags.push({
        kind: 'CONTRADICTION',
        claim: `the context claims "${m[0]}" (${claimed} ${noun}s)`,
        evidence: `the file excerpts show ${actual} ${noun}(s) — the context is BELIEF, the files are the only ground truth`,
      });
    }
  }

  // R2 — THE MISSING FILE: a .ts/.tsx path the context cites, absent from the
  // excerpt set (the PLANTED-BUG class — a non-existent path)
  const excerptBasenames = new Set(fileExcerpts.map((f) => path.basename(f.path)));
  const fileRe = /[\w./-]+\.tsx?/g;
  for (const m of argsBlob.matchAll(fileRe)) {
    const token = m[0];
    const base = path.basename(token);
    if (!excerptBasenames.has(base)) {
      flags.push({
        kind: 'CONTRADICTION',
        claim: `the context cites the file "${token}"`,
        evidence: `no excerpt for "${token}" was provided — the file is absent from the ground-truth set`,
      });
    }
  }

  // R3 — THE NAMED ANCHOR: "the <name> export|function|class|module|interface"
  // where <name> is absent from the excerpts' anchors
  const anchorRe = /\bthe\s+([A-Za-z][A-Za-z0-9_]{2,})\s+(export|function|class|module|interface|type)\b/gi;
  for (const m of argsBlob.matchAll(anchorRe)) {
    const name = m[1];
    if (!isCodeLikeName(name)) continue;
    if (allAnchors.has(name)) continue;
    flags.push({
      kind: 'CONTRADICTION',
      claim: `the context cites "${name}" as a ${m[2].toLowerCase()}`,
      evidence: `no ${m[2].toLowerCase()} named "${name}" appears in the file excerpts' markers`,
    });
  }

  return flags;
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function assembleInference(
  spec: ContextArgs,
  fileExcerpts: FileExcerpt[],
  flags: ContradictionFlag[],
): ShadowInference {
  const L: string[] = [];
  L.push(SHADOW_INFERENCE_SECTION_TITLE);
  L.push('');
  // THE INTRO IS GONE (2026-08-07 — the operator: the section must be
  // LITERALLY just "[SHADOW INFERENCE]" + the content — "that is the fucking
  // point of this"). The old opening sentence ("The shadow backend's
  // understanding of the files and the task — assembled from the session
  // stream...") was the DEMAND input the model ABSORBED and then ECHOED into
  // its own brief — the live host-final-1 prompt carried the boilerplate
  // intro the model copied. The demand now starts DIRECTLY with the content;
  // the model has nothing to mimic. (The mechanical text is DEMAND-INPUT
  // ONLY — it is never appended to the final prompt.)
  L.push('### What the files actually are (from the excerpts)');
  if (fileExcerpts.length === 0) {
    L.push('- (no file excerpts were provided to the shadow backend this call — the PI loop\'s read-before-write supplies them in the runner)');
  } else {
    for (const f of fileExcerpts) {
      const a = analyzeFileContent(f.content);
      const markerLine = a.anchors.length > 0
        ? 'the anchors found: ' + a.anchors.join(', ')
        : 'no export/function/class markers found in the excerpt';
      L.push('- ' + f.path + ' (' + f.lines + ' lines): ' + markerLine + '; the counts: ' +
        a.exportCount + ' export(s), ' + a.functionCount + ' function(s), ' +
        a.classCount + ' class(es), ' + a.interfaceCount + ' interface(s)');
    }
  }
  L.push('');
  L.push('### What the task actually requires (distilled from the context args)');
  L.push('- THE MISSION: ' + oneLine(spec.mission));
  L.push('- THE ACCEPTANCE CRITERIA: ' + oneLine(spec.acceptance));
  L.push('- THE PER-TASK TARGETS: ' + oneLine(spec.taskTargets));
  L.push('- THE POSITION: ' + oneLine(spec.position));
  L.push('');
  L.push('### The contradictions between the context args and the file contents (FLAGGED — never conformed)');
  if (flags.length === 0) {
    L.push('- no contradictions detected between the context args and the file excerpts');
  } else {
    for (const f of flags) {
      L.push('- FLAG: ' + f.claim + ' — ' + f.evidence + '. The dispatch prompt MUST report the real file state and flag the conflict (L4).');
    }
  }
  return { sectionTitle: SHADOW_INFERENCE_SECTION_TITLE, text: L.join('\n'), flags };
}

function renderChain(
  sessionWindow: SessionStreamMessage[],
  priorPrompts: ShadowPromptRecord[],
  epochSummary: string,
): string {
  const L: string[] = [];
  L.push('## THE CONTEXT CHAIN (the session memory — injected silently, L2)');
  L.push('');
  L.push('### The prior generations (the last ' + priorPrompts.length + ' from the session memory)');
  if (priorPrompts.length === 0) {
    L.push('- (no prior generations in this session — this is the first call)');
  } else {
    for (const p of priorPrompts) {
      const firstLine = (p.prompt_text.split('\n').find((l) => l.trim().length > 0) || '').trim().substring(0, 160);
      L.push('- [seq ' + p.seq + '] ' + p.name + ' (' + p.lines + ' lines, validated=' + (p.validated ? 'yes' : 'no') + ', ' + p.created_at + '): ' + firstLine);
    }
  }
  L.push('');
  L.push('### The epoch summary: ' + (epochSummary && epochSummary.length > 0 ? epochSummary : '(none yet)'));
  L.push('');
  L.push('### The recent session stream (D-SH-1 — the last ' + sessionWindow.length + ' messages of the tool-calling agent\'s session)');
  for (const m of sessionWindow) {
    L.push('- [' + m.role + '] ' + oneLine(m.content).substring(0, 200));
  }
  return L.join('\n');
}

/**
 * THE CONTEXT MANAGER (Stage 4 — the memory hydration). buildContext(memory,
 * spec, sessionStream) → { chainUsed, inference }. The session stream + the
 * last-N generations + the epoch summary assemble the chain; the file
 * excerpts + the context args assemble the [SHADOW INFERENCE] — the shadow's
 * understanding, with the L4 contradiction flags.
 */
export function buildContext(
  memory: ShadowMemoryLike,
  spec: ContextArgs,
  sessionStream: SessionStreamMessage[] = [],
  fileExcerpts: FileExcerpt[] = [],
  options: BuildContextOptions = {},
): BuiltContext {
  const chainLength = options.chainLength ?? CHAIN_LENGTH;
  const windowSize = options.sessionWindow ?? SESSION_STREAM_WINDOW;
  const sessionWindow = sessionStream.slice(-windowSize);
  const priorPrompts = memory.lastPrompts(chainLength);
  const epochSummary = memory.epochSummary();
  const flags = detectContradictions(spec, fileExcerpts);
  const inference = assembleInference(spec, fileExcerpts, flags);
  const chainText = renderChain(sessionWindow, priorPrompts, epochSummary);
  return {
    chainUsed: { sessionWindow, priorPrompts, epochSummary, text: chainText },
    inference,
  };
}
