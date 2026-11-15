import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { COMMANDS } from "../../src/cli.js";
import type { CommandDefinition } from "../../src/commands/types.js";
import { ExitCode } from "../../src/errors.js";
import type { Problem } from "../../src/errors.js";
import type { RequiredValue } from "../../src/input.js";
import { copyFileWithMode, copyTree, listFiles } from "../../src/util/fs.js";
import { runGit } from "../../src/util/git.js";
import { makeRepo } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";
import type { RunCliResult } from "../helpers/runCli.js";

/**
 * The contract sweep: every command, run with `--json` and without a terminal,
 * meets the rules in docs/specs/cli.md (Command behaviour 4 to 6, JSON output,
 * Exit codes) and the seven rules in Plan 1.022, Design → Contract sweep.
 *
 * Every command in `COMMANDS` has a case, and the guard test below fails when
 * one does not, so a new command cannot skip the sweep.
 */

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
const MARK4_SOURCE = path.join(FIXTURES, "build", "mark4-like", "source");
const VALID_FAB = path.join(FIXTURES, "fabs", "valid-fab");
const ENV_FACTORY = path.join(FIXTURES, "env", "factory");
const INVALID_FAB = path.join(FIXTURES, "fabs", "invalid-fab");

/** The fix line every unexpected error carries. */
const BUG_FIX = "This is a bug in metafab. Report it with the command you ran and this message";

interface JsonObject {
  ok: boolean;
  command: string;
  exitCode: number;
  problems?: Problem[];
  required?: RequiredValue[];
  [key: string]: unknown;
}

interface ContractCase {
  /** The `COMMANDS` name this case covers, or `metafab` for the global cases. */
  command: string;
  name: string;
  args: readonly string[] | ((cwd: string) => readonly string[]);
  /** Builds one fresh working directory. It runs once per invocation, so neither run sees the other's writes. */
  prepare: () => Promise<string>;
  /** The exit code the spec fixes. Cases the spec does not fix assert only the contract. */
  exitCode?: ExitCode;
  /** The values the `required` list must hold when the exit code is 2. */
  required?: readonly { name: string; flag?: string }[];
  /** A stub command list, as `test/cli/cli.test.ts` builds one. */
  commands?: readonly CommandDefinition[];
  /** The internal-bug case: the human run prints a stack instead of a clean error. */
  internalBug?: boolean;
  /** Only the Windows runner has these paths; elsewhere the case is skipped. */
  windowsOnly?: boolean;
  /** The defect this case pins, by intake note. The case is registered with `test.fails`. */
  intake?: string;
  also?: (json: JsonObject, cwd: string) => void | Promise<void>;
  humanAlso?: (run: RunCliResult) => void;
}

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function newDirectory(files: Record<string, string | Uint8Array> = {}): Promise<string> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo.root;
}

/** Copies a fixture tree, renaming the fixture's `gitignore.txt` to `.gitignore`. */
async function copyFixture(source: string, destination: string): Promise<void> {
  for (const relativePath of await listFiles(source)) {
    const segments = relativePath.split("/");
    if (segments[segments.length - 1] === "gitignore.txt") segments[segments.length - 1] = ".gitignore";
    await copyFileWithMode(
      path.join(source, ...relativePath.split("/")),
      path.join(destination, ...segments),
    );
  }
}

async function mark4(): Promise<string> {
  const root = await newDirectory();
  await copyFixture(MARK4_SOURCE, root);
  return root;
}

/** A mark4-like factory with one workflow the pipeline does not list. */
async function mark4WithStandalone(): Promise<string> {
  const root = await mark4();
  const created = await runCli(
    ["create", "workflows/standalone", "--description", "A standalone workflow."],
    { cwd: root, tty: false },
  );
  expect(created.code, created.stderr).toBe(ExitCode.Ok);
  return root;
}

/** A format 2 factory that declares `env`, in a Git repository `env set` can write to. */
async function envFactory(): Promise<string> {
  const root = await newDirectory();
  await copyTree(ENV_FACTORY, root);
  const init = await runGit(["init", "--quiet"], { cwd: root });
  expect(init.exitCode, init.stderr).toBe(0);
  return root;
}

/** A mark4-like repository whose output is built, so `check` and `publish` have something to compare. */
async function builtMark4(): Promise<string> {
  const root = await mark4();
  const built = await runCli(["build"], { cwd: root, tty: false });
  expect(built.code, built.stderr).toBe(ExitCode.Ok);
  return root;
}

const SKILL = "---\nname: foo\ndescription: A local skill.\n---\n\n# Foo\n";

const CASES: readonly ContractCase[] = [
  {
    command: "init",
    name: "an empty directory outside Git selects every agent target",
    args: ["init"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Ok,
    also: async (_json, cwd) => {
      const config = await readFile(path.join(cwd, ".factory", "metafab.yaml"), "utf8");
      expect(config).toContain("agents: all");
    },
  },
  {
    command: "init",
    name: "an existing skill without --adopt asks for consent",
    args: ["init"],
    prepare: () => newDirectory({ ".claude/skills/foo/SKILL.md": SKILL }),
    exitCode: ExitCode.NeedsInput,
    required: [{ name: "adopt", flag: "--adopt" }],
  },
  {
    command: "build",
    name: "no factory exits 1 with a fix that names init",
    args: ["build"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
    also: (json) => {
      expect(json.problems?.some((problem) => problem.fix?.includes("metafab init"))).toBe(true);
    },
  },
  {
    command: "build",
    name: "the mark4-like factory builds",
    args: ["build"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
  },
  {
    command: "create",
    name: "a path without --description needs input",
    args: ["create", "workflows/x"],
    prepare: mark4,
    exitCode: ExitCode.NeedsInput,
    required: [{ name: "description", flag: "--description" }],
  },
  {
    command: "create",
    name: "a path with --description creates a workflow",
    args: ["create", "workflows/x", "--description", "d"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
    also: async (json, cwd) => {
      expect(Array.isArray(json.problems)).toBe(true);
      const created = await readFile(path.join(cwd, ".factory", "workflows", "x", "SKILL.md"), "utf8");
      expect(created).toContain("name: x");
    },
  },
  {
    command: "pipeline add",
    name: "an unknown workflow exits 1 with a fix",
    args: ["pipeline", "add", "nope"],
    prepare: mark4,
    exitCode: ExitCode.Failed,
  },
  {
    command: "pipeline add",
    name: "a workflow outside the pipeline is added",
    args: ["pipeline", "add", "standalone"],
    prepare: mark4WithStandalone,
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.pipeline).toContain("standalone");
    },
  },
  {
    command: "pipeline remove",
    name: "an unknown workflow exits 1 with a fix",
    args: ["pipeline", "remove", "nope"],
    prepare: mark4,
    exitCode: ExitCode.Failed,
  },
  {
    command: "pipeline remove",
    name: "a pipeline workflow is removed",
    args: ["pipeline", "remove", "build-slice"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.pipeline).not.toContain("build-slice");
    },
  },
  {
    command: "map",
    name: "the mark4-like factory maps",
    args: ["map"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
  },
  {
    command: "map",
    name: "no factory exits 1",
    args: ["map"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
  },
  {
    command: "check",
    name: "a stale installed skill exits 1",
    args: ["check"],
    prepare: async () => {
      const root = await builtMark4();
      const installed = path.join(root, ".claude", "skills", "git-conventions", "SKILL.md");
      await writeFile(installed, `${await readFile(installed, "utf8")}\nStale edit.\n`, "utf8");
      return root;
    },
    exitCode: ExitCode.Failed,
  },
  {
    command: "env",
    name: "a format 1 factory declares no variables",
    args: ["env"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.variables).toEqual([]);
      expect(json.problems).toEqual([]);
    },
  },
  {
    command: "env set",
    name: "an undeclared value exits 1 with the declared values",
    args: ["env", "set", "harness=zed"],
    prepare: envFactory,
    exitCode: ExitCode.Failed,
  },
  {
    command: "env unset",
    name: "a key that is not set is not an error",
    args: ["env", "unset", "harness"],
    prepare: envFactory,
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.removed).toBe(false);
    },
  },
  {
    command: "import",
    name: "a path source imports",
    args: ["import", VALID_FAB],
    prepare: () => newDirectory(),
  },
  {
    command: "import",
    name: "an invalid fab exits 4",
    args: ["import", INVALID_FAB],
    prepare: () => newDirectory(),
    exitCode: ExitCode.InvalidFab,
  },
  {
    command: "import",
    name: "a path that does not exist exits 3",
    args: (cwd) => ["import", path.join(cwd, "missing-fab")],
    prepare: () => newDirectory(),
    exitCode: ExitCode.FetchFailed,
  },
  {
    command: "import",
    name: "a git source that does not exist exits 3 with a fix",
    args: (cwd) => ["import", `git+${pathToFileURL(path.join(cwd, "missing.git")).href}`],
    prepare: () => newDirectory(),
    exitCode: ExitCode.FetchFailed,
  },
  {
    command: "import",
    name: "an invalid source exits 1 with a fix",
    args: ["import", "github:"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
  },
  {
    command: "import",
    name: "a path whose .factory is a file exits 3 with a fix",
    args: (cwd) => ["import", path.join(cwd, "src")],
    prepare: () => newDirectory({ "src/.factory": "not a directory\n" }),
    exitCode: ExitCode.FetchFailed,
  },
  {
    command: "update",
    name: "a factory with no upstream exits 1 with a fix",
    args: ["update"],
    prepare: mark4,
    exitCode: ExitCode.Failed,
  },
  {
    command: "diff",
    name: "a factory with no upstream exits 1 with a fix",
    args: ["diff"],
    prepare: mark4,
    exitCode: ExitCode.Failed,
  },
  {
    command: "detach",
    name: "a factory with no upstream is a no-op",
    args: ["detach"],
    prepare: mark4,
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.problems).toEqual([]);
    },
  },
  {
    command: "publish",
    name: "no publish key exits 1 with a fix",
    args: ["publish"],
    prepare: mark4,
    exitCode: ExitCode.Failed,
  },
  {
    command: "publish",
    name: "--dry-run with a valid publish key stages the fab",
    args: ["publish", "--dry-run"],
    prepare: async () => {
      const root = await builtMark4();
      const config = path.join(root, ".factory", "metafab.yaml");
      const text = await readFile(config, "utf8");
      await writeFile(config, `${text}\npublish:\n  name: "@seasb/fab-mark4"\n  version: 1.2.0\n`, "utf8");
      return root;
    },
    exitCode: ExitCode.Ok,
  },
  {
    command: "metafab",
    name: "no command prints the global help",
    args: [],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.command).toBe("help");
    },
  },
  {
    command: "metafab",
    name: "--version reports the version and no problems",
    args: ["--version"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Ok,
    also: (json) => {
      expect(json.command).toBe("version");
      expect(json.problems).toEqual([]);
      expect(typeof json.version).toBe("string");
    },
  },
  {
    command: "metafab",
    name: "an unknown command exits 1 with a suggestion",
    args: ["chek"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
    also: (json) => {
      expect(json.problems?.some((problem) => problem.fix?.includes('Did you mean "check"'))).toBe(
        true,
      );
    },
  },
  {
    command: "metafab",
    name: "pipeline without a subcommand exits 1",
    args: ["pipeline"],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
  },
  {
    command: "metafab",
    name: "an unexpected error is reported as a bug",
    args: ["check"],
    commands: [
      {
        name: "check",
        description: "Validate the factory",
        usage: "metafab check",
        async run() {
          throw new Error("boom");
        },
      },
    ],
    prepare: () => newDirectory(),
    exitCode: ExitCode.Failed,
    internalBug: true,
    also: (json) => {
      expect(json.command).toBe("check");
      expect(json.error).toBe("boom");
      expect(json).not.toHaveProperty("stack");
      expect(json.problems).toEqual([
        { level: "error", file: "metafab", message: "boom", fix: BUG_FIX },
      ]);
    },
    humanAlso: (run) => {
      expect(run.stderr).toContain(`  fix: ${BUG_FIX}`);
    },
  },
  {
    command: "import",
    name: "a relative path source written with backslashes",
    args: ["import", ".\\fab"],
    prepare: async () => {
      const root = await newDirectory();
      await copyFixture(VALID_FAB, path.join(root, "fab"));
      return root;
    },
    windowsOnly: true,
  },
];

function stdinProbe(): { stream: Readable; reads: () => number } {
  let reads = 0;
  const stream = new Readable({
    read() {
      reads += 1;
    },
  });
  return { stream, reads: () => reads };
}

function resolveArgs(spec: ContractCase, cwd: string): readonly string[] {
  return typeof spec.args === "function" ? spec.args(cwd) : spec.args;
}

async function invoke(
  spec: ContractCase,
  cwd: string,
  json: boolean,
  stdin: Readable,
): Promise<RunCliResult> {
  const args = resolveArgs(spec, cwd);
  return runCli(json ? [...args, "--json"] : [...args], {
    cwd,
    tty: false,
    stdin,
    ...(spec.commands === undefined ? {} : { commands: spec.commands }),
  });
}

/** Runs one case twice, with and without `--json`, and asserts the seven rules. */
async function expectContract(spec: ContractCase): Promise<void> {
  const label = `${spec.command}: ${spec.name}`;
  const jsonCwd = await spec.prepare();
  const jsonInput = stdinProbe();
  const jsonRun = await invoke(spec, jsonCwd, true, jsonInput.stream);

  // Rule 1: exactly one JSON object, and nothing after it but a final newline.
  expect(jsonRun.stdout.endsWith("\n"), `${label}: JSON output ends with a newline`).toBe(true);
  const body = jsonRun.stdout.slice(0, -1);
  expect(body, `${label}: nothing follows the JSON object`).toBe(body.trimEnd());
  const json = JSON.parse(body) as JsonObject;

  // Rule 2: ok, command and exitCode, and exitCode is the process code, 0 to 5.
  expect(typeof json.ok, `${label}: ok`).toBe("boolean");
  expect(typeof json.command, `${label}: command`).toBe("string");
  expect(typeof json.exitCode, `${label}: exitCode`).toBe("number");
  expect(json.exitCode, `${label}: exitCode matches the process`).toBe(jsonRun.code);
  expect(json.exitCode).toBeGreaterThanOrEqual(ExitCode.Ok);
  expect(json.exitCode).toBeLessThanOrEqual(ExitCode.NotOwned);
  if (spec.exitCode !== undefined) expect(json.exitCode, `${label}: expected exit code`).toBe(spec.exitCode);

  // Rule 3: problems, or required instead for exit 2.
  if (json.exitCode === ExitCode.NeedsInput) {
    expect(Array.isArray(json.required), `${label}: required is an array`).toBe(true);
    expect(json.required!.length, `${label}: required is not empty`).toBeGreaterThan(0);
    expect(json, `${label}: exit 2 has no problems`).not.toHaveProperty("problems");
    for (const value of json.required!) {
      expect(typeof value.name, `${label}: required name`).toBe("string");
      expect(typeof value.description, `${label}: required description`).toBe("string");
    }
    for (const expected of spec.required ?? []) {
      const match = json.required!.find((value) => value.name === expected.name);
      expect(match, `${label}: required names ${expected.name}`).toBeDefined();
      if (expected.flag !== undefined) expect(match!.flag, `${label}: ${expected.name} flag`).toBe(expected.flag);
    }
  } else {
    expect(Array.isArray(json.problems), `${label}: problems is an array`).toBe(true);
    expect(json, `${label}: no required outside exit 2`).not.toHaveProperty("required");

    // Rule 4: every error problem carries a non-empty fix and a `/`-separated file.
    for (const problem of json.problems!) {
      if (problem.level !== "error") continue;
      expect(typeof problem.fix, `${label}: ${problem.message} has a fix`).toBe("string");
      expect(problem.fix!.trim(), `${label}: ${problem.message} fix is not empty`).not.toBe("");
      expect(problem.file, `${label}: ${problem.message} file uses /`).not.toContain("\\");
    }
  }

  if (spec.also !== undefined) await spec.also(json, jsonCwd);

  // Rule 5: no command read standard input without a terminal.
  expect(jsonInput.reads(), `${label}: stdin was not read with --json`).toBe(0);

  const humanCwd = await spec.prepare();
  const humanInput = stdinProbe();
  const humanRun = await invoke(spec, humanCwd, false, humanInput.stream);

  // Rule 6: the same exit code, and no stack trace on stderr. The internal-bug
  // case is exempt: its human run must print the stack.
  expect(humanRun.code, `${label}: human exit code`).toBe(jsonRun.code);
  if (spec.internalBug === true) {
    expect(humanRun.stderr, `${label}: human output has the stack`).toMatch(/^ {4}at /m);
  } else {
    expect(humanRun.stderr, `${label}: no stack trace`).not.toMatch(/^ {4}at /m);
  }

  // Rule 7: an error case names a fix on stderr. Exit 2 is exempt: its
  // `Required values:` list names the flags.
  if (
    json.exitCode === ExitCode.Failed ||
    json.exitCode === ExitCode.FetchFailed ||
    json.exitCode === ExitCode.InvalidFab ||
    json.exitCode === ExitCode.NotOwned
  ) {
    expect(humanRun.stderr, `${label}: human output has a fix line`).toMatch(/^ {2}fix: /m);
  }

  expect(humanInput.reads(), `${label}: stdin was not read without a terminal`).toBe(0);
  if (spec.humanAlso !== undefined) spec.humanAlso(humanRun);
}

function register(spec: ContractCase): void {
  const title = `${spec.command}: ${spec.name}`;
  const run = (): Promise<void> => expectContract(spec);

  if (spec.windowsOnly === true) {
    test.skipIf(process.platform !== "win32")(title, run);
    return;
  }
  if (spec.intake !== undefined) {
    // The case pins the defect in the named intake note until its fix lands.
    test.fails(title, run);
    return;
  }
  test(title, run);
}

describe("contract sweep", () => {
  test("every command in COMMANDS has a case", () => {
    const covered = new Set(CASES.map((spec) => spec.command));
    for (const definition of COMMANDS) {
      expect(covered.has(definition.name), `${definition.name} has no contract case`).toBe(true);
    }
  });

  for (const spec of CASES) register(spec);

  // Windows only: `import` of a path source echoes the source label, which on
  // Windows is the native absolute path, so `sourceProblemFile` replaces its
  // backslashes. Plan 1.026 fixed that, so rule 4's `file` check above runs on
  // every platform and this case pins the Windows half.
  test.skipIf(process.platform !== "win32")(
    "import: an invalid fab reports a / separated file on Windows",
    async () => {
      const cwd = await newDirectory();
      const result = await runCli(["import", INVALID_FAB, "--json"], { cwd, tty: false });
      expect(result.code).toBe(ExitCode.InvalidFab);
      const json = JSON.parse(result.stdout) as JsonObject;
      const errors = (json.problems ?? []).filter((problem) => problem.level === "error");
      expect(errors.length).toBeGreaterThan(0);
      for (const problem of errors) {
        expect(problem.file, `${problem.message} file uses /`).not.toContain("\\");
      }
    },
  );

  // Windows only: a backslash path is the same path as its `/` form, or a
  // usage error that names a fix. A successful result carries `problems`, which
  // Plan 1.026 made required.
  test.skipIf(process.platform !== "win32")("create: a backslash path with --description", async () => {
    const cwd = await mark4();
    const result = await runCli(["create", "workflows\\x", "--description", "d", "--json"], {
      cwd,
      tty: false,
    });
    const json = JSON.parse(result.stdout) as JsonObject;

    if (result.code === ExitCode.Ok) {
      expect(Array.isArray(json.problems)).toBe(true);
      const created = await readFile(path.join(cwd, ".factory", "workflows", "x", "SKILL.md"), "utf8");
      expect(created).toContain("name: x");
    } else {
      expect(result.code).toBe(ExitCode.Failed);
      expect(json.ok).toBe(false);
      expect(json.problems?.every((problem) => (problem.fix ?? "") !== "")).toBe(true);
    }
  });
});
