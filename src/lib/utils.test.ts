import { describe, expect, it } from "vitest";
import { clamp, deepMerge, fmt, pointsToPath, safeNumber, slug } from "./utils";

describe("deepMerge", () => {
  it("merges nested objects without mutating the source", () => {
    const base = { a: 1, nested: { b: 2, c: 3 } };
    const patch = { nested: { c: 8 } };
    const merged = deepMerge(base, patch);
    expect(merged).toEqual({ a: 1, nested: { b: 2, c: 8 } });
    expect(base.nested.c).toBe(3);
  });

  it("replaces arrays instead of concatenating", () => {
    expect(deepMerge({ a: [1, 2] }, { a: [9] }).a).toEqual([9]);
  });
});

describe("formatting and safety", () => {
  it("clamps finite numbers", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(safeNumber("4.4", 1, 0, 10)).toBe(4.4);
    expect(safeNumber("oops", 1, 0, 10)).toBe(1);
  });

  it("creates stable file slugs", () => {
    expect(slug("Esquina Gato 90°")).toBe("esquina-gato-90");
  });

  it("formats Spanish decimals", () => {
    expect(fmt(10.25, 1)).toBe("10,3");
  });

  it("turns rings into SVG paths", () => {
    expect(pointsToPath([[0, 0], [10, 0], [10, 10]])).toContain("M 0.00 0.00");
  });
});
