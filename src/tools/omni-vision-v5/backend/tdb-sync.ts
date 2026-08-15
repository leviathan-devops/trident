// Omni Vision v5.1.0 — Durable Sync through the FORKED shadow memory client
// The v5.0.2 parallel fetch (172.17.0.1:8420/memory/write) is DEAD. The tool
// now routes through the forked src/shadow/memory/tdai-client.ts (TDAI_* env,
// agent root vc-{projectId}-{sessionKey}, the shadow's v3/conversation/add
// contract). BEST-EFFORT: sqlite is the live source; TDB down = TDB_SYNC_PENDING.

import { TDAIClient, type TDAIConfig } from '../shadow/memory/tdai-client.js';

// M18: the core's per-message ceiling (a 400 "Too big: expected string to
// have <=8192 characters" on longer content). 8000 leaves the frame prefix
// headroom under the hard 8192.
const MAX_TDB_MESSAGE_CHARS = 8000;

export interface TdbSyncResult {
  synced: boolean;
  reason?: string;
}

function tdaiConfig(): TDAIConfig | null {
  const endpoint = process.env.TDAI_ENDPOINT || 'http://172.17.0.1:8420';
  const userKey = process.env.TDAI_USER_KEY || '';
  if (!userKey) return null; // not configured — TDB_SYNC_PENDING
  return {
    endpoint,
    userKey,
    teamId: process.env.TDAI_TEAM_ID || undefined,
    userId: process.env.TDAI_USER_ID || undefined,
    agentId: process.env.TDAI_AGENT_ID || undefined,
    serviceId: process.env.TDAI_SERVICE_ID || 'default',
  };
}

function agentRootId(projectId: string, sessionKey: string): string {
  return `vc-${projectId}-${sessionKey}`;
}

export async function tdbWriteMemory(
  projectId: string,
  sessionKey: string,
  payload: { role: 'user' | 'assistant' | 'system'; content: string },
): Promise<TdbSyncResult> {
  const cfg = tdaiConfig();
  if (!cfg) {
    return { synced: false, reason: 'TDB_SYNC_PENDING: TencentDB not configured (TDAI_USER_KEY env missing)' };
  }
  try {
    const client = new TDAIClient(cfg);
    await client.addConversation(agentRootId(projectId, sessionKey), [
      { role: payload.role, content: payload.content },
    ]);
    return { synced: true };
  } catch (e) {
    return {
      synced: false,
      reason: `TDB_SYNC_PENDING: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}


/**
 * T2 READ — cross-session hydration (the durable memory pull).
 * When a NEW session's T1 (SQLite) is cold, the context manager pulls the
 * agent's prior analyses from the durable TencentDB store (searchConversation).
 * FAIL-OPEN: any error returns [] — a cold T1 stays cold, never crashes.
 */
export async function tdbLoadHistory(
  projectId: string,
  sessionKey: string,
  limit = 5,
): Promise<string[]> {
  const cfg = tdaiConfig();
  if (!cfg) return [];
  try {
    const client = new TDAIClient(cfg);
    // The search must filter by SESSION (the core's session_id dimension — the
    // rows are stored with sessionKey=vc-{project}-{session}, agentId="default").
    // The agent_id filter matches the META-plane agent, NOT the session — an
    // agent_id-scoped search returns [] for every tool row (the S6 finding).
    const root = agentRootId(projectId, sessionKey);
    const items = await client.searchConversation(
      `[frame`,
      limit,
      { sessionId: root },
    );
    const texts: string[] = [];
    for (const item of items ?? []) {
      const content = item?.content ?? item?.text ?? item?.message ?? '';
      if (typeof content === 'string' && content.length > 0) texts.push(content);
    }
    return texts;
  } catch (e) {
    console.error(`[vc-tdb] T2 read failed (fail-open): ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

export async function tdbSyncAnalysis(
  projectId: string,
  sessionKey: string,
  analysisText: string,
  frameSeq: number,
): Promise<TdbSyncResult> {
  const prefix = `[frame ${frameSeq}] `;
  const full = `${prefix}${analysisText}`;
  // M18: the core rejects messages > 8192 chars ("Too big: expected string to
  // have <=8192 characters" — a 400 that the fire-and-forget swallowed, so
  // long analyses were silently lost from the durable store). Chunk long
  // analyses into <=8000-char messages (the first carries the frame marker);
  // addConversation accepts the messages array natively.
  if (full.length <= MAX_TDB_MESSAGE_CHARS) {
    return tdbWriteMemory(projectId, sessionKey, { role: 'assistant', content: full });
  }
  const chunks: { role: 'assistant'; content: string }[] = [];
  let rest = analysisText;
  while (rest.length > 0) {
    const cut = Math.min(rest.length, MAX_TDB_MESSAGE_CHARS - prefix.length);
    chunks.push({ role: 'assistant', content: rest.slice(0, cut) });
    rest = rest.slice(cut);
  }
  chunks[0] = { role: 'assistant', content: `${prefix}${chunks[0].content}` };
  const cfg = tdaiConfig();
  if (!cfg) {
    return { synced: false, reason: 'TDB_SYNC_PENDING: TencentDB not configured (TDAI_USER_KEY env missing)' };
  }
  try {
    const client = new TDAIClient(cfg);
    await client.addConversation(agentRootId(projectId, sessionKey), chunks);
    return { synced: true, reason: `chunked ${chunks.length}` };
  } catch (e) {
    return {
      synced: false,
      reason: `TDB_SYNC_PENDING: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
