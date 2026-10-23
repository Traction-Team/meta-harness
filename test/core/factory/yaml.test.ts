import { describe, expect, test } from "vitest";
import { parseYaml } from "../../../src/util/yaml.js";
import type { YamlParseResult } from "../../../src/util/yaml.js";

function parsed(result: YamlParseResult): Extract<YamlParseResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected the YAML to parse");
  return result;
}

function rejected(result: YamlParseResult): Extract<YamlParseResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected the YAML to fail");
  return result;
}

describe("parseYaml", () => {
  test("parses a top-level mapping", () => {
    const result = parsed(parseYaml("format: 1\nname: mark4\n"));

    expect(result.value).toEqual({ format: 1, name: "mark4" });
    expect(result.lineAt(0)).toBe(1);
    expect(result.lineAt("format: 1\n".length)).toBe(2);
  });

  test("uses YAML 1.2 scalar resolution", () => {
    const result = parsed(parseYaml("on: yes\n"));

    expect(result.value).toEqual({ on: "yes" });
  });

  test("treats an empty document as an empty mapping", () => {
    const result = parsed(parseYaml(""));

    expect(result.value).toEqual({});
  });

  test("rejects duplicate keys and reports the duplicate line", () => {
    const result = rejected(parseYaml("name: one\nname: two\n"));

    expect(result.problems).toEqual([{ message: "Map keys must be unique", line: 2 }]);
  });

  test("rejects a top-level sequence", () => {
    const result = rejected(parseYaml("- one\n- two\n"));

    expect(result.problems[0]).toMatchObject({
      message: "Top-level value must be a mapping",
      line: 1,
    });
  });

  test("rejects a top-level scalar", () => {
    const result = rejected(parseYaml("just a string\n"));

    expect(result.problems[0]).toMatchObject({
      message: "Top-level value must be a mapping",
      line: 1,
    });
  });

  test("applies a line offset to errors", () => {
    const result = rejected(parseYaml("name: one\nname: two\n", { lineOffset: 3 }));

    expect(result.problems[0]?.line).toBe(5);
  });

  test("maps node positions to lines", () => {
    const result = parsed(parseYaml("format: 1\nname: mark4\n"));
    const name = result.document.get("name", true);

    expect(result.lineOf(name)).toBe(2);
    expect(result.lineOf(undefined)).toBe(1);
    expect(result.lineOf(result.document.contents)).toBe(1);
  });

  test("applies a line offset to node positions", () => {
    const result = parsed(parseYaml("format: 1\nname: mark4\n", { lineOffset: 1 }));

    expect(result.lineOf(result.document.get("name", true))).toBe(3);
  });
});
