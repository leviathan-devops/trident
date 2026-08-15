// ═══ SHADOW-SLOT-INJECTOR — THE §9 SINGLE SOURCE FOR THE SLOT/WEAVE VALUES ═══
// THE §9 cross-consistency rule (SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md §9):
// a fact appears ONCE. Before this module, the slot values + the weave lived in
// TWO places (trident-task-preflight.ts + shadow-brief-builder.ts) — the
// brief-builder's copies were literal replications ("the module's own weave
// with the SAME values"), and a value drift would silently break one consumer.
// THIS module is the ONE home for:
//   (1) slotValue   — the legacy [FILEPATHS:]/[CONTEXT:]/[FILL:] name-aware values
//   (2) injectSlots — the legacy slot injection (the pre-v11 template fallback)
//   (3) weave       — the v11 [WEAVE: <name>] 84-slot fill + the legacy fallback
// Both the tool and the brief-builder IMPORT from here; the brief-builder
// re-exports injectSlots + weave so the existing importers (shadow-verify, the
// tests) stay green. A change to the values map lands in ONE place.

import * as path from 'node:path';

/** THE STRUCTURAL SPEC SUBSET the weave consumes — compatible with BOTH the
 *  trident-task-preflight AgentSpec (name/template + the 7 args) and the
 *  shadow-brief-builder BriefSpec (name?/template? + the 7 args). The weave
 *  needs ONLY filepaths + the 7 context args; the extra fields pass through. */
export interface WeaveSpec {
  filepaths: string[];
  mission: string;
  knownContext: string;
  doctrine: string;
  measurements: string;
  acceptance: string;
  taskTargets: string;
  position: string;
}

/** THE LEGACY SLOT VALUE — the semantic name decides the value (name-aware; a
 *  raw [FILL: ...] marker would fail the firewall's FILL scan silently, so the
 *  marker names the unfilled slot instead). */
export function slotValue(name: string, filepaths: string[], context: string, root: string): string {
  const n = name.toLowerCase();
  if (n.includes('workspace root') || n.includes('project root')) return root;
  if (n.includes('typecheck') || n.includes('tsc')) return 'tsc --noEmit';
  if (n.includes('sha256')) return 'sha256sum ' + filepaths.join(' ');
  if (n.includes('diff')) return 'git diff';
  if (n.includes('grep')) return 'grep -c "export" ' + (filepaths[0] || '.'); // THE BOUNDED FORM (2026-08-15 — the OUTPUT_BOMB fix: the old `grep -rn "export" <path>` re-emits the ENTIRE minified line per match on a bundle → tens of GB → the RAM blow; the count form is constant-memory)
  if (n.includes('probe')) return 'read ' + (filepaths[filepaths.length - 1] || filepaths[0] || '') + ' (offset=9999) — the EOF confirmed';
  if (n.includes('read command')) return filepaths.map((p: string) => 'read ' + p + ' (full pass)').join('\n');
  if (n.includes('spec') || n.includes('doctrine')) return context;
  if (n.includes('interface') || n.includes('architecture constraint')) return context;
  if (n.includes('build')) return 'bun build src/index.ts --outdir dist --target bun --format esm --bundle';
  if (n.includes('test')) return 'bun test';
  if (n.includes('chain')) return 'the chain under analysis';
  if (n.includes('frozen')) return 'the frozen files named by the orchestrator';
  if (n.includes('file') || n.includes('path') || n.includes('source') || n.includes('region')
    || n.includes('importer') || n.includes('data-model') || n.includes('anchor') || n.includes('doc')) return filepaths.join('\n');
  return context; // the context is the best available data — the operator's context names the content
}

/** THE LEGACY SLOT INJECTION (the pre-v11 template fallback) — the [FILEPATHS:]/
 *  [CONTEXT:]/[FILL:] families + the generic <...> placeholder fills. */
export function injectSlots(skeleton: string, filepaths: string[], context: string): string {
  const root = filepaths[0] ? filepaths[0].split('/').slice(0, 3).join('/') : '/';
  let out = skeleton;
  // the [FILEPATHS: <name>] family — name-aware (the semantic name decides the value)
  out = out.replace(/\[FILEPATHS: ([^\]]*)\]/g, (_m: string, name: string) => slotValue(name, filepaths, context, root));
  // the [CONTEXT: <name>] family — the operator's context names the content
  out = out.replace(/\[CONTEXT: ([^\]]*)\]/g, (_m: string, _name: string) => context);
  // the legacy [FILL: <name>] family (the older template format) — name-aware too
  out = out.replace(/\[FILL: ([^\]]*)\]/g, (_m: string, name: string) => slotValue(name, filepaths, context, root));
  // the placeholder fills (the generic <...> markers)
  out = out.replace(/<the first anchor name>/g, filepaths[0] ? path.basename(filepaths[0]).replace(/\.[^.]+$/, '') : 'thePrimarySymbol');
  out = out.replace(/<the first export name>/g, filepaths[0] ? path.basename(filepaths[0]).replace(/\.[^.]+$/, '') : 'thePrimaryExport');
  out = out.replace(/<the first doc>/g, filepaths[0] || '');
  out = out.replace(/<the second doc>/g, filepaths[1] || filepaths[0] || '');
  out = out.replace(/<the last doc>/g, filepaths[filepaths.length - 1] || filepaths[0] || '');
  out = out.replace(/<the state doc>/g, filepaths[1] || filepaths[0] || '');
  out = out.replace(/<the decision doc>/g, filepaths[3] || filepaths[0] || '');
  out = out.replace(/<the first target file>/g, filepaths[0] || '');
  out = out.replace(/<the last target file>/g, filepaths[filepaths.length - 1] || filepaths[0] || '');
  out = out.replace(/<last line\+1>/g, '9999');
  out = out.replace(/<the source tree pattern>/g, 'src/**/*.ts');
  out = out.replace(/<the key section marker of the first doc>/g, 'THE MISSION');
  out = out.replace(/<the region's module name>/g, filepaths[0] ? path.basename(filepaths[0]).replace(/\.[^.]+$/, '') : 'theRegion');
  // THE CATCH-ALL: any slot that survived (an unknown name) is marked visibly —
  // a raw [FILL: ...] marker would fail the firewall's FILL scan; the marker
  // names the unfilled slot so the orchestrator sees exactly what to expand.
  out = out.replace(/\[(?:FILEPATHS|CONTEXT|FILL): ([^\]]*)\]/g, '<UNFILLED-SLOT: $1>');
  return out;
}

/** THE 84-SLOT WEAVE (the v11 weave) — the [WEAVE: <name>] slots are replaced
 *  from the values map; the legacy slots via injectSlots; any surviving unknown
 *  slot becomes the visible <UNFILLED-WEAVE: name> marker (the verifier's
 *  raw-marker check demands 0 raw [WEAVE:] markers — the marker names the
 *  unfilled slot instead of failing silently). */
export function weave(skeleton: string, spec: WeaveSpec): string {
  const root = spec.filepaths[0] ? spec.filepaths[0].split('/').slice(0, 3).join('/') : '/';
  const readingOrder = spec.filepaths.map((p: string, i: number) => (i + 1) + '. ' + p).join('\n');
  const item1 = spec.filepaths[0] || '';
  const itemLast = spec.filepaths[spec.filepaths.length - 1] || item1;
  const values: Record<string, string> = {
    workspaceRoot: root,
    knowledgeLibrary: root + '/Shared Workspace Context/KNOWLEDGE_LIBRARY',
    readingOrder,
    readingOrderItem1: item1,
    readingOrderItemLast: itemLast,
    readingOrderItems: spec.filepaths.join(' '),
    frozen: 'the frozen files named by the orchestrator',
    mission: spec.mission,
    knownContext: spec.knownContext,
    doctrine: spec.doctrine,
    measurements: spec.measurements,
    acceptance: spec.acceptance,
    taskTargets: spec.taskTargets,
    position: spec.position,
    typecheck: 'tsc --noEmit',
    build: 'bun build src/index.ts --outdir dist --target bun --format esm --bundle',
    test: 'bun test',
    diff: 'git diff',
  };
  let out = skeleton;
  out = out.replace(/\[WEAVE: ([a-zA-Z0-9]+)\]/g, (_m: string, name: string) => values[name] || ('<UNFILLED-WEAVE: ' + name + '>'));
  // the legacy [FILEPATHS:]/[CONTEXT:]/[FILL:] slots (the pre-v11 templates) —
  // filled with the concatenated context args
  const legacyCtx = spec.mission + ' ' + spec.knownContext + ' ' + spec.doctrine + ' ' + spec.measurements + ' ' + spec.acceptance + ' ' + spec.taskTargets + ' ' + spec.position;
  out = injectSlots(out, spec.filepaths, legacyCtx);
  return out;
}
