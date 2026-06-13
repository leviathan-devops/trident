import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R7_CONFIG_SCHEMA: LayerRule = {
  layer: 'R7',
  name: 'Config Schema',
  description: 'Validates opencode.json structure for plugin deployment',
  applicableTo: [],
  enabled: true,

  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const config = ctx.opencodeJson;
    if (!config) return findings;

    const configAgent = config && typeof config === 'object' && config.agent && typeof config.agent === 'object' ? config.agent as Record<string, unknown> : undefined;
    const agentKeys = configAgent ? Object.keys(configAgent) : [];
    if (agentKeys.length === 0) {
      findings.push({
        layer: 'R7',
        severity: 'HIGH',
        category: 'CONFIG_SCHEMA',
        file: 'opencode.json',
        line: 0,
        evidence: 'No agent block in opencode.json',
        description: 'Missing agent definition block — plugin will not register an agent',
        correction: 'Add an "agent" block with at least one agent definition',
        runtimeImpact: 'Plugin loads but no agent appears in TUI agent selector',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    for (const agentKey of agentKeys) {
      const agentRaw = configAgent?.[agentKey]; const agent = agentRaw && typeof agentRaw === 'object' ? agentRaw as Record<string, unknown> : undefined;
      if (!agent) continue;

      if (!agent.permission) {
        findings.push({
          layer: 'R7',
          severity: 'HIGH',
          category: 'CONFIG_SCHEMA',
          file: 'opencode.json',
          line: 0,
          evidence: `Agent "${agentKey}" missing permission block`,
          description: `Missing permission block for agent "${agentKey}" — may default to deny-all`,
          correction: 'Add a permission block: "permission": { "task": "allow" }',
          runtimeImpact: 'Agent may not be able to execute any tasks',
          confidence: 0.95,
          constructType: null,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    const hookEntries = config.hooks ? Object.entries(config.hooks) : [];
    for (const [hookKey, hookVal] of hookEntries) {
      if (typeof hookVal === 'object' && hookVal !== null) {
        const hookObj = hookVal && typeof hookVal === 'object' ? hookVal as Record<string, unknown> : {};
        if (hookObj.plugin) {
          const pluginPath = String(hookObj.plugin);
          if (!pluginPath.startsWith('file://')) {
            findings.push({
              layer: 'R7',
              severity: 'HIGH',
              category: 'CONFIG_SCHEMA',
              file: 'opencode.json',
              line: 0,
              evidence: `Hook "${hookKey}" plugin path: ${pluginPath}`,
              description: `Plugin path not using file:// URI — may fail to resolve in container`,
              correction: 'Change plugin path to use file:// URI format',
              runtimeImpact: 'Plugin fails to load — hook never fires',
              confidence: 0.90,
              constructType: null,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }
    }

    if (!config.$schema) {
      findings.push({
        layer: 'R7',
        severity: 'MEDIUM',
        category: 'CONFIG_SCHEMA',
        file: 'opencode.json',
        line: 0,
        evidence: 'No $schema field',
        description: 'Missing $schema — no IDE validation for config structure',
        correction: 'Add "$schema" field pointing to opencode JSON schema',
        runtimeImpact: 'Config errors not caught by IDE — silent misconfiguration',
        confidence: 0.85,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
