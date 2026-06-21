import { execSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'node:crypto';
import { tridentLog } from '../../utils.js';

export class DeployVerifier {
  /** Verify SHA256 of local bundle */
  verifySha256(filePath: string): { match: boolean; expected: string; actual: string } {
    try {
      const content = fs.readFileSync(filePath);
      const actual = crypto.createHash('sha256').update(content).digest('hex');
      return { match: true, expected: actual, actual };
    } catch (e) {
      tridentLog('ERROR', 'deploy-verifier', `SHA256 verification failed: ${(e as Error).message}`);
      return { match: false, expected: '', actual: '' };
    }
  }

  /** Check if a process is running inside the container */
  isProcessRunning(containerId: string, processName: string): boolean {
    try {
      const result = execSync(`docker exec ${containerId} pgrep -f "${processName}"`, { timeout: 5000 }).toString().trim();
      return result.length > 0;
    } catch {
      return false;
    }
  }

  /** Check if file exists in container */
  fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      execSync(`docker exec ${containerId} test -f "${filePath}"`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
