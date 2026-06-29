import { describe, expect, it } from "vitest";
import { normalizeViolation, normalizeViolations } from "../src/lib/core/violation.js";

describe("normalizeViolation", () => {
  it("keeps custom fields on violations", () => {
    const v = normalizeViolation(
      {
        file: "a.ts",
        message: "bad",
        severity: "error",
        ruleId: "no-foo",
        details: { count: 3 },
      },
      { checkId: "check_foo", step: 2 },
    );

    expect(v).toMatchObject({
      file: "a.ts",
      message: "bad",
      severity: "error",
      ruleId: "no-foo",
      details: { count: 3 },
      checkId: "check_foo",
      step: 2,
    });
  });

  it("defaults file and message", () => {
    const v = normalizeViolation({ title: "Hook misuse" }, { filePath: "x.tsx", checkId: "c" });
    expect(v?.file).toBe("x.tsx");
    expect(v?.message).toBe("Hook misuse");
    expect(v?.checkId).toBe("c");
  });

  it("normalizes repoFn payloads", () => {
    const list = normalizeViolations(
      { violations: [{ message: "a" }], meshSkippedPairs: 5 },
      { checkId: "check_mesh" },
    );
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe("a");
  });
});
