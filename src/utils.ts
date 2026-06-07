import { join } from 'path';
import { tmpdir } from 'os';

// Lazy EvidenceStore initialization with sql.js (in-memory SQLite, no native deps)
let _evidenceStore: any = null;

async function getOrCreateEvidenceStore(): Promise<any> {
  if (!_evidenceStore) {
    try {
      const { EvidenceStore } = await import('./evidence/evidence-store.js');
      _evidenceStore = new EvidenceStore();
    } catch {
      // sql.js not available — use in-memory fallback
      _evidenceStore = fallbackStore;
    }
  }
  return _evidenceStore;
}

const fallbackStore = {
  append: () => Promise.resolve(),
  queryBySession: () => Promise.resolve([]),
  queryByMode: () => Promise.resolve([]),
  queryByLayer: () => Promise.resolve([]),
  queryByTimestamp: () => Promise.resolve([]),
  queryBySessionAndMode: () => Promise.resolve([]),
  compact: () => Promise.resolve({ deleted: 0, newRootHash: '' }),
  verifyChain: () => Promise.resolve({ valid: true, brokenAt: null }),
  close: () => Promise.resolve(),
};

export async function tridentLog(level: string, component: string, message: string): Promise<void> {
  try {
    const store = await getOrCreateEvidenceStore();
    await store.append('global', 'SYSTEM', 'R0', `log:${level}`, { source: component, message, timestamp: Date.now() });
  } catch {
    // Silently discard if evidence store is unavailable
  }
}

export function getEvidenceStore(): Promise<any> {
  return getOrCreateEvidenceStore();
}

// Re-export all existing utility functions unchanged
import { appendFileSync } from 'node:fs';
import * as os from 'os';
import * as path from 'path';
import { Finding, SEVERITY, Severity } from './types.js';

const TRIDENT_LOG_PATH = process.env.TRIDENT_LOG_PATH || path.join(os.tmpdir(), 'trident-engine.log');
const TRIDENT_FALLBACK_LOG = path.join(os.tmpdir(), 'trident-error.log');

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
