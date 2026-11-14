import { describe, expect, test } from "vitest";
import { usesCRLF } from "../../src/util/text.js";

describe("usesCRLF", () => {
  test("is false for text with no line break", () => {
    expect(usesCRLF("a")).toBe(false);
  });

  test("is false for LF only", () => {
    expect(usesCRLF("a\nb")).toBe(false);
  });

  test("is true for CRLF only", () => {
    expect(usesCRLF("a\r\nb\r\n")).toBe(true);
  });

  test("is false for mixed CRLF and LF", () => {
    expect(usesCRLF("a\r\nb\nc")).toBe(false);
  });
});
