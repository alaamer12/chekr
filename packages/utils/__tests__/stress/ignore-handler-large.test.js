import { describe, expect, test } from "vitest";
import { buildIgnoredLines } from "../../src/ignore-handler.js";

const LINE_COUNT = 50_000;
const BLOCK_EVERY = 250;
const MARKER = "@checkr-ignore";

function buildLargeSource(lineCount) {
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const posInCycle = i % BLOCK_EVERY;
    if (posInCycle === 0) {
      lines.push(`// ${MARKER}-start`);
    } else if (posInCycle === 1) {
      lines.push(`const suppressed_${i} = "violation";`);
    } else if (posInCycle === 2) {
      lines.push(`// ${MARKER}-end`);
    } else {
      lines.push(`export const value_${i} = ${i};`);
    }
  }
  return lines;
}

describe("buildIgnoredLines large file stress", () => {
  test(`processes ${LINE_COUNT} lines with ignore blocks`, () => {
    const lines = buildLargeSource(LINE_COUNT);

    const start = performance.now();
    const ignored = buildIgnoredLines(lines, { marker: MARKER });
    const elapsed = performance.now() - start;

    const expectedBlocks = Math.floor(LINE_COUNT / BLOCK_EVERY);
    expect(expectedBlocks).toBe(200);
    expect(ignored.size).toBe(expectedBlocks);

    for (let block = 0; block < expectedBlocks; block++) {
      const violationLine = block * BLOCK_EVERY + 2;
      expect(ignored.has(violationLine)).toBe(true);
      expect(ignored.has(violationLine - 1)).toBe(false);
      expect(ignored.has(violationLine + 1)).toBe(false);
    }

    expect(elapsed).toBeLessThan(3000);
  });
});
