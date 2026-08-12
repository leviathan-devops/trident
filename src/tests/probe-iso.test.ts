// ISOLATED probe test — imports ONLY the probe, no other test interactions.
// @ts-ignore
import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { hasWaveAuditArtifact } from '../hooks/trident-hooks.ts';

test('isolated: the fresh audit qualifies the probe', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-audit-iso-'));
  try {
    const auditDir = path.join(sandbox, '.trident', 'wave-audit');
    fs.mkdirSync(auditDir, { recursive: true });
    fs.writeFileSync(path.join(auditDir, 'fresh-audit.md'), '# WAVE AUDIT\nVERDICT: CORRECT\ncoverage: 100\n', 'utf-8');
    const cwd = process.cwd();
    process.chdir(sandbox);
    try {
      const since = Date.now() - 5000;
      console.log('ISO-DEBUG', JSON.stringify({ cwd: process.cwd(), since, exists: fs.existsSync(path.join(sandbox, '.trident', 'wave-audit')) }));
      const result = hasWaveAuditArtifact(since);
      console.log('ISO-RESULT', JSON.stringify({ result }));
      expect(result).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  } finally {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { void e; }
  }
});
