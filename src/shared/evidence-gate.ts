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
    } catch {
      return false;
    }
  }

  hasRequiredEvidence(gate: string): string[] {
    const required: string[] = [];
    switch (gate) {
      case 'TEST':
        required.push('ContainerSpawnResult.json', 'ContainerTestResult.json');
        break;
      case 'VERIFY':
        required.push('ContainerTestResult.json');
        break;
      case 'AUDIT':
        required.push('TridentReport.json', 'ContainerTestResult.json');
        break;
      case 'DELIVERY':
        required.push('ShipManifest.json', 'ContainerTestResult.json');
        break;
    }
    return required.filter(f => !fs.existsSync(path.join(this.evidenceDir, f)));
  }

  validatePassRate(result: Record<string, unknown>, threshold = 0.96): boolean {
    const total = (result.totalTests as number) || (result.total_tests as number) || 0;
    const passed = (result.passedTests as number) || (result.passed_tests as number) || 0;
    if (total === 0) return false;
    return (passed / total) >= threshold;
  }
}

/** Singleton instance */
export const evidenceGate = new EvidenceGate();
