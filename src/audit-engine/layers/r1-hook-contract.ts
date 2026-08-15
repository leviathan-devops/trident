import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// ---------------------------------------------------------------------------
// AST Helpers (iterative walk — mirrors R3 pattern, avoids stack overflow)
// ---------------------------------------------------------------------------

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node) => {
      stack.push(child);
    });
  }
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

// ---------------------------------------------------------------------------
// Structural AST Collectors
// ---------------------------------------------------------------------------

function collectStringLiterals(root: ts.Node): Set<string> {
  const literals = new Set<string>();
  walkAst(root, (node) => {
    if (ts.isStringLiteral(node)) {
      literals.add(node.text);
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.add(node.text);
    }
  });
  return literals;
}

function collectPropertyAccessChains(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const chains = new Set<string>();
  walkAst(root, (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      const raw = node.getText(sourceFile);
      const normalized = raw.replace(/\?/g, '');
      chains.add(normalized);
      chains.add(node.name.text);
    }
  });
  return chains;
}

function collectAssignmentTargets(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const targets = new Set<string>();
  walkAst(root, (node) => {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      const isAssignment =
        op === ts.SyntaxKind.EqualsToken ||
        op === ts.SyntaxKind.PlusEqualsToken ||
        op === ts.SyntaxKind.MinusEqualsToken;
      if (isAssignment) {
        const leftText = node.left.getText(sourceFile).replace(/\?/g, '');
        targets.add(leftText);
      }
    }
  });
  return targets;
}

function collectAgentReferences(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const refs = new Set<string>();
  walkAst(root, (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      const normalized = node.getText(sourceFile).replace(/\?/g, '');
      refs.add(normalized);
      refs.add(node.name.text);
    }
    if (ts.isIdentifier(node)) {
      refs.add(node.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      const argText = node.argumentExpression.text;
      refs.add(argText);
      const objText = node.expression.getText(sourceFile).replace(/\?/g, '');
      refs.add(`${objText}.${argText}`);
    }
  });
  return refs;
}

// ---------------------------------------------------------------------------
// Hook Event Detection Sets
// ---------------------------------------------------------------------------

const TOOL_EXECUTE_BEFORE_EVENTS = new Set([
  'tool.execute.before',
  'toolExecuteBefore',
  'tool.execute',
]);

const TOOL_EXECUTE_AFTER_EVENTS = new Set([
  'tool.execute.after',
  'toolExecuteAfter',
]);

const SYSTEM_TRANSFORM_EVENTS = new Set([
  'system.transform',
  'systemTransform',
  'chat.system.transform',
]);

function referencesHookEvent(literals: Set<string>, eventSet: Set<string>): boolean {
  for (const lit of literals) {
    if (eventSet.has(lit)) return true;
  }
  return false;
}

function isToolExecuteBeforeHandler(literals: Set<string>): boolean {
  const hasBefore = referencesHookEvent(literals, TOOL_EXECUTE_BEFORE_EVENTS);
  const hasAfter = referencesHookEvent(literals, TOOL_EXECUTE_AFTER_EVENTS);
  if (hasBefore && hasAfter) return false;
  if (hasBefore) return true;
  if (literals.has('tool.execute') && !hasAfter && !literals.has('tool.execute.before')) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Correct / Wrong Agent Guard Patterns
// ---------------------------------------------------------------------------

const CORRECT_AGENT_PATTERNS = new Set([
  'input.agent',
  'input.name',
  'input.agentName',
  'event.agent',
  'ctx.agentName',
]);

const WRONG_AGENT_PATTERNS = new Set([
  'session.agent',
  'context.agent',
  'state.agent',
]);

function hasCorrectAgentPattern(refs: Set<string>): boolean {
  for (const ref of refs) {
    if (CORRECT_AGENT_PATTERNS.has(ref)) return true;
  }
  return false;
}

function hasWrongAgentPattern(refs: Set<string>): boolean {
  for (const ref of refs) {
    if (WRONG_AGENT_PATTERNS.has(ref)) return true;
  }
  return false;
}

function hasAgentReference(refs: Set<string>): boolean {
  return refs.has('agent') || refs.has('agentName');
}

// ---------------------------------------------------------------------------
// TypeChecker Signature Validation
// ---------------------------------------------------------------------------

function validateHandlerSignature(
  node: ts.Node,
  checker: ts.TypeChecker | null,
  construct: CodeConstruct,
  findings: AuditFinding[],
  sourceFile: ts.SourceFile,
): void {
  if (!checker) {
    return;
  }

  let funcNode: ts.SignatureDeclaration | null = null;
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
    funcNode = node;
  }
  if (!funcNode) {
    return;
  }

  try {
    const type = checker.getTypeAtLocation(funcNode);
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) {
      return;
    }

    const sig = signatures[0];
    const params = sig.getParameters();

    if (params.length === 0) {
      findings.push({
        layer: 'R1',
        severity: 'MEDIUM',
        category: 'HOOK_CONTRACT',
        file: construct.filePath,
        line: construct.line,
        evidence: funcNode.getText(sourceFile).slice(0, 120),
        description: 'Hook handler function has zero parameters — cannot access input or output objects',
        correction: 'Add (input, output) parameters to the hook handler signature',
        runtimeImpact: 'Handler cannot read event input or write output — hook is effectively a no-op',
        confidence: 0.80,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  } catch (e) {
    console.error('[R1HookContract] TypeChecker signature validation failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R1_HOOK_CONTRACT: LayerRule = {
  layer: 'R1',
  name: 'Hook Contract',
  description: 'Validates hook handlers implement correct input/output contracts via AST structural analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) {
      return [];
    }
    const findings: AuditFinding[] = [];

    const node = construct.node;
    if (!node) {
      return findings;
    }

    const sourceFile = node.getSourceFile();
    if (!sourceFile) {
      return findings;
    }

    // Phase 1: Collect structural AST data
    const stringLiterals = collectStringLiterals(node);
    const propertyChains = collectPropertyAccessChains(node, sourceFile);
    const assignmentTargets = collectAssignmentTargets(node, sourceFile);
    const agentRefs = collectAgentReferences(node, sourceFile);

    // CHECK 1: tool.execute.before handler contract
    if (isToolExecuteBeforeHandler(stringLiterals)) {
      const hasOutputErrorAssignment =
        assignmentTargets.has('output.error') || propertyChains.has('output.error');
      const hasOutputIsErrorAssignment =
        assignmentTargets.has('output.isError') || propertyChains.has('output.isError');

      if (!hasOutputErrorAssignment || !hasOutputIsErrorAssignment) {
        findings.push({
          layer: 'R1',
          severity: 'CRITICAL',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.slice(0, 150),
          description: 'tool.execute.before handler lacks output.error + output.isError — tool blocking cannot work',
          correction: 'Add: output.error = "[BLOCK] message"; output.isError = true; in the blocking path',
          runtimeImpact: 'Tool block is declared but never enforced — all tools pass through unblocked',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      const hasAgentGuard =
        hasCorrectAgentPattern(agentRefs) ||
        agentRefs.has('input.agent') ||
        agentRefs.has('input.name') ||
        agentRefs.has('input.agentName');

      if (!hasAgentGuard) {
        findings.push({
          layer: 'R1',
          severity: 'HIGH',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.slice(0, 150),
          description: 'tool.execute.before handler lacks agent identity check — block applies to ALL agents, not just Trident',
          correction: 'Add agent check: if (input?.agent !== "trident" && input?.name !== "trident") return;',
          runtimeImpact: 'Tool block fires for every agent — non-Trident agents lose access to bash/write/edit',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // CHECK 2: system.transform handler contract
    if (referencesHookEvent(stringLiterals, SYSTEM_TRANSFORM_EVENTS)) {
      const hasOutputSystem =
        propertyChains.has('output.system') ||
        propertyChains.has('output.system.push') ||
        assignmentTargets.has('output.system');

      if (!hasOutputSystem) {
        findings.push({
          layer: 'R1',
          severity: 'CRITICAL',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.slice(0, 150),
          description: 'system.transform handler lacks output.system injection — agent identity never injected',
          correction: 'Add: output.system.push(agentInstructions); or output.system = [agentInstructions];',
          runtimeImpact: 'Agent has no identity — model behaves as generic assistant, not Trident',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // CHECK 3: Agent guard field validation
    if (hasAgentReference(agentRefs)) {
      const correct = hasCorrectAgentPattern(agentRefs);
      const wrong = hasWrongAgentPattern(agentRefs);

      if (wrong && !correct) {
        findings.push({
          layer: 'R1',
          severity: 'HIGH',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.slice(0, 150),
          description: 'Agent guard uses wrong field — correct fields are input.agent, input.name, or input.agentName',
          correction: 'Use input?.agent || input?.name || input?.agentName for agent detection',
          runtimeImpact: 'Agent identity check fails — Trident never activates or always activates',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // CHECK 4: TypeChecker signature validation
    validateHandlerSignature(node, ctx.checker ?? null, construct, findings, sourceFile);

    return findings;
  },
};
