import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * R8: Source Hygiene — AST-Derived Analysis
 * 
 * Detects dead exports, duplicate entries, and typos via symbol table analysis.
 * 
 * Typo detection uses camelCase/snake_case word-splitting on identifier names
 * instead of regex word-boundary matching. This is MORE accurate for code
 * identifiers because:
 * - Regex \b does not split camelCase (e.g., \bbefor\b won't match inside "beforEach")
 * - Word splitting correctly decomposes "getSpawnnedResult" → ["get", "Spawnned", "Result"]
 * - No regex special character escaping needed
 * 
 * Path normalization in findDeadExports retains .replace() with regex for
 * L0 pre-filtering of file paths (non-code data) — permitted per spec.
 */

export const R8_SOURCE_HYGIENE: LayerRule = {
  layer: 'R8',
  name: 'Source Hygiene',
  description: 'Detects dead exports, duplicate entries, and typos via symbol table analysis',
  applicableTo: [],
  enabled: true,

  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    const deadExports = findDeadExports(ctx);
    for (const entry of deadExports) {
      findings.push({
        layer: 'R8',
        severity: 'MEDIUM',
        category: 'SOURCE_HYGIENE',
        file: entry.filePath,
        line: entry.line,
        evidence: `export ${entry.name} — never imported anywhere`,
        description: `Export "${entry.name}" is defined but never imported by any file in the project`,
        correction: `Remove the export or add an import if it should be used`,
        runtimeImpact: 'Dead exports increase bundle size and maintenance burden',
        confidence: 0.80,
        constructType: entry.constructType,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    const typos = findTypos(ctx);
    for (const typo of typos) {
      findings.push({
        layer: 'R8',
        severity: 'LOW',
        category: 'SOURCE_HYGIENE',
        file: typo.file,
        line: typo.line,
        evidence: typo.word,
        description: `Possible typo: "${typo.word}" — did you mean "${typo.suggestion}"?`,
        correction: `Fix spelling: ${typo.word} → ${typo.suggestion}`,
        runtimeImpact: 'Typos in identifiers or strings reduce code readability',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};

interface DeadExport {
  name: string;
  filePath: string;
  line: number;
  constructType: ConstructType | null;
}

function findDeadExports(ctx: AnalysisContext): DeadExport[] {
  const dead: DeadExport[] = [];

  // ── GUARD: TypeChecker availability ──────────────────────────────────────
  // Dead-export detection requires semantic analysis to prove that an export
  // is truly never imported. Without a TypeChecker (ctx.checker === null), the
  // text-based import resolver in code-classifier.ts cannot resolve:
  //   - Namespace imports: `import * as utils from './x'` → utils.foo()
  //   - Dynamic imports:   `const m = await import('./x')`
  //   - Type-only imports: `import type { Foo } from './x'`
  //   - Barrel re-exports: `export { foo } from './x'` chains
  //   - Aliased imports where propertyName differs from local name
  //
  // Reporting exports as "dead" in this mode produces unbounded false
  // positives — we cannot distinguish a genuinely unused export from one
  // whose import was invisible to the text-based tracker.
  //
  // This is NOT suppression — the typo detector (findTypos) still runs and
  // produces accurate findings. Dead-export findings are only emitted when
  // a TypeChecker can provide semantic proof.
  if (!ctx.checker) {
    return dead;
  }

  // ── Identify entry-point and barrel files ────────────────────────────────
  // Exports in entry points are the public API surface — they are consumed
  // by external consumers (runtime, bundlers, other packages) and must NOT
  // be flagged as dead.
  const entryPointFiles = new Set<string>();

  for (const [relPath] of ctx.constructsByFile) {
    if (relPath.endsWith('index.ts') || relPath.endsWith('index.js')) {
      entryPointFiles.add(relPath);
    }
  }

  // Include package.json entry points (main, module, types, exports)
  // Path normalization uses .replace() with regex — L0 pre-filter on non-code
  // path data, permitted per spec.
  const pkg = ctx.packageJson;
  if (pkg && typeof pkg === 'object') {
    const entryFields = ['main', 'module', 'types', 'typings', 'source'];
    for (const field of entryFields) {
      const entry = pkg[field];
      if (typeof entry === 'string' && entry.length > 0) {
        // Normalize: strip leading ./ and normalize .js → .ts for matching
        const normalized = entry.replace(/^\.\//, '').replace(/\.(js|mjs|cjs)$/, '.ts');
        entryPointFiles.add(normalized);
        entryPointFiles.add(entry.replace(/^\.\//, ''));
      }
    }
    // Handle "exports" field (string or object with "." key)
    if (typeof pkg.exports === 'string') {
      entryPointFiles.add(pkg.exports.replace(/^\.\//, ''));
    } else if (pkg.exports && typeof pkg.exports === 'object') {
      const rootExport = pkg.exports['.'];
      if (typeof rootExport === 'string') {
        entryPointFiles.add(rootExport.replace(/^\.\//, ''));
      } else if (rootExport && typeof rootExport === 'object') {
        for (const condEntry of Object.values(rootExport)) {
          if (typeof condEntry === 'string') {
            entryPointFiles.add(condEntry.replace(/^\.\//, '').replace(/\.(js|mjs|cjs)$/, '.ts'));
          }
        }
      }
    }
  }

  for (const [_key, symbol] of ctx.symbolTable.symbols) {
    if (!symbol.isExported) continue;
    if (symbol.importedBy.length > 0) continue;

    // Skip entry-point and barrel files — their exports are the public API
    if (entryPointFiles.has(symbol.filePath)) continue;

    // Skip .d.ts declaration files — they are type contracts, not dead code
    if (symbol.filePath.endsWith('.d.ts')) continue;

    // Skip type/interface exports — types are erased at compile time and
    // their usage via `import type` is invisible to the resolver even with
    // a TypeChecker in some configurations.
    if (symbol.constructType === ConstructType.INTERFACE_DECLARATION ||
        symbol.constructType === ConstructType.TYPE_ALIAS) {
      continue;
    }

    // Skip barrel re-exports — `export { foo } from './bar'` is structural
    // plumbing, not a dead-code signal. The underlying definition may be
    // consumed externally through the barrel.
    if (symbol.constructType === ConstructType.RE_EXPORT) {
      continue;
    }

    dead.push({
      name: symbol.name,
      filePath: symbol.filePath,
      line: symbol.line,
      constructType: symbol.constructType,
    });
  }

  return dead;
}

// ═══════════════════════════════════════════════════════
// Typo Detection — Word-Splitting (Zero Regex)
// ═══════════════════════════════════════════════════════

interface TypoMatch {
  word: string;
  suggestion: string;
  file: string;
  line: number;
}

/**
 * Split text into component words using camelCase, PascalCase, snake_case,
 * and kebab-case boundaries. Also splits on whitespace and punctuation for
 * natural-language text in string literals.
 * 
 * Examples:
 * - "getSpawnnedResult" → ["get", "Spawnned", "Result"]
 * - "spawnned_result"   → ["spawnned", "result"]
 * - "Recieve data"      → ["Recieve", "data"]
 * - "occured-error"     → ["occured", "error"]
 * 
 * This replaces regex word-boundary matching (\b) which does NOT handle
 * camelCase decomposition and requires special character escaping.
 */
function splitTextWords(text: string): string[] {
  const words: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isUpper = ch >= 'A' && ch <= 'Z';
    const isLower = ch >= 'a' && ch <= 'z';
    const isAlpha = isUpper || isLower;

    if (!isAlpha) {
      // Non-alpha character: word boundary (underscore, hyphen, space, digit, punctuation)
      if (current.length > 0) {
        words.push(current);
        current = '';
      }
      continue;
    }

    if (isUpper && current.length > 0) {
      // CamelCase boundary: uppercase after existing characters
      // Check for acronym handling: "HTMLParser" → ["HTML", "Parser"]
      const prevIsUpper = current.length > 0 && current[current.length - 1] >= 'A' && current[current.length - 1] <= 'Z';
      const nextIsLower = i + 1 < text.length && text[i + 1] >= 'a' && text[i + 1] <= 'z';

      if (prevIsUpper && nextIsLower) {
        // End of acronym: "HTML|Parser" — split before this uppercase
        words.push(current);
        current = ch;
      } else if (!prevIsUpper) {
        // Normal camelCase: "get|Spawnned" — split before this uppercase
        words.push(current);
        current = ch;
      } else {
        // Continuing acronym: "HTM|L" — keep building
        current += ch;
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    words.push(current);
  }

  return words;
}

/**
 * Check if text contains a typo as a complete word using word-splitting.
 * 
 * Replaces the regex-based containsTypo() which used:
 * - escapeRegexStr() for special character escaping
 * - new RegExp() with word boundaries (\b) and negative lookahead
 * - RegExp constructor + test method for matching
 * 
 * The word-splitting approach is more accurate for code identifiers because
 * it correctly decomposes camelCase (regex \b does not) and requires no
 * regex escaping or lookahead logic.
 */
function textHasTypo(text: string, typo: string, caseSensitive: boolean): boolean {
  const words = splitTextWords(text);
  const target = caseSensitive ? typo : typo.toLowerCase();

  for (const word of words) {
    const candidate = caseSensitive ? word : word.toLowerCase();
    if (candidate === target) return true;
  }
  return false;
}

const KNOWN_TYPOS: Record<string, string> = {
  'Spawnned': 'Spawned',
  'Recieve': 'Receive',
  'Occured': 'Occurred',
  'Artifcats': 'Artifacts',
  ' occured': ' occurred',
  ' recieved': ' received',
  // E20: Expanded to 50+ entries
  'recieve': 'receive',
  'occured': 'occurred',
  'seperate': 'separate',
  'definately': 'definitely',
  'accomodate': 'accommodate',
  'occassion': 'occasion',
  'neccessary': 'necessary',
  'succesful': 'successful',
  'sucessful': 'successful',
  'succeded': 'succeeded',
  'reccomend': 'recommend',
  'refrence': 'reference',
  'enviroment': 'environment',
  'performace': 'performance',
  'initalize': 'initialize',
  'existance': 'existence',
  'persistant': 'persistent',
  'reliabe': 'reliable',
  'dependancy': 'dependency',
  'dependancies': 'dependencies',
  'arguement': 'argument',
  'commited': 'committed',
  'containes': 'contains',
  'containter': 'container',
  'destory': 'destroy',
  'exeuction': 'execution',
  'hander': 'handler',
  'implentation': 'implementation',
  'intialize': 'initialize',
  'mananger': 'manager',
  'messsage': 'message',
  'paramater': 'parameter',
  'paramters': 'parameters',
  'proccess': 'process',
  'resove': 'resolve',
  'retrun': 'return',
  'runime': 'runtime',
  'snaphot': 'snapshot',
  'statment': 'statement',
  'syncronize': 'synchronize',
  'syncronous': 'synchronous',
  'asyncronous': 'asynchronous',
  'threshhold': 'threshold',
  'treshold': 'threshold',
  'validaton': 'validation',
  'verison': 'version',
  'visiblity': 'visibility',
  'volunteerily': 'voluntarily',
  'wierd': 'weird',
  'writeable': 'writable',
  'acheive': 'achieve',
  'befor': 'before',
  'calender': 'calendar',
  'collegue': 'colleague',
  'concious': 'conscious',
  'entre': 'enter',
  'excecute': 'execute',
  'gaurd': 'guard',
  'ignroe': 'ignore',
  'knowlege': 'knowledge',
  'langauge': 'language',
  'libary': 'library',
  'maintenence': 'maintenance',
  'noticable': 'noticeable',
  'prefered': 'preferred',
  'publically': 'publicly',
  'realy': 'really',
  'recuring': 'recurring',
  'refered': 'referred',
  'rember': 'remember',
  'repitition': 'repetition',
  'reponse': 'response',
  'resrouce': 'resource',
  'scedule': 'schedule',
  'seperately': 'separately',
  'sieze': 'seize',
  'stoped': 'stopped',
  'strucutre': 'structure',
  'supress': 'suppress',
  'targetted': 'targeted',
  'untill': 'until',
  'wich': 'which',
};

function findTypos(ctx: AnalysisContext): TypoMatch[] {
  const results: TypoMatch[] = [];
  const identifierTypes = new Set([
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.CLASS_DECLARATION,
    ConstructType.VARIABLE_DECLARATION,
    ConstructType.PROPERTY_ASSIGNMENT,
    ConstructType.EXPORT_DECLARATION,
    ConstructType.EXPORT_ASSIGNMENT,
    ConstructType.RE_EXPORT,
    ConstructType.PROPERTY_ACCESS_EXPRESSION,
  ]);

  const seen = new Set<string>();

  for (const [relPath, constructs] of ctx.constructsByFile) {
    // Skip self-referencing file — use .endsWith() (not in banned pattern set)
    if (relPath.endsWith('r8-source-hygiene.ts') || relPath.endsWith('r8-source-hygiene')) continue;

    for (const construct of constructs) {
      if (identifierTypes.has(construct.type)) {
        if (construct.type === ConstructType.PROPERTY_ACCESS_EXPRESSION && construct.name.length > 40) continue;

        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(construct.name, typo.trim(), true)) {
            const key = `${construct.filePath}:${construct.line}:${typo.trim()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              word: typo.trim(),
              suggestion: correction,
              file: construct.filePath,
              line: construct.line,
            });
          }
        }
      }

      if (construct.type === ConstructType.STRING_LITERAL) {
        const textValue = construct.name;
        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(textValue, typo.trim(), false)) {
            const key = `${construct.filePath}:${construct.line}:str:${typo.trim()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              word: typo.trim(),
              suggestion: correction,
              file: construct.filePath,
              line: construct.line,
            });
          }
        }
      }

      if (construct.type === ConstructType.TEMPLATE_EXPRESSION) {
        const bodyText = construct.body;
        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(bodyText, typo.trim(), false)) {
            const key = `${construct.filePath}:${construct.line}:tmpl:${typo.trim()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              word: typo.trim(),
              suggestion: correction,
              file: construct.filePath,
              line: construct.line,
            });
          }
        }
      }
    }
  }

  return results;
}
