// src/tests/ct-firewall-classifier.test.ts
// THE 5-LAYER FIREWALL CLASSIFIER CORPUS (2026-08-19 — the operator's breach:
// "timeout 25 docker exec ... kill -9 752" + "docker cp <plain-path> container:"
// BYPASSED the old string-position regex). Every hole that let the destructive
// commands through is a failing case here. Every rule has a failing case —
// a firewall that never fires is theater.

import { describe, expect, test } from 'bun:test';
import {
  classifyContainerCommand,
  isContainerTestingCommand,
  tokenizeShell,
  stripWrappers,
} from '../hooks/agent-state.js';

describe('CT-FIREWALL: L1 tokenizer (quote/heredoc-aware — strings are NOT verbs)', () => {
  test('splits a simple command', () => {
    expect(tokenizeShell('docker ps')).toEqual(['docker', 'ps']);
  });
  test('keeps a quoted string as ONE token', () => {
    expect(tokenizeShell('echo "docker exec foo"')).toEqual(['echo', 'docker exec foo']);
  });
  test('handles single quotes', () => {
    expect(tokenizeShell("sh -c 'docker exec bar'")).toEqual(['sh', '-c', 'docker exec bar']);
  });
});

describe('CT-FIREWALL: L2 wrapper-strip (timeout/sudo/env/bash -c/docker exec chains)', () => {
  test('strips a timeout wrapper', () => {
    expect(stripWrappers(tokenizeShell('timeout 25 docker exec x sh -c y'))).toContain('docker');
  });
  test('strips sudo', () => {
    expect(stripWrappers(tokenizeShell('sudo docker run x'))).toContain('docker');
  });
  test('strips bash -c to the inner command', () => {
    expect(stripWrappers(tokenizeShell('bash -lc "docker exec forge-dispatch-test ps aux"'))).toContain('docker');
  });
  test('strips docker exec <c> sh -c to the inner command', () => {
    const s = stripWrappers(tokenizeShell('docker exec forge-dispatch-test sh -c "kill -9 752"'));
    expect(s.join(' ')).toContain('kill');
  });
});

describe('CT-FIREWALL: THE HOLES — every bypass that executed BEFORE is now BLOCKED', () => {
  const MUST_BLOCK: Array<[string, string]> = [
    // HOLE #1 — the timeout wrapper pushed docker mid-command (the anchor failed)
    ['HOLE-1 timeout docker exec kill', 'timeout 25 docker exec forge-dispatch-test sh -c \'kill -9 752\''],
    // HOLE #2 — the docker cp with a plain host source path (no -test token before container)
    ['HOLE-2 docker cp plain-path', 'docker cp /home/leviathan/OPENCODE_WORKSPACE/dist/index.js forge-dispatch-test:/root/OPENCODE_WORKSPACE/dist/index.js'],
    // HOLE #3 — the same cp variant to the plugin path
    ['HOLE-3 docker cp plugin-path', 'docker cp ./dist/index.js forge-dispatch-test:/root/.config/opencode/plugins/trident/dist/'],
    // HOLE #4 — the nested bash -c docker exec
    ['HOLE-4 bash -c docker exec', 'bash -lc "docker exec forge-dispatch-test tmux send-keys -t test Enter"'],
    // HOLE #5 — the sudo docker run
    ['HOLE-5 sudo docker run', 'sudo docker run --rm -it forge-fork-test:v1 sh'],
    // the plain mutation verbs — ALWAYS blocked by verb, no target dependence
    ['docker exec read', 'docker exec forge-dispatch-test ps aux'],
    ['docker exec kill', 'docker exec forge-dispatch-test sh -c \'kill -9 153\''],
    ['docker run', 'docker run -it forge-fork-test:v1 sh'],
    ['docker cp', 'docker cp /tmp/foo forge-dispatch-test:/tmp/'],
    ['docker stop', 'docker stop forge-dispatch-test'],
    ['docker rm', 'docker rm -f forge-dispatch-test'],
    ['tmux send-keys', 'tmux send-keys -t test "bun run src/index.ts" Enter'],
    ['tmux pipe-pane', 'tmux pipe-pane -t test'],
    ['tmux capture-pane', 'tmux capture-pane -t test'],
  ];
  for (const [name, cmd] of MUST_BLOCK) {
    test('BLOCK: ' + name, () => {
      expect(isContainerTestingCommand(cmd)).toBe(true);
      const v = classifyContainerCommand(cmd);
      expect(['BLOCK_MUTATION', 'BLOCK_TARGET', 'BLOCK_UNPARSEABLE']).toContain(v.verdict);
      // the evidence names the verb — the message teaches
      if (v.evidence) expect(v.evidence.verb.length).toBeGreaterThan(0);
    });
  }
});

describe('CT-FIREWALL: the READ-ONLY infra + the legit commands still PASS', () => {
  const MUST_PASS: Array<[string, string]> = [
    ['docker ps', 'docker ps'],
    ['docker images', 'docker images forge-fork-test'],
    ['docker inspect', 'docker inspect forge-dispatch-test'],
    ['docker logs', 'docker logs forge-dispatch-test 2>&1 | tail -20'],
    ['docker version', 'docker version'],
    ['docker info', 'docker info'],
    ['unrelated build', 'bun build src/index.ts --outdir dist'],
    ['git status', 'git status'],
    ['ls', 'ls -la'],
    ['sha256sum', 'sha256sum dist/index.js'],
    ['no docker', 'python3 -c "print(1)"'],
    ['a quoted docker string (echo)', 'echo "docker exec foo"'],
    ['a heredoc body containing docker', 'cat > /tmp/notes.txt << EOF\ndocker exec bar\nEOF'],
  ];
  for (const [name, cmd] of MUST_PASS) {
    test('ALLOW: ' + name, () => {
      expect(isContainerTestingCommand(cmd)).toBe(false);
      const v = classifyContainerCommand(cmd);
      expect(v.verdict).toBe('ALLOW_INFRA');
    });
  }
});

describe('CT-FIREWALL: fail-closed (unparseable docker/tmux = BLOCK, never pass)', () => {
  test('docker with no verb → BLOCK_UNPARSEABLE', () => {
    const v = classifyContainerCommand('docker');
    expect(v.verdict).toBe('BLOCK_UNPARSEABLE');
    expect(isContainerTestingCommand('docker')).toBe(true);
  });
  test('docker with an unknown verb → BLOCK_UNPARSEABLE', () => {
    const v = classifyContainerCommand('docker frobnicate');
    expect(v.verdict).toBe('BLOCK_UNPARSEABLE');
    expect(isContainerTestingCommand('docker frobnicate')).toBe(true);
  });
  test('tmux with an unknown verb → BLOCK_UNPARSEABLE', () => {
    const v = classifyContainerCommand('tmux frobnicate');
    expect(v.verdict).toBe('BLOCK_UNPARSEABLE');
  });
});
