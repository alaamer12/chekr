import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENGINE_DEFAULTS } from "../src/config/defaults.js";
import { resolveConfig } from "../src/config/resolve-config.js";
import { run } from "../src/engine.js";
import { createGitignoreFilter } from "../src/git/gitignore-filter.js";
import { matchGlob } from "../src/glob-match.js";
import { resolveStepOrder } from "../src/loader.js";
import { scanFiles } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../__fixtures__/minimal");

describe("resolveConfig", () => {
  it("merges defaults with file and CLI patches", () => {
    const resolved = resolveConfig(
      { bail: false, concurrency: 8 },
      { verbose: true },
      { cwd: FIXTURE },
    );

    expect(resolved.bail).toBe(false);
    expect(resolved.concurrency).toBe(8);
    expect(resolved.verbose).toBe(true);
    expect(resolved.checksDir).toBe(ENGINE_DEFAULTS.checksDir);
    expect(resolved.cwd).toBe(FIXTURE);
  });
});

describe("glob-match", () => {
  it("matches brace expansion patterns", () => {
    expect(matchGlob("src/foo.js", "src/**/*.{js,ts}")).toBe(true);
    expect(matchGlob("src/foo.ts", "src/**/*.{js,ts}")).toBe(true);
    expect(matchGlob("src/foo.css", "src/**/*.{js,ts}")).toBe(false);
  });
});

describe("gitignore filter", () => {
  it("excludes gitignored paths", () => {
    const isIgnored = createGitignoreFilter(".gitignore", FIXTURE);
    expect(isIgnored("ignored.js")).toBe(true);
    expect(isIgnored("src/clean.js")).toBe(false);
  });
});

describe("step overrides", () => {
  it("applies per-step include via resolveStepOrder and scanFiles", async () => {
    const globalConfig = resolveConfig(
      {
        checksDir: "./.checkr/checks",
        include: ["**/*.js"],
        cache: false,
        cwd: FIXTURE,
      },
      {},
      { cwd: FIXTURE },
    );

    const stepConfig = {
      id: "check_todo_violation",
      include: ["src/with-todo.js"],
      extensions: [".js"],
    };

    const files = await scanFiles(stepConfig, globalConfig);
    expect(files).toEqual(["src/with-todo.js"]);
  });
});

describe("skip / only", () => {
  it("respects --only over discovery order", () => {
    const checks = [
      { id: "check_always_pass", filename: "check_always_pass.js", fn: () => [] },
      { id: "check_todo_violation", filename: "check_todo_violation.js", fn: () => [] },
    ];

    const ordered = resolveStepOrder(checks, { only: ["check_todo_violation"] });
    expect(ordered.map((c) => c.id)).toEqual(["check_todo_violation"]);
  });

  it("respects skip list", () => {
    const checks = [
      { id: "check_always_pass", filename: "check_always_pass.js", fn: () => [] },
      { id: "check_todo_violation", filename: "check_todo_violation.js", fn: () => [] },
    ];

    const ordered = resolveStepOrder(checks, { skip: ["check_todo_violation"] });
    expect(ordered.map((c) => c.id)).toEqual(["check_always_pass"]);
  });
});

describe("run() integration", () => {
  it("runs checks on minimal fixture and finds TODO violations", async () => {
    const result = await run({
      cwd: FIXTURE,
      configPath: path.join(FIXTURE, "checkr.config.js"),
      loadFileConfig: false,
      cache: false,
      reporter: "json",
      bail: false,
    });

    expect(result.steps.length).toBe(2);
    expect(result.steps[0].status).toBe("pass");
    expect(result.steps[1].status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].file).toBe("src/with-todo.js");
  });

  it("filters gitignored files from scan", async () => {
    const result = await run({
      cwd: FIXTURE,
      checksDir: "./.checkr/checks",
      only: ["check_todo_violation"],
      include: ["**/*.js"],
      gitignore: ".gitignore",
      scanPath: ".",
      cache: false,
      reporter: "json",
      bail: false,
      loadFileConfig: false,
    });

    const files = result.steps[0].violations.map((v) => v.file);
    expect(files).not.toContain("ignored.js");
  });

  it("bails on first failure when bail is true", async () => {
    const result = await run({
      cwd: FIXTURE,
      checksDir: "./.checkr/checks",
      include: ["**/*.js"],
      scanPath: "src",
      cache: false,
      reporter: "json",
      bail: true,
      loadFileConfig: false,
      steps: [
        { id: "check_todo_violation", step: 1 },
        { id: "check_always_pass", step: 2 },
      ],
    });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].status).toBe("fail");
  });
});
