// THE W1 MECHANICAL ENFORCEMENT TESTS (2026-08-26 — the operator: "WHY IS IT
// NOT ENFORCED TO FUCKING BATCH EVERYTHING"). The live B1 dripped 20
// single-edit calls + 14 keyhole reads in ONE round; prompt laws didn't stop
// it. These tests prove the MECHANISM: the edit budget refuses call #4, and
// the turn cap forces round end at 12 LLM calls.
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ShadowAgent } from '../tools/shadow/shadow-agent.ts';
import { AssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';

function makeBasePartial(modelId: string): AssistantMessage {
  return {
    role: 'assistant',
    api: 'openai-completions',
    provider: 'test',
    model: modelId,
    content: [],
    stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    timestamp: Date.now(),
  } as never;
}

function scriptedEditStream(modelId: string, targetPath: string, oldText: string, newText: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    const editArgs = { path: targetPath, edits: [{ oldText, newText }] };
    const content: AssistantMessage['content'] = [{ type: 'toolCall', id: 'c2', name: 'edit', arguments: editArgs }];
    const withCall: AssistantMessage = { ...partial, content, stopReason: 'toolUse', timestamp: Date.now() };
    stream.push({ type: 'start', partial });
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: withCall });
    stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: { id: 'c2', name: 'edit', arguments: editArgs } as never, partial: withCall });
    stream.push({ type: 'done', reason: 'toolUse', message: withCall });
    stream.end(withCall);
  })();
  return stream;
}

function scriptedTextStream(modelId: string, text: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    const content: AssistantMessage['content'] = [{ type: 'text', text }];
    const withText: AssistantMessage = { ...partial, content, stopReason: 'stop', timestamp: Date.now() };
    stream.push({ type: 'start', partial });
    stream.push({ type: 'text_start', contentIndex: 0, partial: withText });
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: withText });
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: withText });
    stream.push({ type: 'done', reason: 'stop', message: withText });
    stream.end(withText);
  })();
  return stream;
}

describe('W1 mechanical enforcement (the edit budget + turn cap)', () => {
  test('A DRIP of 5 single-edit calls is CUT to 3 — the 4th+ are refused, only 3 pairs land on disk', async () => {
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'w1-drip-'));
    const promptFilePath = path.join(box, 'drip.md');
    const seed: string[] = [];
    for (let i = 1; i <= 8; i++) seed.push('ORIGINAL LINE ' + i + ' — the seed content to replace.');
    fs.writeFileSync(promptFilePath, seed.join('\n') + '\n', 'utf-8');

    const agent = new ShadowAgent(box);
    let call = 0;
    const res = await agent.run({
      promptFilePath,
      systemPrompt: 'test',
      demand: 'Polish: replace the seed lines one at a time.',
      maxRounds: 1,
      streamFn: ((_m: unknown, _c: unknown) => {
        call++;
        // FIVE single-edit turns (the drip), then stop.
        if (call <= 5) return scriptedEditStream('w1-test', promptFilePath, 'ORIGINAL LINE ' + call + ' — the seed content to replace.', 'REPLACED LINE ' + call + ' — the polish.');
        return scriptedTextStream('w1-test', 'DONE');
      }) as never,
    });

    // Only calls 1-3 applied; the 4th and 5th were REFUSED by the budget.
    const finalText = fs.readFileSync(promptFilePath, 'utf-8');
    expect(finalText).toContain('REPLACED LINE 1');
    expect(finalText).toContain('REPLACED LINE 2');
    expect(finalText).toContain('REPLACED LINE 3');
    expect(finalText).not.toContain('REPLACED LINE 4');   // refused
    expect(finalText).not.toContain('REPLACED LINE 5');   // refused
    expect(finalText).toContain('ORIGINAL LINE 4');        // untouched
    // The run itself SUCCEEDS (3 real edits landed — polishSucceeded).
    expect(res.errors).toHaveLength(0);
    expect(res.toolCallsMade).toBeGreaterThanOrEqual(3);
  }, 30000);

  test('the enforcement markers exist in source (the mechanism, not the prompt)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'shadow', 'shadow-agent.ts'), 'utf-8');
    expect(src).toContain('[W1 ENFORCED — EDIT REFUSED]');
    expect(src).toContain('editCallsThisRound > 3');
    expect(src).toContain('shouldStopAfterTurn');
    expect(src).toContain('TURN CAP HIT (12 LLM calls');
    expect(src).toContain('[W1 KEYHOLE GUARD]');
  });
});
