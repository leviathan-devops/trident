import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R4_ERROR_HANDLING: LayerRule = {
  layer: 'R4',
  name: 'Error Handling',
  description: 'Detects error handling gaps, empty catch blocks, and silent failure swallowing',
  applicableTo: [ConstructType.CATCH_CLAUSE],
  excludeTypes: [ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    const statements = extractStatements(body);
    if (statements.length === 0) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Empty catch block — errors silently swallowed with no logging',
        correction: 'Add at minimum: console.error("[Component] operation failed:", err);',
        runtimeImpact: 'When this error occurs, there is ZERO evidence — failures are invisible, debugging impossible',
        confidence: 0.98,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      return findings;
    }

    const bodyLower = body.toLowerCase();
    const hasLogging = bodyLower.includes('console.error') || bodyLower.includes('console.warn') || bodyLower.includes('console.log') || bodyLower.includes('tridentlog');
    const hasThrow = bodyLower.includes('throw');
    const hasRethrow = body.includes('throw err') || body.includes('throw error') || body.includes('throw e');

    if (!hasLogging && !hasThrow) {
      findings.push({
        layer: 'R4',
        severity: 'MEDIUM',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block contains no logging or re-throw — error is silently consumed',
        correction: 'Add console.error("[Component] failed:", err); or re-throw if critical',
        runtimeImpact: 'Error silently consumed — caller thinks operation succeeded, state may be inconsistent',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (body.includes('acknowledgeCommand') || body.includes("ack('completed')") || body.includes('ack("completed")')) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Acknowledgement called "completed" inside catch block — claims success on failure',
        correction: 'Only acknowledge "completed" in the try block success path. Acknowledge "failed" in catch.',
        runtimeImpact: 'Failed operation reported as success — orchestrator assumes task finished, never retries',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // E14: Replace substring match with structured check for success-signal patterns
    const falseSuccessPatterns = [
      { match: /return\s+\{\s*success\s*:\s*true\s*\}/, desc: 'return { success: true }' },
      { match: /return\s+\{\s*passed\s*:\s*true\s*\}/, desc: 'return { passed: true }' },
      { match: /return\s+1\b/, desc: 'return 1' },
      { match: /return\s+['"]pass['"]/, desc: 'return "pass"' },
    ];
    for (const pattern of falseSuccessPatterns) {
      if (pattern.match.test(body)) {
        findings.push({
          layer: 'R4',
          severity: 'CRITICAL',
          category: 'ERROR_HANDLING',
          file: construct.filePath,
          line: construct.line,
          evidence: pattern.desc,
          description: `Catch block returns success signal (${pattern.desc}) — error caught and function reports success`,
          correction: 'Return an error indicator or re-throw. Errors should not produce success signals.',
          runtimeImpact: 'Failed operations report success — callers believe the operation succeeded when it did not',
          confidence: 0.95,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
        break;
      }
    }

    if (body.includes('non-critical') || body.includes('non critical') || body.includes('/* non-critical')) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block marked "non-critical" — errors classified as non-critical without evidence',
        correction: 'If the operation can fail without consequence, prove it with evidence. Otherwise, treat it as a real error.',
        runtimeImpact: 'Catastrophic failures classified as "non-critical" — system continues in corrupted state',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    const children = construct.children;
    const hasReturnTrue = children.some(
      (c: CodeConstruct) => c.type === ConstructType.RETURN_STATEMENT &&
           c.children.some((gc: CodeConstruct) => gc.type === ConstructType.BOOLEAN_LITERAL && gc.name === 'true')
    );
    if (hasReturnTrue) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block returns true — error is caught and the function reports success',
        correction: 'Return false or re-throw in the catch block. Errors should not produce success signals.',
        runtimeImpact: 'Failed operations report success — callers believe the operation succeeded when it did not',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (body.includes('try next') || body.includes('try next */') || body.includes('/* try next')) {
      findings.push({
        layer: 'R4',
        severity: 'MEDIUM',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block dismisses error with "try next" comment — error evidence lost',
        correction: 'Log the error with console.error() before trying the next alternative',
        runtimeImpact: 'Errors silently discarded — when all alternatives fail, no evidence remains to debug',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (body.includes('fall back') || body.includes('fallback') || body.includes('/* fall back')) {
      const hasLog = body.toLowerCase().includes('console.error') || body.toLowerCase().includes('console.warn') || body.toLowerCase().includes('tridentlog');
      if (!hasLog) {
        findings.push({
          layer: 'R4',
          severity: 'MEDIUM',
          category: 'ERROR_HANDLING',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 80),
          description: 'Catch block falls back without logging — error evidence lost during fallback',
          correction: 'Add console.error("[Component] fallback triggered:", err) before fallback logic',
          runtimeImpact: 'Fallback hides the original error — when fallback also fails, root cause is unknown',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};

function extractStatements(body: string): string[] {
  const stripped = body
    .replace(/catch\s*(?:\([^)]*\))?\s*\{/, '')
    .replace(/\}$/, '')
    .trim();
  if (!stripped) return [];
  return stripped.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
}
