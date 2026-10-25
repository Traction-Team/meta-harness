import { describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import {
  addPipelineEntryText,
  createFactoryYamlText,
  parseFactoryYamlDocument,
  pipelineEntryNames,
  removePipelineEntryText,
  renamePipelineEntryText,
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

  test("renames a plain entry and keeps comments", () => {
    const text = renamePipelineEntryText(SOURCE, "y", "y2");

    expect(text).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y2 # first workflow
  - z
`);
  });

  test("renames a stop entry and keeps the stop text, comments and tail comment", () => {
    const source = `format: 1
name: mark4
pipeline:
  # Keep me
  - old: { stop: The owner reviews it } # tail comment
`;

    const text = renamePipelineEntryText(source, "old", "new");

    expect(text).toBe(`format: 1
name: mark4
pipeline:
  # Keep me
  - new: { stop: The owner reviews it } # tail comment
`);
  });

  test("renaming a missing entry changes nothing", () => {
    expect(renamePipelineEntryText(SOURCE, "nope", "other")).toBe(SOURCE);
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
