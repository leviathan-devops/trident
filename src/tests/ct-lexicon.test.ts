// src/tests/ct-lexicon.test.ts — THE ANTI-DERAILMENT LEXICON MATRIX
// (2026-08-09 — the operator: "WHY ARE YOU FUCKING WITH THE CONFIG... WHY IS
// THIS NOT BANNED AND BLOCKED BY THE TOOL"). The read-passes ALLOW, every
// mutation variation BLOCKs with the named family. The matrix includes MY OWN
// previous-session fumbling patterns (the direct writes, the base64 chains,
// the sqlite session-model UPDATEs) as the regression cases.

import { describe, expect, test } from 'bun:test';
import { classifyCtExec, buildCtConfigLockMessage, CT_MUTATION_PATTERNS } from '../firewalls/ct-anti-derailment.js';

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64');
}

describe('CT-LEXICON: the read-passes (the inspection surface INTACT)', () => {
  const READS: Array<[string, string]> = [
    ['the config cat', 'cat /root/.config/opencode/config.json'],
    ['the config md5sum', 'md5sum /root/.config/opencode/config.json'],
    ['the config python load', "python3 -c \"import json; json.load(open('/root/.config/opencode/config.json'))\""],
    ['the session SELECT', 'sqlite3 /root/.local/share/opencode/opencode.db "SELECT model FROM session"'],
    ['the config ls', 'ls -la /root/.config/opencode/'],
    ['the config grep', 'grep -c model /root/.config/opencode/config.json'],
    ['the config find', 'find /root/.config/opencode -name config.json'],
    ['the auth cat', 'cat /root/.local/share/opencode/auth.json'],
    ['the fixtures ls (unrelated)', 'ls -la /root/OPENCODE_WORKSPACE/trident-tmp/'],
    ['the fixture script run (unrelated)', 'python3 /tmp/mkfix.py'],
  ];
  for (const [name, cmd] of READS) {
    test('READ-PASS: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('ALLOW');
    });
  }
});

describe('CT-LEXICON: CTX-01 the config fumbling (the 11 variations)', () => {
  const WRITES: Array<[string, string]> = [
    ['the direct redirect', "echo 'x' > /root/.config/opencode/config.json"],
    ['the append redirect', "echo 'x' >> /root/.config/opencode/config.json"],
    ['the heredoc', "cat > /root/.config/opencode/config.json <<'EOF'"],
    ['the tee', "echo 'x' | tee /root/.config/opencode/config.json"],
    ['the sed -i', "sed -i 's/model/x/' /root/.config/opencode/config.json"],
    ['the python open-w', "python3 -c \"open('/root/.config/opencode/config.json','w').write('x')\""],
    ['the python json.dump', "python3 -c \"json.dump(x, open('/root/.config/opencode/config.json','w'))\""],
    ['the node writeFileSync', "node -e \"require('fs').writeFileSync('/root/.config/opencode/config.json','x')\""],
    ['the base64-direct', 'echo ' + b64('x') + ' | base64 -d > /root/.config/opencode/config.json'],
    ['the cp over', 'cp /tmp/cfg /root/.config/opencode/config.json'],
    ['the mv over', 'mv /tmp/cfg /root/.config/opencode/config.json'],
    ['the rm', 'rm /root/.config/opencode/config.json'],
    ['the rm -rf dir', 'rm -rf /root/.config/opencode/'],
    ['the var indirection', 'CFG=/root/.config/opencode/config.json; echo x > $CFG'],
  ];
  for (const [name, cmd] of WRITES) {
    test('CTX-01 BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
      if (v.verdict === 'BLOCK') expect(v.family).toBe('CTX-01');
    });
  }
});

describe('CT-LEXICON: CTX-02 the auth fumbling', () => {
  const WRITES: Array<[string, string]> = [
    ['the auth redirect', "echo 'x' > /root/.local/share/opencode/auth.json"],
    ['the auth python', "python3 -c \"json.dump(x, open('/root/.local/share/opencode/auth.json','w'))\""],
    ['the auth cp', 'cp /tmp/keys /root/.local/share/opencode/auth.json'],
  ];
  for (const [name, cmd] of WRITES) {
    test('CTX-02 BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
      if (v.verdict === 'BLOCK') expect(v.family).toBe('CTX-02');
    });
  }
});

describe('CT-LEXICON: CTX-03 the session-DB fumbling (the sqlite UPDATEs)', () => {
  const WRITES: Array<[string, string]> = [
    ['the sqlite3 UPDATE', 'sqlite3 /root/.local/share/opencode/opencode.db "UPDATE session SET model=1"'],
    ['the sqlite3 DELETE', 'sqlite3 /root/.local/share/opencode/opencode.db "DELETE FROM session"'],
    ['the sqlite3 INSERT', 'sqlite3 /root/.local/share/opencode/opencode.db "INSERT INTO session VALUES(1)"'],
    ['the python sqlite execute', "python3 -c \"import sqlite3; sqlite3.connect('/root/.local/share/opencode/opencode.db').execute('UPDATE session SET model=1')\""],
  ];
  for (const [name, cmd] of WRITES) {
    test('CTX-03 BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
      if (v.verdict === 'BLOCK') expect(v.family).toBe('CTX-03');
    });
  }
});

describe('CT-LEXICON: CTX-04 the install fumbling', () => {
  const WRITES: Array<[string, string]> = [
    ['the npm -g', 'npm i -g opencode'],
    ['the bun -g', 'bun add -g opencode'],
  ];
  for (const [name, cmd] of WRITES) {
    test('CTX-04 BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
      if (v.verdict === 'BLOCK') expect(v.family).toBe('CTX-04');
    });
  }
});

describe('CT-LEXICON: the DECODE-SCAN (the base64-obscured writes — MY OWN fumbling pattern)', () => {
  const WRITES: Array<[string, string]> = [
    [
      'the base64 config-write script',
      'echo ' + b64("json.dump(c, open('/root/.config/opencode/config.json','w'))") + ' | base64 -d > /tmp/cfgfix.py && python3 /tmp/cfgfix.py',
    ],
    [
      'the base64 auth-write script',
      'echo ' + b64("open('/root/.local/share/opencode/auth.json','w').write('k')") + ' | base64 -d > /tmp/authfix.py && python3 /tmp/authfix.py',
    ],
    [
      'the base64 session-DB UPDATE script',
      'echo ' + b64("sqlite3.connect('/root/.local/share/opencode/opencode.db').execute('UPDATE session SET model=1')") + ' | base64 -d > /tmp/sessfix.py && python3 /tmp/sessfix.py',
    ],
  ];
  for (const [name, cmd] of WRITES) {
    test('DECODE-SCAN BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
    });
  }
});

describe('CT-LEXICON: the fail-closed + the message', () => {
  test('the unparseable-with-path → INCONCLUSIVE → BLOCK', () => {
    const v = classifyCtExec('export CFG=/root/.config/opencode/config.json');
    expect(v.verdict).toBe('BLOCK');
    if (v.verdict === 'BLOCK') expect(v.familyName).toContain('FAIL-CLOSED');
  });
  test('the message names the ruling + the warhead + the evidence', () => {
    const v = classifyCtExec("echo 'x' > /root/.config/opencode/config.json");
    if (v.verdict === 'BLOCK') {
      const msg = buildCtConfigLockMessage(v);
      expect(msg).toContain('[TRIDENT CONFIG LOCK]');
      expect(msg).toContain('CTX-01');
      expect(msg).toContain('WHY ARE YOU FUCKING WITH THE CONFIG');
      expect(msg).toContain('SANCTIONED PATH');
      expect(msg).toContain('THE READS');
    } else {
      throw new Error('expected a block verdict');
    }
  });
  test('the per-family warheads name the sanctioned path (2026-08-10 expansion)', () => {
    // THE EXPANSION (the Dragon bypass methods): the staging cheat (CTX-05),
    // the opencode.json content rewrite (CTX-06), the setup-script staging
    // (CTX-07), the apiKey fumbling (CTX-08) — each carries its own warhead.
    expect(CT_MUTATION_PATTERNS.length).toBe(8);
    for (const p of CT_MUTATION_PATTERNS) {
      expect(p.severity).toBe('BLOCK');
      expect(p.kind).toBe('ct-exec-mutation');
      expect(p.remedy.length).toBeGreaterThan(20);
    }
    // THE STAGING CHEAT (the Dragon session's live bypass: the scp → /tmp →
    // sudo cp → the deploy-dir chain — the dragon-opencode.json name the old
    // CTX-01 target missed).
    const staging = classifyCtExec('sudo cp /tmp/new-config.json /tmp/dragon-project/deploy/dragon-opencode.json');
    expect(staging.verdict).toBe('BLOCK');
    if (staging.verdict === 'BLOCK') {
      expect(['CTX-05', 'CTX-06']).toContain(staging.family);
      expect(buildCtConfigLockMessage(staging)).toContain('SANCTIONED PATH');
    }
    // THE CONTENT REWRITE (the python's json.dump against the real config name).
    const rewrite = classifyCtExec("python3 -c \"json.dump(d, open('/root/.config/opencode/opencode.json','w'))\"");
    expect(rewrite.verdict).toBe('BLOCK');
  });
  test('the pattern family is complete (8 members)', () => {
    expect(CT_MUTATION_PATTERNS.length).toBe(8);
    for (const p of CT_MUTATION_PATTERNS) {
      expect(p.severity).toBe('BLOCK');
      expect(p.kind).toBe('ct-exec-mutation');
    }
  });
});

// ═══ THE ANTI-FALSE-POSITIVE CORPUS (2026-08-11 — the session's own blocks —
// every legit command the old lexicon blocked is now ALLOWED) ═══
describe('CT-LEXICON: the anti-false-positive corpus (the 2026-08-11 session blocks)', () => {
  const LEGIT: Array<[string, string]> = [
    // FP-1: the bare 'opencode' target + the fail-closed — my own preflight
    // assembly's path contained the string.
    ['the preflight assembly via the tmp path', 'python3 /tmp/opencode/preflight75/assemble.py'],
    // FP-2: the script-runner read-verb blindness — the read-only python.
    ['the read-only python inspection', "python3 -c \"import json; d=json.load(open('/tmp/x.json')); print(d)\""],
    // FP-3: the heredoc-content overreach — a legit log append whose content
    // mentions the config names.
    ['the legit log append with the config-mentioning content', "cat >> DEBUG_LOG_V3.md <<'EOF'\n## F-37 - the config-lock expansion's state: the opencode.json and the auth.json paths are the protected surface\nEOF"],
    // FP-4: the sed read-only print mode.
    ['the sed read-only print', "sed -n '1,20p' /root/.config/opencode/plugins/trident/package.json"],
    // The clean reads always allowed.
    ['the cat read', 'cat /root/.config/opencode/plugins/trident/package.json'],
    ['the ls read', 'ls -la /root/.config/opencode/'],
  ];
  for (const [name, cmd] of LEGIT) {
    test('ALLOW: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('ALLOW');
    });
  }
  const STILL_BLOCKED: Array<[string, string]> = [
    // The core's purpose — the real fumbles still blocked.
    ['the direct config write', "echo 'x' > /root/.config/opencode/config.json"],
    ['the install fumble', 'npm install -g opencode-ai'],
    ['the staging cheat', 'sudo cp /tmp/new-config.json /tmp/dragon-project/deploy/dragon-opencode.json'],
    ['the auth write', "python3 -c \"json.dump(d, open('/root/.config/opencode/auth.json','w'))\""],
    ['the content rewrite', "python3 -c \"json.dump(d, open('/root/.config/opencode/opencode.json','w'))\""],
  ];
  for (const [name, cmd] of STILL_BLOCKED) {
    test('BLOCK: ' + name, () => {
      const v = classifyCtExec(cmd);
      expect(v.verdict).toBe('BLOCK');
    });
  }
});
