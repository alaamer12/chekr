#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgv } from "./argv/parse-argv.js";
import { fixCommand } from "./commands/fix.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { validateCommand } from "./commands/validate.js";
import { publishCommand } from "./commands/publish.js";
import { installCommand } from "./commands/install.js";
import { pruneCommand } from "./commands/prune.js";
import { indexCommand } from "./commands/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

function printHelp() {
  console.log(`chekr v${pkg.version} — project rule runner

Usage:
  chekr [command] [options] [path]

Commands:
  run        Run checks (default)
  list       List discovered checks
  validate   Validate check/fix file contracts
  init       Scaffold .chekr/ and chekr.config.js
  publish    Publish a check to the marketplace
             Usage: chekr publish <check-id>
  install    Install a check from the marketplace
             Usage: chekr install <check-id> [--force]
  fix        Run fixers (not yet implemented)
  prune      Delete the cache entirely or for a specific step
             Usage: chekr prune <step-number | check-id | "all">
  index      Build/update code graph for faster checks (experimental)
             Usage: chekr index [--full] [--status] [--reset]

Options:
  --config <file>         Config file path
  --force                 Force overwrite on install
  --no-bail               Run all steps after failures
  --no-cache              Disable result caching
  --clear-cache           Delete cache directory before run
  --concurrency <N>       Parallel worker count
  --no-parallel           Run files sequentially
  --reporter <type>       default | json | compact
  --report <file>         Write report to file
  --verbose               Verbose output
  --ignore-marker <s>     Ignore block marker
  --gitignore <path>      Gitignore file path
  --no-gitignore          Disable gitignore filtering
  --checks-dir <path>     Checks directory
  --fixes-dir <path>      Fixes directory
  --changed               Scan changed files only
  --staged                Scan staged files only
  --skip <ids>            Comma-separated step IDs to skip
  --only <ids>            Run only these step IDs
  --steps <ids>           Override step order
  --disable <id>          Disable a step
  --enable <id>           Enable a step
  --keep-on               Skip the large-diff countdown and keep cache as-is
  --large-diff-threshold  File count above which a cross-commit diff triggers a
                          warning countdown (default: 20)
  -h, --help              Show help
  -v, --version           Show version
`);
}

async function main() {
  const cwd = process.cwd();

  try {
    const parsed = parseArgv(process.argv.slice(2));

    if (parsed.version) {
      console.log(pkg.version);
      return;
    }

    if (parsed.help) {
      printHelp();
      return;
    }

    const { command, flags, positionals } = parsed;

    switch (command) {
      case "run":
        await runCommand(flags, positionals, cwd);
        break;
      case "fix":
        await fixCommand(flags, positionals, cwd);
        break;
      case "list":
        await listCommand(flags, positionals, cwd);
        break;
      case "validate":
        await validateCommand(flags, positionals, cwd);
        break;
      case "init":
        await initCommand(flags, positionals, cwd);
        break;
      case "publish":
        await publishCommand(flags, positionals, cwd);
        break;
      case "install":
        await installCommand(flags, positionals, cwd);
        break;
      case "prune":
        await pruneCommand(flags, positionals, cwd);
        break;
      case "index":
        await indexCommand(flags, positionals, cwd);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exitCode = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  }
}

main();
