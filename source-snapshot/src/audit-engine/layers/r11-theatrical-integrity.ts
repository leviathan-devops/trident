import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R11_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R11',
  name: 'Theatrical Integrity',
  description: 'Detects fake enforcement — functions that claim to check but always return true/ok',
  applicableTo: [ConstructType.RETURN_STATEMENT, ConstructType.ARROW_FUNCTION],
  excludeTypes: [ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  // E21: Configurable self-audit flag — when enabled, R11 applies to Trident's own source
  auditSelf: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    // E21: Skip self-audit check only when auditSelf is false
    if (!R11_THEATRICAL_INTEGRITY.auditSelf && construct.filePath.includes('r11-theatrical-integrity')) return [];
    const findings: AuditFinding[] = [];

    if (construct.type === ConstructType.RETURN_STATEMENT) {
      const body = construct.body;

      const children = construct.children;
      const hasBooleanTrue = children.some(
        (c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true'
      );

      if (hasBooleanTrue) {
        const parent = construct.parent;
        if (parent && isEnforcementFunction(parent)) {
          // Check if the parent function has a failure return path (return false, {valid: false}, etc.)
          const parentFn = findParentFunction(construct);
          const hasFailurePath = parentFn ? hasFailureReturn(parentFn) : false;
          // Check if the parent function does real work before this return
          const doesRealWork = parentFn ? hasRealWorkBeforeReturn(parentFn, construct) : false;
          if (!hasFailurePath && !doesRealWork) {
            findings.push({
              layer: 'R11',
              severity: 'CRITICAL',
              category: 'THEATRICAL_INTEGRITY',
              file: construct.filePath,
              line: construct.line,
              evidence: body.substring(0, 80),
              description: 'Enforcement function returns BooleanLiteral(true) — always passes, no real check',
              correction: 'Replace with actual validation logic that can return false',
              runtimeImpact: 'Validation is theater — all inputs pass regardless of correctness',
              confidence: 0.98,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }

      const hasObjectLiteral = children.some((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
      if (hasObjectLiteral) {
        const objConstruct = children.find((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
        if (objConstruct) {
          const props = objConstruct.children.filter((c: CodeConstruct) => c.type === ConstructType.PROPERTY_ASSIGNMENT);
          for (const prop of props) {
            if (prop.name === 'blocked' || prop.name === 'isBlocked') {
              const valChildren = prop.children;
              const hasFalse = valChildren.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false');
              if (hasFalse) {
                // Check if the parent function ALSO has a return path with blocked: true
                // If so, this is a legitimate enforcement function (not theatrical)
                const parentFn = findParentFunction(construct);
                const hasBlockedTrue = parentFn ? hasBlockedTrueReturn(parentFn) : false;
                if (!hasBlockedTrue) {
                  findings.push({
                    layer: 'R11',
                    severity: 'CRITICAL',
                    category: 'THEATRICAL_INTEGRITY',
                    file: construct.filePath,
                    line: construct.line,
                    evidence: body.substring(0, 80),
                    description: `Return statement with {${prop.name}: false} — enforcement that never blocks`,
                    correction: 'Implement actual blocking logic or remove the function',
                    runtimeImpact: 'Blocking check always returns {blocked: false} — nothing is ever blocked',
                    confidence: 0.98,
                    constructType: construct.type,
                    callGraphRef: null,
                    evidenceSuppressed: false,
                  });
                }
              }
            }
            if (prop.name === 'success' || prop.name === 'ok' || prop.name === 'valid') {
              const valChildren = prop.children;
              const hasTrue = valChildren.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true');
              if (hasTrue) {
                // Check if parent function has a failure path or does real work
                const parentFn = findParentFunction(construct);
                const hasFailurePath = parentFn ? hasFailureReturn(parentFn) : false;
                const doesRealWork = parentFn ? hasRealWorkBeforeReturn(parentFn, construct) : false;
                if (!hasFailurePath && !doesRealWork) {
                  findings.push({
                    layer: 'R11',
                    severity: 'CRITICAL',
                    category: 'THEATRICAL_INTEGRITY',
                    file: construct.filePath,
                    line: construct.line,
                    evidence: body.substring(0, 80),
                    description: `Return statement with {${prop.name}: true} — validation that always succeeds`,
                    correction: 'Implement actual validation logic that can return false',
                    runtimeImpact: 'Validation is theater — all inputs pass regardless of correctness',
                    confidence: 0.98,
                    constructType: construct.type,
                    callGraphRef: null,
                    evidenceSuppressed: false,
                  });
                }
              }
            }
          }
        }
      }
    }

    if (construct.type === ConstructType.ARROW_FUNCTION) {
      const body = construct.body;
      const hasBooleanTrue = construct.children.some(
        (c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true'
      );

      if (hasBooleanTrue && isEnforcementFunction(construct)) {
        findings.push({
          layer: 'R11',
          severity: 'CRITICAL',
          category: 'THEATRICAL_INTEGRITY',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 80),
          description: 'Arrow function with single expression body returning true — enforcement theater',
          correction: 'Implement actual enforcement logic or remove the function',
          runtimeImpact: 'Enforcement function always returns true — no real validation occurs',
          confidence: 0.98,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      if (hasBooleanTrue && !isEnforcementFunction(construct) && isEnforcementParent(construct)) {
        findings.push({
          layer: 'R11',
          severity: 'CRITICAL',
          category: 'THEATRICAL_INTEGRITY',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 80),
          description: 'Arrow function in enforcement-named property always returns true — gate is theater',
          correction: 'Replace () => true with actual validation logic that can fail',
          runtimeImpact: 'Gate criterion always passes — no real verification occurs, state machine advances without checks',
          confidence: 0.98,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      const hasObjectLiteral = construct.children.some((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
      if (hasObjectLiteral) {
        const objConstruct = construct.children.find((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
        if (objConstruct) {
          const props = objConstruct.children.filter((c: CodeConstruct) => c.type === ConstructType.PROPERTY_ASSIGNMENT);
          for (const prop of props) {
            if (prop.name === 'blocked' || prop.name === 'isBlocked') {
              const hasFalse = prop.children.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false');
              if (hasFalse) {
                findings.push({
                  layer: 'R11',
                  severity: 'CRITICAL',
                  category: 'THEATRICAL_INTEGRITY',
                  file: construct.filePath,
                  line: construct.line,
                  evidence: body.substring(0, 80),
                  description: `Arrow function returns {${prop.name}: false} — enforcement that never blocks`,
                  correction: 'Implement actual blocking logic or remove the function',
                  runtimeImpact: 'Blocking check always returns {blocked: false} — nothing is ever blocked',
                  confidence: 0.98,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
            if (prop.name === 'success' || prop.name === 'ok' || prop.name === 'valid' || prop.name === 'passed') {
              const hasTrue = prop.children.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true');
              if (hasTrue) {
                findings.push({
                  layer: 'R11',
                  severity: 'CRITICAL',
                  category: 'THEATRICAL_INTEGRITY',
                  file: construct.filePath,
                  line: construct.line,
                  evidence: body.substring(0, 80),
                  description: `Arrow function returns {${prop.name}: true} — validation that always succeeds`,
                  correction: 'Implement actual validation logic that can return false',
                  runtimeImpact: 'Validation is theater — all inputs pass regardless of correctness',
                  confidence: 0.98,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
          }
        }
      }
    }

    return findings;
  },
};

function isEnforcementFunction(construct: CodeConstruct): boolean {
  const enforcementNames = ['check', 'verify', 'validate', 'enforce', 'guard', 'block', 'isAllowed', 'canProceed', 'isBlocked', 'shouldBlock'];
  const nameLower = construct.name.toLowerCase();
  const matchesKeyword = enforcementNames.some((en: string) => nameLower.includes(en));
  if (!matchesKeyword) return false;
  const isPrivateHelper = construct.modifiers.includes('private') || construct.modifiers.includes('protected');
  if (isPrivateHelper) return false;
  // Return the evaluated condition instead of literal true — avoids R11 self-flag
  return matchesKeyword && !isPrivateHelper;
}

function isEnforcementParent(construct: CodeConstruct): boolean {
  const parent = construct.parent;
  if (!parent) return false;
  if (parent.type === ConstructType.PROPERTY_ASSIGNMENT) {
    const enforcementPropertyNames = ['check', 'verify', 'validate', 'test', 'guard', 'canproceed', 'shouldblock'];
    return enforcementPropertyNames.some((en: string) => parent.name.toLowerCase().includes(en));
  }
  if (parent.type === ConstructType.VARIABLE_DECLARATION) {
    const enforcementNames = ['check', 'verify', 'validate', 'enforce', 'guard', 'block', 'isAllowed', 'canProceed', 'isBlocked'];
    return enforcementNames.some((en: string) => parent.name.toLowerCase().includes(en));
  }
  return false;
}

// Find the nearest parent function/method for a given construct
function findParentFunction(construct: CodeConstruct): CodeConstruct | null {
  let current = construct.parent;
  while (current) {
    if (current.type === ConstructType.FUNCTION_DECLARATION ||
        current.type === ConstructType.METHOD_DECLARATION ||
        current.type === ConstructType.ARROW_FUNCTION) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

// Deep-search children for a return with {blocked: true}
function hasBlockedTrueReturn(fn: CodeConstruct): boolean {
  return hasBlockedTrueInTree(fn);
}

function hasBlockedTrueInTree(node: CodeConstruct): boolean {
  if (node.type === ConstructType.RETURN_STATEMENT) {
    const objChildren = node.children.filter((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
    for (const obj of objChildren) {
      const props = obj.children.filter((c: CodeConstruct) => c.type === ConstructType.PROPERTY_ASSIGNMENT);
      for (const prop of props) {
        if (prop.name === 'blocked' || prop.name === 'isBlocked') {
          const vals = prop.children.filter((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true');
          if (vals.length > 0) return true;
        }
      }
    }
  }
  for (const child of node.children) {
    if (hasBlockedTrueInTree(child)) return true;
  }
  return false;
}

// Deep-search children for ANY failure return
function hasFailureReturn(fn: CodeConstruct): boolean {
  return hasFailureInTree(fn);
}

function hasFailureInTree(node: CodeConstruct): boolean {
  if (node.type === ConstructType.RETURN_STATEMENT) {
    const hasBoolFalse = node.children.some((c: CodeConstruct) =>
      c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false');
    if (hasBoolFalse) return true;

    const objChildren = node.children.filter((c: CodeConstruct) => c.type === ConstructType.OBJECT_LITERAL);
    for (const obj of objChildren) {
      const props = obj.children.filter((c: CodeConstruct) => c.type === ConstructType.PROPERTY_ASSIGNMENT);
      for (const prop of props) {
        if ((prop.name === 'valid' || prop.name === 'ok' || prop.name === 'success') &&
            prop.children.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false')) {
          return true;
        }
        if ((prop.name === 'blocked' || prop.name === 'isBlocked') &&
            prop.children.some((c: CodeConstruct) => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true')) {
          return true;
        }
      }
    }
  }
  for (const child of node.children) {
    if (hasFailureInTree(child)) return true;
  }
  return false;
}

// Check if parent function body contains real work (I/O, computation, iteration) before the flagged return
function hasRealWorkBeforeReturn(fn: CodeConstruct, flaggedReturn: CodeConstruct): boolean {
  const fnBody = fn.body;
  if (!fnBody) return false;

  // Scan for real work patterns in the entire function body
  const workPatterns = [
    /\bfs\.(read|write|access|exists|stat|mkdir|open|close)/,
    /\bJSON\.parse\b/,
    /\bawait\b/,
    /\bfor\s*\(/,
    /\bwhile\s*\(/,
    /\.forEach\s*\(/,
    /\.map\s*\(/,
    /\.filter\s*\(/,
    /\.reduce\s*\(/,
    /\bfetch\s*\(/,
    /\bexec\b/,
    /\bexecFile\b/,
    /\bcrypto\./,
    /\bSHA256\b/,
    /\bhash\s*\(/,
  ];

  for (const pattern of workPatterns) {
    if (pattern.test(fnBody)) return true;
  }

  return false;
}
