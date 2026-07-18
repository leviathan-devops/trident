import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * R12 — Cross-Plugin Isolation
 *
 * Detects mutable shared state that breaks isolation between plugins/agents.
 * All five detection targets use TypeScript AST traversal — zero regex patterns.
 *
 *   1. Module-level mutable export  — `export let x = …` at SourceFile scope
 *   2. globalThis assignment        — `globalThis.foo = …`
 *   3. process.env mutation         — `process.env.KEY = …`
 *   4. Singleton mutation           — `singleton.prop = …` after singleton-getter call
 *   5. declare global augmentation  — `declare global { … }`
 */

// ---------------------------------------------------------------------------
// AST traversal helpers
// ---------------------------------------------------------------------------

/** Walk every node in the subtree rooted at `root` (iterative depth-first). */
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

/** Return 1-based line number of `node` within its SourceFile. */
function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// ---------------------------------------------------------------------------
// Pattern-match helpers (pure AST, no regex)
// ---------------------------------------------------------------------------

/**
 * Determine whether an expression is (or chains through) a `globalThis` reference.
 *
 *   globalThis            → true
 *   globalThis.foo        → true
 *   globalThis.foo.bar    → true
 *   window                → false  (narrow scope — only globalThis)
 */
function isGlobalThisAccess(expr: ts.Expression): boolean {
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) && current.text === 'globalThis';
}

/**
 * Determine whether an expression is a `process.env.KEY` property access.
 *
 *   process.env.FOO   → true
 *   process.env       → false  (no terminal property to write)
 */
function isProcessEnvAccess(expr: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expr)) return false;
  const envAccess = expr.expression;
  if (!ts.isPropertyAccessExpression(envAccess)) return false;
  return (
    ts.isIdentifier(envAccess.expression) &&
    envAccess.expression.text === 'process' &&
    envAccess.name.text === 'env'
  );
}

/**
 * Call-expression callee names that conventionally return shared singleton objects.
 * Used to identify variables whose mutations leak across plugin boundaries.
 */
const SINGLETON_GETTER_NAMES = new Set([
  'getInstance',
  'getRegistry',
  'getSingleton',
  'getShared',
  'getGlobal',
  'getDefault',
  'getSingle',
  'createRegistry',
]);

/**
 * Determine whether a CallExpression is a likely singleton accessor based on
 * its callee name (direct identifier or property-access identifier).
 */
function isSingletonGetterCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  // Direct call: getInstance()
  if (ts.isIdentifier(callee)) {
    return SINGLETON_GETTER_NAMES.has(callee.text);
  }
  // Property-access call: Registry.getInstance(), registry.get()
  if (ts.isPropertyAccessExpression(callee)) {
    return SINGLETON_GETTER_NAMES.has(callee.name.text);
  }
  return false;
}

/**
 * Climb from a node to its enclosing VariableStatement, if any.
 * Handles both VariableStatement nodes and VariableDeclaration nodes
 * (whose parent chain is: Declaration → DeclarationList → VariableStatement).
 */
function climbToVariableStatement(node: ts.Node): ts.VariableStatement | null {
  if (ts.isVariableStatement(node)) return node;
  if (
    ts.isVariableDeclaration(node) &&
    node.parent &&
    ts.isVariableDeclarationList(node.parent) &&
    node.parent.parent &&
    ts.isVariableStatement(node.parent.parent)
  ) {
    return node.parent.parent;
  }
  return null;
}

/**
 * Check whether a VariableStatement carries an `export` modifier.
 * Handles both the modern `ts.getModifiers` API (TS 4.8+) and the legacy
 * `node.modifiers` property.
 */
function hasExportModifier(node: ts.VariableStatement): boolean {
  // Modern API (TS 4.8+)
  if (typeof ts.getModifiers === 'function') {
    const mods = ts.getModifiers(node);
    if (mods) {
      return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    }
  }
  // Legacy fallback (TS < 4.8)
  const legacyMods = (
    node as unknown as { modifiers?: readonly ts.Node[] }
  ).modifiers;
  return (
    legacyMods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

// ---------------------------------------------------------------------------
// Layer rule
// ---------------------------------------------------------------------------

export const R12_CROSS_PLUGIN_ISOLATION: LayerRule = {
  layer: 'R12',
  name: 'Cross-Plugin Isolation',
  description:
    'Detects mutable shared state that breaks cross-plugin isolation: ' +
    'module-level mutable exports, globalThis assignments, process.env mutations, ' +
    'singleton mutations, and declare global augmentations',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.VARIABLE_DECLARATION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.BINARY_EXPRESSION,
    ConstructType.PROPERTY_ACCESS_EXPRESSION,
    ConstructType.IF_STATEMENT,
    ConstructType.EXPORT_DECLARATION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];

    try {
      const findings: AuditFinding[] = [];
      const node = construct.node;
      if (!node) return findings;

      const sourceFile = node.getSourceFile();
      if (!sourceFile) return findings;

      const checker = ctx.checker;

      // Variables assigned from singleton-getter calls. Tracked in a pre-pass
      // so that mutation detection (Phase B) sees the complete set regardless
      // of AST visit order.
      const singletonVars = new Map<string, ts.CallExpression>();

      // Dedup mutable-export findings: a VariableStatement may be visited from
      // both itself and its VariableDeclaration children during the walk.
      const reportedMutableExports = new Set<string>();

      // ── Pre-pass: collect singleton variable names ──────────────────
      //
      //   const registry = getRegistry()
      //   const instance = Registry.getInstance()
      //
      // Records <variableName → callNode> so Phase B can flag mutations.
      walkAst(node, (child: ts.Node) => {
        if (
          ts.isVariableDeclaration(child) &&
          child.initializer &&
          ts.isCallExpression(child.initializer) &&
          isSingletonGetterCall(child.initializer)
        ) {
          const varName = child.name.getText(sourceFile);
          if (varName) {
            singletonVars.set(varName, child.initializer);
          }
        }
      });

      // ── Main pass: detect all five violation patterns ───────────────
      walkAst(node, (child: ts.Node) => {
        const line = getLineNumber(sourceFile, child);

        // ── 1. Module-level mutable export ───────────────────────────
        //
        //   export let sharedState = …
        //   export var counter = 0
        //
        // A VariableStatement at SourceFile top-level whose declaration list
        // uses let or var (i.e. NOT const) and has an export modifier.
        // The exported binding is mutable — any importer shares the same
        // mutable reference.
        const vs = climbToVariableStatement(child);
        if (vs && vs.parent && ts.isSourceFile(vs.parent)) {
          const declFlags = ts.getCombinedNodeFlags(vs.declarationList);
          // In TypeScript, NodeFlags.Const marks const declarations.
          // let and var both lack the Const flag. NodeFlags.Let marks let
          // specifically; var has neither Let nor Const.
          const isMutable = (declFlags & ts.NodeFlags.Const) === 0;

          if (isMutable && hasExportModifier(vs)) {
            const keyword =
              (declFlags & ts.NodeFlags.Let) !== 0 ? 'let' : 'var';
            const varName =
              vs.declarationList.declarations[0]?.name.getText(sourceFile) ??
              '<unknown>';
            if (!reportedMutableExports.has(varName)) {
              reportedMutableExports.add(varName);
              findings.push({
                layer: 'R12',
                severity: 'HIGH',
                category: 'CROSS_PLUGIN_ISOLATION',
                file: construct.filePath,
                line,
                evidence: `Module-level mutable export: \`export ${keyword} ${varName}\``,
                description:
                  `Exported "${varName}" uses a mutable binding (${keyword}) at module scope. ` +
                  'Any plugin that imports it shares the same mutable reference — ' +
                  'concurrent mutations from different plugins corrupt shared state.',
                correction:
                  'Export a factory function, a frozen object (Object.freeze), or a const ' +
                  'reference. Avoid exporting mutable bindings.',
                runtimeImpact:
                  'Shared mutable export — plugins can corrupt each other\'s state ' +
                  'via the same reference',
                confidence: 0.90,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }

        // ── 2 & 3 & 4. Assignment-based violations ───────────────────
        //
        // All three remaining patterns are BinaryExpression nodes with the
        // `=` operator, distinguished by the shape of their left-hand side.
        if (
          ts.isBinaryExpression(child) &&
          child.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          const lhs = child.left;

          // 2. globalThis property assignment
          //    globalThis.__myPlugin = …
          if (isGlobalThisAccess(lhs)) {
            const target = lhs.getText(sourceFile);
            findings.push({
              layer: 'R12',
              severity: 'CRITICAL',
              category: 'CROSS_PLUGIN_ISOLATION',
              file: construct.filePath,
              line,
              evidence: `globalThis assignment: \`${target} = …\``,
              description:
                `Direct mutation of \`${target}\` pollutes the global namespace. ` +
                'Every plugin shares the globalThis object — writes are visible to ' +
                'all plugins simultaneously.',
              correction:
                'Use a module-scoped variable, a Symbol-keyed property on globalThis, ' +
                'or a dedicated registry instead of a string-keyed global property.',
              runtimeImpact:
                'Global namespace pollution — all plugins observe and can overwrite this value',
              confidence: 0.95,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }

          // 3. process.env mutation
          //    process.env.PLUGIN_MODE = …
          if (isProcessEnvAccess(lhs)) {
            const envKey = ts.isPropertyAccessExpression(lhs)
              ? lhs.name.getText(sourceFile)
              : 'unknown';
            findings.push({
              layer: 'R12',
              severity: 'HIGH',
              category: 'CROSS_PLUGIN_ISOLATION',
              file: construct.filePath,
              line,
              evidence: `process.env mutation: \`process.env.${envKey} = …\``,
              description:
                `Writing to \`process.env.${envKey}\` modifies the environment for all plugins. ` +
                'Environment variables are process-global — mutations are shared across ' +
                'every plugin instance.',
              correction:
                'Use module-scoped configuration objects. If an env override is required, ' +
                'restore the original value in a finally block.',
              runtimeImpact:
                'Environment mutation leaks to all plugins — configuration drift ' +
                'and race conditions',
              confidence: 0.90,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }

          // 4. Singleton property mutation (Phase B)
          //    singletonVar.prop = value
          //
          // Where singletonVar was assigned from a singleton-getter call
          // identified in the pre-pass above.
          if (ts.isPropertyAccessExpression(lhs)) {
            const base = lhs.expression;
            if (ts.isIdentifier(base) && singletonVars.has(base.text)) {
              const varName = base.text;
              const propName = lhs.name.getText(sourceFile);

              // Use the TypeChecker to verify the getter call returns an
              // object type (mutations on primitives are no-ops in JS).
              let returnsObject = true;
              if (checker) {
                try {
                  const callExpr = singletonVars.get(varName)!;
                  const type = checker.getTypeAtLocation(callExpr);
                  returnsObject = (type.flags & ts.TypeFlags.Object) !== 0;
                } catch {
                  // TypeChecker failure — assume object to avoid false negatives
                  returnsObject = true;
                }
              }

              if (returnsObject) {
                findings.push({
                  layer: 'R12',
                  severity: 'HIGH',
                  category: 'CROSS_PLUGIN_ISOLATION',
                  file: construct.filePath,
                  line,
                  evidence: `Singleton mutation: \`${varName}.${propName} = …\``,
                  description:
                    `Property "${propName}" on singleton "${varName}" is mutated directly. ` +
                    'Singleton objects are shared across all plugins — mutations affect ' +
                    'every consumer simultaneously.',
                  correction:
                    'Use immutable replacement, a scoped copy, or a method that validates ' +
                    'the mutation scope before applying it.',
                  runtimeImpact:
                    'Singleton mutation visible to all plugins — state corruption ' +
                    'across plugin boundaries',
                  confidence: 0.85,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
          }
        }

        // ── 5. declare global augmentation ───────────────────────────
        //
        //   declare global {
        //     interface Window { … }
        //   }
        //
        // A ModuleDeclaration with the GlobalAugmentation flag. Augmenting
        // the global scope affects all plugins in the same type-checking pass.
        if (ts.isModuleDeclaration(child)) {
          const combined = ts.getCombinedNodeFlags(child);
          if ((combined & ts.NodeFlags.GlobalAugmentation) !== 0) {
            findings.push({
              layer: 'R12',
              severity: 'MEDIUM',
              category: 'CROSS_PLUGIN_ISOLATION',
              file: construct.filePath,
              line,
              evidence: 'declare global augmentation block',
              description:
                '`declare global` augments the global scope. All plugins inherit these ' +
                'additions, which can cause naming collisions and unintended behavior ' +
                'across plugin boundaries.',
              correction:
                'Use module-scoped types and export them explicitly instead of augmenting ' +
                'the global scope.',
              runtimeImpact:
                'Global type/scope pollution — all plugins see augmented global definitions',
              confidence: 0.75,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      });

      return findings;
    } catch (e) {
      console.error('[R12CrossPluginIsolation]', e);
      return [];
    }
  },
};
