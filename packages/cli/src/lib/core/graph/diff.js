/**
 * Code Graph Context (CGC) — Incremental diff logic.
 *
 * Handles:
 * - Detecting changed/new/deleted files vs. graph state
 * - Scope widening (narrow config → wide config → new files appear)
 * - Scope narrowing (wide → narrow → files leave scope but stay in graph)
 * - Efficient partial re-indexing
 *
 * @module graph/diff
 */

/**
 * @typedef {object} DiffResult
 * @property {string[]} added — files in current scope but not in graph
 * @property {string[]} removed — files in graph but not in current scope
 * @property {string[]} modified — files in both but content hash changed
 * @property {string[]} unchanged — files in both with same hash
 * @property {number} totalCurrent — total files in current scope
 * @property {number} totalGraphed — total files in graph
 * @property {boolean} scopeChanged — true if added or removed files exist
 */

/**
 * Compare current file list against what's already in the graph.
 *
 * This is the core logic for handling scope changes:
 * - If config narrows scope → some files become "removed" (we keep them in
 *   graph but mark them as out-of-scope for the current run)
 * - If config widens scope → new files become "added" (need full indexing)
 * - If files are modified → "modified" (need re-indexing)
 *
 * @param {string[]} currentFiles — files in the current scan scope
 * @param {Map<string, string>} graphedFiles — Map<path, contentHash> from graph
 * @param {Map<string, string>} currentHashes — Map<path, contentHash> for current files
 * @returns {DiffResult}
 */
export function computeDiff(currentFiles, graphedFiles, currentHashes) {
  const currentSet = new Set(currentFiles);
  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];

  // Files in current scope
  for (const file of currentFiles) {
    const graphHash = graphedFiles.get(file);
    if (!graphHash) {
      // New file — not in graph yet
      added.push(file);
    } else {
      // File exists in graph — check if content changed
      const currentHash = currentHashes.get(file);
      if (currentHash && currentHash !== graphHash) {
        modified.push(file);
      } else {
        unchanged.push(file);
      }
    }
  }

  // Files in graph but no longer in scope
  for (const [graphPath] of graphedFiles) {
    if (!currentSet.has(graphPath)) {
      removed.push(graphPath);
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged,
    totalCurrent: currentFiles.length,
    totalGraphed: graphedFiles.size,
    scopeChanged: added.length > 0 || removed.length > 0,
  };
}

/**
 * Determine which files need re-indexing based on the diff and dependency graph.
 *
 * When a file is modified, its direct dependents may also need structural
 * re-validation (e.g., if exports changed, importers may be stale).
 *
 * @param {DiffResult} diff
 * @param {Map<string, Set<string>>} dependents — Map<filePath, Set<files that import it>>
 * @returns {{ filesToIndex: string[], filesToRemove: string[], filesToValidate: string[] }}
 */
export function computeReindexPlan(diff, dependents) {
  const filesToIndex = [...diff.added, ...diff.modified];
  const filesToRemove = [...diff.removed];

  // Files that depend on modified files may need structural revalidation
  const filesToValidate = new Set();
  for (const modifiedFile of diff.modified) {
    const deps = dependents.get(modifiedFile);
    if (deps) {
      for (const dep of deps) {
        // Only validate if the dependent is in current scope and wasn't already modified
        if (!diff.modified.includes(dep) && !diff.added.includes(dep)) {
          filesToValidate.add(dep);
        }
      }
    }
  }

  // Removed files' dependents also need validation
  for (const removedFile of diff.removed) {
    const deps = dependents.get(removedFile);
    if (deps) {
      for (const dep of deps) {
        filesToValidate.add(dep);
      }
    }
  }

  return {
    filesToIndex,
    filesToRemove,
    filesToValidate: [...filesToValidate],
  };
}

/**
 * Estimate the work required for re-indexing.
 * Used to show progress information and determine if full rebuild is faster.
 *
 * @param {{ filesToIndex: string[], filesToRemove: string[], filesToValidate: string[] }} plan
 * @param {number} totalFiles
 * @returns {{ totalWork: number, percentageChanged: number, suggestFullRebuild: boolean }}
 */
export function estimateWork(plan, totalFiles) {
  const totalWork =
    plan.filesToIndex.length + plan.filesToRemove.length + plan.filesToValidate.length;
  const percentageChanged = totalFiles > 0 ? (totalWork / totalFiles) * 100 : 0;

  // If more than 60% of files changed, a full rebuild is likely faster
  // than incremental (less graph query overhead)
  const suggestFullRebuild = percentageChanged > 60;

  return { totalWork, percentageChanged, suggestFullRebuild };
}
