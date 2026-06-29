import { describe, expect, it } from "vitest";
import { ConfigError, validateConfig } from "../src/config/validate-config.js";

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    const config = validateConfig({
      checksDir: "./.checkr/checks",
      reporter: "json",
      concurrency: 4,
      steps: [{ id: "check_raw_colors", enabled: true }],
    });

    expect(config.checksDir).toBe("./.checkr/checks");
  });

  it("throws ConfigError with field path for invalid reporter", () => {
    try {
      validateConfig({ reporter: "verbose" });
      expect.fail("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.path).toBe("reporter");
    }
  });

  it("validates step ids", () => {
    try {
      validateConfig({ steps: [{ id: "" }] });
      expect.fail("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.path).toBe("steps[0].id");
    }
  });

  it("rejects non-object config", () => {
    expect(() => validateConfig(null)).toThrow(ConfigError);
  });
});
