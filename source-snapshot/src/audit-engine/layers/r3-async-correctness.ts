import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R3_ASYNC_CORRECTNESS: LayerRule = {
  layer: 'R3',
  name: 'Async Correctness',
  description: 'Detects async/await patterns that silently fail at runtime using call graph analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireAsync: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    for (const [key, entry] of ctx.callGraph.entries) {
      if (entry.calleeFile !== construct.filePath) continue;
      if (Math.abs(entry.calleeLine - construct.line) > 5) continue;

      for (const callSite of entry.callSites) {
        if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.isInsideTry) {
          findings.push({
            layer: 'R3',
            severity: 'HIGH',
            category: 'ASYNC_CORRECTNESS',
            file: callSite.callSiteFile,
            line: callSite.callSiteLine,
            evidence: `${entry.calleeName}() returns Promise but is called without await outside try`,
            description: `Async function '${entry.calleeName}' returns Promise but is called without await — caller continues before completion`,
            correction: `Add 'await' before ${entry.calleeName}() or handle the returned Promise with .then().catch()`,
            runtimeImpact: `Caller continues execution before ${entry.calleeName}() completes — may process stale state, set flags too early`,
            confidence: callSite.calleeResolved ? 0.90 : 0.70,
            constructType: construct.type,
            callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
            evidenceSuppressed: false,
          });
        }
      }
    }

    const body = construct.body;
    const emptyThenCatch = /\.then\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/g;
    let match;
    while ((match = emptyThenCatch.exec(body)) !== null) {
      findings.push({
        layer: 'R3',
        severity: 'MEDIUM',
        category: 'ASYNC_CORRECTNESS',
        file: construct.filePath,
        line: construct.line,
        evidence: match[0],
        description: 'Empty .then() callback — async result silently discarded',
        correction: 'Handle the async result properly — await it or add meaningful .then()/.catch() handlers',
        runtimeImpact: 'Async result silently discarded — errors never caught, completion never verified',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    const emptyCatch = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/g;
    while ((match = emptyCatch.exec(body)) !== null) {
      findings.push({
        layer: 'R3',
        severity: 'MEDIUM',
        category: 'ASYNC_CORRECTNESS',
        file: construct.filePath,
        line: construct.line,
        evidence: match[0],
        description: 'Empty .catch() callback — errors silently discarded',
        correction: 'Add error handling in .catch() or use try/catch with await',
        runtimeImpact: 'Rejection silently consumed — error evidence lost',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // E3: Fix Promise.all check — use Boolean(result) not Boolean.toString()
    // Also check for fire-and-forget patterns: callers not awaiting AND internal fire-and-forget
    if (body.includes('Promise.all')) {
      const hasAwaitPromiseAll = body.includes('await Promise.all');
      const promiseAllIdx = body.indexOf('Promise.all');
      const afterPromiseAll = body.substring(promiseAllIdx);
      const hasCatchOnPromiseAll = afterPromiseAll.includes('.catch');
      if (!hasAwaitPromiseAll && !hasCatchOnPromiseAll) {
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Promise.all') && !lines[i].includes('await')) {
            const lineAfterIdx = lines[i].indexOf('Promise.all');
            const lineAfter = lines[i].substring(lineAfterIdx);
            if (!lineAfter.includes('.catch')) {
              findings.push({
                layer: 'R3',
                severity: 'HIGH',
                category: 'ASYNC_CORRECTNESS',
                file: construct.filePath,
                line: construct.line + i,
                evidence: lines[i].trim(),
                description: 'Promise.all without await or .catch() — unhandled rejections will crash silently',
                correction: 'Add await before Promise.all() or chain .catch() to handle errors',
                runtimeImpact: 'If any promise rejects, the rejection is unhandled — Node.js will terminate the process',
                confidence: 0.90,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
      }
    }

    // E3: Detect internal fire-and-forget — async calls within the function body that are not awaited
    for (const [key, entry] of ctx.callGraph.entries) {
      for (const callSite of entry.callSites) {
        if (callSite.callSiteFile !== construct.filePath) continue;
        const lineDiff = Math.abs(callSite.callSiteLine - construct.line);
        if (lineDiff > 0 && lineDiff <= construct.endLine - construct.line) {
          if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.returnValueUsed && !callSite.isInsideTry) {
            const alreadyReported = findings.some((f: AuditFinding) =>
              f.file === callSite.callSiteFile && f.line === callSite.callSiteLine && f.category === 'ASYNC_CORRECTNESS'
            );
            if (!alreadyReported) {
              findings.push({
                layer: 'R3',
                severity: 'MEDIUM',
                category: 'ASYNC_CORRECTNESS',
                file: callSite.callSiteFile,
                line: callSite.callSiteLine,
                evidence: `${entry.calleeName}() returns Promise but result is discarded`,
                description: `Async call '${entry.calleeName}' result not used — fire-and-forget pattern`,
                correction: `Await the result or handle with .then().catch()`,
                runtimeImpact: 'Async operation may fail silently — no error handling, no completion check',
                confidence: 0.75,
                constructType: construct.type,
                callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
                evidenceSuppressed: false,
              });
            }
          }
        }
      }
    }

    return findings;
  },
};
