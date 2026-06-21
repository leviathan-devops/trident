import * as ts from 'typescript';

export enum ConstructType {
  FUNCTION_DECLARATION = 'FUNCTION_DECLARATION',
  ARROW_FUNCTION = 'ARROW_FUNCTION',
  METHOD_DECLARATION = 'METHOD_DECLARATION',
  CALL_EXPRESSION = 'CALL_EXPRESSION',
  NEW_EXPRESSION = 'NEW_EXPRESSION',
  AWAIT_EXPRESSION = 'AWAIT_EXPRESSION',
  TRY_STATEMENT = 'TRY_STATEMENT',
  CATCH_CLAUSE = 'CATCH_CLAUSE',
  THROW_STATEMENT = 'THROW_STATEMENT',
  FINALLY_BLOCK = 'FINALLY_BLOCK',
  IMPORT_DECLARATION = 'IMPORT_DECLARATION',
  EXPORT_DECLARATION = 'EXPORT_DECLARATION',
  RE_EXPORT = 'RE_EXPORT',
  EXPORT_ASSIGNMENT = 'EXPORT_ASSIGNMENT',
  STRING_LITERAL = 'STRING_LITERAL',
  TEMPLATE_EXPRESSION = 'TEMPLATE_EXPRESSION',
  REGULAR_EXPRESSION_LITERAL = 'REGULAR_EXPRESSION_LITERAL',
  RETURN_STATEMENT = 'RETURN_STATEMENT',
  VARIABLE_DECLARATION = 'VARIABLE_DECLARATION',
  CLASS_DECLARATION = 'CLASS_DECLARATION',
  INTERFACE_DECLARATION = 'INTERFACE_DECLARATION',
  TYPE_ALIAS = 'TYPE_ALIAS',
  BOOLEAN_LITERAL = 'BOOLEAN_LITERAL',
  NULL_LITERAL = 'NULL_LITERAL',
  OBJECT_LITERAL = 'OBJECT_LITERAL',
  PROPERTY_ASSIGNMENT = 'PROPERTY_ASSIGNMENT',
  BLOCK_COMMENT = 'BLOCK_COMMENT',
  LINE_COMMENT = 'LINE_COMMENT',
  PROPERTY_ACCESS_EXPRESSION = 'PROPERTY_ACCESS_EXPRESSION',
  IF_STATEMENT = 'IF_STATEMENT',
  FOR_STATEMENT = 'FOR_STATEMENT',
  WHILE_STATEMENT = 'WHILE_STATEMENT',
  SWITCH_STATEMENT = 'SWITCH_STATEMENT',
  ARRAY_LITERAL = 'ARRAY_LITERAL',
  SPREAD_ELEMENT = 'SPREAD_ELEMENT',
  BINARY_EXPRESSION = 'BINARY_EXPRESSION',
  CONDITIONAL_EXPRESSION = 'CONDITIONAL_EXPRESSION',
  AS_EXPRESSION = 'AS_EXPRESSION',
  TYPE_REFERENCE = 'TYPE_REFERENCE',
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CodeConstruct {
  type: ConstructType;
  name: string;
  filePath: string;
  line: number;
  endLine: number;
  body: string;
  node: ts.Node;
  isDefinition: boolean;
  isCallSite: boolean;
  isAsync: boolean;
  modifiers: string[];
  parent: CodeConstruct | null;
  children: CodeConstruct[];
  parameters: { name: string; type: string | null }[];
  returnType: string | null;
}

export interface CallSiteEntry {
  callSiteFile: string;
  callSiteLine: number;
  hasAwait: boolean;
  isInsideTry: boolean;
  isInsideCatch: boolean;
  isInsideFinally: boolean;
  returnValueUsed: boolean;
  calleeResolved: boolean;
  calleeReturnsPromise: boolean;
}

export interface CallGraphEntry {
  calleeFile: string;
  calleeLine: number;
  calleeName: string;
  callSites: CallSiteEntry[];
}

export interface CallGraph {
  entries: Map<string, CallGraphEntry>;
  totalCallSites: number;
  resolvedCallSites: number;
  coveragePercent: number;
}

export interface SymbolTableEntry {
  name: string;
  filePath: string;
  line: number;
  isExported: boolean;
  isImported: boolean;
  importedBy: string[];
  constructType: ConstructType;
}

export interface SymbolTable {
  symbols: Map<string, SymbolTableEntry>;
}

export interface SuppressedFinding {
  layer: string;
  severity: Severity;
  category: string;
  file: string;
  line: number;
  description: string;
  confidence: number;
  suppressionReason: string;
}

export interface AuditMeta {
  callGraphCoverage: number;
  totalCallSites: number;
  resolvedCallSites: number;
  checkerAvailable: boolean;
  blindSpots: string[];
  suppressedBelowFloor: number;
  selfAudit: boolean;
}

export interface ProjectLanguageStats {
  typescript: number;
  javascript: number;
  python: number;
  rust: number;
  go: number;
  java: number;
  csharp: number;
  other: number;
  total: number;
}

export interface AnalysisContext {
  constructs: CodeConstruct[];
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  preflight: PreflightResult;
  packageJson: Record<string, any> | null;
  tsconfig: Record<string, any> | null;
  opencodeJson: Record<string, any> | null;
  diagnostics: ts.Diagnostic[];
  projectRoot: string;
  constructsByFile: Map<string, CodeConstruct[]>;
  isSelfAudit: boolean;
  // v4.3.3 additions — multi-language awareness + evidence integrity
  languageStats?: ProjectLanguageStats;
  evidenceChainHash?: string;
  identityVerified?: boolean;
  // Spec Phase 0: Multi-language scanner metadata
  skippedExtensions?: string[];
  totalFilesScanned?: number;
  totalFilesSkipped?: number;
}

export interface PreflightResult {
  typeCheckPassed: boolean;
  typeCheckError: string | null;
  buildPassed: boolean;
  buildError: string | null;
  distExists: boolean;
  distIsSingleFile: boolean;
  distSize: number;
  hasRelativeImports: boolean;
  sourceMapExists: boolean;
  findings: PreflightFinding[];
}

export interface PreflightFinding {
  check: string;
  passed: boolean;
  detail: string;
}

export interface AuditFinding {
  layer: string;
  severity: Severity;
  category: string;
  file: string;
  line: number;
  evidence: string;
  description: string;
  correction: string;
  runtimeImpact: string;
  confidence: number;
  constructType: ConstructType | null;
  callGraphRef: string | null;
  evidenceSuppressed: boolean;
  confidenceDimensions?: import('../types.js').FindingConfidence;
  reproducible?: import('../types.js').ReproducibleFailure;
}

export interface LayerRule {
  layer: string;
  name: string;
  description: string;
  applicableTo: ConstructType[];
  excludeTypes?: ConstructType[];
  requireAsync?: boolean;
  requireHasBody?: boolean;
  requireDefinition?: boolean;
  requireCallSite?: boolean;
  evaluate: (construct: CodeConstruct | null, ctx: AnalysisContext) => AuditFinding[];
  requireEvidence?: string;
  enabled: boolean;
  auditSelf?: boolean;
}

export interface AuditResult {
  score: number;
  grade: string;
  findings: AuditFinding[];
  filesScanned: number;
  sourceFilesScanned: number;
  layers: { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[];
  report: string;
  preflight: PreflightResult;
  confidenceDistribution: ConfidenceDistribution;
  suppressedFindings: SuppressedFinding[];
  auditMeta: AuditMeta;
}

export interface ConfidenceDistribution {
  definite: number;
  high: number;
  moderate: number;
  low: number;
  noise: number;
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
};

export const CONFIDENCE_LABELS: { min: number; max: number; label: string }[] = [
  { min: 0.95, max: 1.00, label: 'Definite' },
  { min: 0.85, max: 0.94, label: 'High' },
  { min: 0.70, max: 0.84, label: 'Moderate' },
  { min: 0.50, max: 0.69, label: 'Low' },
  { min: 0.00, max: 0.49, label: 'Noise' },
];

export function confidenceLabel(confidence: number): string {
  for (const entry of CONFIDENCE_LABELS) {
    if (confidence >= entry.min && confidence <= entry.max) return entry.label;
  }
  return 'Unknown';
}
