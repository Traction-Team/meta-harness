import { describe, expect, test } from "vitest";
import { sourceProblemFile } from "../../../src/core/sources/problems.js";

describe("sourceProblemFile", () => {
  test("turns a Windows label into / and joins the relative path", () => {
    expect(sourceProblemFile("C:\\fabs\\acme\\", ".factory/skills/x/SKILL.md")).toBe(
      "C:/fabs/acme/.factory/skills/x/SKILL.md",
    );
  });

  test("redacts a credential in the label", () => {
    expect(sourceProblemFile("https://user:secret@example.com/fab.tgz")).toBe(
      "https://***@example.com/fab.tgz",
    );
  });

  test("joins a ./ relative path without the prefix", () => {
    expect(sourceProblemFile("github:seasb/fab", "./package.json")).toBe(
      "github:seasb/fab/package.json",
    );
  });

  test("returns the label alone, without a trailing slash, when there is no path", () => {
    expect(sourceProblemFile("C:\\fabs\\acme\\")).toBe("C:/fabs/acme");
    expect(sourceProblemFile("@seasb/fab@1.0.0")).toBe("@seasb/fab@1.0.0");
  });
});
