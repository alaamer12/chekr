import { describe, expect, it } from "vitest";
import { cliToConfigPatch } from "../src/argv/cli-to-config-patch.js";
import { parseArgv } from "../src/argv/parse-argv.js";

describe("parseArgv", () => {
  it("defaults to run command", () => {
    const parsed = parseArgv(["--verbose"]);
    expect(parsed.command).toBe("run");
    expect(parsed.flags.verbose).toBe(true);
  });

  it("parses explicit command", () => {
    const parsed = parseArgv(["list", "--config", "custom.js"]);
    expect(parsed.command).toBe("list");
    expect(parsed.flags.config).toBe("custom.js");
  });

  it("parses --no-bail and positional path", () => {
    const parsed = parseArgv(["run", "--no-bail", "src/"]);
    expect(parsed.flags["no-bail"]).toBe(true);
    expect(parsed.positionals).toEqual(["src/"]);
  });

  it("parses equals form for flags", () => {
    const parsed = parseArgv(["run", "--reporter=json"]);
    expect(parsed.flags.reporter).toBe("json");
  });
});

describe("cliToConfigPatch", () => {
  it("maps plan §6 flags to config patch", () => {
    const { patch, actions } = cliToConfigPatch(
      {
        "no-bail": true,
        "no-cache": true,
        "clear-cache": true,
        concurrency: "8",
        reporter: "json",
        report: "./out.json",
        verbose: true,
        "ignore-marker": "@custom",
        gitignore: ".cursorignore",
        "checks-dir": "./rules",
        changed: true,
        skip: "a,b",
        only: "c",
        steps: "d,e",
        disable: "f",
        enable: "g",
      },
      ["./src"],
    );

    expect(patch.bail).toBe(false);
    expect(patch.cache).toBe(false);
    expect(actions.clearCache).toBe(true);
    expect(patch.concurrency).toBe(8);
    expect(patch.reporter).toBe("json");
    expect(patch.reportFile).toBe("./out.json");
    expect(patch.verbose).toBe(true);
    expect(patch.ignoreMarker).toBe("@custom");
    expect(patch.gitignore).toBe(".cursorignore");
    expect(patch.checksDir).toBe("./rules");
    expect(patch.scanMode).toBe("changed");
    expect(patch.skip).toEqual(["a", "b"]);
    expect(patch.only).toEqual(["c"]);
    expect(patch.stepOrder).toEqual(["d", "e"]);
    expect(patch.disable).toEqual(["f"]);
    expect(patch.enable).toEqual(["g"]);
    expect(patch.scanPath).toBe("./src");
  });

  it("sets gitignore null for --no-gitignore", () => {
    const { patch } = cliToConfigPatch({ "no-gitignore": true }, []);
    expect(patch.gitignore).toBe(null);
  });
});
