import { setProgressContext } from "../core/progress.js";

/**
 * @typedef {object} MeshContext
 * @property {boolean} [optimize]
 * @property {Set<string>} [unmodifiedFiles]
 * @property {unknown[]} [cachedViolations]
 * @property {string} [checkId]
 */

/**
 * @typedef {object} MeshResult
 * @property {unknown[]} violations
 * @property {number} meshSkippedPairs
 * @property {boolean} meshUsed
 */

/**
 * Pair-wise mesh optimization for O(N²) repo checks.
 * Use in repoFn when `optimize: true` is set on the step.
 *
 * @example
 * export async function checkDuplicationRepo(_scanPath, _files, onProgress, context) {
 *   const mesh = createMeshOptimizer(context);
 *   mesh.announce();
 *
 *   const violations = [];
 *   for (const pair of pairs) {
 *     if (mesh.skipPair(pair.a.file, pair.b.file)) continue;
 *     // ... compare pair ...
 *   }
 *
 *   return mesh.complete(violations);
 * }
 *
 * @param {MeshContext | null | undefined} context
 */
export function createMeshOptimizer(context) {
  const enabled = context?.optimize === true;
  const unmodified = context?.unmodifiedFiles ?? new Set();
  const cachedViolations = Array.isArray(context?.cachedViolations) ? context.cachedViolations : [];
  const checkId = context?.checkId ?? "check";

  let skippedPairs = 0;
  let used = false;

  const isActive = enabled && unmodified.size > 0;

  return {
    get enabled() {
      return enabled;
    },

    get isActive() {
      return isActive;
    },

    get meshUsed() {
      return used;
    },

    /**
     * Print mesh status before heavy work. Updates progress bar ⚡ indicator.
     */
    announce() {
      used = true;
      setProgressContext(checkId, isActive);

      if (!enabled) return;

      if (!isActive) {
        console.log(
          "  \u26a1 Mesh: building cache (first run) \u2014 will optimize on next run"
        );
        return;
      }

      console.log(
        `  \u26a1 Mesh ON: ${unmodified.size.toLocaleString()} clean files \u2192 skipping U\u00d7U pairs`
      );
    },

    /**
     * @param {string} fileA
     * @param {string} fileB
     * @returns {boolean} true when this pair should be skipped
     */
    skipPair(fileA, fileB) {
      if (!enabled) return false;
      used = true;
      if (unmodified.has(fileA) && unmodified.has(fileB)) {
        skippedPairs++;
        return true;
      }
      return false;
    },

    /**
     * Cached violations where every file in `_files` is unmodified.
     * @returns {unknown[]}
     */
    restoreCachedViolations() {
      if (!enabled || cachedViolations.length === 0) return [];
      used = true;

      return cachedViolations.filter((raw) => {
        const v = /** @type {{ _files?: string[] }} */ (raw);
        const files = v._files;
        if (!files || files.length === 0) return false;
        return files.every((f) => unmodified.has(f));
      });
    },

    /**
     * Merge restored cache hits with newly found violations.
     * @param {unknown[]} newViolations
     * @returns {MeshResult}
     */
    complete(newViolations) {
      if (!enabled) {
        return {
          violations: newViolations,
          meshSkippedPairs: 0,
          meshUsed: used,
        };
      }

      used = true;
      const restored = this.restoreCachedViolations();
      return {
        violations: [...restored, ...newViolations],
        meshSkippedPairs: skippedPairs,
        meshUsed: true,
      };
    },
  };
}

/**
 * @param {unknown} result
 * @returns {result is MeshResult}
 */
export function isMeshResult(result) {
  return (
    result != null &&
    typeof result === "object" &&
    "meshUsed" in result &&
    /** @type {MeshResult} */ (result).meshUsed === true
  );
}
