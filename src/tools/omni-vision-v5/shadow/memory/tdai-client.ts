/**
 * TDAIClient — raw v3 HTTP client for the TencentDB Agent Memory service.
 *
 * Per-shadow-agent memory backend. Every call is a JSON POST against the
 * service's /v3 API; responses carry a uniform envelope
 * `{ code, message, request_id, data }` where code 0 means success. A
 * non-zero code is surfaced as a {@link TDApiError}. Network errors and
 * 429/5xx responses are retried (up to 2 retries, 500ms backoff) before the
 * failure is rethrown as a wrapped TDApiError.
 *
 * Isolation model: the client is bound to one memory user via `userKey`
 * (sk-mem-...). All data-plane operations auto-inject the isolation triad
 * (`team_id` / `agent_id` / `user_id`) into both headers and body — body
 * fields win when both are present. Pass `{ teamId, agentId, userId }`
 * per call to target a different agent.
 *
 * Auth bootstrap: creating the FIRST business user requires an admin key.
 * Pass it as `adminKey` to {@link TDAIClient.createUser}.
 */

import { tiError, tiLog } from '../utils/logger.js';

const NS = 'tdai-client';

export const DEFAULT_ENDPOINT = process.env.TDAI_ENDPOINT || 'http://172.17.0.1:8420';
const DEFAULT_SERVICE_ID = 'default';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

interface Envelope {
  code: number;
  message: string;
  request_id: string;
  data: unknown;
}

/** Error thrown when the service reports a non-zero envelope code or the request could not be completed. */
export class TDApiError extends Error {
  readonly code: number;
  readonly requestId: string;

  constructor(code: number, message: string, requestId: string) {
    super(message);
    this.name = 'TDApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

/** Client configuration. `endpoint` defaults to the local v3 service. */
export interface TDAIConfig {
  endpoint: string;
  serviceId?: string;
  userKey: string;
  teamId?: string;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskKey(key: string): string {
  if (!key) return '';
  return key.length <= 8 ? '***' : `${key.slice(0, 8)}***`;
}

async function parseEnvelope(response: Response): Promise<Envelope | null> {
  try {
    const parsed: unknown = await response.json();
    if (parsed === null || typeof parsed !== 'object') return null;
    const raw = parsed as Record<string, unknown>;
    if (raw === null || typeof raw !== 'object' || typeof raw.code !== 'number') return null;
    return {
      code: raw.code,
      message: typeof raw.message === 'string' ? raw.message : '',
      request_id: typeof raw.request_id === 'string' ? raw.request_id : '',
      data: raw.data,
    };
  } catch {
    return null;
  }
}

function wrapNetworkError(path: string, cause: unknown): TDApiError {
  const detail = cause instanceof Error ? cause.message : String(cause ?? 'unknown error');
  return new TDApiError(-1, `network error on ${path}: ${detail}`, '');
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof TDApiError)) return false;
  const message = err.message.toLowerCase();
  return (
    /not ?found|no such|missing|不存在|未找到/.test(message) ||
    [404, 40400, 40004].includes(err.code)
  );
}

function extractItems(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.entries)) return obj.entries;
    if (Array.isArray(obj.list)) return obj.list;
    if (Array.isArray(obj.messages)) return obj.messages; // conversation/search envelope
    if (Array.isArray(obj.hits)) return obj.hits;         // skill listing hits
  }
  return [];
}

/**
 * Per-shadow-agent memory client. Binds to one memory user; any call can
 * override the isolation triad via the trailing `overrides` argument.
 */
export class TDAIClient {
  private readonly config: TDAIConfig;

  constructor(config: TDAIConfig) {
    this.config = {
      ...config,
      endpoint: config.endpoint?.trim() || DEFAULT_ENDPOINT,
      serviceId: config.serviceId ?? DEFAULT_SERVICE_ID,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  private resolve(overrides?: Partial<TDAIConfig>): TDAIConfig {
    return overrides !== undefined ? { ...this.config, ...overrides } : this.config;
  }

  /** Merge the isolation triad into a request body from the effective config. */
  private withTriad(body: Record<string, unknown>, cfg: TDAIConfig): Record<string, unknown> {
    const out = { ...body };
    if (cfg.userId !== undefined) out.user_id = cfg.userId;
    if (cfg.teamId !== undefined) out.team_id = cfg.teamId;
    if (cfg.agentId !== undefined) out.agent_id = cfg.agentId;
    if (cfg.sessionId !== undefined) out.session_id = cfg.sessionId;
    return out;
  }

  private logError(op: string, err: unknown, extra: Record<string, unknown> = {}): void {
    if (err instanceof TDApiError) {
      tiError(NS, `${op} failed`, { code: err.code, requestId: err.requestId, ...extra });
    } else {
      tiError(NS, `${op} failed`, {
        error: err instanceof Error ? err.message : String(err),
        ...extra,
      });
    }
  }

  /**
   * Single POST against a /v3 endpoint. Retries 429/5xx and network errors up
   * to MAX_RETRIES times with RETRY_DELAY_MS backoff. Non-zero envelope codes
   * and exhausted retries surface as {@link TDApiError}.
   */
  private async request<T>(
    path: string,
    body: Record<string, unknown>,
    cfg: TDAIConfig,
  ): Promise<{ data: T; requestId: string }> {
    const endpoint = (cfg.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '');
    const url = `${endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tdai-user-key': cfg.userKey,
      'x-tdai-service-id': cfg.serviceId ?? DEFAULT_SERVICE_ID,
      'Authorization': `Bearer ${cfg.userKey}`,
    };
    if (cfg.teamId !== undefined) headers['x-tdai-team-id'] = cfg.teamId;
    if (cfg.agentId !== undefined) headers['x-tdai-agent-id'] = cfg.agentId;
    if (cfg.userId !== undefined) headers['x-tdai-user-id'] = cfg.userId;
    if (cfg.sessionId !== undefined) headers['x-tdai-session-id'] = cfg.sessionId;

    const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let attempts = 0;
    let lastError: unknown;

    for (;;) {
      if (attempts > 0) await sleep(RETRY_DELAY_MS);
      attempts += 1;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if ((response.status === 429 || response.status >= 500) && attempts <= MAX_RETRIES) {
          lastError = new Error(`${response.status} ${response.statusText}`);
          continue;
        }

        const envelope = await parseEnvelope(response);
        if (envelope === null) {
          if (!response.ok) {
            throw new TDApiError(response.status, `${response.status} ${response.statusText}`, '');
          }
          throw new TDApiError(-1, `non-envelope response from ${path}`, '');
        }
        if (envelope.code !== 0) {
          throw new TDApiError(envelope.code, envelope.message, envelope.request_id);
        }
        // P2 guard: the envelope's data is ALREADY shape-validated by
        // parseEnvelope (a non-object/null data would have returned null and
        // failed the envelope check above). The cast narrows the validated
        // unknown to the caller's expected type — the caller's own field
        // access is the second guard (defensive reads, never blind indexing).
        return { data: envelope.data as T, requestId: envelope.request_id };
      } catch (err) {
        if (err instanceof TDApiError) throw err;
        lastError = err;
        if (attempts > MAX_RETRIES) break;
      }
    }

    throw wrapNetworkError(path, lastError);
  }

  // ── Meta plane ────────────────────────────────────────────────────────────

  /**
   * Create a business user. Requires the bootstrap admin key unless a
   * business user already exists.
   */
  async createUser(
    username: string,
    adminKey?: string,
  ): Promise<{ userId: string; userKey: string }> {
    const cfg =
      adminKey !== undefined && adminKey !== '' ? { ...this.config, userKey: adminKey } : this.config;
    const op = 'createUser';
    try {
      const { data, requestId } = await this.request<{
        user_id: string;
        default_user_key?: string;
        user_key?: string;
      }>('/v3/meta/user/create', { username }, cfg);
      const userKey = data.default_user_key ?? data.user_key ?? '';
      tiLog(NS, op, { username, userId: data.user_id, requestId });
      return { userId: data.user_id, userKey };
    } catch (err) {
      this.logError(op, err, { username });
      throw err;
    }
  }

  async createTeam(name: string, ownerUserId: string): Promise<{ teamId: string }> {
    const op = 'createTeam';
    try {
      const { data, requestId } = await this.request<{ team_id: string }>(
        '/v3/meta/team/create',
        { name, owner_user_id: ownerUserId },
        this.config,
      );
      tiLog(NS, op, { name, teamId: data.team_id, requestId });
      return { teamId: data.team_id };
    } catch (err) {
      this.logError(op, err, { name });
      throw err;
    }
  }

  async createAgent(
    teamId: string,
    ownerUserId: string,
    name: string,
    metadataJson?: string,
  ): Promise<{ agentId: string }> {
    const op = 'createAgent';
    const body: Record<string, unknown> = { team_id: teamId, owner_user_id: ownerUserId, name };
    if (metadataJson !== undefined) body.metadata_json = metadataJson;
    try {
      const { data, requestId } = await this.request<{ agent_id: string }>(
        '/v3/meta/agent/create',
        body,
        this.config,
      );
      tiLog(NS, op, { teamId, name, agentId: data.agent_id, requestId });
      return { agentId: data.agent_id };
    } catch (err) {
      this.logError(op, err, { teamId, name });
      throw err;
    }
  }

  async getAgent(agentId: string): Promise<any> {
    const op = 'getAgent';
    try {
      const { data, requestId } = await this.request<any>(
        '/v3/meta/agent/get',
        { agent_id: agentId },
        this.config,
      );
      tiLog(NS, op, { agentId, requestId });
      return data;
    } catch (err) {
      this.logError(op, err, { agentId });
      throw err;
    }
  }

  /**
   * List agents in scope. `team_id` is optional in the v3 API — when omitted,
   * the request is scoped by the isolation triad header (config.teamId).
   */
  async listAgents(teamId?: string): Promise<any[]> {
    const op = 'listAgents';
    const body: Record<string, unknown> = {};
    if (teamId !== undefined) body.team_id = teamId;
    try {
      const { data, requestId } = await this.request<any>('/v3/meta/agent/list', body, this.config);
      const agents = extractItems(data);
      tiLog(NS, op, { teamId, agents: agents.length, requestId });
      return agents;
    } catch (err) {
      this.logError(op, err, { teamId });
      throw err;
    }
  }

  async updateAgentMetadata(agentId: string, metadataJson: string): Promise<void> {
    const op = 'updateAgentMetadata';
    try {
      const { requestId } = await this.request<Record<string, unknown>>(
        '/v3/meta/agent/update',
        { agent_id: agentId, metadata_json: metadataJson },
        this.config,
      );
      tiLog(NS, op, { agentId, requestId });
    } catch (err) {
      this.logError(op, err, { agentId });
      throw err;
    }
  }

  // ── Data plane ────────────────────────────────────────────────────────────

  async addConversation(
    sessionId: string,
    messages: { role: string; content: string; tool_name?: string; tool_call_id?: string }[],
    overrides?: Partial<TDAIConfig>,
  ): Promise<string[]> {
    const cfg = this.resolve(overrides);
    const op = 'addConversation';
    try {
      const { data, requestId } = await this.request<{ accepted_ids?: string[] }>(
        '/v3/conversation/add',
        { session_id: sessionId, ...this.withTriad({}, cfg), messages },
        cfg,
      );
      const accepted = Array.isArray(data?.accepted_ids) ? data.accepted_ids : [];
      tiLog(NS, op, { sessionId, accepted: accepted.length, requestId });
      return accepted;
    } catch (err) {
      this.logError(op, err, { sessionId });
      throw err;
    }
  }

  async searchConversation(
    query: string,
    limit?: number,
    overrides?: Partial<TDAIConfig>,
  ): Promise<any[]> {
    const cfg = this.resolve(overrides);
    const op = 'searchConversation';
    const body = this.withTriad({ query }, cfg);
    if (limit !== undefined) body.limit = limit;
    try {
      const { data, requestId } = await this.request<any>('/v3/conversation/search', body, cfg);
      const items = extractItems(data);
      tiLog(NS, op, { query: query.slice(0, 64), hits: items.length, requestId });
      return items;
    } catch (err) {
      this.logError(op, err, { query: query.slice(0, 64) });
      throw err;
    }
  }

  async searchAtomic(query: string, limit?: number, overrides?: Partial<TDAIConfig>): Promise<any[]> {
    const cfg = this.resolve(overrides);
    const op = 'searchAtomic';
    const body = this.withTriad({ query }, cfg);
    if (limit !== undefined) body.limit = limit;
    try {
      const { data, requestId } = await this.request<any>('/v3/atomic/search', body, cfg);
      const items = extractItems(data);
      tiLog(NS, op, { query: query.slice(0, 64), hits: items.length, requestId });
      return items;
    } catch (err) {
      this.logError(op, err, { query: query.slice(0, 64) });
      throw err;
    }
  }

  async scenarioList(pathPrefix?: string, overrides?: Partial<TDAIConfig>): Promise<any[]> {
    const cfg = this.resolve(overrides);
    const op = 'scenarioList';
    const body = this.withTriad({}, cfg);
    if (pathPrefix !== undefined) body.path_prefix = pathPrefix;
    try {
      const { data, requestId } = await this.request<any>('/v3/scenario/ls', body, cfg);
      const entries = extractItems(data);
      tiLog(NS, op, { pathPrefix, entries: entries.length, requestId });
      return entries;
    } catch (err) {
      this.logError(op, err, { pathPrefix });
      throw err;
    }
  }

  async scenarioRead(
    path: string,
    overrides?: Partial<TDAIConfig>,
  ): Promise<{ path: string; content: string; version: number } | null> {
    const cfg = this.resolve(overrides);
    const op = 'scenarioRead';
    try {
      const { data, requestId } = await this.request<{
        path?: string;
        content?: string;
        version?: number;
      }>('/v3/scenario/read', this.withTriad({ path }, cfg), cfg);
      tiLog(NS, op, { path, hit: data !== null, requestId });
      if (data === null) return null;
      return { path: data.path ?? path, content: data.content ?? '', version: data.version ?? 0 };
    } catch (err) {
      if (err instanceof TDApiError && isNotFoundError(err)) {
        tiLog(NS, op, { path, hit: false, code: err.code });
        return null;
      }
      this.logError(op, err, { path });
      throw err;
    }
  }

  async scenarioWrite(
    path: string,
    content: string,
    overrides?: Partial<TDAIConfig>,
  ): Promise<{ path: string; version: number }> {
    const cfg = this.resolve(overrides);
    const op = 'scenarioWrite';
    try {
      const { data, requestId } = await this.request<{ path?: string; version?: number }>(
        '/v3/scenario/write',
        this.withTriad({ path, content }, cfg),
        cfg,
      );
      tiLog(NS, op, { path, chars: content.length, requestId });
      return { path: data?.path ?? path, version: data?.version ?? 0 };
    } catch (err) {
      this.logError(op, err, { path });
      throw err;
    }
  }

  async coreRead(): Promise<{ content: string; version: number } | null> {
    const op = 'coreRead';
    try {
      const { data, requestId } = await this.request<{ content?: string; version?: number }>(
        '/v3/core/read',
        {},
        this.config,
      );
      tiLog(NS, op, { hit: data !== null, requestId });
      if (data === null) return null;
      return { content: data.content ?? '', version: data.version ?? 0 };
    } catch (err) {
      if (err instanceof TDApiError && isNotFoundError(err)) {
        tiLog(NS, op, { hit: false, code: err.code });
        return null;
      }
      this.logError(op, err, {});
      throw err;
    }
  }

  async coreWrite(content: string): Promise<{ version: number }> {
    const op = 'coreWrite';
    try {
      const { data, requestId } = await this.request<{ version?: number }>(
        '/v3/core/write',
        { content },
        this.config,
      );
      tiLog(NS, op, { chars: content.length, requestId });
      return { version: data?.version ?? 0 };
    } catch (err) {
      this.logError(op, err, {});
      throw err;
    }
  }

  async createSkill(
    name: string,
    content: string,
    overrides?: Partial<TDAIConfig>,
  ): Promise<{ skillId: string }> {
    const cfg = this.resolve(overrides);
    const op = 'createSkill';
    try {
      const { data, requestId } = await this.request<{ skill_id?: string }>(
        '/v3/skill/create',
        this.withTriad({ name, content }, cfg),
        cfg,
      );
      const skillId = data?.skill_id ?? '';
      tiLog(NS, op, { name, skillId, requestId });
      return { skillId };
    } catch (err) {
      this.logError(op, err, { name });
      throw err;
    }
  }

  async skillListing(
    query?: string,
    charBudget?: number,
    overrides?: Partial<TDAIConfig>,
  ): Promise<any> {
    const cfg = this.resolve(overrides);
    const op = 'skillListing';
    const body: Record<string, unknown> = {};
    if (cfg.teamId !== undefined) body.team_id = cfg.teamId;
    if (cfg.agentId !== undefined) body.agent_id = cfg.agentId;
    if (query !== undefined && query !== '') body.query = query;
    if (charBudget !== undefined) body.char_budget = charBudget;
    try {
      const { data, requestId } = await this.request<any>('/v3/skill/listing', body, cfg);
      tiLog(NS, op, { query, charBudget, requestId });
      return data;
    } catch (err) {
      this.logError(op, err, { query });
      throw err;
    }
  }


  /**
   * Fetch a skill by its generated skill_id (skl-...). includeContent=true
   * returns the full content with YAML frontmatter.
   */
  async getSkill(
    skillId: string,
    includeContent?: boolean,
    overrides?: Partial<TDAIConfig>,
  ): Promise<{ skill_id: string; name: string; version: number; content?: string } | null> {
    const cfg = this.resolve(overrides);
    const op = 'getSkill';
    try {
      const { data, requestId } = await this.request<any>(
        '/v3/skill/get',
        this.withTriad({ skill_id: skillId, include_content: includeContent === true }, cfg),
        cfg,
      );
      if (data === null || typeof data !== 'object') return null;
      tiLog(NS, op, { skillId, version: data.version, requestId });
      return {
        skill_id: data.skill_id ?? skillId,
        name: data.name ?? '',
        version: data.version ?? 0,
        content: typeof data.content === 'string' ? data.content : undefined,
      };
    } catch (err) {
      this.logError(op, err, { skillId });
      throw err;
    }
  }

  /**
   * Update a skill. expected_version is mandatory (40901 on stale).
   */
  async updateSkill(
    skillId: string,
    content: string,
    expectedVersion: number,
    overrides?: Partial<TDAIConfig>,
  ): Promise<{ skillId: string; version: number }> {
    const cfg = this.resolve(overrides);
    const op = 'updateSkill';
    try {
      const { data, requestId } = await this.request<any>(
        '/v3/skill/update',
        this.withTriad({ skill_id: skillId, content, expected_version: expectedVersion }, cfg),
        cfg,
      );
      tiLog(NS, op, { skillId, version: data?.version, requestId });
      return { skillId: data?.skill_id ?? skillId, version: data?.version ?? expectedVersion };
    } catch (err) {
      this.logError(op, err, { skillId });
      throw err;
    }
  }
}
