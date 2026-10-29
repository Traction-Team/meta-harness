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

    expect(result.problems).toEqual([
      { message: "Map keys must be unique", line: 2, fix: "Fix the YAML syntax on this line" },
    ]);
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

  test("resolves an alias whose anchor comes before it", () => {
    const result = parsed(parseYaml("base: &b one\nname: *b\n"));

    expect(result.value).toEqual({ base: "one", name: "one" });
  });

  test("rejects an alias with no anchor on the alias line", () => {
    const result = rejected(parseYaml("name: *missing\n"));

    expect(result.problems).toEqual([
      {
        message: "Alias *missing has no anchor",
        line: 1,
        fix: "Remove the alias or define its anchor before it",
      },
    ]);
  });

  test("offsets an unresolved alias to the real line", () => {
    const result = rejected(parseYaml("name: demo\ndescription: *missing\n", { lineOffset: 3 }));

    expect(result.problems).toEqual([
      {
        message: "Alias *missing has no anchor",
        line: 5,
        fix: "Remove the alias or define its anchor before it",
      },
    ]);
  });

  test("allows an anchor aliased up to the alias limit", () => {
    const result = parsed(parseYaml(aliasedPipeline(99)));

    expect(result.value.pipeline).toHaveLength(100);
  });

  test("rejects an anchor aliased past the limit on the alias that crosses it", () => {
    const result = rejected(parseYaml(aliasedPipeline(120)));

    expect(result.problems).toEqual([
      {
        message: "Alias *gate is aliased too many times",
        line: 102,
        fix: "Use the anchor fewer times or write the values out",
      },
    ]);
  });

  test("reports a document whose aliases expand too far without a stack", () => {
    const result = rejected(parseYaml(expandingAliases(5)));

    expect(result.problems).toEqual([
      {
        message: "Alias *b is aliased too many times",
        line: 3,
        fix: "Use the anchor fewer times or write the values out",
      },
    ]);
  });

  test("reports a nested expansion quickly and on the alias that crosses the limit", () => {
    const started = Date.now();
    const result = rejected(parseYaml(expandingAliases(7)));

    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.problems).toEqual([
      {
        message: "Alias *b is aliased too many times",
        line: 3,
        fix: "Use the anchor fewer times or write the values out",
      },
    ]);
  });

  test("reports an alias that refers to its own anchor", () => {
    const result = rejected(parseYaml("tags: &t [*t]\n"));

    expect(result.problems).toEqual([
      {
        message: "Alias *t refers to itself",
        line: 1,
        fix: "Remove the alias or write the values out",
      },
    ]);
  });

  test("reports an alias that reaches its anchor through another anchor", () => {
    const result = rejected(parseYaml("outer: &outer\n  inner: &inner\n    again: *outer\n"));

    expect(result.problems).toEqual([
      {
        message: "Alias *outer refers to itself",
        line: 3,
        fix: "Remove the alias or write the values out",
      },
    ]);
  });
});

/** `pipeline:` with one anchored options mapping and `uses` aliases to it. */
function aliasedPipeline(uses: number): string {
  const aliases = Array.from({ length: uses }, (_, index) => `  - workflow-${index}: *gate`);
  return ["pipeline:", "  - review-slice: &gate { stop: Wait for approval }", ...aliases].join("\n");
}

/** Ten aliases per level, which multiplies the expansion each level reaches. */
function expandingAliases(depth: number): string {
  const ten = (source: string): string => Array.from({ length: 10 }, () => `*${source}`).join(", ");
  const names = ["a", "b", "c", "d", "e", "f", "g"];
  const lines = ["a: &a [one, two, three, four, five, six, seven, eight, nine, ten]"];
  for (let level = 1; level < depth; level += 1) {
    lines.push(`${names[level]}: &${names[level]} [${ten(names[level - 1]!)}]`);
  }
  return lines.join("\n");
}
