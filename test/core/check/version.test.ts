import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import { cliVersion } from "../../../src/util/version.js";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = (require("../../../package.json") as { version: string }).version;

describe("cliVersion", () => {
  test("is the version in package.json", () => {
    expect(cliVersion()).toBe(PACKAGE_VERSION);
  });
});
