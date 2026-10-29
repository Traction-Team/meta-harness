import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../src/errors.js";
import { NeedsInput } from "../../src/input.js";
import type { CommandDefinition } from "../../src/commands/types.js";
import { listFiles } from "../../src/util/fs.js";
import { makeRepo } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";

const V1_COMMANDS = [
  "init",
  "build",
  "create",
  "pipeline add",
  "pipeline remove",
  "map",
  "check",
  "import",
  "update",
  "diff",
  "detach",
  "publish",
];

let repo: TempRepo;

beforeAll(async () => {
  repo = await makeRepo({ "README.md": "hello\n" });
});

afterAll(async () => {
  await repo.cleanup();
});

describe("global flags", () => {
  test("--help lists every v1 command", async () => {
    const result = await runCli(["--help"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Ok);
    for (const command of V1_COMMANDS) expect(result.stdout).toContain(command);
  });

  test("--version prints the package version", async () => {
    const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    const result = await runCli(["--version"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test("a pipeline subcommand is dispatched", async () => {
    const result = await runCli(["pipeline", "add", "review-slice"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("No factory found");
  });
});

describe("json output", () => {
  test("writes exactly one parseable object to stdout", async () => {
    const result = await runCli(["--json", "check"], { cwd: repo.root, tty: false });
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().startsWith("{")).toBe(true);
    expect(result.stdout.trim().endsWith("}")).toBe(true);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; command: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("check");
  });

  test("accepts --json after the command", async () => {
    const result = await runCli(["check", "--json"], { cwd: repo.root, tty: false });
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stderr).toBe("");
  });

  test("renders an unknown command as one object when --json follows it", async () => {
    const result = await runCli(["chek", "--json"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    const parsed = JSON.parse(result.stdout) as { ok: boolean };
    expect(parsed.ok).toBe(false);
    expect(result.stderr).toBe("");
  });

  test("renders a command parse failure as one object when --json follows the command", async () => {
    const result = await runCli(["check", "--json", "--bogus"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    const parsed = JSON.parse(result.stdout) as { ok: boolean };
    expect(parsed.ok).toBe(false);
    expect(result.stderr).toBe("");
  });

  test("renders a missing pipeline subcommand as one object when --json follows it", async () => {
    const result = await runCli(["pipeline", "--json"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    const parsed = JSON.parse(result.stdout) as { ok: boolean };
    expect(parsed.ok).toBe(false);
    expect(result.stderr).toBe("");
  });
});

describe("unknown command", () => {
  test("exits 1 with a suggestion", async () => {
    const result = await runCli(["chek"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('Did you mean "check"?');
  });

  test("reports a missing pipeline subcommand", async () => {
    const result = await runCli(["pipeline"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("pipeline add");
  });

  test("rejects the removed rename command", async () => {
    const result = await runCli(["rename", "a", "b"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Unknown command: rename");

    const help = await runCli(["--help"], { cwd: repo.root, tty: false });
    expect(help.code).toBe(ExitCode.Ok);
    expect(help.stdout).not.toContain("rename");
  });
});

describe("commands without a factory", () => {
  test("map exits 1 with a missing factory message", async () => {
    const result = await runCli(["map"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("No factory found");
  });

  test("does not change files", async () => {
    const before = await listFiles(repo.root);
    const result = await runCli(["create", "workflows/review-slice"], { cwd: repo.root, tty: false });
    expect(result.code).toBe(ExitCode.Failed);
    expect(await listFiles(repo.root)).toEqual(before);
  });
});

describe("command arguments", () => {
  const capturing: CommandDefinition = {
    name: "create",
    description: "Create a skill in the factory",
    options: {
      description: { type: "string" },
      force: { type: "boolean" },
    },
    async run(context) {
      return {
        ok: true,
        command: "create",
        exitCode: ExitCode.Ok,
        summary: JSON.stringify({ positionals: context.positionals, options: context.options }),
      };
    },
  };

  test("delivers positionals and a string option to the command", async () => {
    const result = await runCli(["create", "x", "--description", "d"], {
      cwd: repo.root,
      tty: false,
      commands: [capturing],
    });
    expect(result.code).toBe(ExitCode.Ok);
    expect(JSON.parse(result.stdout)).toEqual({ positionals: ["x"], options: { description: "d" } });
  });

  test("delivers a value-less boolean option to the command", async () => {
    const result = await runCli(["create", "x", "--force"], { cwd: repo.root, tty: false, commands: [capturing] });
    expect(result.code).toBe(ExitCode.Ok);
    expect(JSON.parse(result.stdout)).toEqual({ positionals: ["x"], options: { force: true } });
  });

  test("does not strip a global flag used as an option value after the command", async () => {
    const result = await runCli(["create", "my-skill", "--description", "--json"], {
      cwd: repo.root,
      tty: false,
      commands: [capturing],
    });
    expect(result.code).toBe(ExitCode.Ok);
    expect(JSON.parse(result.stdout)).toEqual({ positionals: ["my-skill"], options: { description: "--json" } });
  });
});

describe("NeedsInput", () => {
  const required = [
    { name: "description", flag: "--description", description: "Skill description" },
    { name: "agent", description: "Agent tool", choices: ["claude", "codex"] },
  ];
  const needsInput: CommandDefinition = {
    name: "create",
    description: "Create a skill in the factory",
    async run() {
      throw new NeedsInput(required);
    },
  };

  test("exits 2 and renders every required value in JSON mode", async () => {
    const result = await runCli(["create", "--json"], { cwd: repo.root, tty: false, commands: [needsInput] });
    expect(result.code).toBe(ExitCode.NeedsInput);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, command: "create", required });
  });

  test("exits 2 and lists every required value in human mode", async () => {
    const result = await runCli(["create"], { cwd: repo.root, tty: false, commands: [needsInput] });
    expect(result.code).toBe(ExitCode.NeedsInput);
    for (const value of required) expect(result.stderr).toContain(value.name);
    expect(result.stderr).toContain("--description");
    expect(result.stderr).toContain("claude");
  });
});

describe("MetafabError", () => {
  const failing: CommandDefinition = {
    name: "check",
    description: "Validate the factory",
    async run() {
      throw new MetafabError("invalid fab", {
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
        problems: [{ level: "error", file: "a.yaml", line: 2, message: "bad" }],
        details: { path: "a.yaml" },
      });
    },
  };

  test("renders its exit code and details", async () => {
    const result = await runCli(["check", "--json"], { cwd: repo.root, tty: false, commands: [failing] });
    expect(result.code).toBe(ExitCode.InvalidFab);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      exitCode: number;
      code: string;
      details: unknown;
      problems: { message: string }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(ExitCode.InvalidFab);
    expect(parsed.code).toBe("invalid-fab");
    expect(parsed.details).toEqual({ path: "a.yaml" });
    expect(parsed.problems[0]?.message).toBe("bad");
  });

  test("renders its problems in human mode", async () => {
    const result = await runCli(["check"], { cwd: repo.root, tty: false, commands: [failing] });
    expect(result.code).toBe(ExitCode.InvalidFab);
    expect(result.stderr).toContain("a.yaml:2: error: bad");
  });
});

describe("unexpected errors", () => {
  const broken: CommandDefinition = {
    name: "check",
    description: "Validate the factory",
    async run() {
      throw new Error("boom");
    },
  };

  test("renders { ok: false, error } in JSON mode and exits 1", async () => {
    const result = await runCli(["check", "--json"], { cwd: repo.root, tty: false, commands: [broken] });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: "boom" });
  });

  test("prints the stack in human mode and exits 1", async () => {
    const result = await runCli(["check"], { cwd: repo.root, tty: false, commands: [broken] });
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("boom");
  });
});
