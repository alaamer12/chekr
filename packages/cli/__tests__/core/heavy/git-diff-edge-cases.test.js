/**
 * Git diff / status edge cases (ported from toolkit check-violations-cache scenarios).
 * Mocks simple-git — no real repository required.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildStatusFingerprint,
  getChangedPathsSince,
  parseModifiedPathsFromStatus,
} from "../../../src/lib/core/git/diff-cache.js";

vi.mock("simple-git", () => {
  const instance = {
    checkIsRepo: vi.fn(),
    revparse: vi.fn(),
    raw: vi.fn(),
    diff: vi.fn(),
  };
  globalThis.__chekrMockGit = instance;
  return {
    default: vi.fn(() => instance),
  };
});

/** @type {ReturnType<typeof vi.fn> & { checkIsRepo: ReturnType<typeof vi.fn>, revparse: ReturnType<typeof vi.fn>, raw: ReturnType<typeof vi.fn>, diff: ReturnType<typeof vi.fn> }} */
const mockGit = globalThis.__chekrMockGit;

import {
  diffPaths,
  getChangedPaths,
  getGitContext,
  getHead,
  getStagedPaths,
  getStatus,
  isRepo,
} from "../../../src/lib/core/git/git-service.js";

const CWD = "/mock/repo";

describe("git-service edge cases (mocked simple-git)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGit.checkIsRepo.mockResolvedValue(true);
    mockGit.revparse.mockImplementation((args) => {
      if (args.includes("--abbrev-ref")) return Promise.resolve("main");
      if (args.includes("HEAD")) return Promise.resolve("abc123deadbeef");
      return Promise.resolve("");
    });
    mockGit.raw.mockResolvedValue("");
    mockGit.diff.mockResolvedValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("getGitContext returns null when not a repo", async () => {
    mockGit.checkIsRepo.mockResolvedValue(false);
    await expect(getGitContext(CWD)).resolves.toBeNull();
    expect(mockGit.revparse).not.toHaveBeenCalled();
  });

  test("isRepo returns false when checkIsRepo throws", async () => {
    mockGit.checkIsRepo.mockRejectedValue(new Error("not git"));
    await expect(isRepo(CWD)).resolves.toBe(false);
  });

  test("diffPaths returns empty array on empty diff", async () => {
    mockGit.diff.mockResolvedValue("");
    await expect(diffPaths("HEAD~1", "HEAD", CWD)).resolves.toEqual([]);
  });

  test("diffPaths returns empty array when diff throws (e.g. invalid ref)", async () => {
    mockGit.diff.mockRejectedValue(new Error("bad revision"));
    await expect(diffPaths("missing", "HEAD", CWD)).resolves.toEqual([]);
  });

  test("getChangedPaths merges diff and untracked, deduped", async () => {
    mockGit.diff.mockResolvedValue("src/a.ts\nsrc/b.ts\n");
    mockGit.raw.mockImplementation((args) => {
      if (args[0] === "ls-files") return Promise.resolve("src/b.ts\nsrc/c.ts\n");
      return Promise.resolve("");
    });
    const paths = await getChangedPaths(CWD);
    expect(paths.sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  test("getStagedPaths parses cached diff only", async () => {
    mockGit.diff.mockResolvedValue(" staged.ts \nother.ts\n");
    await expect(getStagedPaths(CWD)).resolves.toEqual(["staged.ts", "other.ts"]);
    expect(mockGit.diff).toHaveBeenCalledWith(["--cached", "--name-only"]);
  });

  test("merge commit diff between parents returns changed files", async () => {
    mockGit.diff.mockResolvedValue("packages/merged.ts\n");
    const paths = await diffPaths("abc111", "def222", CWD);
    expect(paths).toEqual(["packages/merged.ts"]);
    expect(mockGit.diff).toHaveBeenCalledWith(["--name-only", "abc111", "def222"]);
  });

  test("getHead and getBranch delegate to revparse", async () => {
    await expect(getHead(CWD)).resolves.toBe("abc123deadbeef");
    await expect(getStatus(CWD)).resolves.toBe("");
    expect(mockGit.raw).toHaveBeenCalledWith(["status", "--porcelain"]);
  });

  test("getGitContext builds status fingerprint from porcelain", async () => {
    mockGit.raw.mockResolvedValue(" M src/dirty.ts\n");
    const ctx = await getGitContext(CWD);
    expect(ctx).toMatchObject({
      branch: "main",
      head: "abc123deadbeef",
      status: " M src/dirty.ts\n",
    });
    expect(ctx.statusFingerprint).toBe(
      buildStatusFingerprint({ head: "abc123deadbeef", status: " M src/dirty.ts\n" }),
    );
  });
});

describe("parseModifiedPathsFromStatus porcelain variants", () => {
  test("handles staged, unstaged, and both modified", () => {
    const status = [" M unstaged.ts", "M  staged.ts", "MM both.ts"].join("\n");
    const paths = parseModifiedPathsFromStatus(status);
    expect([...paths].sort()).toEqual(["both.ts", "staged.ts", "unstaged.ts"]);
  });

  test("handles added and untracked entries", () => {
    const status = ["A  new-file.ts", "?? untracked.ts"].join("\n");
    const paths = parseModifiedPathsFromStatus(status);
    expect([...paths].sort()).toEqual(["new-file.ts", "untracked.ts"]);
  });

  test("handles deleted paths", () => {
    const status = [" D removed.ts", "D  deleted-staged.ts"].join("\n");
    const paths = parseModifiedPathsFromStatus(status);
    expect([...paths].sort()).toEqual(["deleted-staged.ts", "removed.ts"]);
  });

  test("handles rename porcelain (uses destination path)", () => {
    const status = ["R  old/name.ts -> packages/new-name.ts", "RM old2.ts -> moved2.ts"].join("\n");
    const paths = parseModifiedPathsFromStatus(status);
    expect(paths.has("packages/new-name.ts")).toBe(true);
    expect(paths.has("moved2.ts")).toBe(true);
    expect(paths.has("old/name.ts")).toBe(false);
  });

  test("handles copy and unmerged conflict markers", () => {
    const status = [
      "C  copy-src.ts -> copy-dst.ts",
      "UU conflict.ts",
      "DU deleted-by-us.ts",
      "UD deleted-by-them.ts",
    ].join("\n");
    const paths = parseModifiedPathsFromStatus(status);
    expect(paths.has("copy-dst.ts")).toBe(true);
    expect(paths.has("conflict.ts")).toBe(true);
    expect(paths.has("deleted-by-us.ts")).toBe(true);
    expect(paths.has("deleted-by-them.ts")).toBe(true);
  });

  test("normalizes backslashes in paths", () => {
    const paths = parseModifiedPathsFromStatus(" M src\\windows\\path.ts");
    expect(paths.has("src/windows/path.ts")).toBe(true);
  });

  test("skips exempt cache output prefixes", () => {
    const status = [
      " M src/app.ts",
      "?? .chekr-cache/main/steps/run.json",
      " M .chekr/output/report.json",
    ].join("\n");
    const paths = parseModifiedPathsFromStatus(status, [".chekr-cache/", ".chekr/"]);
    expect([...paths]).toEqual(["src/app.ts"]);
  });

  test("ignores blank lines in porcelain output", () => {
    const paths = parseModifiedPathsFromStatus("\n\n M only.ts\n\n");
    expect([...paths]).toEqual(["only.ts"]);
  });
});

describe("getChangedPathsSince diff integration", () => {
  test("returns null when diff callback throws", async () => {
    const result = await getChangedPathsSince("base", "head", async () => {
      throw new Error("diff failed");
    });
    expect(result).toBeNull();
  });

  test("returns empty set for merge with no file changes", async () => {
    const result = await getChangedPathsSince("parent1", "parent2", async () => []);
    expect(result).toEqual(new Set());
  });

  test("collects renamed paths from diff name-only output", async () => {
    const result = await getChangedPathsSince("old", "new", async () => [
      "packages/renamed.ts",
      "src/unchanged.ts",
    ]);
    expect(result).toEqual(new Set(["packages/renamed.ts", "src/unchanged.ts"]));
  });
});
