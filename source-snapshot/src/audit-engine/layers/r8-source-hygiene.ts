import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

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
  const barrelFiles = new Set<string>();

  for (const [relPath, constructs] of ctx.constructsByFile) {
    if (relPath.endsWith('index.ts') || relPath.endsWith('index.js')) {
      barrelFiles.add(relPath);
    }
  }

  for (const [key, symbol] of ctx.symbolTable.symbols) {
    if (!symbol.isExported) continue;
    if (symbol.importedBy.length > 0) continue;

    if (barrelFiles.has(symbol.filePath)) continue;

    if (symbol.constructType === ConstructType.INTERFACE_DECLARATION ||
        symbol.constructType === ConstructType.TYPE_ALIAS) {
      if (symbol.name.match(/^[A-Z]/)) continue;
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

interface TypoMatch {
  word: string;
  suggestion: string;
  file: string;
  line: number;
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
    if (relPath.includes('r8-source-hygiene')) continue;

    for (const construct of constructs) {
      if (identifierTypes.has(construct.type)) {
        if (construct.type === ConstructType.PROPERTY_ACCESS_EXPRESSION && construct.name.length > 40) continue;

        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (construct.name.includes(typo.trim())) {
            const key = `${construct.filePath}:${construct.line}:${typo}`;
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
          if (textValue.toLowerCase().includes(typo.trim().toLowerCase())) {
            const key = `${construct.filePath}:${construct.line}:str:${typo}`;
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
          if (bodyText.toLowerCase().includes(typo.trim().toLowerCase())) {
            const key = `${construct.filePath}:${construct.line}:tmpl:${typo}`;
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
