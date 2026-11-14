import { readFile, stat } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { COMMANDS } from "../../src/cli.js";
import type { CommandDefinition } from "../../src/commands/types.js";
import { ExitCode } from "../../src/errors.js";
import { makeRepo } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";

const IMPORT_HELP = [
  "Usage: metafab import <source> [--agents <list>] [--force] [--adopt] [--setup | --no-setup]",
  "",
  "Import a fab as the factory upstream",
  "",
  "Arguments:",
  "  <source>         The fab: an npm package, a Git repository, an HTTPS tarball or a local path",
  "",
  "Options:",
  "  --agents <list>  Agent tools to install for, when import creates metafab.yaml",
  "  --force          Replace local factory files that differ from the fab",
  "  --adopt          Move existing repository skills into .factory/skills/ without asking",
  "  --setup          Create the missing required repository files from the fab's templates",
  "  --no-setup       Leave the missing required repository files uncreated",
  "  --json           Write one JSON object to stdout",
  "  -h, --help       Show this help",
  "",
].join("\n");

const BUILD_HELP = [
  "Usage: metafab build",
  "",
  "Compile the factory for the configured agent tools",
  "",
  "Options:",
  "  --json      Write one JSON object to stdout",
  "  -h, --help  Show this help",
  "",
].join("\n");

const PIPELINE_HELP = [
  "Usage: metafab pipeline <subcommand>",
  "",
  "Subcommands:",
  "  metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]  Add a workflow to the pipeline",
  "  metafab pipeline remove <workflow>                                    Remove a workflow from the pipeline",
  "",
  "Run metafab pipeline <subcommand> --help for its options.",
  "",
].join("\n");

const PIPELINE_ADD_HELP = [
  "Usage: metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]",
  "",
  "Add a workflow to the pipeline",
  "",
  "Arguments:",
  "  <workflow>          An existing workflow",
  "",
  "Options:",
  "  --after <workflow>  Insert after this workflow instead of at the end",
  "  --stop <text>       Who must act, and on what, before the next workflow starts",
  "  --json              Write one JSON object to stdout",
  "  -h, --help          Show this help",
  "",
].join("\n");

let repo: TempRepo;

beforeAll(async () => {
  // A temporary directory outside Git: help needs no repository and no factory.
  repo = await makeRepo({ "README.md": "hello\n" });
});

afterAll(async () => {
  await repo.cleanup();
});

function help(argv: readonly string[]): ReturnType<typeof runCli> {
  return runCli(argv, { cwd: repo.root, tty: false });
}

describe("command help", () => {
  test("import --help prints the usage, the description, the argument and every option", async () => {
    const result = await help(["import", "--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(IMPORT_HELP);
    for (const text of ["Usage:", "Import a fab as the factory upstream", "<source>", "--json"]) {
      expect(result.stdout).toContain(text);
    }
  });

  test("every way of asking for a command's help prints the same text", async () => {
    for (const argv of [
      ["import", "-h"],
      ["--help", "import"],
      ["-h", "import"],
      ["import", "--bogus", "--help"],
    ]) {
      const result = await help(argv);
      expect(result.code, argv.join(" ")).toBe(ExitCode.Ok);
      expect(result.stderr, argv.join(" ")).toBe("");
      expect(result.stdout, argv.join(" ")).toBe(IMPORT_HELP);
    }
  });

  test("create --help works without its required path", async () => {
    const result = await help(["create", "--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("Usage: metafab create <path> [--description <text>]");
    expect(result.stdout).toContain("--description <text>");
  });

  test("a clustered short option that includes h is help, so init -hh writes nothing", async () => {
    const gitRepo = await makeRepo({ "README.md": "hello\n" }, { git: true });
    try {
      const result = await runCli(["init", "-hh"], { cwd: gitRepo.root, tty: false });

      expect(result.code).toBe(ExitCode.Ok);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage: metafab init");
      expect(result.stdout).toContain("--git-hooks");
      for (const created of [".factory", "AGENTS.md", "metafab.yaml", ".gitignore", ".gitattributes"]) {
        expect(await stat(gitRepo.path(created)).catch(() => undefined), created).toBeUndefined();
      }
    } finally {
      await gitRepo.cleanup();
    }
  });

  test("check -hh prints check's help instead of looking for a factory", async () => {
    const result = await help(["check", "-hh"]);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: metafab check");
    expect(result.stdout).toContain("--json");
  });

  test("build --help has no Arguments section", async () => {
    const result = await help(["build", "--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe(BUILD_HELP);
    expect(result.stdout).not.toContain("Arguments:");

    const lines = result.stdout.split("\n");
    const description = lines.indexOf("Compile the factory for the configured agent tools");
    expect(description).toBeGreaterThan(-1);
    expect(lines[description + 1]).toBe("");
    expect(lines[description + 2]).toBe("Options:");
  });

  test("import --help has an Arguments section", async () => {
    const result = await help(["import", "--help"]);
    expect(result.stdout).toContain("Arguments:\n  <source>");
  });

  test("a command's help is one JSON object with no summary", async () => {
    for (const argv of [
      ["import", "--help", "--json"],
      ["--json", "import", "--help"],
      ["import", "--json", "--help"],
    ]) {
      const result = await help(argv);
      expect(result.code, argv.join(" ")).toBe(ExitCode.Ok);
      expect(result.stderr, argv.join(" ")).toBe("");
      const parsed = JSON.parse(result.stdout) as {
        ok: boolean;
        command: string;
        exitCode: number;
        problems: unknown[];
        help: {
          command: string;
          usage: string;
          description: string;
          arguments: { name: string; description: string; optional: boolean }[];
          options: { flag: string; value?: string; description: string }[];
        };
      };

      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe("help");
      expect(parsed.exitCode).toBe(ExitCode.Ok);
      expect(parsed.problems).toEqual([]);
      expect(parsed.help.command).toBe("import");
      expect(parsed.help.usage).toBe(
        "metafab import <source> [--agents <list>] [--force] [--adopt] [--setup | --no-setup]",
      );
      expect(parsed.help.arguments).toEqual([
        {
          name: "source",
          description:
            "The fab: an npm package, a Git repository, an HTTPS tarball or a local path",
          optional: false,
        },
      ]);
      expect(parsed.help.options).toEqual([
        {
          flag: "--agents <list>",
          value: "<list>",
          description: "Agent tools to install for, when import creates metafab.yaml",
        },
        {
          flag: "--force",
          description: "Replace local factory files that differ from the fab",
        },
        {
          flag: "--adopt",
          description: "Move existing repository skills into .factory/skills/ without asking",
        },
        {
          flag: "--setup",
          description: "Create the missing required repository files from the fab's templates",
        },
        {
          flag: "--no-setup",
          description: "Leave the missing required repository files uncreated",
        },
        { flag: "--json", description: "Write one JSON object to stdout" },
        { flag: "-h, --help", description: "Show this help" },
      ]);
      expect("summary" in parsed).toBe(false);
    }
  });

  test("an optional argument is marked optional in JSON", async () => {
    const result = await help(["diff", "--help", "--json"]);
    const parsed = JSON.parse(result.stdout) as {
      help: { arguments: { name: string; optional: boolean }[] };
    };
    expect(parsed.help.arguments).toEqual([
      { name: "path", description: "Show only edits under this path in .factory/", optional: true },
    ]);
  });

  test("pipeline --help prints the subcommands", async () => {
    for (const argv of [["pipeline", "--help"], ["pipeline", "-h"], ["--help", "pipeline"]]) {
      const result = await help(argv);
      expect(result.code, argv.join(" ")).toBe(ExitCode.Ok);
      expect(result.stderr, argv.join(" ")).toBe("");
      expect(result.stdout, argv.join(" ")).toBe(PIPELINE_HELP);
    }
  });

  test("pipeline --help --json lists both subcommands", async () => {
    const result = await help(["pipeline", "--json", "--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    const parsed = JSON.parse(result.stdout) as {
      command: string;
      help: { command: string; subcommands: { command: string; usage: string }[] };
    };
    expect(parsed.command).toBe("help");
    expect(parsed.help.command).toBe("pipeline");
    expect(parsed.help.subcommands.map((subcommand) => subcommand.command)).toEqual([
      "pipeline add",
      "pipeline remove",
    ]);
    expect(parsed.help.subcommands[0]?.usage).toBe(
      "metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]",
    );
    expect("summary" in parsed).toBe(false);
  });

  test("a pipeline subcommand's help wins over unknown options", async () => {
    for (const argv of [
      ["pipeline", "add", "--help"],
      ["pipeline", "add", "-h"],
      ["--help", "pipeline", "add"],
      ["pipeline", "add", "--bogus", "--help"],
    ]) {
      const result = await help(argv);
      expect(result.code, argv.join(" ")).toBe(ExitCode.Ok);
      expect(result.stdout, argv.join(" ")).toBe(PIPELINE_ADD_HELP);
    }
  });

  test("an unknown command name after --help prints the global help", async () => {
    const global = await help(["--help"]);
    const result = await help(["bogus", "--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe(global.stdout);
  });

  test("--help after -- is a value, not help", async () => {
    // A stub, so the test does not resolve the source `--help` as an npm package.
    const capturing: CommandDefinition = {
      name: "import",
      description: "Import a fab as the factory upstream",
      usage: "metafab import <source>",
      async run(context) {
        return {
          ok: true,
          command: "import",
          exitCode: ExitCode.Ok,
          summary: JSON.stringify(context.positionals),
        };
      },
    };

    const result = await runCli(["import", "--", "--help"], {
      cwd: repo.root,
      tty: false,
      commands: [capturing],
    });
    expect(result.code).toBe(ExitCode.Ok);
    expect(JSON.parse(result.stdout)).toEqual(["--help"]);
    expect(result.stdout).not.toContain("Usage:");
  });
});

describe("global help", () => {
  test("--help is one JSON object with every command and no summary", async () => {
    for (const argv of [["--help", "--json"], ["--json", "--help"]]) {
      const result = await help(argv);
      expect(result.code, argv.join(" ")).toBe(ExitCode.Ok);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout) as {
        ok: boolean;
        command: string;
        exitCode: number;
        problems: unknown[];
        commands: { command: string; usage: string; description: string }[];
      };

      expect(Object.keys(parsed).sort()).toEqual([
        "command",
        "commands",
        "exitCode",
        "ok",
        "problems",
      ]);
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe("help");
      expect(parsed.exitCode).toBe(ExitCode.Ok);
      expect(parsed.problems).toEqual([]);
      expect(parsed.commands).toEqual(
        COMMANDS.map((definition) => ({
          command: definition.name,
          usage: definition.usage,
          description: definition.description,
        })),
      );
      expect("summary" in parsed).toBe(false);
    }
  });

  test("--help still lists every command in text", async () => {
    const result = await help(["--help"]);
    expect(result.code).toBe(ExitCode.Ok);
    for (const definition of COMMANDS) expect(result.stdout).toContain(definition.name);
    expect(result.stdout).toContain("--version");
  });
});

describe("option parse errors", () => {
  test("the fix names the command's own help", async () => {
    const result = await help(["import", "--bogus"]);
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Unknown option '--bogus'");
    expect(result.stderr).toContain("Run metafab import --help to see its options");
  });

  test("the fix names a pipeline subcommand's help", async () => {
    const result = await help(["pipeline", "add", "--bogus"]);
    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Run metafab pipeline add --help to see its options");
  });
});

describe("help data", () => {
  test("every command declares its usage and every option its description", () => {
    for (const definition of COMMANDS) {
      expect(definition.usage.startsWith(`metafab ${definition.name}`)).toBe(true);
      expect(definition.description.trim()).not.toBe("");
      for (const option of Object.values(definition.options ?? {})) {
        expect(option.description.trim(), definition.name).not.toBe("");
      }
    }
  });

  test("every usage equals the command's cell in the spec's command tables", async () => {
    const spec = await readFile(new URL("../../docs/specs/cli.md", import.meta.url), "utf8");
    const cells = spec
      .split("\n")
      .map((line) => /^\|\s*`(metafab [^`]*)`\s*\|/.exec(line)?.[1])
      .filter((cell): cell is string => cell !== undefined)
      .map((cell) => cell.replaceAll("\\|", "|"));

    const usages = COMMANDS.map((definition) => definition.usage);
    expect(new Set(usages).size).toBe(usages.length);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(usages).toContain(cell);

    // `map` and `check` have no table row; pin them here.
    const covered = COMMANDS.filter((definition) => cells.includes(definition.usage));
    expect(covered.map((definition) => definition.name)).toEqual([
      "init",
      "build",
      "create",
      "pipeline add",
      "pipeline remove",
      "import",
      "update",
      "diff",
      "detach",
      "publish",
    ]);
    const map = COMMANDS.find((definition) => definition.name === "map");
    const check = COMMANDS.find((definition) => definition.name === "check");
    expect(map?.usage).toBe("metafab map");
    expect(check?.usage).toBe("metafab check");
  });
});
