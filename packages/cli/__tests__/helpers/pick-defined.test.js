import { describe, expect, it } from "vitest";
import { pickDefined } from "../../src/lib/helpers/config/pick-defined.js";

describe("pickDefined", () => {
  it("removes undefined keys", () => {
    expect(pickDefined({ a: 1, b: undefined, c: "ok", d: null })).toEqual({
      a: 1,
      c: "ok",
      d: null,
    });
  });
});
