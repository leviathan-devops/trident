import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'os';

// ── Evidence store interface ──
interface EvidenceStoreLike {
  append(sessionId: string, mode: string, layer: string, eventType: string, payload: Record<string, unknown>): Promise<unknown>;
  queryBySession(sessionId: string): Promise<Array<Record<string, unknown>>>;
  queryByMode(mode: string): Promise<Array<Record<string, unknown>>>;
  queryByLayer(layer: string): Promise<Array<Record<string, unknown>>>;
  queryByTimestamp(from: number, to: number): Promise<Array<Record<string, unknown>>>;
  queryBySessionAndMode(sessionId: string, mode: string): Promise<Array<Record<string, unknown>>>;
  compact(): Promise<{ deleted: number; newRootHash: string }>;
  verifyChain(): Promise<{ valid: boolean; brokenAt: number | string | null }>;
  close(): Promise<void>;
}

// Lazy EvidenceStore initialization with sql.js (in-memory SQLite, no native deps)
let _evidenceStore: EvidenceStoreLike | null = null;

async function getOrCreateEvidenceStore(): Promise<EvidenceStoreLike> {
  if (!_evidenceStore) {
    try {
      const { EvidenceStore } = await import('./evidence/evidence-store.js');
      _evidenceStore = new EvidenceStore() as unknown as EvidenceStoreLike;
    } catch (e: unknown) {
      console.error('[utils] EvidenceStore import failed:', e instanceof Error ? e.message : String(e));
      // sql.js not available — use file-backed fallback
      _evidenceStore = fallbackStore;
      return _evidenceStore;
    }
  }
  return _evidenceStore;
}

// ── FILE-BACKED FALLBACK STORE (not theatrical) ──
// WHY: When sql.js is unavailable, evidence still gets written to disk.
// ANTI-PATTERN: fallbackStore with `append: () => Promise.resolve()` and
//   `verifyChain: () => Promise.resolve({valid: true})` — that is THEATRICAL.
const EVIDENCE_DIR = path.join(process.env.TRIDENT_EVIDENCE_DIR || path.join(tmpdir(), '.trident', 'evidence'));

const fallbackStore = {
  append: async (sessionId: string, mode: string, layer: string, operation: string, data: Record<string, unknown>): Promise<void> => {
    try {
      const dir = path.resolve(EVIDENCE_DIR);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, `${sessionId}-${mode}-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        sessionId, mode, layer, operation, data, timestamp: Date.now(),
      }, null, 2), 'utf-8');
    } catch (e: unknown) {
      // Cannot even write fallback — log to stderr as last resort
      console.error('[Trident fallbackStore] write failed:', e instanceof Error ? e.message : String(e));
      return;
    }
  },

  queryBySession: async (sessionId: string): Promise<Record<string, unknown>[]> => {
    try {
      const dir = path.resolve(EVIDENCE_DIR);
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir).filter((f: string): boolean => f.startsWith(sessionId) && f.endsWith('.json'));
      return files.map((f: string): Record<string, unknown> => {
        try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); return d && typeof d === 'object' ? d as Record<string, unknown> : {}; }
        catch (e: unknown) { console.error('[utils] queryBySession file parse failed:', e instanceof Error ? e.message : String(e)); return {}; }
      });
    } catch (e: unknown) { console.error('[utils] queryBySession failed:', e instanceof Error ? e.message : String(e)); return []; }
  },

  queryByMode: async (mode: string): Promise<Record<string, unknown>[]> => {
    try {
      const dir = path.resolve(EVIDENCE_DIR);
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir).filter((f: string): boolean => f.endsWith('.json'));
      return files.map((f: string): Record<string, unknown> => {
        try {
          const parsedContent = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); const content = parsedContent && typeof parsedContent === 'object' ? parsedContent as Record<string, unknown> : {};
          return content.mode === mode ? content : {};
        } catch (e: unknown) { console.error('[utils] queryByMode file parse failed:', e instanceof Error ? e.message : String(e)); return {}; }
      });
    } catch (e: unknown) { console.error('[utils] queryByMode failed:', e instanceof Error ? e.message : String(e)); return []; }
  },

  queryByLayer: async (_layer: string): Promise<Record<string, unknown>[]> => {
    // File-backed store doesn't support layer queries efficiently
    return [];
  },

  queryByTimestamp: async (_from: number, _to: number): Promise<Record<string, unknown>[]> => {
    // File-backed store doesn't support timestamp range queries efficiently
    return [];
  },

  queryBySessionAndMode: async (sessionId: string, mode: string): Promise<Record<string, unknown>[]> => {
    try {
      const dir = path.resolve(EVIDENCE_DIR);
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir).filter((f: string): boolean => f.startsWith(sessionId) && f.endsWith('.json'));
      return files.map((f: string): Record<string, unknown> => {
        try {
          const parsedContent = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); const content = parsedContent && typeof parsedContent === 'object' ? parsedContent as Record<string, unknown> : {};
          return content.mode === mode ? content : {};
        } catch (e: unknown) { console.error('[utils] queryBySessionAndMode file parse failed:', e instanceof Error ? e.message : String(e)); return {}; }
      });
    } catch (e: unknown) { console.error('[utils] queryBySessionAndMode failed:', e instanceof Error ? e.message : String(e)); return []; }
  },

  compact: async (): Promise<{ deleted: number; newRootHash: string }> => {
    return { deleted: 0, newRootHash: '' };
  },

  verifyChain: async (): Promise<{ valid: boolean; brokenAt: string | null }> => {
    try {
      const dir = path.resolve(EVIDENCE_DIR);
      if (!fs.existsSync(dir)) return { valid: false, brokenAt: 'no_evidence_dir' };
      const files = fs.readdirSync(dir).filter((f: string): boolean => f.endsWith('.json')).sort();
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Record<string, unknown>;
          if (!content || typeof content !== 'object') {
            return { valid: false, brokenAt: f };
          }
        } catch (e: unknown) {
          console.error('[utils] verifyChain file parse failed:', e instanceof Error ? e.message : String(e));
          return { valid: false, brokenAt: f };
        }
      }
      // All evidence files parsed and validated as valid JSON
      return { valid: true, brokenAt: null };
    } catch (e: unknown) {
      console.error('[utils] verifyChain failed:', e instanceof Error ? e.message : String(e));
      return { valid: false, brokenAt: 'storage_error' };
    }
  },

  close: async (): Promise<void> => {},
};

export async function tridentLog(level: string, component: string, message: string): Promise<void> {
  try {
    const store = await getOrCreateEvidenceStore();
    await store.append('global', 'SYSTEM', 'R0', `log:${level}`, { source: component, message, timestamp: Date.now() });
  } catch (e: unknown) {
    console.error('[utils] Evidence store log failed:', e instanceof Error ? e.message : String(e));
    return;
  }
}

export function getEvidenceStore(): Promise<EvidenceStoreLike> {
  return getOrCreateEvidenceStore();
}

// Re-export all existing utility functions unchanged
import { appendFileSync } from 'node:fs';
import * as os from 'os';
import * as path2 from 'path';
import { Finding, SEVERITY, Severity } from './types.js';

const TRIDENT_LOG_PATH = process.env.TRIDENT_LOG_PATH || path2.join(os.tmpdir(), 'trident-engine.log');
const TRIDENT_FALLBACK_LOG = path2.join(os.tmpdir(), 'trident-error.log');

const SEVERITY_ORDER: Record<Severity, number> = {
  [SEVERITY.CRITICAL]: 4,
  [SEVERITY.HIGH]: 3,
  [SEVERITY.MEDIUM]: 2,
  [SEVERITY.LOW]: 1,
  [SEVERITY.INFO]: 0,
};

export function shortFile(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) return '<unknown>';
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1] || filePath;
  const lineMatch = filePath.match(/:(\d+)$/);
  if (lineMatch) {
    const base = fileName.replace(/:\d+$/, '');
    return `${base}:${lineMatch[1]}`;
  }
  return fileName;
}

export function confidenceLabel(confidence: number): string {
  if (typeof confidence !== 'number' || isNaN(confidence)) return 'LOW';
  if (confidence >= 0.9) return 'CRITICAL';
  if (confidence >= 0.7) return 'HIGH';
  if (confidence >= 0.4) return 'MEDIUM';
  return 'LOW';
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  if (!Array.isArray(findings)) return [];
  const bucket = new Map<string, Finding>();
  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const loc = `${f.file || ''}:${f.line ?? 'x'}:${f.category || ''}`;
    const existing = bucket.get(loc);
    if (!existing) {
      bucket.set(loc, f);
      continue;
    }
    const existingRank = SEVERITY_ORDER[existing.severity] ?? -1;
    const currentRank = SEVERITY_ORDER[f.severity] ?? -1;
    if (currentRank > existingRank) {
      bucket.set(loc, f);
    }
  }
  return Array.from(bucket.values());
}

export function parseVersion(versionStr: string): { major: number; minor: number; patch: number } {
  const defaultResult = { major: 1, minor: 0, patch: 0 };
  if (typeof versionStr !== 'string' || versionStr.length === 0) return defaultResult;
  const cleaned = versionStr.replace(/^V/i, '');
  const parts = cleaned.split('.').map(Number);
  const safe = (v: number): number => (isNaN(v) ? 0 : Math.max(0, v));
  return { major: safe(parts[0] ?? 0), minor: safe(parts[1] ?? 0), patch: safe(parts[2] ?? 0) };
}

export function formatVersion(major: number, minor: number, patch: number): string {
  const safe = (v: number): number => { const n = typeof v === 'number' && !isNaN(v) ? v : 0; return Math.max(0, n); };
  return `V${safe(major)}.${safe(minor)}.${safe(patch)}`;
}
