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

export const R9_RUNTIME_CONTRACT: LayerRule = {
  layer: 'R9',
  name: 'Runtime Contract',
  description: 'Detects null returns from non-nullable functions, bracket access on unverified keys, hardcoded paths',
  applicableTo: [ConstructType.RETURN_STATEMENT, ConstructType.CALL_EXPRESSION, ConstructType.STRING_LITERAL],
  excludeTypes: [ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT, ConstructType.TEMPLATE_EXPRESSION],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    if (construct.type === ConstructType.RETURN_STATEMENT) {
      const children = construct.children;
      const hasNull = children.some(c => c.type === ConstructType.NULL_LITERAL);
      if (hasNull) {
        const parent = findParentFunction(construct);
        if (parent && parent.returnType) {
          const retType = parent.returnType;
          if (retType.includes('string') || retType.includes('number') || retType.includes('boolean')) {
            if (!retType.includes('null') && !retType.includes('| null') && !retType.includes('undefined')) {
              findings.push({
                layer: 'R9',
                severity: 'CRITICAL',
                category: 'RUNTIME_CONTRACT',
                file: construct.filePath,
                line: construct.line,
                evidence: `return null — function ${parent.name} declares return type ${retType}`,
                description: `Function "${parent.name}" returns null but declares non-nullable return type "${retType}"`,
                correction: 'Return a valid value of the declared type or update the type annotation to include | null',
                runtimeImpact: 'Type contract violation — caller expects non-null, gets null, crashes on property access',
                confidence: 0.95,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
      }
    }

    if (construct.type === ConstructType.CALL_EXPRESSION) {
      const body = construct.body;
      // E4: Check for dynamic bracket access patterns and CREATE findings
      const bracketPatterns = [
        /(\w+)\[\s*['"](\w+)['"]\s*\]/g,
        /(\w+)\[\s*(?!['"])(\w+)\s*\]/g,
      ];
      for (const pattern of bracketPatterns) {
        let bracketMatch;
        const seenKeys = new Set<string>();
        while ((bracketMatch = pattern.exec(body)) !== null) {
          const objName = bracketMatch[1];
          const key = bracketMatch[2];

          if (objName === 'process' || objName === 'console' || objName === 'Math' ||
              objName === 'JSON' || objName === 'globalThis' || objName === 'window' ||
              objName === 'document' || objName === 'Reflect') {
            continue;
          }

          const dedupKey = `${objName}[${key}]`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          // E4: Create and return findings instead of void
          findings.push({
            layer: 'R9',
            severity: 'MEDIUM',
            category: 'RUNTIME_CONTRACT',
            file: construct.filePath,
            line: construct.line,
            evidence: `${objName}[${/^\d+$/.test(key) ? key : `'${key}'`}]`,
            description: `Dynamic bracket access on "${objName}" — key "${key}" not validated at runtime`,
            correction: `Use validated access: if ("${key}" in ${objName}) or use optional chaining ${objName}?.["${key}"]`,
            runtimeImpact: 'Accessing non-existent property returns undefined — downstream code may crash on unexpected type',
            confidence: 0.60,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    if (construct.type === ConstructType.STRING_LITERAL) {
      const value = construct.name;
      if (/\/home\/[a-zA-Z]/.test(value)) {
        const parent = construct.parent;
        if (parent && parent.type !== ConstructType.IMPORT_DECLARATION) {
          findings.push({
            layer: 'R9',
            severity: 'HIGH',
            category: 'RUNTIME_CONTRACT',
            file: construct.filePath,
            line: construct.line,
            evidence: value,
            description: `Hardcoded /home/ path "${value}" in executable code — breaks in container`,
            correction: 'Use path.resolve(process.env.HOME || "/root", ...) or relative paths',
            runtimeImpact: 'Path does not exist in container — file operations fail silently or throw',
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    return deduplicateFindings(findings);
  },
};

function findParentFunction(construct: CodeConstruct): CodeConstruct | null {
  let current = construct.parent;
  while (current) {
    if (current.isDefinition && (
      current.type === ConstructType.FUNCTION_DECLARATION ||
      current.type === ConstructType.ARROW_FUNCTION ||
      current.type === ConstructType.METHOD_DECLARATION
    )) {
      return current;
    }
    current = current.parent;
  }
  return null;
}
