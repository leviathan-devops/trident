import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';
import * as fs from 'fs';
import * as path from 'path';

export const R0_BUILD_CHAIN: LayerRule = {
  layer: 'R0',
  name: 'Build Chain Integrity',
  description: 'Validates build system produces single-file bundle suitable for container deployment',
  applicableTo: [],
  enabled: true,

  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const pkg = ctx.packageJson;
    if (!pkg) return findings;

    const scripts = pkg && typeof pkg === 'object' ? (pkg.scripts as Record<string, unknown> | undefined) : undefined;
    const buildScript = String(scripts?.build || '');

    if (buildScript.includes('tsc') && !buildScript.includes('esbuild') && !buildScript.includes('bun') && !buildScript.includes('tsup')) {
      findings.push({
        layer: 'R0',
        severity: 'CRITICAL',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: buildScript,
        description: 'Build uses tsc instead of bundler — produces multi-file output that breaks container deployment',
        correction: 'Change build script to use esbuild/bun/tsup with --bundle for single-file output',
        runtimeImpact: 'Plugin fails to load in container — import resolution fails when only index.js is copied',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // E12: Expand build tool recognition
    const buildToolConfigFiles = [
      'tsup.config.ts', 'tsup.config.js', 'tsup.config.mjs',
      'rollup.config.ts', 'rollup.config.js', 'rollup.config.mjs',
      'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
      'webpack.config.ts', 'webpack.config.js', 'webpack.config.mjs',
    ];
    const buildSystemFiles = ['turbo.json', 'nx.json'];

    if (!buildScript) {
      for (const configFile of buildToolConfigFiles) {
        const configPath = path.join(ctx.projectRoot, configFile);
        if (fs.existsSync(configPath)) {
          findings.push({
            layer: 'R0',
            severity: 'MEDIUM',
            category: 'BUILD_CHAIN',
            file: configFile,
            line: 0,
            evidence: `${configFile} exists but no build script in package.json`,
            description: `Build configuration file ${configFile} found but no corresponding build script`,
            correction: `Add a build script to package.json that uses ${configFile}`,
            runtimeImpact: 'Build configuration exists but is never invoked — dist may be stale or missing',
            confidence: 0.80,
            constructType: null,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }
    }

    // E12: Check for monorepo build system files
    for (const systemFile of buildSystemFiles) {
      const systemPath = path.join(ctx.projectRoot, systemFile);
      if (fs.existsSync(systemPath)) {
        const hasTurboBuild = buildScript.includes('turbo') || buildScript.includes('nx');
        if (!hasTurboBuild && buildScript) {
          findings.push({
            layer: 'R0',
            severity: 'LOW',
            category: 'BUILD_CHAIN',
            file: systemFile,
            line: 0,
            evidence: `${systemFile} exists alongside non-monorepo build script`,
            description: `Monorepo build system file ${systemFile} found but build script doesn't reference it`,
            correction: `Ensure build script is compatible with ${systemFile} or remove unused config`,
            runtimeImpact: 'Build system configuration mismatch may cause inconsistent builds',
            confidence: 0.60,
            constructType: null,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    if (buildScript.includes('esbuild') && !buildScript.includes('--bundle')) {
      findings.push({
        layer: 'R0',
        severity: 'HIGH',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: buildScript,
        description: 'esbuild build missing --bundle flag — produces multi-file output',
        correction: 'Add --bundle flag to esbuild command',
        runtimeImpact: 'Same as tsc — multi-file output breaks container deployment',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (buildScript.includes('esbuild') && !buildScript.includes('--platform=node')) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: buildScript,
        description: 'esbuild build missing --platform=node — may produce browser-incompatible output',
        correction: 'Add --platform=node to esbuild command',
        runtimeImpact: 'Node builtins (fs, path) not externalized — bundle includes polyfills that may fail',
        confidence: 0.90,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (!(scripts?.['build:check']) && buildScript.includes('esbuild')) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: 'No build:check script',
        description: 'No type checking script — esbuild does not type-check, errors slip through',
        correction: 'Add "build:check": "tsc --noEmit" script',
        runtimeImpact: 'Type errors caught at runtime instead of build time',
        confidence: 0.90,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
