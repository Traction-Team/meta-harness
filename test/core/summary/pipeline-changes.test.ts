import { describe, expect, test } from "vitest";
import { describePipelineChanges } from "../../../src/core/import/pipeline-changes.js";

function factoryYaml(pipeline: string): string {
  return `format: 1\nname: mark4\npipeline:\n${pipeline
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n`;
}

describe("describePipelineChanges", () => {
  test("names a workflow added after another", () => {
    const before = factoryYaml("- build-slice\n- review-slice");
    const after = factoryYaml("- build-slice\n- review-slice\n- finish-slice");

    expect(describePipelineChanges(before, after)).toEqual([
      "pipeline: finish-slice added after review-slice",
    ]);
  });

  test("names a workflow added at the start", () => {
    const before = factoryYaml("- build-slice\n- review-slice");
    const after = factoryYaml("- finish-slice\n- build-slice\n- review-slice");

    expect(describePipelineChanges(before, after)).toEqual([
      "pipeline: finish-slice added at the start",
    ]);
  });

  test("names a removed workflow", () => {
    const before = factoryYaml("- build-slice\n- review-slice\n- ship-slice");
    const after = factoryYaml("- build-slice\n- ship-slice");

    expect(describePipelineChanges(before, after)).toEqual(["pipeline: review-slice removed"]);
  });

  test("names a workflow moved to the start", () => {
    const before = factoryYaml("- build-slice\n- review-slice\n- ship-slice");
    const after = factoryYaml("- ship-slice\n- build-slice\n- review-slice");

    expect(describePipelineChanges(before, after)).toEqual(["pipeline: ship-slice moved to the start"]);
  });

  test("names a workflow moved after another", () => {
    const before = factoryYaml("- build-slice\n- review-slice\n- ship-slice");
    const after = factoryYaml("- build-slice\n- ship-slice\n- review-slice");

    expect(describePipelineChanges(before, after)).toEqual(["pipeline: review-slice moved after ship-slice"]);
  });

  test("names a changed stop instruction", () => {
    const before = factoryYaml('- build-slice: { stop: "Ask before building" }\n- review-slice');
    const after = factoryYaml('- build-slice: { stop: "Ask before every build" }\n- review-slice');

    expect(describePipelineChanges(before, after)).toEqual(["pipeline: build-slice stop changed"]);
  });

  test("an unchanged pipeline has no descriptions", () => {
    const yaml = factoryYaml("- build-slice\n- review-slice");

    expect(describePipelineChanges(yaml, yaml)).toEqual([]);
  });

  test("a new factory.yaml reports every workflow as added", () => {
    const after = factoryYaml("- build-slice\n- review-slice");

    expect(describePipelineChanges(undefined, after)).toEqual([
      "pipeline: build-slice added at the start",
      "pipeline: review-slice added after build-slice",
    ]);
  });

  test("no descriptions when either side cannot be parsed", () => {
    expect(describePipelineChanges("pipeline: [", "format: 1\nname: mark4\npipeline: []\n")).toEqual([]);
  });
});
