const COMMANDS = new Set(["run", "fix", "list", "validate", "init", "install", "publish"]);

/** Flags that take no value (--verbose, --help, etc.). */
const BOOLEAN_FLAGS = new Set([
  "help",
  "verbose",
  "changed",
  "staged",
  "clear-cache",
  "version",
  "pass",
  "force",
]);

/** Flags that use --no-* form only. */
const NO_PREFIX_FLAGS = new Set(["no-bail", "no-cache", "no-parallel", "no-gitignore"]);

/**
 * Parse process.argv slice into command, flags, and positionals.
 * @param {string[]} rawArgv
 * @returns {{ command: string, flags: Record<string, string | boolean>, positionals: string[], help: boolean, version: boolean }}
 */
export function parseArgv(rawArgv) {
  const args = [...rawArgv];
  let command = "run";

  if (args.length > 0 && COMMANDS.has(args[0])) {
    command = /** @type {string} */ (args.shift());
  }

  /** @type {Record<string, string | boolean>} */
  const flags = {};
  /** @type {string[]} */
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      flags.version = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);

      if (BOOLEAN_FLAGS.has(body)) {
        flags[body] = true;
        continue;
      }

      if (NO_PREFIX_FLAGS.has(body)) {
        flags[body] = true;
        continue;
      }

      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }

      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for --${body}`);
      }

      flags[body] = value;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown short flag: ${arg}`);
    }

    positionals.push(arg);
  }

  return {
    command,
    flags,
    positionals,
    help: flags.help === true,
    version: flags.version === true,
  };
}
