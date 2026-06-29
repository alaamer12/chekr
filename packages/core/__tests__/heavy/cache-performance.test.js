import { describe, expect, test } from "vitest";
import { contentHash, partitionFilesByCache } from "../../src/git/diff-cache.js";

const FILE_COUNT = 1500;
const MAX_MS = 500;

function buildLargeFixture(count) {
  const filePaths = [];
  const cachedFiles = {};
  const currentHashes = new Map();

  for (let i = 0; i < count; i++) {
    const file = `src/packages/module-${i}/file-${i}.ts`;
    const hash = contentHash(`content-${i}`);
    filePaths.push(file);
    cachedFiles[file] = hash;
    currentHashes.set(file, hash);
  }

  return { filePaths, cachedFiles, currentHashes };
}

describe("partitionFilesByCache performance", () => {
  test(`partitions ${FILE_COUNT}+ files in under ${MAX_MS}ms`, () => {
    const { filePaths, cachedFiles, currentHashes } = buildLargeFixture(FILE_COUNT);
    const modifiedPaths = new Set(["src/packages/module-42/file-42.ts"]);

    const start = performance.now();
    const { toCheck, skipped } = partitionFilesByCache(
      filePaths,
      cachedFiles,
      modifiedPaths,
      currentHashes,
    );
    const elapsed = performance.now() - start;

    expect(filePaths.length).toBeGreaterThanOrEqual(1000);
    expect(toCheck).toEqual(["src/packages/module-42/file-42.ts"]);
    expect(skipped.length).toBe(FILE_COUNT - 1);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  test("handles cold cache (all files to check) quickly", () => {
    const filePaths = Array.from({ length: FILE_COUNT }, (_, i) => `cold/file-${i}.js`);

    const start = performance.now();
    const { toCheck, skipped } = partitionFilesByCache(filePaths, {}, new Set());
    const elapsed = performance.now() - start;

    expect(toCheck.length).toBe(FILE_COUNT);
    expect(skipped.length).toBe(0);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  test("handles hash mismatch sweep quickly", () => {
    const { filePaths, cachedFiles } = buildLargeFixture(FILE_COUNT);
    const liveHashes = new Map(
      filePaths.map((file, i) => [file, i % 10 === 0 ? "stale-hash" : cachedFiles[file]]),
    );

    const start = performance.now();
    const { toCheck, skipped } = partitionFilesByCache(
      filePaths,
      cachedFiles,
      new Set(),
      liveHashes,
    );
    const elapsed = performance.now() - start;

    expect(toCheck.length).toBe(Math.ceil(FILE_COUNT / 10));
    expect(skipped.length).toBe(FILE_COUNT - toCheck.length);
    expect(elapsed).toBeLessThan(MAX_MS);
  });
});
