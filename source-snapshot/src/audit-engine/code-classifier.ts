import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../utils.js';
import {
  ConstructType,
  CodeConstruct,
  SymbolTable,
  SymbolTableEntry,
  AnalysisContext,
  CallGraph,
  CallGraphEntry,
  CallSiteEntry,
  PreflightResult,
} from './types.ts';

interface ClassificationResult {
  constructsByFile: Map<string, CodeConstruct[]>;
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  diagnostics: ts.Diagnostic[];
  sourceFiles: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker | null;
}

export function classifyProject(
  projectRoot: string,
  preflight: PreflightResult,
  packageJson: Record<string, unknown> | null,
  tsconfig: Record<string, unknown> | null,
  opencodeJson: Record<string, unknown> | null,
): AnalysisContext {
  const result = buildAST(projectRoot);
  const callGraph = buildCallGraph(result.constructsByFile, result.checker);

  const allConstructs: CodeConstruct[] = [];
  for (const constructs of result.constructsByFile.values()) {
    allConstructs.push(...constructs);
  }

  // FINDING #9 FIX: Use package.json name instead of brittle path heuristics
  const isSelfAudit = String(packageJson?.name || '').toLowerCase().includes('trident') || false;

  return {
    constructs: allConstructs,
    symbolTable: result.symbolTable,
    callGraph,
    preflight,
    packageJson,
    tsconfig,
    opencodeJson,
    diagnostics: result.diagnostics,
    projectRoot,
    constructsByFile: result.constructsByFile,
    isSelfAudit,
    sourceFiles: result.sourceFiles,
  };
}

function buildAST(projectRoot: string): ClassificationResult {
  const constructsByFile = new Map<string, CodeConstruct[]>();
  const symbolTable: SymbolTable = { symbols: new Map() };
  const sourceFiles = new Map<string, ts.SourceFile>();
  let checker: ts.TypeChecker | null = null;
  let diagnostics: ts.Diagnostic[] = [];

  const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  let program: ts.Program | null = null;

  if (tsconfigPath) {
    try {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
      const options: ts.CompilerOptions = {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
      };

      const fileNames = parsed.fileNames.filter(
        (f: string) => !f.includes('node_modules') && !f.includes('.d.ts') && !f.includes('dist'),
      );

      program = ts.createProgram(fileNames, options);
      checker = program.getTypeChecker();
      diagnostics = [...ts.getPreEmitDiagnostics(program)];
    } catch (e: unknown) {
      tridentLog('DEBUG', 'code-classifier', 'ts.createProgram failed: ' + (e instanceof Error ? e.message : String(e)));
      tridentLog('ERROR', 'code-classifier', `ts.createProgram failed, falling back to createSourceFile: ${(e as Error).message}`);
      return { constructsByFile: new Map(), symbolTable: { symbols: new Map() }, callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 }, diagnostics: [], sourceFiles: new Map(), checker: null };
    }
  }

  if (program) {
    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;
      if (filePath.includes('node_modules') || filePath.includes('.d.ts') || filePath.includes('dist')) continue;
      if (!filePath.startsWith(projectRoot)) continue;

      const relativePath = path.relative(projectRoot, filePath);
      const constructs: CodeConstruct[] = [];
      sourceFiles.set(filePath, sourceFile);

      visitNode(sourceFile, filePath, constructs, null, symbolTable, checker);
      constructsByFile.set(relativePath, constructs);
    }

    // FINDING #1 FIX: If tsconfig was found in a parent directory, the program
    // may have 0 files matching startsWith(projectRoot). Fall through to the
    // filesystem-based collectTsFiles fallback instead of returning empty.
    if (constructsByFile.size === 0) {
      program = null;
      checker = null;
    }
  }

  if (!program) {
    const srcDir = path.join(projectRoot, 'src');
    const baseDir = fs.existsSync(srcDir) ? srcDir : projectRoot;
    const files = collectTsFiles(baseDir, projectRoot, 0, 20);

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(projectRoot, filePath);
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      sourceFiles.set(filePath, sourceFile);

      const constructs: CodeConstruct[] = [];
      visitNode(sourceFile, filePath, constructs, null, symbolTable, null);
      constructsByFile.set(relativePath, constructs);
    }
  }

  return { constructsByFile, symbolTable, callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 }, diagnostics, sourceFiles, checker };
}

function visitNode(
  node: ts.Node,
  filePath: string,
  constructs: CodeConstruct[],
  parent: CodeConstruct | null,
  symbolTable: SymbolTable,
  checker: ts.TypeChecker | null,
): void {
  const classified = classifyNode(node, filePath, parent, checker);

    if (classified) {
    if (parent) {
      parent.children.push(classified);
    }
    constructs.push(classified);

    if (classified.type === ConstructType.EXPORT_DECLARATION || classified.type === ConstructType.RE_EXPORT) {
      registerExport(classified, symbolTable);
    }

    // E1: Populate symbol table for exports, named exports, and variable statements with export modifier
    if (classified.isDefinition) {
      const key = `${classified.name}@${filePath}`;
      if (!symbolTable.symbols.has(key)) {
        symbolTable.symbols.set(key, {
          name: classified.name,
          filePath,
          line: classified.line,
          isExported: classified.modifiers.includes('export'),
          isImported: false,
          importedBy: [],
          constructType: classified.type,
        });
      } else if (classified.modifiers.includes('export')) {
        const existing = symbolTable.symbols.get(key);
        if (existing) existing.isExported = true;
      }
    }

    // E1: ExportDeclaration with NamedExports — register each exported name
    if (classified.type === ConstructType.EXPORT_DECLARATION) {
      const exportDecl = node as ts.ExportDeclaration;
      if (exportDecl.exportClause && ts.isNamedExports(exportDecl.exportClause)) {
        for (const element of exportDecl.exportClause.elements) {
          const exportedName = element.name.getText(element.getSourceFile());
          const symKey = `${exportedName}@${filePath}`;
          const existing = symbolTable.symbols.get(symKey);
          if (existing) {
            existing.isExported = true;
          } else {
            symbolTable.symbols.set(symKey, {
              name: exportedName,
              filePath,
              line: classified.line,
              isExported: true,
              isImported: false,
              importedBy: [],
              constructType: ConstructType.EXPORT_DECLARATION,
            });
          }
        }
      }
    }

    // E1: VariableStatement with export modifier — register variable declarations
    if (ts.isVariableStatement(node) && node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        const varName = decl.name.getText(decl.getSourceFile());
        const symKey = `${varName}@${filePath}`;
        const existing = symbolTable.symbols.get(symKey);
        if (existing) {
          existing.isExported = true;
        } else {
          symbolTable.symbols.set(symKey, {
            name: varName,
            filePath,
            line: classified.line,
            isExported: true,
            isImported: false,
            importedBy: [],
            constructType: ConstructType.VARIABLE_DECLARATION,
          });
        }
      }
    }

    // E1: ImportDeclaration — mark imported symbols
    if (classified.type === ConstructType.IMPORT_DECLARATION) {
      const importDecl = node as ts.ImportDeclaration;
      const importClause = importDecl.importClause;
      if (importClause) {
        if (importClause.name) {
          const importedName = importClause.name.getText(importClause.getSourceFile());
          const existing = symbolTable.symbols.get(`${importedName}@${filePath}`);
          if (existing) {
            existing.isImported = true;
          }
        }
        if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            const importedName = element.name.getText(element.getSourceFile());
            const existing = symbolTable.symbols.get(`${importedName}@${filePath}`);
            if (existing) {
              existing.isImported = true;
            }
          }
        }
      }
    }
  }

  ts.forEachChild(node, (child: ts.Node) => {
    visitNode(child, filePath, constructs, classified || parent, symbolTable, checker);
  });
}

function classifyNode(
  node: ts.Node,
  filePath: string,
  parent: CodeConstruct | null,
  checker: ts.TypeChecker | null,
): CodeConstruct | null {
  const sf = node.getSourceFile();
  const lineAndChar = sf ? ts.getLineAndCharacterOfPosition(sf, node.getStart(sf) || node.pos) : null;
  const endLineAndChar = sf ? ts.getLineAndCharacterOfPosition(sf, node.getEnd()) : null;
  let line = lineAndChar ? lineAndChar.line + 1 : 0;
  let endLine = endLineAndChar ? endLineAndChar.line + 1 : line;

  // Validate line number against source file length
  // Ensures we never report a line that doesn't exist in the file
  if (sf && line > 0) {
    const totalLines = sf.text.split('\n').length;
    if (line > totalLines) line = 0;
    if (endLine > totalLines) endLine = line;
  }

  let body: string;
  try {
    body = node.getText(sf);
  } catch (e: unknown) {
    tridentLog('DEBUG', 'code-classifier', 'getText failed: ' + (e instanceof Error ? e.message : String(e)));
    body = '';
    return null;
  }

  let type: ConstructType | null = null;
  let name = '';
  let isDefinition = false;
  let isCallSite = false;
  let isAsync = false;
  let modifiers: string[] = [];
  let parameters: { name: string; type: string | null }[] = [];
  let returnType: string | null = null;

  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration: {
      const decl = node as ts.FunctionDeclaration;
      type = ConstructType.FUNCTION_DECLARATION;
      name = decl.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      isAsync = !!decl.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(decl.modifiers);
      parameters = extractParameters(decl.parameters);
      returnType = extractReturnType(decl, checker);
      break;
    }
    case ts.SyntaxKind.ArrowFunction: {
      const arrow = node as ts.ArrowFunction;
      type = ConstructType.ARROW_FUNCTION;
      // E7: Walk up to parent VariableDeclaration to extract variable name
      name = extractArrowFunctionName(node);
      isDefinition = true;
      isAsync = !!arrow.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(arrow.modifiers);
      parameters = extractParameters(arrow.parameters);
      returnType = extractReturnType(arrow, checker);
      break;
    }
    case ts.SyntaxKind.MethodDeclaration: {
      const method = node as ts.MethodDeclaration;
      type = ConstructType.METHOD_DECLARATION;
      name = method.name?.getText(sf) || '<method>';
      isDefinition = true;
      isAsync = !!method.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(method.modifiers);
      parameters = extractParameters(method.parameters);
      returnType = extractReturnType(method, checker);
      break;
    }
    case ts.SyntaxKind.CallExpression: {
      const call = node as ts.CallExpression;
      type = ConstructType.CALL_EXPRESSION;
      name = call.expression.getText(sf);
      isCallSite = true;
      break;
    }
    case ts.SyntaxKind.NewExpression: {
      const newExpr = node as ts.NewExpression;
      type = ConstructType.NEW_EXPRESSION;
      name = newExpr.expression.getText(sf);
      isCallSite = true;
      break;
    }
    case ts.SyntaxKind.AwaitExpression: {
      type = ConstructType.AWAIT_EXPRESSION;
      name = 'await';
      break;
    }
    case ts.SyntaxKind.TryStatement: {
      type = ConstructType.TRY_STATEMENT;
      name = 'try';
      break;
    }
    case ts.SyntaxKind.CatchClause: {
      type = ConstructType.CATCH_CLAUSE;
      name = 'catch';
      break;
    }
    case ts.SyntaxKind.ThrowStatement: {
      type = ConstructType.THROW_STATEMENT;
      name = 'throw';
      break;
    }
    case ts.SyntaxKind.ImportDeclaration: {
      type = ConstructType.IMPORT_DECLARATION;
      const imp = node as ts.ImportDeclaration;
      name = (imp.moduleSpecifier as ts.StringLiteral)?.text || '';
      break;
    }
    case ts.SyntaxKind.ExportDeclaration: {
      const exp = node as ts.ExportDeclaration;
      if (exp.moduleSpecifier) {
        type = ConstructType.RE_EXPORT;
        name = (exp.moduleSpecifier as ts.StringLiteral)?.text || '';
      } else {
        type = ConstructType.EXPORT_DECLARATION;
        name = 'export';
      }
      break;
    }
    case ts.SyntaxKind.ExportAssignment: {
      type = ConstructType.EXPORT_ASSIGNMENT;
      name = 'export=';
      break;
    }
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
      type = ConstructType.STRING_LITERAL;
      name = (node as ts.StringLiteral).text;
      break;
    }
    case ts.SyntaxKind.TemplateExpression: {
      type = ConstructType.TEMPLATE_EXPRESSION;
      name = body.substring(0, 60);
      break;
    }
    case ts.SyntaxKind.RegularExpressionLiteral: {
      type = ConstructType.REGULAR_EXPRESSION_LITERAL;
      name = body;
      break;
    }
    case ts.SyntaxKind.ReturnStatement: {
      type = ConstructType.RETURN_STATEMENT;
      name = 'return';
      break;
    }
    case ts.SyntaxKind.VariableDeclaration: {
      type = ConstructType.VARIABLE_DECLARATION;
      const vDecl = node as ts.VariableDeclaration;
      name = vDecl.name.getText(sf);
      break;
    }
    case ts.SyntaxKind.ClassDeclaration: {
      type = ConstructType.CLASS_DECLARATION;
      const cls = node as ts.ClassDeclaration;
      name = cls.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.InterfaceDeclaration: {
      type = ConstructType.INTERFACE_DECLARATION;
      const iface = node as ts.InterfaceDeclaration;
      name = iface.name?.getText(sf);
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.TypeAliasDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      const ta = node as ts.TypeAliasDeclaration;
      name = ta.name?.getText(sf) || '';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword: {
      type = ConstructType.BOOLEAN_LITERAL;
      name = node.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false';
      break;
    }
    case ts.SyntaxKind.NullKeyword: {
      type = ConstructType.NULL_LITERAL;
      name = 'null';
      break;
    }
    case ts.SyntaxKind.ObjectLiteralExpression: {
      type = ConstructType.OBJECT_LITERAL;
      name = '{}';
      break;
    }
    case ts.SyntaxKind.PropertyAssignment: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      const pa = node as ts.PropertyAssignment;
      name = pa.name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      type = ConstructType.PROPERTY_ACCESS_EXPRESSION;
      name = (node as ts.PropertyAccessExpression).getText(sf);
      break;
    }
    case ts.SyntaxKind.Block: {
      if (parent?.type === ConstructType.TRY_STATEMENT) {
        const tryStmt = parent.node as ts.TryStatement;
        if (tryStmt.finallyBlock && node === tryStmt.finallyBlock) {
          type = ConstructType.FINALLY_BLOCK;
          name = 'finally';
        }
      }
      if (!type) return null;
      break;
    }
    case ts.SyntaxKind.IfStatement: {
      type = ConstructType.IF_STATEMENT;
      name = 'if';
      break;
    }
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement: {
      type = ConstructType.FOR_STATEMENT;
      name = 'for';
      break;
    }
    case ts.SyntaxKind.WhileStatement: {
      type = ConstructType.WHILE_STATEMENT;
      name = 'while';
      break;
    }
    case ts.SyntaxKind.SwitchStatement: {
      type = ConstructType.SWITCH_STATEMENT;
      name = 'switch';
      break;
    }
    case ts.SyntaxKind.ArrayLiteralExpression: {
      type = ConstructType.ARRAY_LITERAL;
      name = '[]';
      break;
    }
    case ts.SyntaxKind.SpreadElement: {
      type = ConstructType.SPREAD_ELEMENT;
      name = '...';
      break;
    }
    case ts.SyntaxKind.BinaryExpression: {
      type = ConstructType.BINARY_EXPRESSION;
      name = body.substring(0, 40);
      break;
    }
    case ts.SyntaxKind.ConditionalExpression: {
      type = ConstructType.CONDITIONAL_EXPRESSION;
      name = '?:';
      break;
    }
    case ts.SyntaxKind.AsExpression: {
      type = ConstructType.AS_EXPRESSION;
      name = body.substring(0, 40);
      break;
    }
    case ts.SyntaxKind.TypeReference: {
      type = ConstructType.TYPE_REFERENCE;
      name = body;
      break;
    }
    // E6: Missing AST constructs
    case ts.SyntaxKind.Constructor: {
      const ctor = node as ts.ConstructorDeclaration;
      type = ConstructType.METHOD_DECLARATION;
      name = 'constructor';
      isDefinition = true;
      parameters = extractParameters(ctor.parameters);
      returnType = extractReturnType(ctor, checker);
      break;
    }
    case ts.SyntaxKind.EnumDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      const enumDecl = node as ts.EnumDeclaration;
      name = enumDecl.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.EnumMember: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      const enumMember = node as ts.EnumMember;
      name = enumMember.name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyDeclaration: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      const propDecl = node as ts.PropertyDeclaration;
      name = propDecl.name?.getText(sf) || '<property>';
      modifiers = extractModifiers(propDecl.modifiers);
      break;
    }
    case ts.SyntaxKind.JsxElement: {
      type = ConstructType.CALL_EXPRESSION;
      const jsx = node as ts.JsxElement;
      name = jsx.openingElement.tagName.getText(sf);
      break;
    }
    case ts.SyntaxKind.JsxSelfClosingElement: {
      type = ConstructType.CALL_EXPRESSION;
      const jsxSelf = node as ts.JsxSelfClosingElement;
      name = jsxSelf.tagName.getText(sf);
      break;
    }
    default:
      return null;
  }

  return {
    type,
    name,
    filePath,
    line,
    endLine,
    body,
    node,
    isDefinition,
    isCallSite,
    isAsync,
    modifiers,
    parent,
    children: [],
    parameters,
    returnType,
  };
}

function extractArrowFunctionName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return current.name.getText(current.getSourceFile());
    }
    if (ts.isPropertyAssignment(current)) {
      const propName = current.name.getText(current.getSourceFile());
      return propName;
    }
    if (ts.isPropertyDeclaration(current)) {
      return current.name?.getText(current.getSourceFile()) || '<arrow>';
    }
    current = current.parent;
  }
  return '<arrow>';
}

function extractModifiers(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): string[] {
  if (!modifiers) return [];
  return modifiers.map((m: ts.ModifierLike) => {
    switch (m.kind) {
      case ts.SyntaxKind.AsyncKeyword: return 'async';
      case ts.SyntaxKind.ExportKeyword: return 'export';
      case ts.SyntaxKind.DefaultKeyword: return 'default';
      case ts.SyntaxKind.DeclareKeyword: return 'declare';
      case ts.SyntaxKind.ConstKeyword: return 'const';
      case ts.SyntaxKind.StaticKeyword: return 'static';
      case ts.SyntaxKind.PrivateKeyword: return 'private';
      case ts.SyntaxKind.ProtectedKeyword: return 'protected';
      case ts.SyntaxKind.PublicKeyword: return 'public';
      case ts.SyntaxKind.ReadonlyKeyword: return 'readonly';
      default: return ts.SyntaxKind[m.kind];
    }
  });
}

function extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>): { name: string; type: string | null }[] {
  return params.map((p: ts.ParameterDeclaration) => ({
    name: p.name.getText(),
    type: p.type?.getText() || null,
  }));
}

function extractReturnType(decl: ts.SignatureDeclarationBase, checker: ts.TypeChecker | null): string | null {
  if (decl.type) return decl.type.getText();
  if (!checker) return null;
  try {
    const signature = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
    if (signature) {
      const retType = checker.getReturnTypeOfSignature(signature);
      return checker.typeToString(retType);
    }
  } catch (e: unknown) {       tridentLog('DEBUG', 'code-classifier', 'extractReturnType failed: ' + (e instanceof Error ? e.message : String(e))); return null; }
  return null;
}

function registerExport(construct: CodeConstruct, symbolTable: SymbolTable): void {
  const key = `${construct.name}@${construct.filePath}`;
  const existing = symbolTable.symbols.get(key);
  if (existing) {
    existing.isExported = true;
  }
}

function collectTsFiles(dir: string, projectRoot: string, depth: number = 0, maxDepth: number = 20): string[] {
  const files: string[] = [];
  if (depth > maxDepth) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        files.push(...collectTsFiles(fullPath, projectRoot, depth + 1, maxDepth));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  } catch (e: unknown) {     tridentLog('DEBUG', 'code-classifier', 'collectTsFiles failed: ' + (e instanceof Error ? e.message : String(e))); return files; }
  return files;
}


function resolveCallSiteWithChecker(
  checker: ts.TypeChecker,
  callExpr: ts.CallExpression | ts.NewExpression,
): { calleeName: string; calleeFile: string; calleeLine: number; resolved: boolean } | null {
  try {
    const symbol = checker.getSymbolAtLocation(callExpr.expression);
    if (symbol) {
      const decl = symbol.valueDeclaration || symbol.declarations?.[0];
      if (decl) {
        return {
          calleeName: symbol.name,
          calleeFile: decl.getSourceFile().fileName,
          calleeLine: ts.getLineAndCharacterOfPosition(decl.getSourceFile(), decl.getStart(decl.getSourceFile()) || decl.pos).line + 1,
          resolved: true,
        };
      }
    }
    return null;
  } catch (e: unknown) {
    tridentLog('DEBUG', 'code-classifier', 'call resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    tridentLog('ERROR', 'code-classifier', `call resolution failed: ${(e as Error).message}`);
    return null;
  }
}

function buildCallGraph(
  constructsByFile: Map<string, CodeConstruct[]>,
  checker: ts.TypeChecker | null,
): CallGraph {
  const entries = new Map<string, CallGraphEntry>();
  let totalCallSites = 0;
  let resolvedCallSites = 0;

  const allDefinitions = new Map<string, CodeConstruct>();
  if (!checker) {
    for (const [, constructs] of constructsByFile) {
      for (const c of constructs) {
        if (c.isDefinition && c.name && c.name !== '<anonymous>' && c.name !== '<arrow>' && c.name !== '<method>') {
          allDefinitions.set(c.name, c);
        }
      }
    }
  }

  for (const [filePath, constructs] of constructsByFile) {
    for (const construct of constructs) {
      // E15: Include NEW_EXPRESSION in call graph — resolve new ClassName() as call to ClassName.constructor
      if (construct.type !== ConstructType.CALL_EXPRESSION && construct.type !== ConstructType.NEW_EXPRESSION) continue;
      totalCallSites++;

      const callExpr = construct.node as ts.CallExpression | ts.NewExpression;
      let calleeName = '';
      let calleeFile = '';
      let calleeLine = 0;
      let calleeResolved = false;

      // E15: For NEW_EXPRESSION, resolve using class name for .constructor lookup
      const isNewExpr = construct.type === ConstructType.NEW_EXPRESSION;
      const resolvedCalleeName = isNewExpr ? `${extractCalleeName(construct.name)}.constructor` : '';

      if (checker) {
        const resolved = resolveCallSiteWithChecker(checker, callExpr);
        if (resolved) {
          calleeName = resolved.calleeName || construct.name;
          calleeFile = resolved.calleeFile;
          calleeLine = resolved.calleeLine;
          calleeResolved = true;
          resolvedCallSites++;
        }
      }

      if (!calleeResolved) {
        calleeName = isNewExpr ? resolvedCalleeName : extractCalleeName(construct.name);
        // E15: For new expressions, look up the class name
        const lookupName = isNewExpr ? extractCalleeName(construct.name) : calleeName;
        const def = allDefinitions.get(lookupName);
        if (def) {
          calleeFile = def.filePath;
          calleeLine = def.line;
          calleeResolved = true;
          resolvedCallSites++;
        }
      }

      if (!calleeName) {
        calleeName = construct.name;
      }

      const callSiteEntry: CallSiteEntry = {
        callSiteFile: filePath,
        callSiteLine: construct.line,
        hasAwait: hasAncestorType(construct, ConstructType.AWAIT_EXPRESSION),
        isInsideTry: hasAncestorType(construct, ConstructType.TRY_STATEMENT),
        isInsideCatch: hasAncestorType(construct, ConstructType.CATCH_CLAUSE),
        isInsideFinally: hasAncestorType(construct, ConstructType.FINALLY_BLOCK),
        returnValueUsed: isReturnValueUsed(construct),
        calleeResolved,
        calleeReturnsPromise: checker ? checkReturnsPromise(construct, checker) : false,
      };

      const graphKey = calleeResolved ? `${calleeFile}:${calleeLine}:${calleeName}` : `unresolved:${calleeName}`;
      const existing = entries.get(graphKey);
      if (existing) {
        existing.callSites.push(callSiteEntry);
      } else {
        entries.set(graphKey, {
          calleeFile,
          calleeLine,
          calleeName,
          callSites: [callSiteEntry],
        });
      }

      // E15: For NEW_EXPRESSION, also add a reference to the base class constructor
      if (isNewExpr && calleeResolved) {
        const baseClassName = extractCalleeName(construct.name);
        const baseGraphKey = `${calleeFile}:${calleeLine}:${baseClassName}`;
        if (!entries.has(baseGraphKey)) {
          entries.set(baseGraphKey, {
            calleeFile,
            calleeLine,
            calleeName: baseClassName,
            callSites: [callSiteEntry],
          });
        }
      }
    }
  }

  const coveragePercent = totalCallSites > 0 ? Math.round((resolvedCallSites / totalCallSites) * 100) : 0;

  return { entries, totalCallSites, resolvedCallSites, coveragePercent };
}

function extractCalleeName(expression: string): string {
  const parts = expression.split('.');
  const lastPart = parts[parts.length - 1];
  const match = lastPart.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return match ? match[1] : lastPart.substring(0, 30);
}

function hasAncestorType(construct: CodeConstruct, type: ConstructType): boolean {
  let current = construct.parent;
  while (current) {
    if (current.type === type) return true;
    current = current.parent;
  }
  return false;
}

function isReturnValueUsed(construct: CodeConstruct): boolean {
  const parent = construct.parent;
  if (!parent) return false;
  switch (parent.type) {
    case ConstructType.VARIABLE_DECLARATION:
    case ConstructType.RETURN_STATEMENT:
    case ConstructType.PROPERTY_ACCESS_EXPRESSION:
    case ConstructType.AWAIT_EXPRESSION:
      return true;
    default:
      break;
  }
  return hasAncestorType(construct, ConstructType.IF_STATEMENT) ||
         hasAncestorType(construct, ConstructType.WHILE_STATEMENT) ||
         hasAncestorType(construct, ConstructType.FOR_STATEMENT) ||
         hasAncestorType(construct, ConstructType.CONDITIONAL_EXPRESSION) ||
         hasAncestorType(construct, ConstructType.BINARY_EXPRESSION);
}

function checkReturnsPromise(construct: CodeConstruct, checker: ts.TypeChecker): boolean {
  if (!checker) return false;
  try {
    const callExpr = construct.node as ts.CallExpression;
    const symbol = checker.getSymbolAtLocation(callExpr.expression);
    if (!symbol) return false;
    const decl = symbol.valueDeclaration;
    if (!decl) return false;
    if (ts.isFunctionLike(decl)) {
      const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        const retStr = checker.typeToString(retType);
        return retStr.includes('Promise');
      }
    }
    return false;
  } catch (e: unknown) {     tridentLog('DEBUG', 'code-classifier', 'checkReturnsPromise failed: ' + (e instanceof Error ? e.message : String(e))); return false; }
}
