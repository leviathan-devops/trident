interface AgentState {
  agent: string | undefined;
  timestamp: number;
  sessionId: string;
  toolsCalledThisTurn: number;
  lastModelMessage: string | null;
  pendingDispatch: number;
}

const agentBySession = new Map<string, AgentState>();

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

// ── L3 DISPATCH TRACKING ──
// pendingDispatch tracks how many trident_planner agents the primary agent
// must dispatch after L3 Phase 1 returns. Set by L3 tool, decremented by
// tool.before hook on each trident_planner task() call.

export function getPendingDispatch(sessionId?: string): number {
  return agentBySession.get(sessionId || 'default')?.pendingDispatch || 0;
}

export function setPendingDispatch(count: number, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.pendingDispatch = count;
    agentBySession.set(sid, current);
  } else {
    // Create minimal state if session not yet tracked
    agentBySession.set(sid, {
      agent: undefined,
      timestamp: Date.now(),
      sessionId: sid,
      toolsCalledThisTurn: 0,
      lastModelMessage: null,
      pendingDispatch: count,
    });
  }
}

export function decrementPendingDispatch(sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current && current.pendingDispatch > 0) {
    current.pendingDispatch--;
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
  var hasDocker = lower.indexOf('docker run') !== -1 || lower.indexOf('docker exec') !== -1;
  var hasTesting = lower.indexOf('opencode') !== -1 || lower.indexOf('tmux') !== -1 || lower.indexOf('send-keys') !== -1;
  var isInfra = lower.indexOf('docker ps') !== -1 || lower.indexOf('docker images') !== -1 ||
                lower.indexOf('docker stop') !== -1 || lower.indexOf('docker rm') !== -1 ||
                lower.indexOf('docker inspect') !== -1 || lower.indexOf('docker logs') !== -1;
  return hasDocker && hasTesting && !isInfra;
}
