import { describe, expect, test } from "vitest";
import { equalIgnoringEOL, isSingleLine, toLF } from "../../src/util/text.js";

describe("toLF", () => {
  test("converts CRLF and CR to LF", () => {
    expect(toLF("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  test("leaves LF text unchanged", () => {
    expect(toLF("a\nb\n")).toBe("a\nb\n");
  });
});

describe("equalIgnoringEOL", () => {
  test("ignores CRLF, CR and LF differences", () => {
    expect(equalIgnoringEOL("a\r\nb", "a\nb")).toBe(true);
    expect(equalIgnoringEOL("a\rb", "a\nb")).toBe(true);
  });

  test("still compares content", () => {
    expect(equalIgnoringEOL("a\nb", "a\nc")).toBe(false);
  });
});

describe("isSingleLine", () => {
  test("accepts one line", () => {
    expect(isSingleLine("one line")).toBe(true);
  });

  test("rejects LF and CR", () => {
    expect(isSingleLine("one\ntwo")).toBe(false);
    expect(isSingleLine("one\rtwo")).toBe(false);
  });
});
