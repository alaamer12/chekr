import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deriveCheckExport, toAbsolute } from "@checkr/helpers";

/**
 * @typedef {object} LoadedCheck
 * @property {string} id
 * @property {string} filename
 * @property {Function} fn
 * @property {number} [step]
 * @property {string} [description]
 * @property {Record<string, unknown>} [config]
 */

/**
 * Discover and load check_*.js modules from checksDir.
 * @param {string} checksDir
 * @param {string} cwd
 * @returns {Promise<LoadedCheck[]>}
 */
export async function loadChecks(checksDir, cwd) {
  const absoluteDir = toAbsolute(checksDir, cwd);
  let entries;

  try {
    entries = await readdir(absoluteDir);
  } catch {
    return [];
  }

  const checkFiles = entries
    .filter((name) => name.startsWith("check_") && name.endsWith(".js"))
    .sort();

  const loaded = [];

  for (const filename of checkFiles) {
    const id = filename.replace(/^check_/, "").replace(/\.js$/, "");
    const filePath = path.join(absoluteDir, filename);
    const mod = await import(pathToFileURL(filePath).href);
    const exportName = deriveCheckExport(filename);
    const fn = mod[exportName];

    if (typeof fn !== "function") {
      throw new Error(
        `Check ${filename} must export function ${exportName}`,
      );
    }

    loaded.push({
      id,
      filename,
      fn,
    });
  }

  return loaded;
}

/**
 * Resolve step order from config and discovered checks.
 * Precedence: only > stepOrder > config.steps > alphabetical.
 * @param {LoadedCheck[]} checks
 * @param {Record<string, unknown>} config
 * @returns {LoadedCheck[]}
 */
export function resolveStepOrder(checks, config) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const configSteps = Array.isArray(config.steps) ? config.steps : [];

  for (const step of configSteps) {
    const check = byId.get(/** @type {{ id: string }} */ (step).id);
    if (check) {
      Object.assign(check, {
        step: step.step,
        description: step.description,
        config: step,
      });
    }
  }

  let ordered = [...checks];

  const only = /** @type {string[]} */ (config.only ?? []);
  if (only.length > 0) {
    ordered = only.map((id) => byId.get(id)).filter(Boolean);
  } else {
    const stepOrder = /** @type {string[] | undefined} */ (config.stepOrder);
    if (stepOrder?.length) {
      ordered = stepOrder.map((id) => byId.get(id)).filter(Boolean);
    } else if (configSteps.length > 0) {
      const stepIds = configSteps.map((s) => /** @type {{ id: string }} */ (s).id);
      const fromConfig = stepIds.map((id) => byId.get(id)).filter(Boolean);
      const configIdSet = new Set(stepIds);
      const rest = checks.filter((c) => !configIdSet.has(c.id));
      ordered = [...fromConfig, ...rest];
    }
  }

  const disable = new Set(/** @type {string[]} */ (config.disable ?? []));
  const enable = new Set(/** @type {string[]} */ (config.enable ?? []));

  return ordered.filter((check) => {
    if (enable.has(check.id)) return true;
    if (disable.has(check.id)) return false;

    const stepConfig = check.config ?? configSteps.find((s) => s.id === check.id);
    if (stepConfig && stepConfig.enabled === false) return false;

    const skip = /** @type {string[]} */ (config.skip ?? []);
    if (skip.includes(check.id)) return false;

    return true;
  });
}
