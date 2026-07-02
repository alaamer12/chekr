import { describe, expect, test } from "vitest";
import { CGC_DEFAULTS, checkBigRepo, resolveCGCConfig } from "../../../src/lib/core/graph/index.js";

describe("resolveCGCConfig", () => {
  test("returns defaults when no user config", () => {
    const config = resolveCGCConfig(undefined);
    expect(config).toEqual(CGC_DEFAULTS);
  });

  test("returns defaults for null", () => {
    const config = resolveCGCConfig(null);
    expect(config).toEqual(CGC_DEFAULTS);
  });

  test("merges user overrides with defaults", () => {
    const config = resolveCGCConfig({
      enabled: true,
      autoIndex: true,
      maxDepth: 10,
    });
    expect(config.enabled).toBe(true);
    expect(config.autoIndex).toBe(true);
    expect(config.maxDepth).toBe(10);
    // Defaults preserved for non-overridden values
    expect(config.engine).toBe("auto");
    expect(config.persistDir).toBe(".chekr-graph");
  });

  test("autoIndex defaults to false", () => {
    const config = resolveCGCConfig({ enabled: true });
    expect(config.autoIndex).toBe(false);
  });

  test("suggestIndexing defaults to true", () => {
    const config = resolveCGCConfig({});
    expect(config.suggestIndexing).toBe(true);
  });

  test("suggestIndexing can be disabled", () => {
    const config = resolveCGCConfig({ suggestIndexing: false });
    expect(config.suggestIndexing).toBe(false);
  });

  test("bigRepoThreshold defaults to 500", () => {
    const config = resolveCGCConfig({});
    expect(config.bigRepoThreshold).toBe(500);
  });

  test("custom bigRepoThreshold", () => {
    const config = resolveCGCConfig({ bigRepoThreshold: 1000 });
    expect(config.bigRepoThreshold).toBe(1000);
  });
});

describe("checkBigRepo", () => {
  test("returns false for small repos", () => {
    const config = resolveCGCConfig({});
    const result = checkBigRepo(100, config);
    expect(result.isBig).toBe(false);
    expect(result.message).toBeNull();
  });

  test("returns true for repos at threshold", () => {
    const config = resolveCGCConfig({ bigRepoThreshold: 500 });
    const result = checkBigRepo(500, config);
    expect(result.isBig).toBe(true);
    expect(result.message).toContain("500 files");
    expect(result.message).toContain("chekr index");
  });

  test("returns true for repos above threshold", () => {
    const config = resolveCGCConfig({ bigRepoThreshold: 500 });
    const result = checkBigRepo(1200, config);
    expect(result.isBig).toBe(true);
    expect(result.message).toContain("1200 files");
  });

  test("respects suggestIndexing: false", () => {
    const config = resolveCGCConfig({ suggestIndexing: false });
    const result = checkBigRepo(10000, config);
    expect(result.isBig).toBe(false);
    expect(result.message).toBeNull();
  });

  test("message includes disable instruction", () => {
    const config = resolveCGCConfig({});
    const result = checkBigRepo(600, config);
    expect(result.message).toContain("suggestIndexing: false");
  });
});
