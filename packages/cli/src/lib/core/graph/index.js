/**
 * Code Graph Context (CGC) — Main module.
 *
 * Orchestrates graph creation, incremental updates, and query access.
 * This is the public API for the graph subsystem.
 *
 * @module graph
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { computeDiff, computeReindexPlan, estimateWork } from "./diff.js";
import { createGraphEngine } from "./engine.js";
import { batchIndex, hashContent, isIndexableFile } from "./indexer.js";
import { SCHEMA_VERSION } from "./schema.js";

export { computeDiff, computeReindexPlan } from "./diff.js";
export { detectBinary, detectSemiStructured, extractExports, extractImports } from "./indexer.js";
export { createQueryContext } from "./query.js";
export { SCHEMA_VERSION } from "./schema.js";

/**
 * @typedef {object} CGCConfig
 * @property {boolean} enabled
 * @property {string} engine — "ladybug" | "kuzu" | "auto"
 * @property {string} persistDir — relative to cwd, default ".chekr-graph"
 * @property {string[]} indexOn — ["imports", "exports", "tokens", "symbols"]
 * @property {boolean} autoIndex — auto-reindex on chekr run (default: false)
 * @property {number} maxDepth — max traversal depth (default: 5)
 * @property {boolean} suggestIndexing — show big-repo suggestion (default: true)
 * @property {number} bigRepoThreshold — file count to trigger suggestion (default: 500)
 */

/** @type {CGCConfig} */
export const CGC_DEFAULTS = {
  enabled: false,
  engine: "auto",
  persistDir: ".chekr-graph",
  indexOn: ["imports", "exports", "symbols"],
  autoIndex: false,
  maxDepth: 5,
  suggestIndexing: true,
  bigRepoThreshold: 500,
};

/**
 * Resolve CGC config from user config, applying defaults.
 * @param {Record<string, unknown> | undefined} userConfig — experimental.codeGraph from chekr.config.js
 * @returns {CGCConfig}
 */
export function resolveCGCConfig(userConfig) {
  if (!userConfig || typeof userConfig !== "object") {
    return { ...CGC_DEFAULTS };
  }

  return {
    enabled: userConfig.enabled === true,
    engine: typeof userConfig.engine === "string" ? userConfig.engine : CGC_DEFAULTS.engine,
    persistDir:
      typeof userConfig.persistDir === "string" ? userConfig.persistDir : CGC_DEFAULTS.persistDir,
    indexOn: Array.isArray(userConfig.indexOn) ? userConfig.indexOn : CGC_DEFAULTS.indexOn,
    autoIndex: userConfig.autoIndex === true,
    maxDepth: typeof userConfig.maxDepth === "number" ? userConfig.maxDepth : CGC_DEFAULTS.maxDepth,
    suggestIndexing: userConfig.suggestIndexing !== false,
    bigRepoThreshold:
      typeof userConfig.bigRepoThreshold === "number"
        ? userConfig.bigRepoThreshold
        : CGC_DEFAULTS.bigRepoThreshold,
  };
}

/**
 * @typedef {object} IndexStats
 * @property {number} totalFiles
 * @property {number} indexed
 * @property {number} skipped
 * @property {number} warnings
 * @property {number} added
 * @property {number} modified
 * @property {number} removed
 * @property {number} unchanged
 * @property {number} durationMs
 * @property {boolean} isIncremental
 */

/**
 * Run full or incremental indexing of the code graph.
 *
 * @param {object} params
 * @param {string[]} params.files — resolved file list (from scanner)
 * @param {string} params.cwd — project root
 * @param {CGCConfig} params.config
 * @param {string} [params.commitHash] — current git HEAD
 * @param {object} [params.callbacks]
 * @param {(done: number, total: number, file: string) => void} [params.callbacks.onProgress]
 * @param {(msg: string) => void} [params.callbacks.onWarning]
 * @param {(msg: string) => void} [params.callbacks.onInfo]
 * @returns {Promise<{ stats: IndexStats, engine: import('./engine.js').GraphEngine }>}
 */
export async function runIndex({ files, cwd, config, commitHash = "", callbacks = {} }) {
  const startTime = Date.now();
  const graphDir = resolve(cwd, config.persistDir);
  const engine = await createGraphEngine(graphDir);

  if (!engine.isAvailable()) {
    if (callbacks.onWarning) {
      callbacks.onWarning(
        "Graph database engine unavailable. Install @ladybugdb/core for code graph indexing.",
      );
    }
    return {
      stats: {
        totalFiles: files.length,
        indexed: 0,
        skipped: files.length,
        warnings: 1,
        added: 0,
        modified: 0,
        removed: 0,
        unchanged: files.length,
        durationMs: Date.now() - startTime,
        isIncremental: false,
      },
      engine,
    };
  }

  // Determine if this is incremental or full
  const manifest = engine.getManifest();
  const isIncremental = manifest && manifest.fileCount > 0;

  let stats;

  if (isIncremental) {
    stats = await runIncrementalIndex({ files, cwd, engine, callbacks });
  } else {
    stats = await runFullIndex({ files, cwd, engine, callbacks });
  }

  stats.durationMs = Date.now() - startTime;

  // Update manifest
  engine.updateManifest({
    schemaVersion: SCHEMA_VERSION,
    lastIndexedCommit: commitHash,
    lastIndexedAt: new Date().toISOString(),
    fileCount: stats.indexed + stats.unchanged,
    symbolCount: 0, // TODO: track from batch results
    edgeCount: 0,
  });

  return { stats, engine };
}

/**
 * Run a full (clean) index — all files from scratch.
 */
async function runFullIndex({ files, cwd, engine, callbacks }) {
  // Reset schema for clean start
  await engine.resetSchema();

  // Filter to indexable files only
  const indexableFiles = files.filter(isIndexableFile);
  const nonIndexable = files.length - indexableFiles.length;

  if (callbacks.onInfo && nonIndexable > 0) {
    callbacks.onInfo(`Skipping ${nonIndexable} non-code file(s) (not indexable).`);
  }

  // Batch index
  const { results, stats: batchStats } = batchIndex(indexableFiles, cwd, {
    onProgress: callbacks.onProgress,
  });

  // Persist to graph
  await persistResults(engine, results, cwd);

  // Report warnings
  if (callbacks.onWarning) {
    for (const result of results) {
      for (const warning of result.warnings) {
        callbacks.onWarning(`${result.file?.path || "unknown"}: ${warning}`);
      }
    }
  }

  return {
    totalFiles: files.length,
    indexed: batchStats.indexed,
    skipped: batchStats.skipped + nonIndexable,
    warnings: batchStats.warnings,
    added: batchStats.indexed,
    modified: 0,
    removed: 0,
    unchanged: 0,
    durationMs: 0,
    isIncremental: false,
  };
}

/**
 * Run an incremental index — only re-index changed/new files.
 */
async function runIncrementalIndex({ files, cwd, engine, callbacks }) {
  // Get current graph state
  const graphedFiles = new Map();
  try {
    const rows = await engine.query("MATCH (f:File) RETURN f.path AS path, f.contentHash AS hash");
    for (const row of rows) {
      graphedFiles.set(row.path, row.hash);
    }
  } catch {
    // If query fails, fall back to full index
    if (callbacks.onWarning) {
      callbacks.onWarning("Failed to read graph state. Performing full re-index.");
    }
    return runFullIndex({ files, cwd, engine, callbacks });
  }

  // Compute current hashes for files in scope
  const indexableFiles = files.filter(isIndexableFile);
  const currentHashes = new Map();

  for (const filePath of indexableFiles) {
    try {
      const absolutePath = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
      const content = readFileSync(absolutePath, "utf8");
      currentHashes.set(filePath, hashContent(content));
    } catch {
      // Skip unreadable files
    }
  }

  // Compute diff
  const diff = computeDiff(indexableFiles, graphedFiles, currentHashes);

  if (callbacks.onInfo) {
    if (diff.scopeChanged) {
      callbacks.onInfo(
        `Scope changed: ${diff.added.length} new, ${diff.removed.length} removed from scope.`,
      );
    }
  }

  // Compute re-index plan
  const dependents = await getDependentsMap(engine);
  const plan = computeReindexPlan(diff, dependents);
  const workEstimate = estimateWork(plan, indexableFiles.length);

  // If too much changed, do full rebuild instead
  if (workEstimate.suggestFullRebuild) {
    if (callbacks.onInfo) {
      callbacks.onInfo(
        `${workEstimate.percentageChanged.toFixed(0)}% of files changed — full rebuild is faster.`,
      );
    }
    return runFullIndex({ files, cwd, engine, callbacks });
  }

  // Remove deleted files from graph
  for (const filePath of plan.filesToRemove) {
    await removeFileFromGraph(engine, filePath);
  }

  // Re-index changed/new files
  if (plan.filesToIndex.length > 0) {
    const { results } = batchIndex(plan.filesToIndex, cwd, {
      onProgress: callbacks.onProgress,
    });

    // Remove old data for modified files before persisting new data
    for (const filePath of diff.modified) {
      await removeFileFromGraph(engine, filePath);
    }

    await persistResults(engine, results, cwd);

    if (callbacks.onWarning) {
      for (const result of results) {
        for (const warning of result.warnings) {
          callbacks.onWarning(`${result.file?.path || "unknown"}: ${warning}`);
        }
      }
    }
  }

  return {
    totalFiles: files.length,
    indexed: plan.filesToIndex.length,
    skipped: diff.unchanged.length,
    warnings: 0,
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged.length,
    durationMs: 0,
    isIncremental: true,
  };
}

/**
 * Persist indexing results to the graph database.
 */
async function persistResults(engine, results, _cwd) {
  for (const result of results) {
    if (result.skipped || !result.file) continue;

    const f = result.file;

    // Upsert file node
    try {
      await engine.query(
        `MERGE (f:File {path: $path})
         SET f.contentHash = $contentHash,
             f.lastModified = $lastModified,
             f.loc = $loc,
             f.language = $language,
             f.isEntryPoint = $isEntryPoint`,
        {
          path: f.path,
          contentHash: f.contentHash,
          lastModified: f.lastModified,
          loc: f.loc,
          language: f.language,
          isEntryPoint: f.isEntryPoint,
        },
      );
    } catch {
      // Fallback: try CREATE if MERGE isn't supported
      try {
        await engine.query(
          `CREATE (f:File {path: $path, contentHash: $contentHash, lastModified: $lastModified, loc: $loc, language: $language, isEntryPoint: $isEntryPoint})`,
          {
            path: f.path,
            contentHash: f.contentHash,
            lastModified: f.lastModified,
            loc: f.loc,
            language: f.language,
            isEntryPoint: f.isEntryPoint,
          },
        );
      } catch {
        // Already exists, ignore
      }
    }

    // Persist symbols
    for (const sym of result.symbols) {
      try {
        await engine.query(
          `MERGE (s:Symbol {id: $id})
           SET s.name = $name, s.kind = $kind, s.filePath = $filePath, s.line = $line, s.isDefault = $isDefault`,
          {
            id: sym.id,
            name: sym.name,
            kind: sym.kind,
            filePath: sym.filePath,
            line: sym.line,
            isDefault: sym.isDefault,
          },
        );
      } catch {
        try {
          await engine.query(
            `CREATE (s:Symbol {id: $id, name: $name, kind: $kind, filePath: $filePath, line: $line, isDefault: $isDefault})`,
            {
              id: sym.id,
              name: sym.name,
              kind: sym.kind,
              filePath: sym.filePath,
              line: sym.line,
              isDefault: sym.isDefault,
            },
          );
        } catch {
          // Ignore duplicates
        }
      }

      // EXPORTS edge
      try {
        await engine.query(
          `MATCH (f:File {path: $filePath}), (s:Symbol {id: $symbolId})
           CREATE (f)-[:EXPORTS]->(s)`,
          { filePath: f.path, symbolId: sym.id },
        );
      } catch {
        // Edge might already exist
      }
    }

    // Persist import edges
    for (const imp of result.imports) {
      // Resolve specifier to a file path if it's a relative import
      const targetPath = resolveImportSpecifier(imp.toSpecifier, f.path);
      if (!targetPath) continue;

      try {
        await engine.query(
          `MATCH (source:File {path: $from}), (target:File {path: $to})
           CREATE (source)-[:IMPORTS {specifier: $specifier, isDynamic: $isDynamic}]->(target)`,
          {
            from: f.path,
            to: targetPath,
            specifier: imp.toSpecifier,
            isDynamic: imp.isDynamic,
          },
        );
      } catch {
        // Target file might not be indexed yet — this is fine
      }
    }
  }
}

/**
 * Remove a file and all its relationships from the graph.
 */
async function removeFileFromGraph(engine, filePath) {
  try {
    // Remove edges first
    await engine.query(`MATCH (f:File {path: $path})-[r:IMPORTS]->() DELETE r`, { path: filePath });
    await engine.query(`MATCH ()-[r:IMPORTS]->(f:File {path: $path}) DELETE r`, { path: filePath });
    await engine.query(`MATCH (f:File {path: $path})-[r:EXPORTS]->(s:Symbol) DELETE r, s`, {
      path: filePath,
    });
    await engine.query(`MATCH (f:File {path: $path})-[r:DEPENDS_ON]->() DELETE r`, {
      path: filePath,
    });
    await engine.query(`MATCH ()-[r:DEPENDS_ON]->(f:File {path: $path}) DELETE r`, {
      path: filePath,
    });
    // Remove node
    await engine.query(`MATCH (f:File {path: $path}) DELETE f`, { path: filePath });
  } catch {
    // Best-effort removal
  }
}

/**
 * Get a map of file → set of files that import it.
 */
async function getDependentsMap(engine) {
  const map = new Map();
  try {
    const rows = await engine.query(
      `MATCH (source:File)-[:IMPORTS]->(target:File)
       RETURN source.path AS importer, target.path AS imported`,
    );
    for (const row of rows) {
      if (!map.has(row.imported)) {
        map.set(row.imported, new Set());
      }
      map.get(row.imported).add(row.importer);
    }
  } catch {
    // Return empty map on failure
  }
  return map;
}

/**
 * Resolve a relative import specifier to a file path.
 * Only handles relative imports (./  ../) — node_modules are skipped.
 *
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | null}
 */
function resolveImportSpecifier(specifier, fromFile) {
  // Skip non-relative imports (bare specifiers like 'react', '@pkg/foo')
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null;
  }

  // Resolve relative to the importing file's directory
  const fromDir = fromFile.includes("/") ? fromFile.substring(0, fromFile.lastIndexOf("/")) : ".";

  let resolved;
  if (specifier.startsWith("/")) {
    resolved = specifier;
  } else {
    // Simple relative path resolution
    const parts = fromDir.split("/");
    const specParts = specifier.split("/");

    for (const part of specParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }
    resolved = parts.join("/");
  }

  // Normalize: remove extension duplicates, handle index files
  // We store paths without resolving extensions — the graph matches by prefix
  return resolved.replace(/\\/g, "/");
}

/**
 * Check if a repository is "big" enough to suggest indexing.
 *
 * @param {number} fileCount
 * @param {CGCConfig} config
 * @returns {{ isBig: boolean, message: string | null }}
 */
export function checkBigRepo(fileCount, config) {
  if (!config.suggestIndexing) {
    return { isBig: false, message: null };
  }

  if (fileCount >= config.bigRepoThreshold) {
    return {
      isBig: true,
      message:
        `This repository has ${fileCount} files. ` +
        "Code graph indexing can significantly speed up subsequent checks.\n" +
        "Enable it with: chekr index\n" +
        "Or add to chekr.config.js:\n" +
        "  experimental: { codeGraph: { enabled: true } }\n" +
        "Suppress this message: experimental: { codeGraph: { suggestIndexing: false } }",
    };
  }

  return { isBig: false, message: null };
}

/**
 * Reset/delete the graph database entirely.
 *
 * @param {string} graphDir — absolute path to graph directory
 */
export function resetGraph(graphDir) {
  if (existsSync(graphDir)) {
    rmSync(graphDir, { recursive: true, force: true });
  }
}
