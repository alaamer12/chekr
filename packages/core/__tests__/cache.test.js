import { describe, expect, test } from "vitest";
import {
  buildStatusFingerprint,
  contentHash,
  formatIncrementalCacheBanner,
  getChangedPathsSince,
  isStepCacheValid,
  needsRepoLevelCheck,
  parseModifiedPathsFromStatus,
  partitionFilesByCache,
  sanitizeBranchName,
} from "../src/git/diff-cache.js";
import { getGitContext, isGitAvailable } from "../src/git/git-service.js";

describe("sanitizeBranchName", () => {
  test("replaces unsafe characters", () => {
    expect(sanitizeBranchName("feature/foo bar")).toBe("feature_foo_bar");
  });

  test("returns unknown for empty branch", () => {
    expect(sanitizeBranchName("")).toBe("unknown");
  });
});

describe("buildStatusFingerprint", () => {
  test("is stable for the same head and status", () => {
    const a = buildStatusFingerprint({ head: "abc", status: " M file.ts\n" });
    const b = buildStatusFingerprint({ head: "abc", status: " M file.ts\n" });
    expect(a).toBe(b);
  });

  test("changes when status changes", () => {
    const a = buildStatusFingerprint({ head: "abc", status: "" });
    const b = buildStatusFingerprint({ head: "abc", status: " M file.ts\n" });
    expect(a).not.toBe(b);
  });
});

describe("contentHash", () => {
  test("returns sha256 hex digest", () => {
    const hash = contentHash("hello");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash("hello")).toBe(hash);
  });
});

describe("parseModifiedPathsFromStatus", () => {
  test("collects modified and renamed paths", () => {
    const status = [" M packages/foo.ts", "R  old.ts -> packages/new.ts", "?? untracked.ts"].join(
      "\n",
    );
    const paths = parseModifiedPathsFromStatus(status);
    expect(paths.has("packages/foo.ts")).toBe(true);
    expect(paths.has("packages/new.ts")).toBe(true);
    expect(paths.has("untracked.ts")).toBe(true);
  });

  test("ignores cache output paths via exempt prefixes", () => {
    const paths = parseModifiedPathsFromStatus("?? .checkr-cache/main/steps/foo.json\n", [
      ".checkr-cache/",
    ]);
    expect(paths.size).toBe(0);
  });
});

describe("partitionFilesByCache", () => {
  const cached = {
    "a.ts": "hash-a",
    "b.ts": "hash-b",
  };

  test("checks files missing from cache", () => {
    const { toCheck, skipped } = partitionFilesByCache(["a.ts", "c.ts"], cached, new Set());
    expect(toCheck).toEqual(["c.ts"]);
    expect(skipped).toEqual(["a.ts"]);
  });

  test("checks files listed in git status", () => {
    const { toCheck, skipped } = partitionFilesByCache(["a.ts", "b.ts"], cached, new Set(["a.ts"]));
    expect(toCheck).toEqual(["a.ts"]);
    expect(skipped).toEqual(["b.ts"]);
  });

  test("checks when live content hash differs from cache", () => {
    const live = new Map([["a.ts", "different"]]);
    const { toCheck, skipped } = partitionFilesByCache(["a.ts"], cached, new Set(), live);
    expect(toCheck).toEqual(["a.ts"]);
    expect(skipped).toEqual([]);
  });
});

describe("isStepCacheValid", () => {
  const gitContext = {
    branch: "main",
    head: "deadbeef",
    status: "",
    statusFingerprint: buildStatusFingerprint({ head: "deadbeef", status: "" }),
  };

  test("accepts matching branch meta", () => {
    expect(
      isStepCacheValid(
        {
          meta: {
            head: gitContext.head,
            branch: "main",
            statusFingerprint: gitContext.statusFingerprint,
          },
        },
        gitContext,
      ),
    ).toBe(true);
  });

  test("rejects when meta head is missing", () => {
    expect(isStepCacheValid({ meta: {} }, gitContext)).toBe(false);
  });

  test("stays valid when only git status changes (same HEAD)", () => {
    const ctxClean = {
      branch: "main",
      head: "deadbeef",
      status: "",
      statusFingerprint: buildStatusFingerprint({ head: "deadbeef", status: "" }),
    };
    const ctxDirty = {
      ...ctxClean,
      status: " M packages/foo.ts\n",
      statusFingerprint: buildStatusFingerprint({
        head: "deadbeef",
        status: " M packages/foo.ts\n",
      }),
    };
    const cache = {
      meta: {
        head: "deadbeef",
        branch: "main",
        statusFingerprint: ctxClean.statusFingerprint,
      },
    };
    expect(isStepCacheValid(cache, ctxDirty)).toBe(true);
  });

  test("rejects cache from a different branch at the same HEAD", () => {
    const ctx = {
      branch: "main",
      head: "deadbeef",
      status: "",
      statusFingerprint: buildStatusFingerprint({ head: "deadbeef", status: "" }),
    };
    expect(isStepCacheValid({ meta: { head: "deadbeef", branch: "other" } }, ctx)).toBe(false);
  });

  test("rejects when forceFullScan is set", () => {
    expect(
      isStepCacheValid(
        { meta: { head: "deadbeef", branch: "main" } },
        { ...gitContext, forceFullScan: true },
      ),
    ).toBe(false);
  });
});

describe("formatIncrementalCacheBanner", () => {
  const gitContext = {
    branch: "main",
    head: "5771b85deadbeef5771b85deadbeef5771b85de",
    status: "",
    statusFingerprint: "abc",
  };

  test("explains missing cache for current commit", () => {
    const msg = formatIncrementalCacheBanner(gitContext, null, 0);
    expect(msg).toContain("5771b85");
    expect(msg).toContain("no saved results");
  });

  test("explains reuse with prior commit cache", () => {
    const msg = formatIncrementalCacheBanner(
      gitContext,
      { head: "d6e471d000000000000000000000000000000000", branch: "main" },
      0,
    );
    expect(msg).toContain("5771b85");
    expect(msg).toContain("d6e471d");
    expect(msg).toContain("reusing saved results");
  });

  test("explains reuse on same commit with clean tree", () => {
    const msg = formatIncrementalCacheBanner(
      gitContext,
      { head: gitContext.head, branch: "main" },
      0,
    );
    expect(msg).toContain("reusing saved results");
    expect(msg).toContain("clean working tree");
  });

  test("explains rechecking dirty paths", () => {
    const msg = formatIncrementalCacheBanner(
      gitContext,
      { head: gitContext.head, branch: "main" },
      3,
    );
    expect(msg).toContain("rechecking 3");
  });
});

describe("needsRepoLevelCheck", () => {
  test("is false when every scoped file is cached and clean", () => {
    expect(needsRepoLevelCheck(["a.ts"], { "a.ts": "h" }, new Set())).toBe(false);
  });

  test("is true when any scoped file must be rechecked", () => {
    expect(needsRepoLevelCheck(["a.ts", "b.ts"], { "a.ts": "h" }, new Set(["b.ts"]))).toBe(true);
  });
});

describe("getChangedPathsSince", () => {
  test("returns null when diff fails", async () => {
    const result = await getChangedPathsSince("a", "b", async () => {
      throw new Error("fail");
    });
    expect(result).toBeNull();
  });

  test("normalizes paths into a set", async () => {
    const result = await getChangedPathsSince("a", "b", async () => ["src/foo.ts", "src/bar.ts"]);
    expect(result).toEqual(new Set(["src/foo.ts", "src/bar.ts"]));
  });
});

describe("git integration (mocked)", () => {
  test("getGitContext returns null outside a repo", async () => {
    const ctx = await getGitContext("/nonexistent/path/that/is/not/a/repo");
    expect(ctx).toBeNull();
  });

  test("isGitAvailable returns false outside a repo", async () => {
    await expect(isGitAvailable("/nonexistent/path/that/is/not/a/repo")).resolves.toBe(false);
  });
});
