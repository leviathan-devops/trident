import { describe, expect, test } from 'bun:test';
import { createShadowModels } from '../tools/shadow/shadow-agent.ts';

describe('PI MODEL RESOLUTION', () => {
  test('the nvidia provider registers models', () => {
    const models = createShadowModels();
    const all = models.getModels('nvidia' as never);
    console.log('nvidia models:', JSON.stringify(all.map(m => ({id: m.id, provider: m.provider})), null, 2));
    expect(all.length).toBeGreaterThan(0);
  });
});
