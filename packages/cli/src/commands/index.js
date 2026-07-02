/**
 * `chekr index` command — Build or update the Code Graph Context.
 *
 * This command indexes the codebase into a graph database for faster
 * subsequent checks. It's experimental and opt-in.
 *
 * Usage:
 *   chekr index              Build/update the graph incrementally
 *   chekr index --full       Force a full rebuild
 *   chekr index --status     Show graph statistics
 *   chekr index --reset      Delete the graph and rebuild
 *
 * @module commands/index
 */

import { resolve } from "node:path";
import { loadConfig, resolveConfig } from "../lib/core/engine.js";
import { getGitContext } from "../lib/core/git/git-service.js";
import { createGraphEngine } from "../lib/core/graph/engine.js";
import { resetGraph, resolveCGCConfig, runIndex } from "../lib/core/graph/index.js";
import { scanFiles } from "../lib/core/scanner.js";

/**
 * ANSI color helpers for pretty output.
 */
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

/**
 * Format a duration in ms to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Print a styled section header.
 * @param {string} title
 */
function printHeader(title) {
  console.log(`\n${BOLD}${CYAN}◆ ${title}${RESET}`);
}

/**
 * Print a key-value stat line.
 * @param {string} label
 * @param {string | number} value
 * @param {string} [color]
 */
function printStat(label, value, color = DIM) {
  console.log(`  ${DIM}${label}:${RESET} ${color}${value}${RESET}`);
}

/**
 * Print a progress bar.
 * @param {number} done
 * @param {number} total
 * @param {string} file
 */
function printProgress(done, total, file) {
  const pct = Math.round((done / total) * 100);
  const barWidth = 30;
  const filled = Math.round((done / total) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  const shortFile = file.length > 40 ? `...${file.slice(-37)}` : file;
  process.stdout.write(
    `\r  ${DIM}[${bar}]${RESET} ${pct}% (${done}/${total}) ${DIM}${shortFile}${RESET}`,
  );

  if (done === total) {
    process.stdout.write("\n");
  }
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function indexCommand(flags, _positionals, cwd) {
  const isStatus = flags.status === true;
  const isReset = flags.reset === true;
  const isFull = flags.full === true;
  const verbose = flags.verbose === true;

  // Load config
  let fileConfig = {};
  try {
    fileConfig = await loadConfig(undefined, cwd);
  } catch {
    // No config file — use defaults
  }

  const globalConfig = resolveConfig(fileConfig, {}, { cwd });
  const experimentalConfig = globalConfig.experimental;
  const cgcUserConfig =
    experimentalConfig && typeof experimentalConfig === "object"
      ? experimentalConfig.codeGraph
      : undefined;
  const cgcConfig = resolveCGCConfig(cgcUserConfig);
  const graphDir = resolve(cwd, cgcConfig.persistDir);

  // ─── Status mode ──────────────────────────────────────────────────────────
  if (isStatus) {
    return printStatus(graphDir, cgcConfig);
  }

  // ─── Reset mode ───────────────────────────────────────────────────────────
  if (isReset) {
    console.log(`${YELLOW}⚠ Resetting code graph...${RESET}`);
    resetGraph(graphDir);
    console.log(`${GREEN}✓ Graph deleted.${RESET} Run ${BOLD}chekr index${RESET} to rebuild.`);
    if (!isFull) return;
  }

  // ─── Index mode ───────────────────────────────────────────────────────────
  printHeader("Code Graph Context (CGC) — Experimental");
  console.log(`  ${DIM}Indexing codebase into a graph database for faster checks.${RESET}`);
  console.log(`  ${DIM}This can significantly reduce check times on subsequent runs.${RESET}\n`);

  // If forcing full rebuild, reset first
  if (isFull) {
    resetGraph(graphDir);
    console.log(`  ${YELLOW}Full rebuild requested.${RESET}\n`);
  }

  // Scan files using the same scanner as `chekr run`
  const scanConfig = {
    ...globalConfig,
    scanMode: "full",
  };
  const files = await scanFiles(scanConfig, globalConfig);

  if (files.length === 0) {
    console.log(`  ${YELLOW}No files found in scope. Check your config.${RESET}`);
    return;
  }

  // Get git context for commit tracking
  let commitHash = "";
  try {
    const gitCtx = await getGitContext(cwd);
    if (gitCtx) commitHash = gitCtx.head;
  } catch {
    // Not a git repo — that's fine
  }

  // Show file count and start indexing
  console.log(`  ${DIM}Files in scope:${RESET} ${BOLD}${files.length}${RESET}`);
  if (commitHash) {
    console.log(`  ${DIM}Git HEAD:${RESET} ${commitHash.slice(0, 7)}`);
  }
  console.log(`  ${DIM}Graph dir:${RESET} ${cgcConfig.persistDir}/\n`);

  const warnings = [];

  const { stats, engine } = await runIndex({
    files,
    cwd,
    config: cgcConfig,
    commitHash,
    callbacks: {
      onProgress: printProgress,
      onWarning: (msg) => {
        warnings.push(msg);
        if (verbose) {
          console.log(`  ${YELLOW}⚠ ${msg}${RESET}`);
        }
      },
      onInfo: (msg) => {
        console.log(`  ${BLUE}ℹ ${msg}${RESET}`);
      },
    },
  });

  await engine.close();

  // ─── Results ──────────────────────────────────────────────────────────────
  console.log("");
  printHeader("Indexing Complete");

  const modeLabel = stats.isIncremental ? `${CYAN}incremental${RESET}` : `${MAGENTA}full${RESET}`;
  printStat("Mode", modeLabel);
  printStat("Duration", formatDuration(stats.durationMs), GREEN);
  printStat("Total files", String(stats.totalFiles));
  printStat("Indexed", String(stats.indexed), GREEN);
  printStat("Unchanged", String(stats.unchanged), DIM);
  printStat("Skipped", String(stats.skipped), YELLOW);

  if (stats.added > 0) printStat("New files", `+${stats.added}`, GREEN);
  if (stats.modified > 0) printStat("Modified", String(stats.modified), YELLOW);
  if (stats.removed > 0) printStat("Removed", `-${stats.removed}`, RED);

  if (warnings.length > 0) {
    printStat("Warnings", String(warnings.length), YELLOW);
    if (!verbose) {
      console.log(`  ${DIM}Run with --verbose to see warning details.${RESET}`);
    }
  }

  // Performance suggestion
  console.log(
    `\n  ${GREEN}${BOLD}✓${RESET} Graph ready. Subsequent ${BOLD}chekr run --graph${RESET} will use indexed data.`,
  );

  if (!cgcConfig.enabled) {
    console.log(`\n  ${DIM}Tip: Add to chekr.config.js to auto-use the graph:${RESET}`);
    console.log(`  ${DIM}  experimental: { codeGraph: { enabled: true } }${RESET}`);
  }
}

/**
 * Print graph status information.
 */
async function printStatus(graphDir, cgcConfig) {
  const engine = await createGraphEngine(graphDir);

  if (!engine.isAvailable()) {
    console.log(`${YELLOW}Graph engine not available.${RESET}`);
    console.log(`Install: ${BOLD}bun add @ladybugdb/core${RESET}`);
    return;
  }

  const manifest = engine.getManifest();

  printHeader("Code Graph Status");

  if (!manifest || manifest.fileCount === 0) {
    console.log(`  ${DIM}No graph index found.${RESET}`);
    console.log(`  Run ${BOLD}chekr index${RESET} to build the graph.`);
    await engine.close();
    return;
  }

  printStat("Engine", manifest.engine || "ladybugdb");
  printStat("Schema version", String(manifest.schemaVersion));
  printStat("Last indexed", manifest.lastIndexedAt || "unknown");
  printStat("Last commit", manifest.lastIndexedCommit?.slice(0, 7) || "unknown");
  printStat("Files indexed", String(manifest.fileCount));
  printStat("Graph dir", cgcConfig.persistDir);

  // Query for more stats
  try {
    const fileCount = await engine.query("MATCH (f:File) RETURN COUNT(f) AS count");
    const symbolCount = await engine.query("MATCH (s:Symbol) RETURN COUNT(s) AS count");
    const importCount = await engine.query("MATCH ()-[r:IMPORTS]->() RETURN COUNT(r) AS count");

    if (fileCount.length > 0) printStat("File nodes", String(fileCount[0].count));
    if (symbolCount.length > 0) printStat("Symbol nodes", String(symbolCount[0].count));
    if (importCount.length > 0) printStat("Import edges", String(importCount[0].count));
  } catch {
    console.log(`  ${DIM}(Could not query graph for detailed stats)${RESET}`);
  }

  await engine.close();
}
