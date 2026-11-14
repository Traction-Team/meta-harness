import { chmod, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { runImport } from "../../../src/core/import/run.js";
import type { RequirementResult } from "../../../src/core/requires/inspect.js";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));
const REQUIRES_FAB = path.join(FIXTURES, "requires-fab");

const OPENCODE = '{\n  "agent": {}\n}\n';
const ROADMAP = "# Roadmap\n";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: RepoFiles = {}): Promise<TempRepo> {
  const repo = await makeRepo(files, { git: true });
  repos.push(repo);
  return repo;
}

function requiresYaml(entries: readonly string[]): string {
  return `format: 1\nname: demo-fab\n\nrequires:\n${entries.join("")}`;
}

function requirement(path: string, description: string, template?: string): string {
  return `  - path: ${path}\n    description: ${description}\n${template === undefined ? "" : `    template: ${template}\n`}`;
}

/** A fab with two creatable files and one the person must create. */
function requiresFab(): RepoFiles {
  return {
    ".factory/factory.yaml": requiresYaml([
      requirement(
        "opencode.json",
        "Defines the agent-coding sub-agent that every workflow starts",
        ".factory/templates/setup/opencode.json",
      ),
      requirement(
        "docs/roadmap.md",
        "The roadmap that prioritise-roadmap writes and start-plan reads",
        ".factory/templates/docs/roadmap.md",
      ),
      requirement("docs/factory.md", "The repository settings the workflows read"),
    ]),
    ".factory/templates/setup/opencode.json": OPENCODE,
    ".factory/templates/docs/roadmap.md": ROADMAP,
    ".factory/AGENTS.md": "# Agents\n",
  };
}

async function makeFab(files: RepoFiles = requiresFab()): Promise<TempRepo> {
  const fab = await makeRepo(files);
  repos.push(fab);
  return fab;
}

function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function requirements(result: RunCliResult): RequirementResult[] {
  return parseJson(result).requires as RequirementResult[];
}

async function fixtureTemplate(...segments: string[]): Promise<string> {
  return readFile(path.join(REQUIRES_FAB, ".factory", "templates", ...segments), "utf8");
}

describe("import requires", { timeout: 30_000 }, () => {
  test("--setup creates each missing file from the fixture fab's templates", async () => {
    const repo = await repoWith();
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--setup", "--json"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(0);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(
      await fixtureTemplate("setup", "opencode.json"),
    );
    expect(await readFile(repo.path("docs", "factory.md"), "utf8")).toBe(
      await fixtureTemplate("docs", "factory.md"),
    );
    expect(await pathExists(repo.path("orca.yaml"))).toBe(false);

    expect(requirements(result).map((entry) => [entry.path, entry.state])).toEqual([
      ["opencode.json", "created"],
      ["docs/factory.md", "created"],
      ["orca.yaml", "missing"],
    ]);
  });

  test("a terminal asks with yes as the default and creates the files", async () => {
    const repo = await repoWith();
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--json"],
      { cwd: repo.root, tty: true, stdin: Readable.from(["\n"]) },
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("The factory needs these files, which are missing:\n");
    expect(result.stderr).toContain(
      "  opencode.json    Defines the agent-coding sub-agent that every workflow starts\n",
    );
    expect(result.stderr).toContain(
      "Create the missing files from the fab's templates? Existing files are never changed.",
    );
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(
      await fixtureTemplate("setup", "opencode.json"),
    );
  });

  test("creates CRLF and executable templates byte for byte, and never touches a present file", async () => {
    const repo = await repoWith({ "existing.json": "mine\n" });
    const before = await stat(repo.path("existing.json"));
    const fab = await makeFab({
      ".factory/factory.yaml": requiresYaml([
        requirement(
          "existing.json",
          "A file the person already wrote",
          ".factory/templates/existing.json",
        ),
        requirement(
          "scripts/setup.sh",
          "Runs the setup step",
          ".factory/templates/scripts/setup.sh",
        ),
        requirement("opencode.json", "Agent settings", ".factory/templates/setup/opencode.json"),
      ]),
      ".factory/templates/existing.json": '{"template": true}\n',
      ".factory/templates/scripts/setup.sh": "#!/bin/sh\r\necho setup\r\n",
      ".factory/templates/setup/opencode.json": '{\r\n  "agent": {}\r\n}\r\n',
      ".factory/AGENTS.md": "# Agents\n",
    });
    if (process.platform !== "win32") {
      await chmod(fab.path(".factory", "templates", "scripts", "setup.sh"), 0o755);
    }

    const result = await runCli(["import", fab.root, "--agents", "claude", "--setup", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path("opencode.json"))).toEqual(
      Buffer.from('{\r\n  "agent": {}\r\n}\r\n'),
    );
    expect(await readFile(repo.path("scripts", "setup.sh"))).toEqual(
      Buffer.from("#!/bin/sh\r\necho setup\r\n"),
    );
    if (process.platform !== "win32") {
      expect((await stat(repo.path("scripts", "setup.sh"))).mode & 0o111).not.toBe(0);
    }

    const after = await stat(repo.path("existing.json"));
    expect(await readFile(repo.path("existing.json"), "utf8")).toBe("mine\n");
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(requirements(result).map((entry) => entry.state)).toEqual([
      "present",
      "created",
      "created",
    ]);
  });

  test("--no-setup declines every creatable file and creates nothing for it", async () => {
    const repo = await repoWith();
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--no-setup", "--json"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(0);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
    expect(await pathExists(repo.path("docs", "factory.md"))).toBe(false);
    expect(await pathExists(repo.path("orca.yaml"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(true);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(true);
    expect(requirements(result).map((entry) => [entry.path, entry.state])).toEqual([
      ["opencode.json", "declined"],
      ["docs/factory.md", "declined"],
      ["orca.yaml", "missing"],
    ]);

    const review = parseJson(result).review as {
      groups: { key: string; entries: { path: string; description?: string }[] }[];
    };
    const setup = review.groups.find((group) => group.key === "setup");
    expect(setup?.entries).toEqual([
      { path: "opencode.json", description: "not created: declined" },
      { path: "docs/factory.md", description: "not created: declined" },
      { path: "orca.yaml", description: "missing: Runs metafab build in each new Orca worktree" },
    ]);
  });

  test("a terminal decline creates nothing outside .factory/", async () => {
    const repo = await repoWith();
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--json"],
      { cwd: repo.root, tty: true, stdin: Readable.from(["n\n"]) },
    );

    expect(result.code).toBe(0);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
    expect(await pathExists(repo.path("docs", "factory.md"))).toBe(false);
    expect(requirements(result).map((entry) => entry.state)).toEqual([
      "declined",
      "declined",
      "missing",
    ]);
  });

  test("without a terminal and without a flag, exit 2 names --setup and changes nothing", async () => {
    const repo = await repoWith({ "README.md": "# Repository\n" });
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--json"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(2);
    const required = parseJson(result).required as Record<string, unknown>[];
    expect(required[0]).toMatchObject({ name: "setup", flag: "--setup" });
    expect(String(required[0]!.description)).toContain("opencode.json, docs/factory.md");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });

  test("without a terminal, adoption and setup needs are reported together", async () => {
    const repo = await repoWith({
      ".claude/skills/release/SKILL.md":
        "---\nname: release\ndescription: Use release when the task needs it.\n---\n\n# release\n",
    });
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--json"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(2);
    const required = parseJson(result).required as Record<string, unknown>[];
    expect(required.map((value) => value.name)).toEqual(["adopt", "setup"]);
    expect(required[1]!.flag).toBe("--setup");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("nothing creatable asks nothing and does not exit 2 without a terminal", async () => {
    const repo = await repoWith({ "orca.yaml": "scripts:\n  setup: make setup\n" });
    const fab = await makeFab({
      ".factory/factory.yaml": requiresYaml([
        requirement("orca.yaml", "Runs metafab build in each new Orca worktree"),
        requirement("docs/factory.md", "The repository settings the workflows read"),
      ]),
      ".factory/AGENTS.md": "# Agents\n",
    });

    const result = await runCli(["import", fab.root, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(requirements(result).map((entry) => entry.state)).toEqual(["present", "missing"]);
  });

  test("a file that appears between preflight and creation is present and untouched", async () => {
    const repo = await repoWith();
    const fab = await makeFab();

    const report = await runImport({
      root: repo.root,
      source: fab.root,
      setup: true,
      io: { tty: false },
      async beforeCreate() {
        await writeRepoFiles(repo.root, { "opencode.json": "appeared\n" });
      },
    });

    expect(report.requires.map((entry) => [entry.path, entry.state])).toEqual([
      ["opencode.json", "present"],
      ["docs/roadmap.md", "created"],
      ["docs/factory.md", "missing"],
    ]);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe("appeared\n");
    expect(await readFile(repo.path("docs", "roadmap.md"), "utf8")).toBe(ROADMAP);
  });

  test("--setup and --no-setup together is a usage error that writes nothing", async () => {
    const repo = await repoWith();
    const result = await runCli(
      ["import", REQUIRES_FAB, "--agents", "claude", "--setup", "--no-setup"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("Pass --setup or --no-setup, not both");
    expect(result.stderr).toContain("fix: Run metafab import <source> [--setup | --no-setup]");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });
});
