import { describe, expect, test } from "vitest";
import { classifySource } from "../../../src/core/config.js";

describe("classifySource", () => {
  test("classifies package names as npm", () => {
    expect(classifySource("@seasb/fab-base")).toBe("npm");
    expect(classifySource("fab-base")).toBe("npm");
    expect(classifySource("seasb/fab-base")).toBe("npm");
  });

  test("classifies github: as git", () => {
    expect(classifySource("github:seasb/fab-mark4")).toBe("git");
  });

  test("classifies git+ sources as git", () => {
    expect(classifySource("git+https://github.com/seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("git+ssh://git@github.com/seasb/fab-mark4.git")).toBe("git");
  });

  test("classifies https sources as git", () => {
    expect(classifySource("https://github.com/seasb/fab-mark4.git")).toBe("git");
  });

  test("classifies ssh and git@ sources as git", () => {
    expect(classifySource("git@github.com:seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("ssh://git@github.com/seasb/fab-mark4.git")).toBe("git");
  });

  test("classifies path-like sources as unversioned", () => {
    expect(classifySource("../platform/.factory")).toBe("unversioned");
    expect(classifySource("./factory")).toBe("unversioned");
    expect(classifySource("/opt/factories/base")).toBe("unversioned");
    expect(classifySource("~/factories/base")).toBe("unversioned");
  });

  test("treats an empty source as npm", () => {
    expect(classifySource("")).toBe("npm");
  });
});
