import { describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import {
  addPipelineEntryText,
  createFactoryYamlText,
  parseFactoryYamlDocument,
  pipelineEntryNames,
  removePipelineEntryText,
  addPipelineEntry,
  removePipelineEntry,
} from "../../../src/core/edit/index.js";

const SOURCE = `format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y # first workflow
  - z
`;

const ALIASED = `format: 1
name: mark4
pipeline:
  - review-slice: &gate { stop: Wait for approval }
  - finish-slice: *gate
`;

/** One anchor inside another, aliased 60 times: only the expansion crosses the limit. */
const NESTED_EXPANSION = [
  "format: 1",
  "name: mark4",
  "pipeline:",
  "  - gate: &g { stop: Wait for approval }",
  "  - wrapped: &w { stop: *g }",
  ...Array.from({ length: 60 }, (_, index) => `  - e${index}: *w`),
].join("\n");

describe("factory.yaml editor", () => {
  test("inserts an entry after a named entry, keeping comments", () => {
    const text = addPipelineEntryText(SOURCE, "x", {
      after: "y",
      stop: "The tech lead approves the plan",
    });

    expect(text).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y # first workflow
  - x: { stop: The tech lead approves the plan }
  - z
`);
  });

  test("appends a plain entry at the end", () => {
    const text = addPipelineEntryText(SOURCE, "x");

    expect(text).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y # first workflow
  - z
  - x
`);
  });

  test("inserts after the last entry", () => {
    const text = addPipelineEntryText(SOURCE, "x", { after: "z" });

    expect(text).toContain("  - z\n  - x\n");
    expect(text).toContain("# The pipeline runs in order.");
    expect(text).toContain("  # File the work first.");
    expect(text).toContain("  - y # first workflow");
  });

  test("creates the pipeline field when it is missing", () => {
    const text = addPipelineEntryText("format: 1\nname: mark4\n", "x");

    expect(text).toBe(`format: 1
name: mark4

pipeline:
  - x
`);
  });

  test("removes an entry and keeps every comment", () => {
    const text = removePipelineEntryText(SOURCE, "y");

    expect(text).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - z
`);
  });

  test("removing the last entry leaves an empty pipeline", () => {
    const text = removePipelineEntryText("format: 1\nname: mark4\npipeline:\n  - y\n", "y");

    expect(text).toBe("format: 1\nname: mark4\npipeline: []\n");
  });

  test("does nothing when the entry is not in the pipeline", () => {
    expect(removePipelineEntryText(SOURCE, "nope")).toBe(SOURCE);
  });

  test("rejects a duplicate entry", () => {
    expect(() => addPipelineEntryText(SOURCE, "y")).toThrowError(MetafabError);
    try {
      addPipelineEntryText(SOURCE, "y");
    } catch (error) {
      expect((error as MetafabError).code).toBe("pipeline-duplicate");
    }
  });

  test("rejects an unknown --after entry", () => {
    try {
      addPipelineEntryText(SOURCE, "x", { after: "nope" });
      throw new Error("expected the add to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("pipeline-after-missing");
    }
  });

  test("rejects an empty or multi-line stop", () => {
    expect(() => addPipelineEntryText(SOURCE, "x", { stop: "" })).toThrowError(MetafabError);
    expect(() => addPipelineEntryText(SOURCE, "x", { stop: "one\ntwo" })).toThrowError(MetafabError);
  });

  test("rejects an empty workflow with the command to run", () => {
    try {
      addPipelineEntryText(SOURCE, "");
      throw new Error("expected the add to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          message: "A pipeline entry must name a workflow",
          fix: "Name the workflow: metafab pipeline add <workflow>",
        },
      ]);
    }
  });

  test("rejects invalid YAML with a problem", () => {
    expect(() => parseFactoryYamlDocument("name: [")).toThrowError(MetafabError);
  });

  test("rejects a pipeline that is not a list", () => {
    expect(() => addPipelineEntryText("format: 1\nname: mark4\npipeline: nope\n", "x")).toThrowError(
      MetafabError,
    );
  });

  test("lists the pipeline entries", () => {
    const doc = parseFactoryYamlDocument(SOURCE);

    expect(pipelineEntryNames(doc)).toEqual(["y", "z"]);
    expect(pipelineEntryNames(parseFactoryYamlDocument("format: 1\nname: mark4\n"))).toEqual([]);
  });

  test("edits a document in place", () => {
    const doc = parseFactoryYamlDocument(SOURCE);
    addPipelineEntry(doc, "x", { after: "y" });
    expect(removePipelineEntry(doc, "z")).toBe(true);
    expect(pipelineEntryNames(doc)).toEqual(["y", "x"]);
  });

  test("creates a factory.yaml with format and name", () => {
    expect(createFactoryYamlText("mark4")).toBe("format: 1\nname: mark4\n");
  });

  test("creates a factory.yaml with a pipeline", () => {
    const text = createFactoryYamlText("mark4", [
      { workflow: "file-work" },
      { workflow: "triage-ideas", stop: "The product lead picks the next item" },
    ]);

    expect(text).toBe(`format: 1
name: mark4
pipeline:
  - file-work
  - triage-ideas: { stop: The product lead picks the next item }
`);
  });
});

describe("factory.yaml editor with YAML aliases", () => {
  test("lists aliased entries by their workflow name", () => {
    expect(pipelineEntryNames(parseFactoryYamlDocument(ALIASED))).toEqual([
      "review-slice",
      "finish-slice",
    ]);
  });

  test("inserts after an aliased entry and keeps the anchor", () => {
    const text = addPipelineEntryText(ALIASED, "x", { after: "finish-slice" });

    expect(text).toContain("&gate");
    expect(text).toContain("*gate");
    expect(text.indexOf("- x")).toBeGreaterThan(text.indexOf("finish-slice"));
    expect(pipelineEntryNames(parseFactoryYamlDocument(text))).toEqual([
      "review-slice",
      "finish-slice",
      "x",
    ]);
  });

  test("removes an aliased entry and keeps the anchor", () => {
    const text = removePipelineEntryText(ALIASED, "finish-slice");

    expect(text).toContain("&gate");
    expect(text).not.toContain("*gate");
    expect(pipelineEntryNames(parseFactoryYamlDocument(text))).toEqual(["review-slice"]);
  });

  test("refuses to remove an entry whose anchor another entry aliases", () => {
    try {
      removePipelineEntryText(ALIASED, "review-slice");
      throw new Error("expected the remove to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("pipeline-entry-anchored");
      expect((error as MetafabError).problems?.[0]).toMatchObject({
        file: ".factory/factory.yaml",
        message: 'Pipeline entry "review-slice" holds the anchor "gate", which another entry aliases',
        fix: "Remove the alias to gate first",
      });
    }
  });

  test("refuses an unresolved alias before changing anything", () => {
    try {
      parseFactoryYamlDocument("format: 1\nname: mark4\npipeline:\n  - review-slice: *missing\n");
      throw new Error("expected the parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("factory-yaml-invalid");
      expect((error as MetafabError).problems?.[0]).toMatchObject({
        file: ".factory/factory.yaml",
        line: 4,
        message: "Alias *missing has no anchor",
      });
    }
  });

  test("refuses an alias that refers to itself before changing anything", () => {
    const source = "format: 1\nname: mark4\ntags: &t [*t]\npipeline:\n  - review-slice\n";
    try {
      parseFactoryYamlDocument(source);
      throw new Error("expected the parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("factory-yaml-invalid");
      expect((error as MetafabError).problems?.[0]).toMatchObject({
        file: ".factory/factory.yaml",
        line: 3,
        message: "Alias *t refers to itself",
        fix: "Remove the alias or write the values out",
      });
    }
    expect(() => addPipelineEntryText(source, "finish-slice")).toThrowError(MetafabError);
    expect(() => removePipelineEntryText(source, "review-slice")).toThrowError(MetafabError);
  });

  test("refuses a nested expansion that crosses the alias limit", () => {
    try {
      parseFactoryYamlDocument(NESTED_EXPANSION);
      throw new Error("expected the parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("factory-yaml-invalid");
      expect((error as MetafabError).problems?.[0]).toMatchObject({
        file: ".factory/factory.yaml",
        line: 55,
        message: "Alias *w is aliased too many times",
      });
    }
  });

  test("add and remove refuse a nested expansion before changing anything", () => {
    expect(() => addPipelineEntryText(NESTED_EXPANSION, "finish-slice")).toThrowError(MetafabError);
    expect(() => removePipelineEntryText(NESTED_EXPANSION, "e0")).toThrowError(MetafabError);
  });
});
