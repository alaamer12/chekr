import { describe, expect, it, vi } from "vitest";
import { createMeshOptimizer, isMeshResult } from "../src/lib/utils/mesh-optimizer.js";

describe("createMeshOptimizer", () => {
  it("skipPair returns false when optimize is off", () => {
    const mesh = createMeshOptimizer({
      optimize: false,
      unmodifiedFiles: new Set(["a.ts", "b.ts"]),
    });
    expect(mesh.skipPair("a.ts", "b.ts")).toBe(false);
    expect(mesh.complete([]).meshSkippedPairs).toBe(0);
  });

  it("skipPair skips clean pairs and counts them", () => {
    const mesh = createMeshOptimizer({
      optimize: true,
      unmodifiedFiles: new Set(["a.ts", "b.ts", "c.ts"]),
    });

    expect(mesh.skipPair("a.ts", "b.ts")).toBe(true);
    expect(mesh.skipPair("a.ts", "c.ts")).toBe(true);
    expect(mesh.skipPair("a.ts", "d.ts")).toBe(false);

    const result = mesh.complete([{ message: "new", file: "d.ts" }]);
    expect(result.meshSkippedPairs).toBe(2);
    expect(result.meshUsed).toBe(true);
    expect(isMeshResult(result)).toBe(true);
  });

  it("restores cached pair violations when both files are clean", () => {
    const mesh = createMeshOptimizer({
      optimize: true,
      unmodifiedFiles: new Set(["a.ts", "b.ts"]),
      cachedViolations: [
        { message: "dup", _files: ["a.ts", "b.ts"] },
        { message: "other", _files: ["a.ts", "c.ts"] },
      ],
    });

    const result = mesh.complete([{ message: "fresh", file: "x.ts" }]);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toMatchObject({ message: "dup" });
    expect(result.violations[1]).toMatchObject({ message: "fresh" });
  });

  it("announce prints building-cache line on first run", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => true);
    const mesh = createMeshOptimizer({
      optimize: true,
      unmodifiedFiles: new Set(),
      checkId: "check_dup",
    });
    mesh.announce();
    expect(
      write.mock.calls.some((call) => String(call[0]).includes("building cache")) ||
      log.mock.calls.some((call) => String(call[0]).includes("building cache"))
    ).toBe(true);
    write.mockRestore();
    log.mockRestore();
  });

  it("announce prints mesh ON when clean files exist", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const log = vi.spyOn(console, "log").mockImplementation(() => true);
    const mesh = createMeshOptimizer({
      optimize: true,
      unmodifiedFiles: new Set(["a.ts"]),
      checkId: "check_dup",
    });
    mesh.announce();
    expect(
      write.mock.calls.some((call) => String(call[0]).includes("Mesh ON")) ||
      log.mock.calls.some((call) => String(call[0]).includes("Mesh ON"))
    ).toBe(true);
    write.mockRestore();
    log.mockRestore();
  });
});
