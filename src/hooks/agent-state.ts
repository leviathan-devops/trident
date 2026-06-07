interface AgentState {
  agent: string | undefined;
  timestamp: number;
  sessionId: string;
  toolsCalledThisTurn: number;
  lastModelMessage: string | null;
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

