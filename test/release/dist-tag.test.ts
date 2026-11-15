import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
// The release script is plain JavaScript that the workflow runs from the
// checkout, so it has no type declarations: the tests import it as it is.
import { distTag } from "../../.github/scripts/dist-tag.mjs";

/**
 * The dist-tag a version publishes under. A prerelease must never move
 * `latest`, because `npx @seasb/metafab` installs what `latest` names, and
 * `npm publish` needs `--tag` to put it anywhere else.
 */

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = path.join(repoRoot, ".github", "scripts", "dist-tag.mjs");

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** The script as the workflow runs it, with the exit code instead of a rejection. */
async function run(...args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

describe("distTag", () => {
  test.each([
    // A stable version, with and without a build part. A build part alone does
    // not make a prerelease, even when it holds a hyphen or a number.
    ["1.0.0", "latest"],
    ["2.0.0", "latest"],
    ["1.0.0+sha.abc", "latest"],
    ["1.0.0+build-1", "latest"],
    // A prerelease, whatever its identifier, with and without a build part.
    ["2.0.0-next.1", "next"],
    ["1.0.1-rc.0", "next"],
    ["2.0.0-next.1+sha.abc", "next"],
    ["1.0.0-0", "next"],
  ])("puts %s under %s", (version, tag) => {
    expect(distTag(version)).toBe(tag);
  });

  test("refuses a version that is not a semantic version", () => {
    expect(() => distTag("2.0")).toThrow(/not a semantic version/);
  });
});

describe("the dist-tag command", () => {
  test("prints next for a prerelease", async () => {
    expect(await run("2.0.0-next.1")).toEqual({ code: 0, stdout: "next\n", stderr: "" });
  });

  test("prints latest for a stable version", async () => {
    expect(await run("2.0.0")).toEqual({ code: 0, stdout: "latest\n", stderr: "" });
  });

  test.each(["2.0", "v2.0.0", ""])("exits 1 for %j", async (version) => {
    const result = await run(version);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/not a semantic version/);
  });
});
