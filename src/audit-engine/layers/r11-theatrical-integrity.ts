import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R11_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R11',
  name: 'Theatrical Integrity',
  description: 'Detects fake enforcement — functions that claim to check but always return true/ok',
  applicableTo: [ConstructType.RETURN_STATEMENT, ConstructType.ARROW_FUNCTION],
  excludeTypes: [ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  // E21: Configurable self-audit flag — when enabled, R11 applies to Trident's own source
  auditSelf: false,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    // E21: Skip self-audit check only when auditSelf is false
    if (!R11_THEATRICAL_INTEGRITY.auditSelf && construct.filePath.includes('r11-theatrical-integrity')) return [];
    const findings: AuditFinding[] = [];

    if (construct.type === ConstructType.RETURN_STATEMENT) {
      const body = construct.body;

      const children = construct.children;
      const hasBooleanTrue = children.some(
        c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true'
      );

      if (hasBooleanTrue) {
        const parent = construct.parent;
        if (parent && isEnforcementFunction(parent)) {
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

      const hasObjectLiteral = children.some(c => c.type === ConstructType.OBJECT_LITERAL);
      if (hasObjectLiteral) {
        const objConstruct = children.find(c => c.type === ConstructType.OBJECT_LITERAL);
        if (objConstruct) {
          const props = objConstruct.children.filter(c => c.type === ConstructType.PROPERTY_ASSIGNMENT);
          for (const prop of props) {
            if (prop.name === 'blocked' || prop.name === 'isBlocked') {
              const valChildren = prop.children;
              const hasFalse = valChildren.some(c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false');
              if (hasFalse) {
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
            if (prop.name === 'success' || prop.name === 'ok' || prop.name === 'valid') {
              const valChildren = prop.children;
              const hasTrue = valChildren.some(c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true');
              if (hasTrue) {
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

    if (construct.type === ConstructType.ARROW_FUNCTION) {
      const body = construct.body;
      const hasBooleanTrue = construct.children.some(
        c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true'
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

      const hasObjectLiteral = construct.children.some(c => c.type === ConstructType.OBJECT_LITERAL);
      if (hasObjectLiteral) {
        const objConstruct = construct.children.find(c => c.type === ConstructType.OBJECT_LITERAL);
        if (objConstruct) {
          const props = objConstruct.children.filter(c => c.type === ConstructType.PROPERTY_ASSIGNMENT);
          for (const prop of props) {
            if (prop.name === 'blocked' || prop.name === 'isBlocked') {
              const hasFalse = prop.children.some(c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'false');
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
              const hasTrue = prop.children.some(c => c.type === ConstructType.BOOLEAN_LITERAL && c.name === 'true');
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
  const matchesKeyword = enforcementNames.some(en => nameLower.includes(en));
  if (!matchesKeyword) return false;
  const isPrivateHelper = construct.modifiers.includes('private') || construct.modifiers.includes('protected');
  if (isPrivateHelper) return false;
  return true;
}

function isEnforcementParent(construct: CodeConstruct): boolean {
  const parent = construct.parent;
  if (!parent) return false;
  if (parent.type === ConstructType.PROPERTY_ASSIGNMENT) {
    const enforcementPropertyNames = ['check', 'verify', 'validate', 'test', 'guard', 'canproceed', 'shouldblock'];
    return enforcementPropertyNames.some(en => parent.name.toLowerCase().includes(en));
  }
  if (parent.type === ConstructType.VARIABLE_DECLARATION) {
    const enforcementNames = ['check', 'verify', 'validate', 'enforce', 'guard', 'block', 'isAllowed', 'canProceed', 'isBlocked'];
    return enforcementNames.some(en => parent.name.toLowerCase().includes(en));
  }
  return false;
}
