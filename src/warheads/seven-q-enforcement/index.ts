import { SevenQChecker, SevenQResult } from './checker.js';
import { tridentLog } from '../../utils.js';

export { SevenQChecker, SevenQResult };

export class SevenQEnforcement {
  private checker: SevenQChecker;
  private violations: number = 0;
  private totalChecks: number = 0;

  constructor() {
    this.checker = new SevenQChecker();
    tridentLog('INFO', 'seven-q', '7-Q Enforcement initialized');
  }

  /** Run all 7 questions against tool input. Returns true if ALL pass. */
  checkAll(toolName: string, toolArgs: Record<string, unknown>): { passed: boolean; results: SevenQResult[]; violations: SevenQResult[] } {
    this.totalChecks++;
    const results = this.checker.checkAll(toolName, toolArgs);
    const failed = results.filter(r => !r.passed);
    
    if (failed.length > 0) {
      this.violations++;
      for (const f of failed) {
        tridentLog('WARN', 'seven-q', `BLOCKED ${toolName}: Q${f.question} - ${f.reason}`);
      }
    }
    
    return {
      passed: failed.length === 0,
      results,
      violations: failed,
    };
  }

  /** Get enforcement stats */
  getStats(): { totalChecks: number; violations: number; passRate: number } {
    return {
      totalChecks: this.totalChecks,
      violations: this.violations,
      passRate: this.totalChecks > 0 ? (this.totalChecks - this.violations) / this.totalChecks : 1,
    };
  }
}
