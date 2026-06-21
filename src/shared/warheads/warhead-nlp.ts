import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog, getEvidenceStore } from '../../utils.js';
import type { StreamingIntentResult } from '../../nlp/streaming-buffer.js';
import { loadKnowledgeSummary } from '../knowledge-loader.js';

// ── Helper: Extract text from output ──
function extractOutputText(output: Record<string, unknown>): string {
  try {
    if (typeof output !== 'object' || output === null) return '';
    const msg = (output as Record<string, unknown>).message;
    if (typeof msg === 'object' && msg !== null) {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === 'string') return content;
    }
  } catch (e: unknown) {
    tridentLog('ERROR', 'warhead-nlp', `Error: ${e instanceof Error ? e.message : String(e)}`);
    return ''; // Safe fallback — output text extraction failed, return empty string
  }
  return '';
}

class NLPPipelineWarhead implements Warhead {
  id = 'nlp-pipeline';
  priority = 1;
  type = 'static' as const;

  private messageCount = 0;
  private intentCount = 0;
  private nlpAvailable = false;
  private kbContent = '';
  private kbLoaded = false;
  private entityCount = 0;

  async init(): Promise<void> {
    // Load KB-07: Deterministic NLP Pipeline knowledge
    const kb = loadKnowledgeSummary('KB-07', 30);
    if (kb.loaded) {
      this.kbContent = kb.content;
      this.kbLoaded = true;
      await tridentLog('INFO', 'warhead-nlp',
        `KB-07 loaded: ${kb.content.length} chars`);
    } else {
      await tridentLog('WARN', 'warhead-nlp',
        `KB-07 not loaded: ${kb.error || 'unknown error'}`);
    }

    // Probe for NLP modules
    try {
      await import('../../nlp/streaming-buffer.js');
      await import('../../nlp/principle-extractor.js');
      await import('../../nlp/intent-parser.js');
      this.nlpAvailable = true;
      await tridentLog('INFO', 'warhead-nlp', 'NLP pipeline: wink-nlp modules available');
    } catch (e: unknown) {
      this.nlpAvailable = false;
      await tridentLog('WARN', 'warhead-nlp',
        `NLP modules not available: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  register(hooks: HookRegistry): void {
    hooks.on('chat.message', async (input, output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;

        const inputText = inputR.text as string;
        const text = inputText || extractOutputText(output) || '';
        if (!text) return;

        this.messageCount++;

        // ── 1. Intent detection ──
        if (this.nlpAvailable) {
          try {
            const { detectIntent } = await import('../../nlp/intent-parser.js');
            const result = detectIntent(text);

            if (result.mode !== 'UNKNOWN' && result.confidence > 0.5) {
              this.intentCount++;

              // Store intent in evidence
              try {
                const store = await getEvidenceStore();
                await store.append('global', 'SYSTEM', 'R0', 'nlp-intent', {
                  mode: result.mode,
                  confidence: result.confidence,
                  extracted: result.extracted,
                  reasoning: result.reasoning,
                  tokenCount: result.tokens?.length || 0,
                  timestamp: Date.now(),
                });
              } catch (e: unknown) {
                await tridentLog('ERROR', 'warhead-nlp', `Evidence store write failed: ${e instanceof Error ? e.message : String(e)}`);
                return;
              }

              await tridentLog('INFO', 'warhead-nlp',
                `Message ${this.messageCount}: intent=${result.mode} confidence=${result.confidence.toFixed(2)}`);
            }
          } catch (e: unknown) {
            await tridentLog('ERROR', 'warhead-nlp', `Intent detection error: ${e instanceof Error ? e.message : String(e)}`);
            const msg = e instanceof Error ? e.message : String(e);
            if (this.nlpAvailable) {
              // Only log first failure, then mark unavailable to avoid spam
              this.nlpAvailable = false;
              await tridentLog('WARN', 'warhead-nlp',
                `Intent detection failed, disabling NLP: ${msg}`);
            }
            return;
          }

          // ── 2. Streaming buffer processing ──
          try {
            const { StreamingIntentParser } = await import('../../nlp/streaming-buffer.js');
            const parser = new StreamingIntentParser();
            const results = parser.processChunk(text);
            if (results.length > 0) {
              const sentences = results.map((r: StreamingIntentResult) => r.intent);
              await tridentLog('INFO', 'warhead-nlp',
                `Message ${this.messageCount}: ${sentences.length} sentences from streaming buffer`);
            }
          } catch (e: unknown) {
            await tridentLog('ERROR', 'warhead-nlp', `Error: ${e instanceof Error ? e.message : String(e)}`);
            // Safe to continue — streaming buffer is best-effort, intent detection already completed
          }

          // ── 3. Principle extraction ──
          try {
            const { extractPrinciplesFromText } = await import('../../nlp/principle-extractor.js');
            const principles = extractPrinciplesFromText(text);
            if (principles.length > 0) {
              await tridentLog('INFO', 'warhead-nlp',
                `Message ${this.messageCount}: ${principles.length} principles extracted`);
            }
          } catch (e: unknown) {
            await tridentLog('ERROR', 'warhead-nlp', `Error: ${e instanceof Error ? e.message : String(e)}`);
            // Safe to continue — principle extraction is best-effort, streaming buffer already processed
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-nlp', `Chat hook failed: ${msg}`);
        return;
      }
    });

    // ── NER: Extract project names and file paths from tool arguments ──
    hooks.on('tool.execute.before', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;

        const args = inputR.args;
        if (!args) return;
        const argsStr = JSON.stringify(args);

        const projectMatch = argsStr.match(/([A-Z][A-Z0-9_-]+)/g);
        const filePathMatch = argsStr.match(/(\/[a-zA-Z0-9_\/.-]+\.(ts|js|json|md))/g);

        if (projectMatch || filePathMatch) {
          const newEntities = (projectMatch?.length || 0) + (filePathMatch?.length || 0);
          this.entityCount += newEntities;

          await tridentLog('INFO', 'warhead-nlp',
            `NER: projects=${projectMatch?.join(',') || 'none'} paths=${filePathMatch?.join(',') || 'none'} (+${newEntities} entities)`);

          // Write to evidence store
          try {
            const store = await getEvidenceStore();
            await store.append('global', 'SYSTEM', 'R1', 'ner-extraction', {
              projects: projectMatch?.join(',') || '',
              paths: filePathMatch?.join(',') || '',
              entityCount: this.entityCount,
              newEntities,
              timestamp: Date.now(),
            });
          } catch (e: unknown) {
            tridentLog('ERROR', 'warhead-nlp', `NER evidence write error: ${e instanceof Error ? e.message : String(e)}`);
            // Safe to continue — evidence store write is best-effort, NER entities already counted
          }
        }
      } catch (e: unknown) {
        await tridentLog('ERROR', 'warhead-nlp', `NER failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    });
  }

  getT0(): string {
    const parts: string[] = [];
    parts.push(this.nlpAvailable ? 'wink-nlp active' : 'modules unavailable');
    if (this.kbLoaded) parts.push('KB-07 loaded');
    return `[NLP PIPELINE] ${parts.join(' | ')}. ${this.messageCount} messages, ${this.intentCount} intents, ${this.entityCount} entities detected.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      messages: this.messageCount,
      intentsResolved: this.intentCount,
      entities: this.entityCount,
      nlpAvailable: Number(this.nlpAvailable),
      kbLoaded: Number(this.kbLoaded),
    };
  }
}

export const nlpPipelineWarhead = new NLPPipelineWarhead();
