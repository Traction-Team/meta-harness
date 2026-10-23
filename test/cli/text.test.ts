import { describe, expect, test } from "vitest";
import { equalIgnoringEOL, isBinary, isSingleLine, toLF } from "../../src/util/text.js";

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

describe("isBinary", () => {
  test("is false for text", () => {
    expect(isBinary(Buffer.from("hello\nworld\n"))).toBe(false);
  });

  test("is true for a NUL byte in the first 8 KB", () => {
    const data = Buffer.alloc(16, 0x61);
    data[15] = 0;
    expect(isBinary(data)).toBe(true);
  });

  test("ignores a NUL byte past the first 8 KB", () => {
    const data = Buffer.alloc(8 * 1024 + 1, 0x61);
    data[8 * 1024] = 0;
    expect(isBinary(data)).toBe(false);
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
