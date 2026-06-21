import * as path from 'node:path';
import * as fs from 'node:fs';

export class EvidenceGate {
  private readonly evidenceDir: string;

  constructor(basePath?: string) {
    this.evidenceDir = path.join(basePath || process.cwd(), '.trident', 'evidence', 'delivery');
  }

  hasContainerTestEvidence(): boolean {
    try {
      const resultPath = path.join(this.evidenceDir, 'ContainerTestResult.json');
      if (!fs.existsSync(resultPath)) return false;
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
      const total = (result.totalTests as number) || (result.total_tests as number) || 0;
      const passed = (result.passedTests as number) || (result.passed_tests as number) || 0;
      if (total === 0) return false;
      return (passed / total) >= 0.96;
    } catch (e) {
      // Evidence file missing or corrupted — treat as no evidence
      console.error('[evidence-gate] hasContainerTestEvidence failed:', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

}

/** Singleton instance */
export const evidenceGate = new EvidenceGate();
