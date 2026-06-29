import { loadConfig } from "./config/load-config.js";
import { resolveConfig } from "./config/resolve-config.js";
import { loadChecks, resolveStepOrder } from "./loader.js";
import { report } from "./reporter/index.js";
import { runSteps } from "./runner.js";

/**
 * Run the checkr engine.
 * @param {Record<string, unknown>} [inputConfig]
 * @returns {Promise<{ passed: boolean, violations: unknown[], steps: unknown[], meta: Record<string, unknown> }>}
 */
export async function run(inputConfig = {}) {
  const cwd = /** @type {string} */ (inputConfig.cwd ?? process.cwd());
  let fileConfig = {};

  if (inputConfig.configPath) {
    fileConfig = await loadConfig(/** @type {string} */ (inputConfig.configPath), cwd);
  } else if (inputConfig.loadFileConfig !== false) {
    try {
      fileConfig = await loadConfig(undefined, cwd);
    } catch {
      fileConfig = {};
    }
  }

  const { configPath, loadFileConfig, ...cliPatch } = inputConfig;
  const globalConfig = resolveConfig(fileConfig, cliPatch, { cwd });

  const checksDir = /** @type {string} */ (globalConfig.checksDir) ?? "./.checkr/checks";
  const checks = await loadChecks(checksDir, cwd);
  const ordered = resolveStepOrder(checks, globalConfig);

  const stepResults = await runSteps({
    checks: ordered,
    globalConfig,
  });

  const violations = stepResults.flatMap((s) => s.violations);
  const passed = stepResults.every((s) => s.status === "pass");

  const result = {
    passed,
    violations,
    steps: stepResults,
    meta: {
      timestamp: new Date().toISOString(),
      cwd,
      checkCount: ordered.length,
      scanMode: globalConfig.scanMode ?? "full",
    },
  };

  if (globalConfig.reporter) {
    report(result, globalConfig);
  }

  return result;
}

export { ENGINE_DEFAULTS } from "./config/defaults.js";
export { loadConfig } from "./config/load-config.js";
export { resolveConfig } from "./config/resolve-config.js";
export { ConfigError, validateConfig } from "./config/validate-config.js";
