import { describe, test, expect, vi } from "vitest";
import {
	buildStatusFingerprint,
	contentHash,
	getGitContext,
	isGitAvailable,
	isStepCacheValid,
	parseModifiedPathsFromStatus,
	partitionFilesByCache,
	sanitizeBranchName,
	needsRepoLevelCheck,
	formatIncrementalCacheBanner,
} from "../utils/check-violations-cache.js";

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
		const status = [" M packages/foo.ts", "R  old.ts -> packages/new.ts", "?? untracked.ts"].join("\n");
		const paths = parseModifiedPathsFromStatus(status);
		expect(paths.has("packages/foo.ts")).toBe(true);
		expect(paths.has("packages/new.ts")).toBe(true);
		expect(paths.has("untracked.ts")).toBe(true);
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

	test("accepts matching meta", () => {
		expect(
			isStepCacheValid(
				{ meta: { head: gitContext.head, statusFingerprint: gitContext.statusFingerprint } },
				gitContext
			)
		).toBe(true);
	});

	test("rejects stale head", () => {
		expect(
			isStepCacheValid({ meta: { head: "other", statusFingerprint: gitContext.statusFingerprint } }, gitContext)
		).toBe(false);
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
			statusFingerprint: buildStatusFingerprint({ head: "deadbeef", status: ctxClean.status }),
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

	test("ignores toolkit cache paths in modified set", () => {
		const paths = parseModifiedPathsFromStatus("?? packages/toolkit/.cache/check-violations/main/steps/foo.json\n");
		expect(paths.size).toBe(0);
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

	test("explains new commit invalidates prior cache", () => {
		const msg = formatIncrementalCacheBanner(
			gitContext,
			{ head: "d6e471d000000000000000000000000000000000", branch: "main" },
			0
		);
		expect(msg).toContain("NEW commit 5771b85");
		expect(msg).toContain("d6e471d");
		expect(msg).toContain("ignored");
	});

	test("explains reuse on same commit with clean tree", () => {
		const msg = formatIncrementalCacheBanner(gitContext, { head: gitContext.head, branch: "main" }, 0);
		expect(msg).toContain("reusing saved results");
		expect(msg).toContain("clean working tree");
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

describe("git integration (mocked)", () => {
	test("getGitContext uses injected exec", async () => {
		const execGit = vi.fn(async (_cmd, args) => {
			if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
				return { stdout: "feature/test\n" };
			}
			if (args[0] === "rev-parse") {
				return { stdout: "abc123\n" };
			}
			if (args[0] === "status") {
				return { stdout: " M src/foo.ts\n" };
			}
			throw new Error(`unexpected: ${args.join(" ")}`);
		});

		const ctx = await getGitContext(execGit);
		expect(ctx.branch).toBe("feature/test");
		expect(ctx.head).toBe("abc123");
		expect(ctx.status).toContain("src/foo.ts");
		expect(ctx.statusFingerprint).toHaveLength(16);
	});

	test("isGitAvailable returns false when git exec fails", async () => {
		const execGit = vi.fn(async () => {
			throw new Error("not found");
		});
		await expect(isGitAvailable(execGit)).resolves.toBe(false);
	});

	test("isGitAvailable returns true when git responds", async () => {
		const execGit = vi.fn(async () => ({ stdout: "git version 2.0\n" }));
		await expect(isGitAvailable(execGit)).resolves.toBe(true);
	});
});
