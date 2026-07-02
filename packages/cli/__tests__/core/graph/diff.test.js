import { describe, expect, test } from "vitest";
import { computeDiff, computeReindexPlan, estimateWork } from "../../../src/lib/core/graph/diff.js";

describe("computeDiff", () => {
  test("detects added files (scope widened)", () => {
    const currentFiles = ["a.js", "b.js", "c.js"];
    const graphedFiles = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
    ]);
    const currentHashes = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
      ["c.js", "hash-c"],
    ]);

    const diff = computeDiff(currentFiles, graphedFiles, currentHashes);
    expect(diff.added).toEqual(["c.js"]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged).toEqual(["a.js", "b.js"]);
    expect(diff.scopeChanged).toBe(true);
  });

  test("detects removed files (scope narrowed)", () => {
    const currentFiles = ["a.js"];
    const graphedFiles = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
      ["c.js", "hash-c"],
    ]);
    const currentHashes = new Map([["a.js", "hash-a"]]);

    const diff = computeDiff(currentFiles, graphedFiles, currentHashes);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(["b.js", "c.js"]);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged).toEqual(["a.js"]);
    expect(diff.scopeChanged).toBe(true);
  });

  test("detects modified files", () => {
    const currentFiles = ["a.js", "b.js"];
    const graphedFiles = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
    ]);
    const currentHashes = new Map([
      ["a.js", "hash-a-new"],
      ["b.js", "hash-b"],
    ]);

    const diff = computeDiff(currentFiles, graphedFiles, currentHashes);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual(["a.js"]);
    expect(diff.unchanged).toEqual(["b.js"]);
    expect(diff.scopeChanged).toBe(false);
  });

  test("handles empty state (first index)", () => {
    const currentFiles = ["a.js", "b.js"];
    const graphedFiles = new Map();
    const currentHashes = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
    ]);

    const diff = computeDiff(currentFiles, graphedFiles, currentHashes);
    expect(diff.added).toEqual(["a.js", "b.js"]);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
    expect(diff.scopeChanged).toBe(true);
  });

  test("all unchanged when nothing changed", () => {
    const currentFiles = ["a.js", "b.js"];
    const graphedFiles = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
    ]);
    const currentHashes = new Map([
      ["a.js", "hash-a"],
      ["b.js", "hash-b"],
    ]);

    const diff = computeDiff(currentFiles, graphedFiles, currentHashes);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged).toEqual(["a.js", "b.js"]);
    expect(diff.scopeChanged).toBe(false);
  });
});

describe("computeReindexPlan", () => {
  test("includes added and modified files in filesToIndex", () => {
    const diff = {
      added: ["c.js"],
      removed: ["d.js"],
      modified: ["a.js"],
      unchanged: ["b.js"],
      totalCurrent: 3,
      totalGraphed: 3,
      scopeChanged: true,
    };
    const dependents = new Map();

    const plan = computeReindexPlan(diff, dependents);
    expect(plan.filesToIndex).toEqual(["c.js", "a.js"]);
    expect(plan.filesToRemove).toEqual(["d.js"]);
    expect(plan.filesToValidate).toEqual([]);
  });

  test("validates dependents of modified files", () => {
    const diff = {
      added: [],
      removed: [],
      modified: ["utils.js"],
      unchanged: ["app.js", "other.js"],
      totalCurrent: 3,
      totalGraphed: 3,
      scopeChanged: false,
    };
    const dependents = new Map([["utils.js", new Set(["app.js", "other.js"])]]);

    const plan = computeReindexPlan(diff, dependents);
    expect(plan.filesToIndex).toEqual(["utils.js"]);
    expect(plan.filesToValidate).toContain("app.js");
    expect(plan.filesToValidate).toContain("other.js");
  });

  test("validates dependents of removed files", () => {
    const diff = {
      added: [],
      removed: ["old.js"],
      modified: [],
      unchanged: ["app.js"],
      totalCurrent: 1,
      totalGraphed: 2,
      scopeChanged: true,
    };
    const dependents = new Map([["old.js", new Set(["app.js"])]]);

    const plan = computeReindexPlan(diff, dependents);
    expect(plan.filesToRemove).toEqual(["old.js"]);
    expect(plan.filesToValidate).toContain("app.js");
  });

  test("does not double-validate already modified files", () => {
    const diff = {
      added: [],
      removed: [],
      modified: ["a.js", "b.js"],
      unchanged: ["c.js"],
      totalCurrent: 3,
      totalGraphed: 3,
      scopeChanged: false,
    };
    // b.js depends on a.js, but b.js is already modified
    const dependents = new Map([["a.js", new Set(["b.js", "c.js"])]]);

    const plan = computeReindexPlan(diff, dependents);
    expect(plan.filesToValidate).toEqual(["c.js"]);
    expect(plan.filesToValidate).not.toContain("b.js");
  });
});

describe("estimateWork", () => {
  test("calculates total work and percentage", () => {
    const plan = {
      filesToIndex: ["a.js", "b.js"],
      filesToRemove: ["c.js"],
      filesToValidate: ["d.js"],
    };
    const result = estimateWork(plan, 10);
    expect(result.totalWork).toBe(4);
    expect(result.percentageChanged).toBe(40);
    expect(result.suggestFullRebuild).toBe(false);
  });

  test("suggests full rebuild when >60% changed", () => {
    const plan = {
      filesToIndex: Array(7).fill("file.js"),
      filesToRemove: [],
      filesToValidate: [],
    };
    const result = estimateWork(plan, 10);
    expect(result.percentageChanged).toBe(70);
    expect(result.suggestFullRebuild).toBe(true);
  });

  test("handles zero total files", () => {
    const plan = { filesToIndex: [], filesToRemove: [], filesToValidate: [] };
    const result = estimateWork(plan, 0);
    expect(result.totalWork).toBe(0);
    expect(result.percentageChanged).toBe(0);
    expect(result.suggestFullRebuild).toBe(false);
  });
});
