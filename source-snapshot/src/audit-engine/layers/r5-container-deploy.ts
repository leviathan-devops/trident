import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType, Severity } from '../types.ts';

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, f);
    } else {
      const severityOrder: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (severityOrder[f.severity] > severityOrder[existing.severity]) {
        grouped.set(key, f);
      }
    }
  }
  return Array.from(grouped.values());
}

export const R5_CONTAINER_DEPLOY: LayerRule = {
  layer: 'R5',
  name: 'Container Deploy',
  description: 'Detects hardcoded paths and container-incompatible patterns',
  applicableTo: [ConstructType.STRING_LITERAL],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    const parent = construct.parent;
    if (parent && (parent.type === ConstructType.IMPORT_DECLARATION ||
                   parent.type === ConstructType.LINE_COMMENT ||
                   parent.type === ConstructType.BLOCK_COMMENT)) {
      return findings;
    }

    const value = construct.name;

    if (/\/home\/[a-zA-Z]/.test(value) && !value.includes('OPENCODE_WORKSPACE')) {
      const isInExecutable = parent && (
        parent.type === ConstructType.VARIABLE_DECLARATION ||
        parent.type === ConstructType.BINARY_EXPRESSION ||
        parent.type === ConstructType.CALL_EXPRESSION ||
        parent.type === ConstructType.RETURN_STATEMENT
      );

      if (isInExecutable) {
        findings.push({
          layer: 'R5',
          severity: 'HIGH',
          category: 'CONTAINER_DEPLOY',
          file: construct.filePath,
          line: construct.line,
          evidence: value,
          description: `Hardcoded /home/ path in executable code: "${value}" — will break in container`,
          correction: 'Use path.resolve(process.env.HOME || "/root", ...) or relative paths',
          runtimeImpact: 'Path does not exist in container — file operations fail silently or throw',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // E13: Expanded path patterns
    const expandedPatterns = [
      { regex: /\/Users\/[a-zA-Z]/, desc: '/Users/' },
      { regex: /C:\\\\Users\\\\/, desc: 'C:\\Users\\' },
      { regex: /localhost:\d{4}/, desc: 'localhost' },
      { regex: /127\.0\.0\.1:\d{4}/, desc: '127.0.0.1' },
      { regex: /0\.0\.0\.0:\d{4}/, desc: '0.0.0.0' },
    ];

    for (const pattern of expandedPatterns) {
      if (pattern.regex.test(value)) {
        const isInExec = parent && (
          parent.type === ConstructType.VARIABLE_DECLARATION ||
          parent.type === ConstructType.BINARY_EXPRESSION ||
          parent.type === ConstructType.CALL_EXPRESSION ||
          parent.type === ConstructType.RETURN_STATEMENT
        );
        if (isInExec) {
          findings.push({
            layer: 'R5',
            severity: 'HIGH',
            category: 'CONTAINER_DEPLOY',
            file: construct.filePath,
            line: construct.line,
            evidence: value,
            description: `Hardcoded ${pattern.desc} path in executable code: "${value}" — will break in container`,
            correction: 'Use environment variables or relative paths for container-compatible code',
            runtimeImpact: 'Hardcoded local path does not exist in container — file operations fail',
            confidence: 0.80,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
        break;
      }
    }

    return deduplicateFindings(findings);
  },
};
