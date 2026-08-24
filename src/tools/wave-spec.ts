// ═══ WAVE SPEC — THE SELF-CONTAINED PREFLIGHT TEMPLATE (2026-08-22) ═══
//
// THE CONCEPT (the operator's design): instead of composing dense specs inline
// in a tool call (which every model fails at), the model edits ONE template file
// with placeholder instructions embedded in every field value. A tool.after hook
// validates on each edit and returns compiler-style diagnostics IN THE SAME TURN.
// When all fields pass, action=generate reads the file directly — zero other params.
//
// STATE MACHINE: FRESH → EDITING → GENERATED → reset → FRESH

import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateTemplateMatch, type SpecIntentEvidence } from './template-intent.ts';

export const WAVE_SPEC_RELATIVE_PATH = '.trident/wave-spec.json';

// ── THE TEMPLATE SHELL ──

const AGENT_SHELL = () => ({
  name: '[NAME: e.g. explore-alpha — semantic, lowercase-with-hyphens]',
  template: '[TEMPLATE: E1=code-extract | E2=docs-deep | E3=research | E4=failure-evidence | B1-B5=builds]',
  filepaths: ['[FILEPATH: absolute path the subagent will analyze, must EXIST on disk]'],
  mission: '[MISSION — FLOOR 200c, TARGET 400–800c. WHAT the subagent does, WHY it matters, WHAT it must NOT do. Include the specific filepath it will analyze and what findings are expected. Do NOT write less than 200 characters — thin missions are REFUSED.]',
  knownContext: '[KNOWN CONTEXT — FLOOR 200c, TARGET 400–800c. Measured state, file:line anchors, numbers, tables, prior findings the subagent needs. Everything it would have to discover by reading files — hand it to them here. Do NOT write less than 200 characters.]',
  doctrine: '[DOCTRINE — FLOOR 100c, TARGET 200–400c. Verbatim quotes from operator rulings or project conventions that govern how this task must be executed. Do NOT write less than 100 characters.]',
  measurements: '[MEASUREMENTS — FLOOR 100c, TARGET 200–400c. Numbers, counts, table sizes, line counts, test results — anything quantifiable the prompt must reconcile against the actual file. Do NOT write less than 100 characters.]',
  acceptance: '[ACCEPTANCE — FLOOR 100c, TARGET 200–400c. Checkable bullets defining DONE for this task. Each bullet must be verifiable by reading the output or running a command. Do NOT write less than 100 characters.]',
  taskTargets: '[TASK TARGETS — FLOOR 100c, TARGET 200–400c. Per-task expansion: WHAT to do, HOW to do it, WHY it matters, EXPECTED output format. Do NOT write less than 100 characters.]',
  position: '[POSITION — FLOOR 50c, TARGET 100–200c. Where this agent sits in the pipeline, what consumes its output, what feeds into it. Do NOT write less than 50 characters.]',
});

const DUPLICATE_INSTRUCTION = '// ↑ DUPLICATE THIS ENTIRE OBJECT for each additional agent. Each object spawns ONE subagent. Remove extra objects for smaller waves. Delete this comment string when done.';

function buildTemplateShell(): string {
  return JSON.stringify({
    expectedCount: '[SET TO NUMBER: total agents in your wave, e.g. 8]',
    agents: [AGENT_SHELL(), AGENT_SHELL(), DUPLICATE_INSTRUCTION],
  }, null, 2);
}

// ── PLACEHOLDER DETECTION ──

const PLACEHOLDER_RE = /^\[.*(?:FLOOR|TARGET|SET TO|NAME:|TEMPLATE:|FILEPATH:|DUPLICATE).*\]$/is;

export function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_RE.test(value.trim());
}

export function isTemplateShell(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    if (!parsed.agents || !Array.isArray(parsed.agents)) return true;
    return parsed.agents.every((a: Record<string, unknown>) =>
      Object.values(a).every((v) => isPlaceholder(v))
    );
  } catch { return true; }
}

// ── VALIDATION ──

export interface SpecDiagnostic {
  agent: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  fix: string;
}

const CTX_FLOORS: Record<string, number> = {
  mission: 200,
  knownContext: 200,
  doctrine: 100,
  measurements: 100,
  acceptance: 100,
  taskTargets: 100,
  position: 50,
};

const CTX_FIELDS = Object.keys(CTX_FLOORS);

export function validateSpecFile(filePath: string): SpecDiagnostic[] {
  const diags: SpecDiagnostic[] = [];
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch { return [{ agent: '*', field: 'file', severity: 'error', message: 'spec file not found', fix: 'create the file first' }]; }

  let parsed: any;
  try { parsed = JSON.parse(content); }
  catch (e) {
    return [{ agent: '*', field: 'JSON', severity: 'error', message: `parse error: ${e instanceof Error ? e.message.slice(0, 80) : 'invalid JSON'}`, fix: 'fix the JSON syntax and save again' }];
  }

  if (!Array.isArray(parsed.agents)) {
    return [{ agent: '*', field: 'agents', severity: 'error', message: 'agents must be an array', fix: 'add agent objects to the agents array' }];
  }

  // Count contract check
  const declaredCount = typeof parsed.expectedCount === 'number' ? parsed.expectedCount
    : typeof parsed.expectedCount === 'string' && !isNaN(Number(parsed.expectedCount)) ? Number(parsed.expectedCount)
    : null;
  if (declaredCount !== null && parsed.agents.length !== declaredCount) {
    diags.push({ agent: '*', field: 'expectedCount', severity: 'error',
      message: `count mismatch: ${parsed.agents.length} agents defined but expectedCount says ${declaredCount}`,
      fix: `set expectedCount=${parsed.agents.length} OR add/remove agent objects to match` });
  }

  for (let i = 0; i < parsed.agents.length; i++) {
    const a = parsed.agents[i];
    const label = typeof a.name === 'string' && a.name.length > 0 && !isPlaceholder(a.name) ? a.name : `agent-${i + 1}`;

    // Name
    if (!a.name || isPlaceholder(a.name)) {
      diags.push({ agent: label, field: 'name', severity: 'error', message: 'name is missing or still a placeholder', fix: 'replace with a semantic lowercase-with-hyphens name' });
    }

    // Template
    if (!a.template || isPlaceholder(a.template)) {
      diags.push({ agent: label, field: 'template', severity: 'error', message: 'template is missing or still a placeholder', fix: 'use E1|E2|E3|E4|B1|B2|B3|B4|B5' });
    }

    // Filepaths
    if (!Array.isArray(a.filepaths) || a.filepaths.length === 0) {
      diags.push({ agent: label, field: 'filepaths', severity: 'error', message: 'no filepaths provided', fix: 'add absolute paths that EXIST on disk' });
    } else {
      for (const fp of a.filepaths) {
        if (typeof fp === 'string' && !fs.existsSync(fp)) {
          diags.push({ agent: label, field: 'filepaths', severity: 'warning', message: `filepath does not exist: ${fp}`, fix: 'use an absolute path that exists on disk' });
        }
      }
    }

    // Context fields: floors + placeholder detection
    for (const field of CTX_FIELDS) {
      const val = a[field];
      const floor = CTX_FLOORS[field];
      if (val === undefined || val === null) {
        diags.push({ agent: label, field, severity: 'error', message: `${field} is MISSING`, fix: `write ${floor}–${floor * 4}c of dense real context` });
      } else if (isPlaceholder(val)) {
        diags.push({ agent: label, field, severity: 'error', message: `${field} is still a PLACEHOLDER (${String(val).length}c < ${floor}c floor)`, fix: `replace the bracketed instruction with ${floor * 2}–${floor * 4}c of dense real content` });
      } else if (typeof val === 'string' && val.length < floor) {
        diags.push({ agent: label, field, severity: 'error', message: `${field}: ${val.length}c < ${floor}c floor`, fix: `write ${floor * 2}–${floor * 4}c with dense real context (anchors, numbers, quotes)` });
      }
    }

    // Position
    const pos = a.position;
    if (pos === undefined || pos === null) {
      diags.push({ agent: label, field: 'position', severity: 'error', message: 'position is MISSING', fix: 'describe chain slot and consumers (50c+)' });
    } else if (isPlaceholder(pos)) {
      diags.push({ agent: label, field: 'position', severity: 'error', message: `position is still a PLACEHOLDER`, fix: `describe where this agent sits in the pipeline (50c+)` });
    } else if (typeof pos === 'string' && pos.length < 50) {
      diags.push({ agent: label, field: 'position', severity: 'error', message: `position: ${pos.length}c < 50c floor`, fix: 'expand with chain slot context' });
    }

    // THE TEMPLATE-INTENT FILTER (2026-08-23 — the input-file filter that makes
    // template mismatch IMPOSSIBLE): the spec's own fields (filepaths shape +
    // mission/taskTargets verb lexicons) classify the intent; a cross-kin
    // mismatch with the declared template is an ERROR — refused HERE, before
    // any generation. The live failure class (E3 research weave on a code job,
    // ~15 minutes wasted on DPL1 failures) can no longer reach the pipeline.
    const intentDiag = validateTemplateMatch({
      name: label,
      template: typeof a.template === 'string' ? a.template : '',
      filepaths: Array.isArray(a.filepaths) ? (a.filepaths as string[]).filter((f): f is string => typeof f === 'string') : [],
      mission: typeof a.mission === 'string' ? a.mission : '',
      taskTargets: typeof a.taskTargets === 'string' ? a.taskTargets : undefined,
    } satisfies SpecIntentEvidence);
    if (intentDiag) diags.push(intentDiag);
  }

  return diags;
}

// ── DIAGNOSTIC FORMATTER (compiler-style) ──

export function formatDiagnostics(diags: SpecDiagnostic[]): string {
  if (diags.length === 0) return '✓ ALL FIELDS PASS — ready to generate';
  const errors = diags.filter((d) => d.severity === 'error');
  const warnings = diags.filter((d) => d.severity === 'warning');
  const lines: string[] = [];
  lines.push('WAVE SPEC VALIDATION');
  lines.push('');
  for (const d of diags) {
    const icon = d.severity === 'error' ? '✗' : '⚠';
    lines.push(`${icon} ${d.agent}.${d.field}: ${d.message}`);
    lines.push(`  → ${d.fix}`);
  }
  lines.push('');
  if (errors.length > 0) {
    lines.push(`${errors.length} error(s), ${warnings.length} warning(s)`);
    lines.push('Fix all ✗ errors, then re-call action=generate');
  } else {
    lines.push('All checks passed — ready to generate');
  }
  return lines.join('\n');
}

// ── RESET TO TEMPLATE ──

export function resetToTemplate(projectRoot: string): void {
  const specPath = path.join(projectRoot, WAVE_SPEC_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, buildTemplateShell(), 'utf-8');
}

// ── READ / ENSURE ──

export function ensureSpecFile(projectRoot: string): string {
  const specPath = path.join(projectRoot, WAVE_SPEC_RELATIVE_PATH);
  if (!fs.existsSync(specPath)) resetToTemplate(projectRoot);
  return specPath;
}
