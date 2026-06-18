# FULL OVERHAUL PLAN — Knowledge Warhead System (Correct Architecture)

## THE CORE PROBLEM SUMMARY

The heuristic scorer replaced NLP. Extractive summarization replaced generative (which is fine since cached after first call). All KB/CS files merged into one blob when each needs its OWN T1 injectable. DP backward-mapping when forward-mapping required. Algorithmic Systems directory not loaded. Every one of these is a derailment.

---

## CHANGE 1: ContextSynthesisEngine — NLP Pipeline Only, No Heuristics

### Current (theatrical garbage):
```
score(contexts) {
  // 8 heuristic factors I invented
  if (section.content.includes('\`\`\`')) score += 0.2
  if (/Law\s+\d+|Rule\s+\d+|Principle\s+\d+|Iron\s+Law/i.test(section.content)) score += 0.15
  // ... MORE HARDCODED RULES
}
```

### Required:
```
import { extractPrinciplesFromText } from '../nlp/principle-extractor.js'
import { StreamingIntentParser } from '../nlp/streaming-buffer.js'

score(contexts: CollectedContext[]): ScoredItem[] {
  for (const ctx of contexts) {
    for (const section of ctx.sections) {
      // USE THE ACTUAL NLP PIPELINE — NOT HEURISTICS
      const principles = extractPrinciplesFromText(section.content)
      const parser = new StreamingIntentParser()
      const sentences = parser.processChunk(section.content)
      
      // Score based on NLP confidence, not regex
      const nlpScore = principles.length > 0 
        ? principles.reduce((a, p) => a + p.confidence, 0) / principles.length
        : 0
      
      scored.push({
        source: ctx.source,
        principle: section.heading,
        relevanceScore: nlpScore,
        content: section.content,
        sentenceCount: sentences.length,
        principleCount: principles.length,
      })
    }
  }
}
```

What changes: `extractPrinciplesFromText()` already exists in `src/nlp/principle-extractor.ts`. It uses wink-nlp tokenizer with 10+ attributes per token. It identifies semantic principles from text. The ONLY thing missing was wiring it into the engine. `StreamingIntentParser` from `src/nlp/streaming-buffer.ts` already handles sentence boundary detection. Both are real NLP.

---

## CHANGE 2: Per-File T1 Injectables — Each File Gets Its Own Section

### Current (one merged blob):
```
buildKnowledgeT1() collects ALL kb/* + cs/* into ONE Map
engine.synthesize(kbEntries) processes ALL files together
Outputs ONE [T1 WARHEAD: KNOWLEDGE] section
```

### Required: Each file produces ITS OWN [T1: FILENAME] section at 250-400 tokens
```
function buildKnowledgeT1(): string {
  const t2 = ensureT2Cache()
  const sections: string[] = []
  const engine = new ContextSynthesisEngine()

  // Process EACH kb/* file individually → OWN T1 section
  for (const [key, content] of t2.entries()) {
    if (!key.startsWith('kb/') && !key.startsWith('cs/') && !key.startsWith('as/')) continue
    
    const singleEntry = new Map([[key, content]])
    const result = engine.synthesize(singleEntry) // ONE FILE ONLY
    
    if (result.sections.length > 0) {
      sections.push(result.sections[0]) // [T1: Domain] ... (250-400 tokens)
    }
  }

  return `[T1 WARHEAD: KNOWLEDGE]\n${sections.join('\n\n')}`
}
```

Token math: 14+ files (KB + CS + AS) at 250-400 tokens each = 3,500-5,600+ tokens for knowledge alone.

---

## CHANGE 3: Load Algorithmic Systems Directory + New Common Sense Files

### Current T2 cache loads:
```
KNOWLEDGE_LIBRARY/Typescript Deep Knowledge/  (9 files → kb/*)
KNOWLEDGE_LIBRARY/Common_Sense/               (5 files → cs/*)
```

### Required:
```
KNOWLEDGE_LIBRARY/Typescript Deep Knowledge/  (9 files → kb/*)
KNOWLEDGE_LIBRARY/Common_Sense/               (5+N files → cs/*)
KNOWLEDGE_LIBRARY/Algorithmic Systems/        (N files → as/*)
```

In ensureT2Cache(), after Common_Sense block:
```
  // Load Algorithmic Systems knowledge directory
  try {
    const homeDir = process.env.HOME || '/root'
    const asDir = path.join(homeDir, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY', 'Algorithmic Systems')
    if (fs.existsSync(asDir)) {
      const asFiles = fs.readdirSync(asDir).filter((f: string) => f.endsWith('.md'))
      for (const asFile of asFiles) {
        try {
          const content = fs.readFileSync(path.join(asDir, asFile), 'utf-8')
          _t2Cache.set('as/' + asFile, content)
        } catch (e: unknown) {
          tridentLog('WARN', 'warhead-synthesizer', 'AS load failed for ' + asFile + ': ' + (e instanceof Error ? e.message : String(e)))
        }
      }
      tridentLog('INFO', 'warhead-synthesizer', 'Algorithmic Systems: ' + asFiles.length + ' files loaded')
    }
  } catch (e: unknown) {
    tridentLog('WARN', 'warhead-synthesizer', 'AS dir scan failed: ' + (e instanceof Error ? e.message : String(e)))
  }
```

---

## CHANGE 4: Dedicated Common Sense Warhead + Distilled Knowledge Warhead

Already created (P1-C, P1-D). Need init() methods updated to ALSO probe for as/* entries in T2 cache. Add k.startsWith('as/') to the filter.

---

## CHANGE 5: DP Layer 1/2/3 — Full Forward-Mapping Rewrite

### Current: generateLayer1Prompt() takes EXISTING project path, runs auto-discovery, generates summary of what's there. BACKWARD mapping.

### Required: DP Layer 1 takes MINIMAL IDEA (5 tokens: "build a GUI for X") and GENERATES comprehensive build prompt.

Three separate generators:
- generateLayer1Prompt(idea: string) → 400-600 line generative prompt. NO auto-discovery data. User copy-pastes into any chat.
- generateLayer2BuildSpec(layer1Prompt: string) → 500-1000 line phased implementation with ACTUAL TypeScript code, test cases, verification commands
- generateLayer3ContextLibrary(buildSpec: string) → 9+ files, 5000+ lines, reference-grade documentation

Tool handler change: when targetPath is provided → auto-discovery ENRICHMENT. When ONLY requirements → pure forward generation.

---

## CHANGE 6: Generative T1 Synthesis (LLM Call on First Init)

### Current: T1 synthesis is extractive (selects existing sentences).

### Required: On FIRST synthesizeT1Injectables() call, for EACH knowledge file, call agent's own LLM to generate 250-400 token T1 injectable. Then cache.

The agent's own LLM (the same model powering the conversation) is used for generation — not an external API. The call pattern:
```
async function generateT1Section(fileName: string, rawContent: string): Promise<string> {
  // Use the same LLM that's running the agent
  // Prompt: "Summarize this engineering knowledge into 250-400 tokens of dense, 
  // actionable principles. Output ONLY the summary, no preamble."
  const summary = await callLLM({prompt: summarizePrompt, content: rawContent})
  return `[T1: ${fileName}] ${summary}`
}
```

Fires ONCE per session (~14-20 LLM calls, negligible cost). All subsequent calls use cached version. LLM calls happen on first API call after plugin load, not during user interaction.

---

## CHANGE 7: Token Target — 11,000 Total Per API Call

### Current: ~2,200 tokens. Target: ~11,000 tokens.

| Component | Current Tokens | Target Tokens | Delta |
|-----------|---------------|---------------|-------|
| T0 sections (14 warheads, live every call) | 325 | 325 | 0 |
| Identity Binding | 75 | 200 | +125 |
| P1-P10 Principles | 150 | 300 | +150 |
| Layer Engine | 125 | 200 | +75 |
| 17-Layer Audit Engine | 125 | 300 | +175 |
| TS Compiler API | 38 | 100 | +62 |
| Knowledge per-file T1 (14+ files × 250-400) | 400 (merged blob) | 3,500-5,600 | +3,100-5,200 |
| Algorithmic Systems per-file (N files × 250-400) | 0 | 1,000-3,000 | +1,000-3,000 |
| Explore Protocol | 75 | 150 | +75 |
| Compact Identity | 50 | 100 | +50 |
| NLP Pipeline | 75 | 200 | +125 |
| Audit Layer Progression | 100 | 200 | +100 |
| getIdentityHeader() raw identity | 375 | 375 | 0 |
| Context lines | 50 | 100 | +50 |
| Per-turn override | 50 | 100 | +50 |
| **Total** | **~2,200** | **~8,000-11,000** | |

---

## EXECUTION ORDER

```
Phase 0: Fix T0 stale — split _t1Cache into _t1StaticCache, T0 live every call.
  File: trident-warhead-synthesizer.ts lines 506-535

Phase 1: Rewire ContextSynthesisEngine — remove heuristic scoring, use NLP pipeline.
  Files: context-synthesis-engine.ts, warhead-synthesizer.ts

Phase 2: Per-file T1 injectables — each file gets own [T1: NAME] section.
  Files: warhead-synthesizer.ts (buildKnowledgeT1), context-synthesis-engine.ts (synthesize)

Phase 3: Load Algorithmic Systems — add as/* directory scanning.
  Files: warhead-synthesizer.ts, warhead-common-sense.ts, warhead-distilled-knowledge.ts

Phase 4: Generative T1 synthesis — LLM call on first init, then cached.
  Files: warhead-synthesizer.ts (+ new function), context-synthesis-engine.ts

Phase 5: DP Layer 1/2/3 forward-mapping rewrite.
  Files: deep-planning-artifact.ts (COMPLETE REWRITE)

Phase 6: Token target verification — measure actual tokens per section.
  Target: ~11,000 tokens total.

Phase 7: tsc + bundle + deploy — 0 errors, container deploy, verify knowledge visible.
```

---

## VERIFICATION CRITERIA

1. NLP pipeline used — extractPrinciplesFromText() appears in context-synthesis-engine.ts imports. Zero heuristic scoring remains.
2. Per-file T1 injectables — grep for [T1: on captured system prompt shows individual entries per file.
3. Token count per T1 — Each section is 250-400 tokens (chars/4).
4. Total injection — ~11,000 tokens across all injectables.
5. DP forward-mapping — trident-deep-planning with only requirements (no targetPath) generates prompt from minimal idea.
6. Algorithmic Systems loaded — T2 cache has as/ prefix entries.
7. T0 real-time — Two sequential synthesizeT1Injectables() calls produce different T0 counters.
8. Zero heuristic scoring — grep "score += |score -= " context-synthesis-engine.ts = 0 matches.
