interface AgentState {
  agent: string | undefined;
  timestamp: number;
  sessionId: string;
  toolsCalledThisTurn: number;
  lastModelMessage: string | null;
  pendingDispatch: number;
  buildIntentTarget: string | null;
  buildIntentWorkspace: string | null;
}

// Global-backed storage — the plugin can load TWICE (config path + plugin-dir
// symlink / hot-reload overlap), creating duplicate module instances with
// separate Maps. Writes land in instance A, reads hit empty instance B.
// globalThis guarantees ONE map across all instances and reloads.
const g = globalThis as Record<string, unknown>;
if (!g.__tridentAgentBySession) g.__tridentAgentBySession = new Map<string, AgentState>();
const agentBySession = g.__tridentAgentBySession as Map<string, AgentState>;

export function setCurrentAgent(agent: string | undefined, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  agentBySession.set(sid, {
    agent,
    timestamp: Date.now(),
    sessionId: sid,
    toolsCalledThisTurn: current?.toolsCalledThisTurn || 0,
    lastModelMessage: current?.lastModelMessage || null,
    pendingDispatch: current?.pendingDispatch || 0,
    buildIntentTarget: current?.buildIntentTarget || null,
    buildIntentWorkspace: current?.buildIntentWorkspace || null,
  });
}

export function getCurrentAgent(sessionId?: string): string | undefined {
  const sid = sessionId || 'default';
  return agentBySession.get(sid)?.agent;
}

export function clearCurrentAgent(sessionId?: string): void {
  const sid = sessionId || 'default';
  agentBySession.delete(sid);
}

export function getToolsCalled(sessionId?: string): number {
  return agentBySession.get(sessionId || 'default')?.toolsCalledThisTurn || 0;
}

export function setToolsCalled(value: number, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.toolsCalledThisTurn = value;
    agentBySession.set(sid, current);
  }
}

export function resetToolsCalled(sessionId?: string): void {
  setToolsCalled(0, sessionId);
}

export function incrementToolsCalled(sessionId?: string): void {
  setToolsCalled(getToolsCalled(sessionId) + 1, sessionId);
}

export function getLastMessage(sessionId?: string): string | null {
  return agentBySession.get(sessionId || 'default')?.lastModelMessage || null;
}

export function setLastMessage(value: string | null, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.lastModelMessage = value;
    agentBySession.set(sid, current);
  }
}

// ── L1 OUTPUT INJECTION (tool.after reads file, injects into output) ──
var pendingL1Path: string | null = null;
export function getPendingL1Path(): string | null { return pendingL1Path; }
export function setPendingL1Path(p: string): void { pendingL1Path = p; }
export function clearPendingL1Path(): void { pendingL1Path = null; }

// ── CONTAINER TESTING SKILL TRACKING ──
var containerSkillSessions = new Set<string>();
export function setContainerSkillLoaded(sessionId: string): void {
  containerSkillSessions.add(sessionId);
  containerSkillSessions.add('default');
}
export function isContainerSkillLoaded(sessionId: string): boolean {
  return containerSkillSessions.has(sessionId) || containerSkillSessions.has('default');
}
export function isContainerTestingCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  var lower = command.toLowerCase();
  // Infrastructure commands are ALWAYS allowed via bash (not container testing)
  var isInfra = lower.indexOf('docker ps') !== -1 || lower.indexOf('docker images') !== -1 ||
                lower.indexOf('docker stop') !== -1 || lower.indexOf('docker rm') !== -1 ||
                lower.indexOf('docker inspect') !== -1 || lower.indexOf('docker logs') !== -1 ||
                lower.indexOf('docker kill') !== -1 || lower.indexOf('docker network') !== -1 ||
                lower.indexOf('docker volume') !== -1 || lower.indexOf('docker system') !== -1 ||
                lower.indexOf('docker info') !== -1 || lower.indexOf('docker version') !== -1;
  if (isInfra) return false;
  var hasDocker = lower.indexOf('docker run') !== -1 || lower.indexOf('docker exec') !== -1 || lower.indexOf('docker cp') !== -1;
  if (!hasDocker) return false;
  // Container-testing context: opencode/tmux/send-keys/pipe-pane/stream, or test-named containers
  var hasTesting = lower.indexOf('opencode') !== -1 || lower.indexOf('tmux') !== -1 ||
                   lower.indexOf('send-keys') !== -1 || lower.indexOf('pipe-pane') !== -1 ||
                   lower.indexOf('stream.txt') !== -1 ||
                   /docker\s+(exec|run|cp)\s+[\w./-]*(-test|_test|test-)/i.test(command);
  return hasTesting;
}

// ── POSEIDON ACTIVATION INTENT ──
// Stores the classified intent of the user's Poseidon activation message:
//   PERMISSIONS — unlock tools for direct work (do NOT call trident-poseidon action=start)
//   GOD_LOOP    — autonomous build orchestration (action=start is correct)
//   NONE        — no activation context
var poseidonIntentBySession = new Map<string, string>();
export function setPoseidonIntent(sessionId: string, intent: string): void {
  poseidonIntentBySession.set(sessionId, intent);
  poseidonIntentBySession.set('default', intent);
}
export function getPoseidonIntent(sessionId: string): string {
  return poseidonIntentBySession.get(sessionId) || poseidonIntentBySession.get('default') || 'NONE';
}
export function clearPoseidonIntent(sessionId: string): void {
  poseidonIntentBySession.delete(sessionId);
  poseidonIntentBySession.delete('default');
}

// ── MODEL WIRING ──
// Stores the current session's model provider+ID so callLLM() can use it
// for internal LLM calls without reading client.session.messages().
let _currentSessionModel: { providerID: string; modelID: string } | null = null;

export function setCurrentSessionModel(model: { providerID: string; modelID: string } | null): void {
  _currentSessionModel = model;
}

export function getCurrentSessionModel(): { providerID: string; modelID: string } | null {
  return _currentSessionModel;
}

// ── L3 DISPATCH ENFORCEMENT ──
// Tracks pending subagent dispatches. When > 0, the hook system
// blocks responses that don't contain task() calls.
export function getPendingDispatch(sessionId?: string): number {
  return agentBySession.get(sessionId || 'default')?.pendingDispatch || 0;
}

export function setPendingDispatch(count: number, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.pendingDispatch = count;
  } else {
    agentBySession.set(sid, {
      agent: undefined, timestamp: Date.now(), sessionId: sid,
      toolsCalledThisTurn: 0, lastModelMessage: null,
      pendingDispatch: count, buildIntentTarget: null, buildIntentWorkspace: null,
    });
  }
}

// ── BUILD INTENT TRACKING ──
// Stores the detected build target path from user messages.
export function setBuildIntent(target: string | null, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.buildIntentTarget = target;
  }
}

export function getBuildIntent(sessionId?: string): string | null {
  return agentBySession.get(sessionId || 'default')?.buildIntentTarget || null;
}

export function clearBuildIntent(sessionId?: string): void {
  setBuildIntent(null, sessionId);
}

export function setBuildIntentWorkspace(workspace: string, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.buildIntentWorkspace = workspace;
  }
}
