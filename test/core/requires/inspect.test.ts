import { execFile } from "node:child_process";
import { chmod, mkdir, symlink } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { inspectRequirement } from "../../../src/core/requires/inspect.js";
import type { Requirement } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";

const run = promisify(execFile);
const cannotLink = process.platform === "win32";
const cannotTestPermissions = process.platform === "win32" || process.getuid?.() === 0;

function requirement(path: string, template?: string): Requirement {
  return {
    path,
    description: "The workflows need it.",
    ...(template === undefined ? {} : { template }),
    line: 4,
  };
}

describe("inspectRequirement", () => {
  test("reports a missing file and carries the entry", async () => {
    const repo = await makeRepo({});

    expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
      path: "docs/roadmap.md",
      description: "The workflows need it.",
      state: "missing",
    });

    expect(
      await inspectRequirement(repo.root, requirement("opencode.json", ".factory/templates/o.json")),
    ).toEqual({
      path: "opencode.json",
      description: "The workflows need it.",
      template: ".factory/templates/o.json",
      state: "missing",
    });
  });

  test("reports an existing file and a file below existing directories as present", async () => {
    const repo = await makeRepo({
      "opencode.json": "{}\n",
      "docs/roadmap.md": "# Roadmap\n",
    });

    expect((await inspectRequirement(repo.root, requirement("opencode.json"))).state).toBe("present");
    expect((await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).state).toBe(
      "present",
    );
  });

  test.skipIf(cannotLink)("reports a dangling link as present", async () => {
    const repo = await makeRepo({});
    await symlink(repo.path("gone.md"), repo.path("opencode.json"));

    expect((await inspectRequirement(repo.root, requirement("opencode.json"))).state).toBe("present");
  });

  test("reports a directory at the path as blocked", async () => {
    const repo = await makeRepo({ "docs/inside.md": "body\n" });

    expect(await inspectRequirement(repo.root, requirement("docs"))).toEqual({
      path: "docs",
      description: "The workflows need it.",
      state: "blocked",
      reason: "docs is a directory",
      clash: "docs",
    });
  });

  test("reports a parent that is a file", async () => {
    const repo = await makeRepo({ docs: "not a directory\n" });

    expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
      path: "docs/roadmap.md",
      description: "The workflows need it.",
      state: "blocked",
      reason: "docs is a file",
      clash: "docs",
    });
  });

  test.skipIf(cannotLink)("reports a parent that is a symbolic link, without following it", async () => {
    const repo = await makeRepo({ "real/roadmap.md": "# Roadmap\n" });
    await symlink(repo.path("real"), repo.path("docs"));

    expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
      path: "docs/roadmap.md",
      description: "The workflows need it.",
      state: "blocked",
      reason: "docs is a symbolic link",
      clash: "docs",
    });
  });

  test.skipIf(process.platform === "win32")("reports a parent that is a FIFO", async () => {
    const repo = await makeRepo({});
    await run("mkfifo", [repo.path("docs")]);

    expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
      path: "docs/roadmap.md",
      description: "The workflows need it.",
      state: "blocked",
      reason: "docs is not a directory",
      clash: "docs",
    });
  });

  test("reports a case variant of the file", async () => {
    const repo = await makeRepo({ "OpenCode.json": "{}\n" });

    expect(await inspectRequirement(repo.root, requirement("opencode.json"))).toEqual({
      path: "opencode.json",
      description: "The workflows need it.",
      state: "blocked",
      reason: "OpenCode.json differs only in letter case",
      clash: "OpenCode.json",
    });
  });

  test("reports a case variant of a parent", async () => {
    const repo = await makeRepo({ "Docs/roadmap.md": "# Roadmap\n" });

    expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
      path: "docs/roadmap.md",
      description: "The workflows need it.",
      state: "blocked",
      reason: "Docs differs only in letter case",
      clash: "Docs",
    });
  });

  test.skipIf(cannotTestPermissions)("reports a parent it cannot read", async () => {
    const repo = await makeRepo({ "docs/roadmap.md": "# Roadmap\n" });
    await chmod(repo.path("docs"), 0o000);
    try {
      expect(await inspectRequirement(repo.root, requirement("docs/roadmap.md"))).toEqual({
        path: "docs/roadmap.md",
        description: "The workflows need it.",
        state: "blocked",
        reason: "Cannot read docs",
        clash: "docs",
      });
    } finally {
      await chmod(repo.path("docs"), 0o755);
    }
  });

  test("reports a missing parent directory as missing", async () => {
    const repo = await makeRepo({});

    expect((await inspectRequirement(repo.root, requirement("a/b/c.md"))).state).toBe("missing");
  });

  test("does not confuse a directory named like the file", async () => {
    const repo = await makeRepo({});
    await mkdir(repo.path("docs"), { recursive: true });

    expect((await inspectRequirement(repo.root, requirement("docs"))).state).toBe("blocked");
  });
});
