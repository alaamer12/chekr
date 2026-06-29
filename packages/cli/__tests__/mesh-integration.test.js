import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStatusFingerprint } from "../src/lib/core/git/diff-cache.js";
import { runStep } from "../src/lib/core/runner.js";
import { createMeshOptimizer } from "../src/lib/utils/mesh-optimizer.js";

vi.mock("../src/lib/core/scanner.js", () => ({
  scanFiles: vi.fn(),
}));

vi.mock("../src/lib/core/git/diff-cache.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadStepCache: vi.fn(),
    saveStepCache: vi.fn().mockResolvedValue(undefined),
  };
});

import { loadStepCache } from "../src/lib/core/git/diff-cache.js";
import { scanFiles } from "../src/lib/core/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../__fixtures__/minimal");
const TEMP_DIR = path.join(FIXTURE, ".mesh-test-tmp");
const MODIFIED_FILE = ".mesh-test-tmp/c.js";
const FILES = ["src/clean.js", "src/with-todo.js", MODIFIED_FILE];

const gitContext = {
  branch: "main",
  head: "deadbeef",
  status: "",
  statusFingerprint: buildStatusFingerprint({ head: "deadbeef", status: "" }),
};

/** @param {Record<string, unknown>} [overrides] */
function baseGlobalConfig(overrides = {}) {
  return {
    cwd: FIXTURE,
    cache: true,
    cacheDir: ".chekr-cache",
    parallel: false,
    concurrency: 1,
    ...overrides,
  };
}

/**
 * @param {import("../src/lib/core/loader.js").LoadedCheck["repoFn"]} repoFn
 * @param {Record<string, unknown>} [config]
 * @returns {import("../src/lib/core/loader.js").LoadedCheck}
 */
function meshCheck(repoFn, config = {}) {
  return {
    id: "check_mesh_mock",
    filename: "check_mesh_mock.js",
    fn: async () => [],
    repoFn,
    config: { id: "check_mesh_mock", optimize: true, ...config },
  };
}

/** @param {Record<string, string>} files */
function stepCachePayload(files, violations = []) {
  return {
    meta: { head: gitContext.head, branch: "main" },
    files,
    violations,
  };
}

beforeAll(async () => {
  await mkdir(TEMP_DIR, { recursive: true });
  await writeFile(path.join(TEMP_DIR, "c.js"), "export const c = 1;\n");
});

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(scanFiles).mockResolvedValue(FILES);
  vi.mocked(loadStepCache).mockResolvedValue(
    stepCachePayload({
      "src/clean.js": "hash-clean",
      "src/with-todo.js": "hash-todo",
      [MODIFIED_FILE]: "hash-c",
    }),
  );
});

describe("mesh optimization via runStep", () => {
  it("skips clean pairs with createMeshOptimizer when optimize is on", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const check = meshCheck((_scanPath, files, _onProgress, context) => {
      const mesh = createMeshOptimizer(context);
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          mesh.skipPair(files[i], files[j]);
        }
      }
      return mesh.complete([]);
    });

    const result = await runStep({
      check,
      globalConfig: baseGlobalConfig(),
      gitContext,
      modifiedPaths: new Set([MODIFIED_FILE]),
    });

    expect(result.cacheInfo.optimize).toBe(true);
    expect(result.cacheInfo.meshSkippedPairs).toBeGreaterThan(0);
    expect(
      logSpy.mock.calls.some((call) =>
        String(call[0]).includes("createMeshOptimizer() was not used"),
      ),
    ).toBe(false);

    logSpy.mockRestore();
  });

  it("warns when optimize is on but createMeshOptimizer was not used", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const check = meshCheck(() => [{ message: "plain violation" }]);

    await runStep({
      check,
      globalConfig: baseGlobalConfig({ cache: false }),
      gitContext: null,
    });

    expect(
      logSpy.mock.calls.some((call) =>
        String(call[0]).includes("createMeshOptimizer() was not used"),
      ),
    ).toBe(true);

    logSpy.mockRestore();
  });

  it("restores cached pair violations via mesh.complete when files are unmodified", async () => {
    vi.mocked(loadStepCache).mockResolvedValue(
      stepCachePayload(
        {
          "src/clean.js": "hash-clean",
          "src/with-todo.js": "hash-todo",
          [MODIFIED_FILE]: "hash-c",
        },
        [{ message: "dup", _files: ["src/clean.js", "src/with-todo.js"] }],
      ),
    );

    const check = meshCheck((_scanPath, _files, _onProgress, context) => {
      const mesh = createMeshOptimizer(context);
      return mesh.complete([{ message: "fresh", file: MODIFIED_FILE }]);
    });

    const result = await runStep({
      check,
      globalConfig: baseGlobalConfig(),
      gitContext,
      modifiedPaths: new Set([MODIFIED_FILE]),
    });

    expect(result.cacheInfo.optimize).toBe(true);
    expect(result.violations.some((v) => v.message === "dup")).toBe(true);
    expect(result.violations.some((v) => v.message === "fresh")).toBe(true);
    expect(result.violations.filter((v) => v.message === "dup").length).toBeGreaterThanOrEqual(1);
  });
});
