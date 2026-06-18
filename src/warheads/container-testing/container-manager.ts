import { execSync } from 'child_process';
import { tridentLog } from '../../utils.js';

export class ContainerManager {
  private containerId: string | null = null;

  /** Spawn a Docker container */
  async spawn(image: string, name?: string): Promise<string | null> {
    try {
      const cmd = name
        ? `docker run -d --name ${name} ${image} sleep infinity`
        : `docker run -d ${image} sleep infinity`;
      const result = execSync(cmd, { timeout: 30000 }).toString().trim();
      this.containerId = result;
      tridentLog('INFO', 'container-manager', `Container spawned: ${this.containerId?.substring(0, 12)}`);
      return this.containerId;
    } catch (e) {
      tridentLog('ERROR', 'container-manager', `Failed to spawn container: ${(e as Error).message}`);
      return null;
    }
  }

  /** Copy plugin bundle into container */
  async copyBundle(localPath: string, containerPath: string = '/root/.config/opencode/plugins/trident/dist/index.js'): Promise<boolean> {
    if (!this.containerId) return false;
    try {
      // Create directories first
      execSync(`docker exec ${this.containerId} mkdir -p /root/.config/opencode/plugins/trident/dist`, { timeout: 10000 });
      execSync(`docker cp ${localPath} ${this.containerId}:${containerPath}`, { timeout: 30000 });
      tridentLog('INFO', 'container-manager', `Bundle copied: ${localPath} → ${this.containerId?.substring(0, 12)}:${containerPath}`);
      return true;
    } catch (e) {
      tridentLog('ERROR', 'container-manager', `Failed to copy bundle: ${(e as Error).message}`);
      return false;
    }
  }

  /** Deploy config file to container */
  async deployConfig(localPath: string, containerPath: string = '/root/.config/opencode/config.json'): Promise<boolean> {
    if (!this.containerId) return false;
    try {
      execSync(`docker exec ${this.containerId} mkdir -p /root/.config/opencode`, { timeout: 10000 });
      execSync(`docker cp ${localPath} ${this.containerId}:${containerPath}`, { timeout: 10000 });
      tridentLog('INFO', 'container-manager', `Config deployed: ${localPath} → ${containerPath}`);
      return true;
    } catch (e) {
      tridentLog('ERROR', 'container-manager', `Failed to deploy config: ${(e as Error).message}`);
      return false;
    }
  }

  /** Execute command in container */
  exec(command: string): string {
    if (!this.containerId) throw new Error('No container spawned');
    return execSync(`docker exec ${this.containerId} ${command}`, { timeout: 30000 }).toString();
  }

  /** Teardown container */
  teardown(): boolean {
    if (!this.containerId) return true;
    try {
      execSync(`docker rm -f ${this.containerId}`, { timeout: 15000 });
      tridentLog('INFO', 'container-manager', `Container removed: ${this.containerId?.substring(0, 12)}`);
      this.containerId = null;
      return true;
    } catch (e) {
      tridentLog('ERROR', 'container-manager', `Failed to remove container: ${(e as Error).message}`);
      return false;
    }
  }

  getContainerId(): string | null { return this.containerId; }
}
