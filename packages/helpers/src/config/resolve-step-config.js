import { mergeConfig } from "./merge-config.js";
import { pickDefined } from "./pick-defined.js";

/**
 * Resolve per-step config from global defaults, step overrides, and CLI patch.
 * @param {Record<string, unknown>} global
 * @param {Record<string, unknown>} step
 * @param {Record<string, unknown>} [cliStepPatch]
 * @returns {Record<string, unknown>}
 */
export function resolveStepConfig(global, step, cliStepPatch = {}) {
  const stepPart = step ?? {};

  const globalInclude = global.include;
  const globalExclude = Array.isArray(global.exclude) ? global.exclude : [];
  const stepExclude = Array.isArray(stepPart.exclude) ? stepPart.exclude : [];

  const resolved = pickDefined({
    id: stepPart.id,
    step: stepPart.step,
    description: stepPart.description,
    enabled: stepPart.enabled !== undefined ? stepPart.enabled : true,
    include:
      stepPart.include !== undefined ? stepPart.include : globalInclude,
    exclude:
      globalExclude.length > 0 || stepExclude.length > 0
        ? [...globalExclude, ...stepExclude]
        : undefined,
    gitignore:
      stepPart.gitignore !== undefined
        ? stepPart.gitignore
        : global.gitignore,
    extensions: stepPart.extensions,
    scope: stepPart.scope,
    ignoreMarker:
      stepPart.ignoreMarker !== undefined
        ? stepPart.ignoreMarker
        : global.ignoreMarker,
    bail:
      stepPart.bail !== undefined ? stepPart.bail : global.bail,
    concurrency:
      stepPart.concurrency !== undefined
        ? stepPart.concurrency
        : global.concurrency,
    options: stepPart.options,
  });

  return mergeConfig(resolved, pickDefined(cliStepPatch));
}
