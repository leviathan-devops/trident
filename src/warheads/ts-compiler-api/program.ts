import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { tridentLog } from '../../utils.js';

export interface AnalyzerResult {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  rule: string;
  confidence: number;
}

export class TsProgramWrapper {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: ts.SourceFile[] = [];
  private targetPath: string = '';

  createProgram(targetPath: string, compilerOptions?: ts.CompilerOptions): boolean {
    this.targetPath = targetPath;
    try {
      const configPath = ts.findConfigFile(targetPath, ts.sys.fileExists, 'tsconfig.json');
      let options: ts.CompilerOptions = compilerOptions || {};
      
      if (configPath) {
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(configPath),
          options
        );
        options = parsedConfig.options;
      }

      // Find .ts files recursively (skip node_modules, dist)
      const files: string[] = [];
      const walkDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) walkDir(fullPath);
            else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(fullPath);
          }
        } catch (e) { /* skip unreadable dirs */ }
      };
      walkDir(targetPath);

      if (files.length === 0) {
        tridentLog('WARN', 'ts-compiler-api', `No .ts files found in ${targetPath}`);
        return false;
      }

      this.program = ts.createProgram(files, options);
      this.checker = this.program.getTypeChecker();
      this.sourceFiles = files.map(f => {
        const sf = this.program!.getSourceFile(f);
        if (sf) return sf;
        return ts.createSourceFile(f, fs.readFileSync(f, 'utf-8'), ts.ScriptTarget.Latest, true);
      });
      
      tridentLog('INFO', 'ts-compiler-api', `Created ts.Program with ${files.length} files`);
      return true;
    } catch (e) {
      tridentLog('ERROR', 'ts-compiler-api', `Failed to create ts.Program: ${(e as Error).message || e}`);
      return false;
    }
  }

  getProgram(): ts.Program | null { return this.program; }
  getChecker(): ts.TypeChecker | null { return this.checker; }

  /** Get type at a specific position in a file */
  getTypeAtLocation(filePath: string, line: number, offset: number): string | null {
    if (!this.checker) return null;
    const sf = this.sourceFiles.find(f => f.fileName.endsWith(path.basename(filePath)));
    if (!sf) return null;
    const pos = sf.getPositionOfLineAndCharacter(line, offset);
    const node = findNodeAtPosition(sf, pos);
    if (!node) return null;
    try {
      const type = this.checker.getTypeAtLocation(node);
      return this.checker.typeToString(type);
    } catch { return null; }
  }

  /** Get symbol at a specific position */
  getSymbolAtLocation(filePath: string, line: number, offset: number): string | null {
    if (!this.checker) return null;
    const sf = this.sourceFiles.find(f => f.fileName.endsWith(path.basename(filePath)));
    if (!sf) return null;
    const pos = sf.getPositionOfLineAndCharacter(line, offset);
    const node = findNodeAtPosition(sf, pos);
    if (!node) return null;
    try {
      const symbol = this.checker.getSymbolAtLocation(node);
      return symbol ? symbol.getName() : null;
    } catch { return null; }
  }

  /** Analyze circular dependencies */
  analyzeCircularDeps(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    if (!this.program) return results;
    const seen = new Set<string>();
    const visit = (file: string, chain: string[], visited: Set<string>) => {
      if (chain.includes(file)) {
        const cycleStart = chain.indexOf(file);
        const cycle = chain.slice(cycleStart).join(' → ');
        results.push({
          file, line: 1, severity: 'high',
          message: `Circular dependency: ${cycle}`,
          rule: 'CIRCULAR_DEP', confidence: 0.85,
        });
        return;
      }
      if (visited.has(file)) return;
      visited.add(file);
      // Simple import scanning
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const importRe = /from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRe.exec(content)) !== null) {
          const resolved = resolveModulePath(match[1], path.dirname(file));
          if (resolved && resolved.startsWith(this.targetPath)) {
            visit(resolved, [...chain, file], visited);
          }
        }
      } catch { /* skip unreadable */ }
    };
    this.sourceFiles.forEach(sf => visit(sf.fileName, [], new Set()));
    return results;
  }

  /** Measure type coverage */
  measureTypeCoverage(): { typed: number; untyped: number; coverage: number } {
    let typed = 0, untyped = 0;
    if (!this.checker) return { typed: 0, untyped: 0, coverage: 0 };
    this.sourceFiles.forEach(sf => {
      ts.forEachChild(sf, function visit(node) {
        if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) {
          if (node.type) typed++; else untyped++;
        }
        ts.forEachChild(node, visit);
      });
    });
    const total = typed + untyped;
    return { typed, untyped, coverage: total > 0 ? typed / total : 0 };
  }

  /** Detect dead exports */
  detectDeadExports(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    if (!this.checker) return results;
    this.sourceFiles.forEach(sf => {
      ts.forEachChild(sf, function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          // Check if function is exported but never imported elsewhere
          const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
          if (isExported && !node.body) {
            // Declaration without body = likely dead
          }
        }
        ts.forEachChild(node, visit);
      });
    });
    return results;
  }

  /** Detect empty catch blocks */
  detectEmptyCatches(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach(sf => {
      const lines = sf.text.split('\n');
      const emptyCatchRe = /catch\s*\([^)]*\)\s*\{\s*\}/g;
      for (let i = 0; i < lines.length; i++) {
        if (emptyCatchRe.test(lines[i])) {
          results.push({
            file: sf.fileName, line: i + 1, severity: 'critical',
            message: 'Empty catch block — error silently swallowed',
            rule: 'P3_EMPTY_CATCH', confidence: 0.95,
          });
        }
      }
    });
    return results;
  }

  /** Check for hardcoded paths */
  detectHardcodedPaths(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach(sf => {
      const lines = sf.text.split('\n');
      const hardcodedRe = /['"](?:\/home\/|\/root\/|\/var\/|\/etc\/)/;
      for (let i = 0; i < lines.length; i++) {
        if (hardcodedRe.test(lines[i])) {
          results.push({
            file: sf.fileName, line: i + 1, severity: 'high',
            message: 'Hardcoded absolute path — use path.join(os.homedir(), ...) instead',
            rule: 'P7_HARDCODED_PATH', confidence: 0.90,
          });
        }
      }
    });
    return results;
  }

  /** Detect fire-and-forget promises */
  detectFireAndForget(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach(sf => {
      const lines = sf.text.split('\n');
      const ffRe = /\.then\s*\([^)]*\)\s*;\s*$/;
      for (let i = 0; i < lines.length; i++) {
        if (ffRe.test(lines[i])) {
          const hasCatch = lines[i + 1]?.includes('.catch');
          if (!hasCatch) {
            results.push({
              file: sf.fileName, line: i + 1, severity: 'high',
              message: 'Fire-and-forget promise — no .catch() error handling',
              rule: 'P9_FIRE_FORGET', confidence: 0.85,
            });
          }
        }
      }
    });
    return results;
  }

  /** Run all analyzers */
  runAll(): { results: AnalyzerResult[]; score: number } {
    let allResults: AnalyzerResult[] = [];
    allResults.push(...this.detectEmptyCatches());
    allResults.push(...this.detectHardcodedPaths());
    allResults.push(...this.detectFireAndForget());
    allResults.push(...this.analyzeCircularDeps());
    
    let penalty = 0;
    for (const r of allResults) {
      const weights: Record<string, number> = { critical: 25, high: 10, medium: 5, low: 2 };
      penalty += weights[r.severity] || 0;
    }
    const score = Math.max(0, 100 - penalty);
    
    tridentLog('INFO', 'ts-compiler-api', `Analysis complete: ${allResults.length} findings, score=${score}`);
    return { results: allResults, score };
  }
}

function findNodeAtPosition(sourceFile: ts.SourceFile, pos: number): ts.Node | null {
  let result: ts.Node | null = null;
  function visit(node: ts.Node) {
    if (node.getStart() <= pos && pos < node.getEnd()) {
      result = node;
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);
  return result;
}

function resolveModulePath(moduleName: string, containingDir: string): string | null {
  if (!moduleName.startsWith('.')) return null;
  const extensions = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];
  const base = path.resolve(containingDir, moduleName);
  for (const ext of extensions) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}
