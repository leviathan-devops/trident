import * as os from 'os';
import * as path from 'path';

const CONFIG_BASE = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const NODE_MODULES_BASE = process.env.TRIDENT_NODE_MODULES_BASE || '/usr/local/lib/node_modules';

export const TRIDENT_CONFIG = {
  containerImage: process.env.TRIDENT_CONTAINER_IMAGE || 'opencode-test:1.14.34',
  baselineBinary: process.env.TRIDENT_BASELINE_BINARY || path.join(NODE_MODULES_BASE, 'opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode'),
  configBase: CONFIG_BASE,
  pluginsDir: path.join(CONFIG_BASE, 'opencode', 'plugins'),
  version: '4.3.3',
  debug: !!process.env.TRIDENT_DEBUG,
  logPath: process.env.TRIDENT_LOG_PATH || '',
  artifactsBase: process.env.TRIDENT_ARTIFACTS_BASE || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'Trident Brain', 'GENERATED_ARTIFACTS'),

  // Poseidon Mode settings
  poseidonMaxCycles: 50,
  poseidonScoreTarget: 96,
  poseidonStallThreshold: 5,
  poseidonTimeout: 300000,
};
