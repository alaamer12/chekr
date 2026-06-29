import { ENGINE_DEFAULTS } from "../lib/core/config/defaults.js";
import { parseArgsString, parsePositiveInt } from "../lib/helpers/index.js";

/** @typedef {{ patch: Record<string, unknown>, actions: Record<string, boolean> }} CliParseResult */

/**
 * Map parsed CLI flags to engine config patch and side-effect actions.
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @returns {CliParseResult}
 */
export function cliToConfigPatch(flags, positionals) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  /** @type {Record<string, boolean>} */
  const actions = {};

  if (typeof flags.config === "string") {
    patch.configPath = flags.config;
  }

  if (flags["no-bail"] === true) {
    patch.bail = false;
  }

  if (flags["no-cache"] === true) {
    patch.cache = false;
  }

  if (flags["clear-cache"] === true) {
    actions.clearCache = true;
  }

  if (typeof flags.concurrency === "string") {
    patch.concurrency = parsePositiveInt(flags.concurrency, ENGINE_DEFAULTS.concurrency);
  }

  if (flags["no-parallel"] === true) {
    patch.parallel = false;
  }

  if (typeof flags.reporter === "string") {
    patch.reporter = flags.reporter;
  }

  if (typeof flags.report === "string") {
    patch.reportFile = flags.report;
  }

  if (flags.verbose === true) {
    patch.verbose = true;
  }

  if (typeof flags["ignore-marker"] === "string") {
    patch.ignoreMarker = flags["ignore-marker"];
  }

  if (flags["no-gitignore"] === true) {
    patch.gitignore = null;
  } else if (typeof flags.gitignore === "string") {
    patch.gitignore = flags.gitignore;
  }

  if (typeof flags["checks-dir"] === "string") {
    patch.checksDir = flags["checks-dir"];
  }

  if (typeof flags["fixes-dir"] === "string") {
    patch.fixesDir = flags["fixes-dir"];
  }

  if (flags.changed === true) {
    patch.scanMode = "changed";
  }

  if (flags.staged === true) {
    patch.scanMode = "staged";
  }

  if (typeof flags.skip === "string") {
    patch.skip = parseArgsString(flags.skip);
  }

  if (typeof flags.only === "string") {
    patch.only = parseArgsString(flags.only);
  }

  if (typeof flags.steps === "string") {
    patch.stepOrder = parseArgsString(flags.steps);
  }

  if (typeof flags.disable === "string") {
    patch.disable = parseArgsString(flags.disable);
  }

  if (typeof flags.enable === "string") {
    patch.enable = parseArgsString(flags.enable);
  }

  if (positionals[0]) {
    patch.scanPath = positionals[0];
  }

  return { patch, actions };
}
