import { describe, expect, test } from "vitest";
import { deriveFactoryName } from "../../../src/core/init/name.js";

describe("deriveFactoryName", () => {
  test("lowercases the directory name", () => {
    expect(deriveFactoryName("MetaFactory")).toBe("metafactory");
  });

  test("replaces each run of other characters with one hyphen", () => {
    expect(deriveFactoryName("My Repo!!")).toBe("my-repo");
    expect(deriveFactoryName("a  __  b")).toBe("a-b");
  });

  test("removes leading and trailing hyphens", () => {
    expect(deriveFactoryName("-- My Repo --")).toBe("my-repo");
  });

  test("falls back to factory when nothing remains", () => {
    expect(deriveFactoryName("!!!")).toBe("factory");
    expect(deriveFactoryName("")).toBe("factory");
  });
});
