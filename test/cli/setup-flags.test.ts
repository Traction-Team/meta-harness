import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import { makeRepo } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";

let repo: TempRepo;

beforeAll(async () => {
  repo = await makeRepo({ "README.md": "hello\n" });
});

afterAll(async () => {
  await repo.cleanup();
});

function help(argv: readonly string[]): ReturnType<typeof runCli> {
  return runCli(argv, { cwd: repo.root, tty: false });
}

describe("the setup flags in help", () => {
  test("import --help lists --setup and --no-setup", async () => {
    const result = await help(["import", "--help"]);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain(
      "Usage: metafab import <source> [--agents <list>] [--force] [--adopt] [--setup | --no-setup]",
    );
    expect(result.stdout).toContain("--setup");
    expect(result.stdout).toContain("--no-setup");
    expect(result.stdout).toContain(
      "Create the missing required repository files from the fab's templates",
    );
    expect(result.stdout).toContain("Leave the missing required repository files uncreated");
  });

  test("update --help lists --setup and --no-setup", async () => {
    const result = await help(["update", "--help"]);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain(
      "Usage: metafab update [--to <version|range|ref>] [--dry-run] [--no-build] [--setup | --no-setup]",
    );
    expect(result.stdout).toContain("--setup");
    expect(result.stdout).toContain("--no-setup");
    expect(result.stdout).toContain("Create the files new required repository entries need");
    expect(result.stdout).toContain("Leave the new required repository files uncreated");
  });

  test("passing both setup flags to import is a usage error", async () => {
    const result = await runCli(["import", "some-fab", "--setup", "--no-setup"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("fix: Run metafab import <source> [--setup | --no-setup]");
  });

  test("passing both setup flags to update is a usage error", async () => {
    const result = await runCli(["update", "--setup", "--no-setup"], { cwd: repo.root });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("fix: Run metafab update [--setup | --no-setup]");
  });
});
