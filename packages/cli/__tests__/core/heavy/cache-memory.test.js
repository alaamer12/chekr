import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildStatusFingerprint,
  contentHash,
  loadStepCache,
  saveStepCache,
} from "../../../src/lib/core/git/diff-cache.js";

const CYCLES = 50;
/** Allow modest heap growth from allocator churn, not unbounded leaks. */
const MAX_HEAP_GROWTH_BYTES = 25 * 1024 * 1024;

function sampleHeapBytes() {
  return process.memoryUsage().heapUsed;
}

function buildFilesMap(cycle, fileCount = 40) {
  const files = {};
  for (let i = 0; i < fileCount; i++) {
    const path = `src/module-${i}/file-${i}.ts`;
    files[path] = contentHash(`cycle-${cycle}-file-${i}`);
  }
  return files;
}

describe("step cache save/load memory", () => {
  /** @type {string} */
  let cacheRoot;

  afterEach(() => {
    if (cacheRoot) {
      rmSync(cacheRoot, { recursive: true, force: true });
      cacheRoot = "";
    }
  });

  test(`${CYCLES} save/load cycles do not grow heap unbounded`, async () => {
    cacheRoot = mkdtempSync(join(tmpdir(), "chekr-cache-mem-"));
    const gitContext = {
      head: "abc123deadbeef00000000000000000000000000",
      branch: "main",
      statusFingerprint: buildStatusFingerprint({ head: "abc123", status: "" }),
    };

    // Warm allocator / JIT
    const warmPath = join(cacheRoot, "warm.json");
    await saveStepCache(warmPath, gitContext, buildFilesMap(0));
    await loadStepCache(warmPath);

    const baselineHeap = sampleHeapBytes();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const cachePath = join(cacheRoot, "steps", `step-${cycle % 5}.json`);
      const files = buildFilesMap(cycle);
      await saveStepCache(cachePath, gitContext, files, [{ id: `v-${cycle}` }]);
      const loaded = await loadStepCache(cachePath);
      expect(loaded?.meta?.head).toBe(gitContext.head);
      expect(Object.keys(loaded?.files ?? {}).length).toBe(40);
    }

    const finalHeap = sampleHeapBytes();
    const growth = finalHeap - baselineHeap;

    expect(growth).toBeLessThan(MAX_HEAP_GROWTH_BYTES);
  });
});
