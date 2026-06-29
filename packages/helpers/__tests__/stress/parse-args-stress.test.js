import { describe, expect, test } from "vitest";
import { parseArgsArrayString } from "../../src/parse/parse-args-array-string.js";

const TOKEN_COUNT = 10_000;

function buildStressInput(count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 500 === 0) {
      parts.push(`"token,with,comma-${i}"`);
    } else if (i > 0 && i % 777 === 0) {
      parts.push(`"escaped\\"quote-${i}"`);
    } else {
      parts.push(`token-${i}`);
    }
  }
  return parts.join(",");
}

describe("parseArgsArrayString stress", () => {
  test(`parses ${TOKEN_COUNT} comma-separated tokens`, () => {
    const input = buildStressInput(TOKEN_COUNT);

    const start = performance.now();
    const tokens = parseArgsArrayString(input);
    const elapsed = performance.now() - start;

    expect(tokens.length).toBe(TOKEN_COUNT);
    expect(tokens[0]).toBe("token-0");
    expect(tokens[1]).toBe("token-1");
    expect(tokens[500]).toBe("token,with,comma-500");
    expect(tokens[777]).toBe('escaped"quote-777');
    expect(tokens[TOKEN_COUNT - 1]).toBe(`token-${TOKEN_COUNT - 1}`);
    expect(elapsed).toBeLessThan(2000);
  });

  test("handles empty segments without inflating token count", () => {
    const sparse = `${"a,".repeat(9999)}b`;
    const tokens = parseArgsArrayString(sparse);
    expect(tokens.length).toBe(10_000);
    expect(tokens.at(-1)).toBe("b");
  });
});
