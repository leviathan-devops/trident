import { P1P10Scanner, ScanResult } from './scanner.js';
import { tridentLog } from '../../utils.js';

export { P1P10Scanner, ScanResult };

export class P1P10Verification {
  private scanner: P1P10Scanner;
  private lastResults: ScanResult[] = [];

  constructor() {
    this.scanner = new P1P10Scanner();
    tridentLog('INFO', 'p1-p10', 'P1-P10 Scanner initialized');
  }

  /** Scan a directory for P1-P10 compliance */
  scan(targetPath: string): { results: ScanResult[]; score: number } {
    this.lastResults = this.scanner.scanDirectory(targetPath);
    
    const totalChecks = this.lastResults.length;
    const passed = this.lastResults.filter(r => r.passed).length;
    const score = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 100;
    
    tridentLog('INFO', 'p1-p10', `Scan complete: ${passed}/${totalChecks} passed (${score}%)`);
    return { results: this.lastResults, score };
  }

  /** Get last scan results */
  getLastResults(): ScanResult[] {
    return [...this.lastResults];
  }
}
