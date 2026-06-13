/**
 * EVIDENCE GATE — Triple Evidence Enforcement
 *
 * Enforces the triple evidence rule for gate advancement:
 *   ContainerTestResult.json + TuiInteraction.json + EvidencePathVerified.json
 *
 * Every gate advancement requires specific evidence files with 96%+ pass rate.
 * This is a SHARED infrastructure class — not a warhead. Warheads DELEGATE to it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EvidenceCheck {
  pass: boolean;
  evidence: {
    containerTestResult: boolean;
    tuiInteraction: boolean;
    evidencePathVerified: boolean;
  };
  passRate: number;
  missingFiles: string[];
}

export class EvidenceGate {
  private evidenceDir: string;

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.evidenceDir = path.join(dir, '.trident', 'evidence', 'delivery');
  }

  hasContainerTestEvidence(): boolean {
    const p = path.join(this.evidenceDir, 'ContainerTestResult.json');
    if (!fs.existsSync(p)) return false;
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const total = (parsed.totalTests as number) || (parsed.total_tests as number) || 0;
      const passed = (parsed.passedTests as number) || (parsed.passed_tests as number) || 0;
      if (total === 0) return false;
      return (passed / total) >= 0.96;
    } catch { return false; }
  }

  hasTuiInteraction(): boolean {
    return fs.existsSync(path.join(this.evidenceDir, 'TuiInteraction.json'));
  }

  hasEvidencePathVerified(): boolean {
    return fs.existsSync(path.join(this.evidenceDir, 'EvidencePathVerified.json'));
  }

  checkAll(): EvidenceCheck {
    const cr = this.hasContainerTestEvidence();
    const ti = this.hasTuiInteraction();
    const ep = this.hasEvidencePathVerified();
    const present = [cr, ti, ep].filter(Boolean).length;
    return {
      pass: cr && ti && ep,
      evidence: { containerTestResult: cr, tuiInteraction: ti, evidencePathVerified: ep },
      passRate: present / 3,
      missingFiles: [
        ...(!cr ? ['ContainerTestResult.json'] : []),
        ...(!ti ? ['TuiInteraction.json'] : []),
        ...(!ep ? ['EvidencePathVerified.json'] : []),
      ],
    };
  }

  getRequiredEvidence(gate: string): string[] {
    switch (gate) {
      case 'TEST': return ['ContainerTestResult.json', 'TuiInteraction.json'];
      case 'VERIFY': return ['ContainerTestResult.json', 'TuiInteraction.json', 'EvidencePathVerified.json'];
      case 'DELIVERY': return ['ContainerTestResult.json', 'TuiInteraction.json', 'EvidencePathVerified.json'];
      default: return [];
    }
  }

  getEvidenceDir(): string {
    return this.evidenceDir;
  }
}

/** Singleton instance */
export const evidenceGate = new EvidenceGate();
