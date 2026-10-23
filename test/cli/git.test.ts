import { realpath } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { runGit } from "../../src/util/git.js";
import { makeRepo } from "../helpers/makeRepo.js";

describe("runGit", () => {
  test("returns stdout and exit code 0 for a successful command", async () => {
    const repo = await makeRepo({ "file.txt": "" }, { git: true });

    try {
      const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: repo.root });
      expect(result.exitCode).toBe(0);
      expect(await realpath(result.stdout.trim())).toBe(await realpath(repo.root));
    } finally {
      await repo.cleanup();
    }
  });

  test("returns a non-zero exit code instead of throwing", async () => {
    const repo = await makeRepo({}, { git: true });

    try {
      const result = await runGit(["rev-parse", "--verify", "does-not-exist"], { cwd: repo.root });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).not.toBe("");
    } finally {
      await repo.cleanup();
    }
  });
});
