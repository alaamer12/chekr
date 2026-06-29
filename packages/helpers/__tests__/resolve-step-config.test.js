import { describe, expect, it } from "vitest";
import { resolveStepConfig } from "../src/config/resolve-step-config.js";

describe("resolveStepConfig", () => {
  const global = {
    include: ["**/*"],
    exclude: ["**/*.test.*"],
    gitignore: ".gitignore",
    ignoreMarker: "@chekr-ignore",
    bail: true,
    concurrency: 4,
  };

  it("inherits global fields when step omits them", () => {
    const resolved = resolveStepConfig(global, { id: "check_raw_colors" });

    expect(resolved).toMatchObject({
      id: "check_raw_colors",
      include: ["**/*"],
      exclude: ["**/*.test.*"],
      gitignore: ".gitignore",
      ignoreMarker: "@chekr-ignore",
      bail: true,
      concurrency: 4,
      enabled: true,
    });
  });

  it("replaces include when step sets it", () => {
    const resolved = resolveStepConfig(global, {
      id: "check_raw_colors",
      include: ["src/**/*"],
    });

    expect(resolved.include).toEqual(["src/**/*"]);
  });

  it("merges global and step exclude arrays", () => {
    const resolved = resolveStepConfig(global, {
      id: "check_raw_colors",
      exclude: ["**/*.stories.*"],
    });

    expect(resolved.exclude).toEqual(["**/*.test.*", "**/*.stories.*"]);
  });

  it("applies CLI step patch last", () => {
    const resolved = resolveStepConfig(
      global,
      { id: "check_raw_colors", bail: false },
      { concurrency: 8 },
    );

    expect(resolved.bail).toBe(false);
    expect(resolved.concurrency).toBe(8);
  });
});
