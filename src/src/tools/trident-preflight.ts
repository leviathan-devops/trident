// src/tools/trident-preflight.ts
// trident-preflight — Mechanical input validation BEFORE calling LLM tools.
//
// Workflow for agents:
//   1. Write all args to /tmp/preflight-{tool}.json
//   2. Call trident-preflight with tool + inputFile + layer/mode
//   3. If FAIL — expand short fields in the file, re-call preflight
//   4. When READY — call the actual tool with inputFile/blocksFile
//
// This tool calls the SAME validators as the real tools. If preflight
// says READY, the tool WILL accept the input. Zero estimation. Zero waste.

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { validateDeepPlanningInput, validateContextSynthesisInput, validateProblemSolvingInput, validateTestPlan } from './input-validation.ts';

// ── SPG validation (not in input-validation.ts, has its own rules) ──

const SPG_MIN = 8000;
const SPG_FIELDS = ['whatWasBuilt', 'bugsFound', 'architectureDecisions', 'filesChanged', 'testResults'];

function validateSPG(args: Record<string, unknown>): { passed: boolean; fields: Array<{ name: string; actual: number; min: number; pass: boolean }> } {
  const fields = SPG_FIELDS.map(name => {
    const val = args[name];
    const actual = typeof val === 'string' ? val.length : 0;
    return { name, actual, min: SPG_MIN, pass: actual >= SPG_MIN };
  });
  return { passed: fields.every(f => f.pass), fields };
}

// ── Tool registration ──

export function createPreflightTool() {
  return tool({
    description: `Mechanical pre-flight input validator. Call BEFORE trident-deep-planning, trident-context-synthesis, trident-problem-solving, trident-container-test, or trident-ship-package. Write all args to a JSON file, then call this tool to validate char counts. Uses the EXACT same validators as the real tools — if preflight says READY, the tool WILL accept. Zero estimation, zero wasted tokens.`,
    parameters: {
      tool: z.enum(['dp', 'cs', 'ps', 'ct', 'spg']).describe('Which tool to validate for'),
      inputFile: z.string().describe('Path to JSON file containing all tool args'),
      layer: z.number().optional().describe('DP layer (1, 2, or 3). Required for dp.'),
      mode: z.string().optional().describe('CS mode (T1 or T2). Required for cs.'),
    },
    execute: async (args: { tool: string; inputFile: string; layer?: number; mode?: string }) => {
      // Read the JSON file
      let data: Record<string, unknown>;
      try {
        const content = fs.readFileSync(args.inputFile, 'utf-8');
        data = JSON.parse(content);
      } catch (e) {
        return `PREFLIGHT ERROR: Cannot read ${args.inputFile}: ${e instanceof Error ? e.message : String(e)}`;
      }

      const toolName = args.tool.toUpperCase();
      const lines: string[] = [];
      let allPass = true;

      if (args.tool === 'dp') {
        const layer = args.layer || 1;
        data.layer = layer;
        const error = validateDeepPlanningInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        // Also show field-by-field status
        const rules = layer === 2
          ? { requirements: 4000, context: 16000, components: 8000, constraints: 8000, designDecisions: 8000, knownGaps: 8000, sourceLineage: 8000, fileInventory: 8000 }
          : { requirements: 500, context: 2000 };
        for (const [field, min] of Object.entries(rules)) {
          const actual = typeof data[field] === 'string' ? (data[field] as string).length : 0;
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
      } else if (args.tool === 'cs') {
        const mode = args.mode || 'T1';
        data.outputMode = mode;
        const error = validateContextSynthesisInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        // Field-by-field
        const stringRules = mode === 'T2'
          ? { context: 4000, requirements: 500, components: 1000, constraints: 1000, designDecisions: 1000, knownGaps: 1000, sourceLineage: 1000 }
          : {};
        for (const [field, min] of Object.entries(stringRules)) {
          const actual = typeof data[field] === 'string' ? (data[field] as string).length : 0;
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
        // keyFacts check
        const facts = data.keyFacts;
        const minItems = mode === 'T2' ? 5 : 3;
        const actualItems = Array.isArray(facts) ? facts.length : 0;
        const passItems = actualItems >= minItems;
        const status = passItems ? 'PASS' : 'FAIL';
        const deficit = Math.max(0, minItems - actualItems);
        const extra = deficit > 0 ? ` — add ${deficit} more` : '';
        lines.push(`  [${status}] keyFacts: ${actualItems} items need ${minItems}${extra}`);
        if (!passItems) allPass = false;

        if (mode === 'T2') {
          const totalChars = Array.isArray(facts) ? facts.reduce((s: number, f) => s + String(f).length, 0) : 0;
          const passTotal = totalChars >= 2000;
          const deficitTotal = Math.max(0, 2000 - totalChars);
          const statusT = passTotal ? 'PASS' : 'FAIL';
          const extraT = deficitTotal > 0 ? ` — add ${deficitTotal}c more` : '';
          lines.push(`  [${statusT}] keyFacts total: ${totalChars}c need 2000c${extraT}`);
          if (!passTotal) allPass = false;
        }
      } else if (args.tool === 'ps') {
        const error = validateProblemSolvingInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        const rules: Record<string, number> = { problem: 500, context: 2000, components: 500, knownGaps: 500 };
        for (const [field, min] of Object.entries(rules)) {
          const actual = typeof data[field] === 'string' ? (data[field] as string).length : 0;
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
        // Array checks
        for (const field of ['reasoning', 'workingPlan']) {
          const arr = data[field];
          const count = Array.isArray(arr) ? arr.length : 0;
          const pass = count >= 3;
          const deficit = Math.max(0, 3 - count);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit} more` : '';
          lines.push(`  [${status}] ${field}: ${count} items need 3${extra}`);
          if (!pass) allPass = false;
        }
      } else if (args.tool === 'ct') {
        const plan = data.testPlan || '';
        const error = validateTestPlan(plan);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        const actual = typeof plan === 'string' ? plan.length : 0;
        const pass = actual >= 2000;
        const deficit = Math.max(0, 2000 - actual);
        const status = pass ? 'PASS' : 'FAIL';
        const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
        lines.push(`  [${status}] testPlan: ${actual}c need 2000c${extra}`);
      } else if (args.tool === 'spg') {
        const result = validateSPG(data);
        for (const f of result.fields) {
          const deficit = Math.max(0, f.min - f.actual);
          const status = f.pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${f.name}: ${f.actual}c need ${f.min}c${extra}`);
        }
        allPass = result.passed;
      }

      // Summary
      const header = `\nPreflight: ${toolName}${args.layer ? ' L' + args.layer : ''}${args.mode ? ' ' + args.mode : ''}`;
      const footer = allPass
        ? `\nREADY — call ${toolName} with inputFile=${args.inputFile}\n`
        : `\nFIX SHORT FIELDS in ${args.inputFile}, then re-call preflight\n`;

      return header + '\n' + lines.join('\n') + footer;
    },
  });
}
