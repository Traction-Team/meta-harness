import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { SETUP_QUESTION } from "../../../src/core/requires/setup.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import {
  createGitFab,
  importFab,
  parseJson,
  updateFab,
  withFabEnvironment,
} from "./git-fab.js";
import type { GitFab } from "./git-fab.js";

const OPENCODE_V1 = '{\n  "agent": {}\n}\n';
const OPENCODE_V2 = '{\n  "agent": {\n    "coding": {}\n  }\n}\n';
const ROADMAP = "# Roadmap\n";

const repos: TempRepo[] = [];
const fabs: GitFab[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...fabs.splice(0).map((fab) => fab.cleanup()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

function factoryYaml(requires: readonly string[] = [], name = "sample-fab"): string {
  const lines = ["format: 1", `name: ${name}`, ""];
  if (requires.length > 0) {
    lines.push("requires:");
    lines.push(...requires);
  }
  return `${lines.join("\n")}\n`;
}

function requirement(path: string, description: string, template?: string): string {
  return `  - path: ${path}\n    description: ${description}\n${template === undefined ? "" : `    template: ${template}\n`}`;
}

function opencodeRequirement(template = ".factory/templates/setup/opencode.json"): string {
  return requirement(
    "opencode.json",
    "Defines the agent-coding sub-agent that every workflow starts",
    template,
  );
}

function roadmapRequirement(): string {
  return requirement(
    "docs/roadmap.md",
    "The roadmap that prioritise-roadmap writes and start-plan reads",
    ".factory/templates/docs/roadmap.md",
  );
}

function baseFab(): RepoFiles {
  return {
    ".factory/factory.yaml": factoryYaml(),
    ".factory/AGENTS.md": "# Agents\n",
  };
}

async function track(fab: GitFab): Promise<GitFab> {
  fabs.push(fab);
  return fab;
}

async function importedFrom(initial: RepoFiles, extra: readonly string[] = []): Promise<{
  repo: TempRepo;
  fab: GitFab;
}> {
  const fab = await track(await createGitFab(initial));
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);
  const imported = await withFabEnvironment(fab, () => importFab(repo.root, undefined, extra));
  expect(imported.code).toBe(0);
  return { repo, fab };
}

async function publish(fab: GitFab, changes: RepoFiles): Promise<void> {
  await fab.commit(changes, "v1.1.0");
  await fab.tag("v1.1.0");
  await fab.push();
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files = await listFiles(root, {
    ignore: (relativePath) => relativePath === ".git" || relativePath.startsWith(".git/"),
  });
  const entries: Record<string, string> = {};
  for (const file of files) {
    entries[file] = (await readFile(path.join(root, ...file.split("/")))).toString("base64");
  }
  return entries;
}

function parse(result: RunCliResult): Record<string, unknown> {
  return parseJson(result);
}

function states(result: RunCliResult): [string, string][] {
  return (parse(result).requires as { path: string; state: string }[]).map((entry) => [
    entry.path,
    entry.state,
  ]);
}

describe("update requires, versioned", { timeout: 30_000 }, () => {
  test("--setup creates a requirement new upstream", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);
    expect(states(result)).toEqual([["opencode.json", "created"]]);

    const review = parse(result).review as {
      groups: { key: string; entries: { path: string; description?: string }[] }[];
    };
    const setup = review.groups.find((group) => group.key === "setup");
    expect(setup?.entries).toEqual([
      {
        status: "A",
        path: "opencode.json",
        description: "created from .factory/templates/setup/opencode.json",
      },
    ]);
  });

  test("a terminal asks before the update writes and creates the file", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });

    const result = await withFabEnvironment(fab, () =>
      runCli(["update", "--no-build", "--json"], {
        cwd: repo.root,
        tty: true,
        stdin: Readable.from(["y\n"]),
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(SETUP_QUESTION);
    expect(result.stderr).toContain("The factory needs these files, which are missing:");
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);
  });

  test("offers only the requirement that is new, not an old one still missing", async () => {
    const { repo, fab } = await importedFrom(
      {
        ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
        ".factory/templates/setup/opencode.json": OPENCODE_V1,
        ".factory/AGENTS.md": "# Agents\n",
      },
      ["--no-setup"],
    );
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);

    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement(), roadmapRequirement()]),
      ".factory/templates/docs/roadmap.md": ROADMAP,
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(states(result)).toEqual([["docs/roadmap.md", "created"]]);
    expect(await readFile(repo.path("docs", "roadmap.md"), "utf8")).toBe(ROADMAP);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });

  test("a dry run asks nothing and writes nothing, inside or outside .factory/", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });
    const before = await snapshot(repo.root);

    const result = await withFabEnvironment(fab, () =>
      runCli(["update", "--dry-run", "--json"], {
        cwd: repo.root,
        tty: true,
        stdin: Readable.from(["y\n"]),
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain(SETUP_QUESTION);
    expect(states(result)).toEqual([["opencode.json", "missing"]]);
    expect(parse(result).notes).toContain("Dry run: nothing was written.");
    expect(await snapshot(repo.root)).toEqual(before);
  });

  test("without a terminal or a flag, exit 2 names --setup and leaves the repository unchanged", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });
    const before = await snapshot(repo.root);

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--json"]),
    );

    expect(result.code).toBe(2);
    const required = parse(result).required as Record<string, unknown>[];
    expect(required[0]).toMatchObject({ name: "setup", flag: "--setup" });
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });

  test("a conflicted factory.yaml is not checked and nothing is created", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await writeRepoFiles(repo.root, {
      ".factory/factory.yaml": factoryYaml([], "local-name"),
    });
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()], "upstream-name"),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(1);
    expect(parse(result).conflicts).toContain("factory.yaml");
    expect(parse(result).notes).toContain(
      "Required repository files not checked: resolve the conflict in factory.yaml first.",
    );
    expect(parse(result).requires).toEqual([]);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });

  test("a template changed upstream for a present file is noted and the file is unchanged", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
      ".factory/AGENTS.md": "# Agents\n",
    }, ["--setup"]);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);

    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V2,
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(parse(result).requires).toEqual([]);
    expect(parse(result).notes).toContain(
      "Upstream changed .factory/templates/setup/opencode.json, the template for opencode.json; opencode.json was not changed.",
    );
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);
  });

  test("a requirement created in this update is not called unchanged", async () => {
    const shared = (file: string): string =>
      requirement(file, "A setup file both requirements use", ".factory/templates/setup/opencode.json");

    const { repo, fab } = await importedFrom(
      {
        ".factory/factory.yaml": factoryYaml([shared("a.json")]),
        ".factory/templates/setup/opencode.json": OPENCODE_V1,
        ".factory/AGENTS.md": "# Agents\n",
      },
      ["--setup"],
    );
    expect(await readFile(repo.path("a.json"), "utf8")).toBe(OPENCODE_V1);

    // The template a.json was created from changes, and a second requirement
    // that uses it appears. b.json is created from the new template in this
    // update, so it was not left unchanged: only a.json was.
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([shared("a.json"), shared("b.json")]),
      ".factory/templates/setup/opencode.json": OPENCODE_V2,
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(states(result)).toEqual([["b.json", "created"]]);
    expect(await readFile(repo.path("b.json"), "utf8")).toBe(OPENCODE_V2);
    expect(await readFile(repo.path("a.json"), "utf8")).toBe(OPENCODE_V1);
    expect(
      (parse(result).notes as string[]).filter((note) => note.endsWith("was not changed.")),
    ).toEqual([
      "Upstream changed .factory/templates/setup/opencode.json, the template for a.json; a.json was not changed.",
    ]);
  });

  test("a requirement removed upstream leaves its file alone", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
      ".factory/AGENTS.md": "# Agents\n",
    }, ["--setup"]);

    await fab.remove([".factory/templates/setup/opencode.json"], "remove the template");
    await fab.commit({ ".factory/factory.yaml": factoryYaml() }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(parse(result).requires).toEqual([]);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);
  });

  test("a new requirement whose template has a conflict is blocked and creates nothing", async () => {
    const { repo, fab } = await importedFrom(baseFab());
    await writeRepoFiles(repo.root, {
      ".factory/templates/setup/opencode.json": "mine\n",
    });
    await publish(fab, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": "upstream\n",
    });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--setup", "--no-build", "--json"]),
    );

    expect(result.code).toBe(1);
    expect(parse(result).requires).toEqual([
      expect.objectContaining({
        path: "opencode.json",
        state: "blocked",
        reason: "its template .factory/templates/setup/opencode.json has a conflict",
      }),
    ]);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });
});

describe("update requires, unversioned", { timeout: 30_000 }, () => {
  async function sourceFab(files: RepoFiles): Promise<{ root: string; source: string }> {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-update-requires-"));
    roots.push(root);
    await writeRepoFiles(root, files);
    return { root, source: path.join(root, ".factory") };
  }

  async function imported(): Promise<{ repo: TempRepo; root: string }> {
    const fab = await sourceFab({
      ".factory/factory.yaml": factoryYaml(),
      ".factory/AGENTS.md": "# Agents v1\n",
    });
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);
    const result = await runCli(["import", fab.source, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });
    expect(result.code).toBe(0);
    return { repo, root: fab.root };
  }

  test("--setup creates a requirement new in the source before the copy finishes", async () => {
    const { repo, root } = await imported();
    await writeRepoFiles(root, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
      ".factory/AGENTS.md": "# Agents v2\n",
    });

    const result = await updateFab(repo.root, ["--setup", "--no-build", "--json"]);

    expect(result.code).toBe(0);
    expect(states(result)).toEqual([["opencode.json", "created"]]);
    expect(await readFile(repo.path("opencode.json"), "utf8")).toBe(OPENCODE_V1);
    expect(await readFile(repo.path(".factory", "AGENTS.md"), "utf8")).toBe("# Agents v2\n");
  });

  test("without a terminal or a flag, exit 2 leaves .factory/ unchanged", async () => {
    const { repo, root } = await imported();
    await writeRepoFiles(root, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
      ".factory/AGENTS.md": "# Agents v2\n",
    });
    const before = await snapshot(repo.root);

    const result = await updateFab(repo.root, ["--no-build", "--json"]);

    expect(result.code).toBe(2);
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });

  test("a dry run asks nothing and writes nothing", async () => {
    const { repo, root } = await imported();
    await writeRepoFiles(root, {
      ".factory/factory.yaml": factoryYaml([opencodeRequirement()]),
      ".factory/templates/setup/opencode.json": OPENCODE_V1,
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["update", "--dry-run", "--json"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["y\n"]),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain(SETUP_QUESTION);
    expect(states(result)).toEqual([["opencode.json", "missing"]]);
    expect(await snapshot(repo.root)).toEqual(before);
  });
});
