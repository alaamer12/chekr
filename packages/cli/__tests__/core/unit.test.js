import { describe, expect, it } from "vitest";
import {
  contentHash,
  partitionFilesByCache,
  sanitizeBranchName,
} from "../../src/lib/core/git/diff-cache.js";
import { deriveExtensions, matchesAny } from "../../src/lib/core/glob-match.js";

describe("diff-cache", () => {
  it("hashes content consistently", () => {
    expect(contentHash("hello")).toHaveLength(64);
    expect(contentHash("hello")).toBe(contentHash("hello"));
  });

  it("sanitizes branch names", () => {
    expect(sanitizeBranchName("feature/foo")).toBe("feature_foo");
  });

  it("partitions files by cache state", () => {
    const modified = new Set(["a.js"]);
    const cached = { "a.js": "hash1", "b.js": "hash2" };
    const { toCheck, skipped } = partitionFilesByCache(["a.js", "b.js", "c.js"], cached, modified);

    expect(toCheck).toEqual(["a.js", "c.js"]);
    expect(skipped).toEqual(["b.js"]);
  });
});

describe("deriveExtensions", () => {
  it("uses explicit extensions when provided", () => {
    expect(deriveExtensions(undefined, ["tsx"])).toEqual([".tsx"]);
  });
});

describe("matchesAny", () => {
  it("returns true when no patterns", () => {
    expect(matchesAny("foo.js", [])).toBe(true);
  });
});
