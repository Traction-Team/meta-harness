import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyBuild, planBuild, planPreview, writePreview } from "../../../src/core/build/index.js";
import type { PreviewIo, PreviewPlan } from "../../../src/core/build/index.js";
import { loadConfig } from "../../../src/core/config/load.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import type { ResolvedSelection } from "../../../src/core/env/types.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = (require("../../../package.json") as { version: string }).version;

/** Symlinks need a privilege Windows CI may not grant. */
const onWindows = process.platform === "win32";
/** A read-only directory does not stop root. */
const asRoot = process.getuid?.() === 0;

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function skill(name: string, description: string, body: string): string {
  return [`---`, `name: ${name}`, `description: ${description}`, `---`, body].join("\n");
}

const FACTORY_YAML = [
  "format: 2",
  "name: preview-demo",
  "",
  "env:",
  "  harness:",
  "    values: [amp, opencode]",
  "",
  "skills:",
  "  amp-only: { when: env.harness == amp }",
  "",
].join("\n");

const AGENTS_MD = [
  "# Preview demo",
  "",
  "Build in slices.",
  "",
  "<!-- factory:when env.harness == amp -->",
  "Amp threads keep their own workspace.",
  "<!-- factory:endwhen -->",
  "",
  "<!-- factory:when env.harness == opencode -->",
  "OpenCode runs in the repository root.",
  "<!-- factory:endwhen -->",
  "",
].join("\n");

const HELLO = skill(
  "hello",
  "Say hello. Use when testing the preview.",
  [
    "",
    "# Hello",
    "",
    "<!-- factory:switch env.harness -->",
    "<!-- factory:case amp -->",
    "Amp text.",
    "<!-- factory:case opencode -->",
    "OpenCode text.",
    "<!-- factory:endswitch -->",
    "",
  ].join("\n"),
);

const AMP_ONLY = skill(
  "amp-only",
  "Work in Amp threads. Use when the harness is Amp.",
  "\n# Amp only\n\nRead the thread before you start.\n",
);

/** A format 2 factory whose skills and AGENTS.md depend on `harness`. */
async function previewRepo(files: Record<string, string> = {}): Promise<TempRepo> {
  return track(
    await makeRepo({
      ".factory/factory.yaml": FACTORY_YAML,
      ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
      ".factory/AGENTS.md": AGENTS_MD,
      ".factory/skills/hello/SKILL.md": HELLO,
      ".factory/skills/amp-only/SKILL.md": AMP_ONLY,
      ...files,
    }),
  );
}

/** The selection `--env harness=amp` would give, without reading Git config. */
function selection(values: Record<string, readonly string[]>): ResolvedSelection {
  return { variables: [], selection: new Map(Object.entries(values)), warnings: [] };
}

async function preview(
  root: string,
  out: string,
  values: Record<string, readonly string[]> = { harness: ["amp"] },
): Promise<PreviewPlan> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factory.dir);
  return planPreview(factory, config, PACKAGE_VERSION, out, { selection: selection(values) });
}

async function build(root: string, values: Record<string, readonly string[]>): Promise<void> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factory.dir);
  const plan = await planBuild(factory, config, PACKAGE_VERSION, {
    selection: selection(values),
  });
  expect(plan.errors).toEqual([]);
  await applyBuild(plan);
}

/** A `writeFile` that writes normally until its `failureAt`th call, then fails. */
function failingWriter(failureAt: number): { io: PreviewIo; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    io: {
      writeFile: async (target, content) => {
        calls.push(target);
        if (calls.length === failureAt) {
          throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
        }
        await writeFile(target, content, { flag: "wx" });
      },
    },
  };
}

function writeProblem(target: string): object {
  return {
    level: "error",
    file: target,
    message: `Cannot write ${target}`,
    fix: `Check that it is writable and has space left (ENOSPC), then run metafab build --out again`,
  };
}

function conflictProblem(target: string): object {
  return {
    level: "error",
    file: target,
    message: `${target} appeared while the preview was being written`,
    fix: "Choose a new directory or empty it, then run metafab build --out again",
  };
}

describe("planPreview", () => {
  test("previews the skills for a selection and the same AGENTS.md block for every selection", async () => {
    const repo = await previewRepo();
    const ampOut = repo.path("preview-amp");
    const opencodeOut = repo.path("preview-opencode");

    const amp = await preview(repo.root, ampOut, { harness: ["amp"] });
    expect(amp.errors).toEqual([]);
    expect(amp.conflicts).toEqual([]);
    expect(amp.created).toBe(true);
    // The plan only describes the preview; nothing is written yet.
    expect(await pathExists(ampOut)).toBe(false);
    await writePreview(amp);

    const opencode = await preview(repo.root, opencodeOut, { harness: ["opencode"] });
    expect(opencode.errors).toEqual([]);
    expect(opencode.conflicts).toEqual([]);
    await writePreview(opencode);

    const ampHello = await readFile(path.join(ampOut, ".agents/skills/hello/SKILL.md"), "utf8");
    expect(ampHello).toContain("Amp text.");
    expect(ampHello).not.toContain("OpenCode text.");

    const opencodeHello = await readFile(
      path.join(opencodeOut, ".agents/skills/hello/SKILL.md"),
      "utf8",
    );
    expect(opencodeHello).toContain("OpenCode text.");
    expect(opencodeHello).not.toContain("Amp text.");

    expect(await pathExists(path.join(ampOut, ".agents/skills/amp-only/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(opencodeOut, ".agents/skills/amp-only"))).toBe(false);

    // Only the destination the selected agents use exists.
    expect(await pathExists(path.join(ampOut, ".claude"))).toBe(false);
    expect(await listFiles(ampOut)).toEqual([
      ".agents/skills/amp-only/SKILL.md",
      ".agents/skills/hello/SKILL.md",
      "AGENTS.md",
    ]);

    // The block is rendered for every value, not for the selection, so both
    // previews hold the same bytes.
    const ampBlock = await readFile(path.join(ampOut, "AGENTS.md"), "utf8");
    const opencodeBlock = await readFile(path.join(opencodeOut, "AGENTS.md"), "utf8");
    expect(ampBlock).toBe(opencodeBlock);
    expect(ampBlock.startsWith("<!-- factory:start -->\n")).toBe(true);
    expect(ampBlock.endsWith("<!-- factory:end -->\n")).toBe(true);
    expect(ampBlock).toContain("**When harness is amp:**");
    expect(ampBlock).toContain("**When harness is opencode:**");
    expect(ampBlock).toContain("Amp threads keep their own workspace.");
    expect(ampBlock).toContain("OpenCode runs in the repository root.");

    // Byte for byte the block `build` writes to the root AGENTS.md.
    await build(repo.root, { harness: ["opencode"] });
    expect(await readFile(repo.path("AGENTS.md"), "utf8")).toBe(ampBlock);
  });

  test("writes only the destinations the selected agents use", async () => {
    const repo = await previewRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    });
    const out = repo.path("preview");

    await writePreview(await preview(repo.root, out));

    expect(await pathExists(path.join(out, ".claude/skills/hello/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(out, ".agents/skills/hello/SKILL.md"))).toBe(true);
  });

  test("keeps build's file modes", async () => {
    const repo = await previewRepo();
    await writeFile(repo.path(".factory/skills/hello/run.sh"), "#!/bin/sh\n");
    await chmod(repo.path(".factory/skills/hello/run.sh"), 0o755);
    const out = repo.path("preview");

    await writePreview(await preview(repo.root, out));

    const executable = await stat(path.join(out, ".agents/skills/hello/run.sh"));
    const plain = await stat(path.join(out, ".agents/skills/hello/SKILL.md"));
    if (process.platform !== "win32") {
      expect(executable.mode & 0o777).toBe(0o755);
      expect(plain.mode & 0o777).toBe(0o644);
    }
  });

  test("creates an absent --out with its parents", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview", "nested");

    const plan = await preview(repo.root, out);
    expect(plan.created).toBe(true);
    expect(plan.errors).toEqual([]);

    await writePreview(plan);
    expect(await pathExists(path.join(out, "AGENTS.md"))).toBe(true);
  });

  test("uses an existing empty --out and leaves it in place", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await mkdir(out);

    const plan = await preview(repo.root, out);
    expect(plan.created).toBe(false);

    await writePreview(plan);
    expect(await pathExists(path.join(out, "AGENTS.md"))).toBe(true);
  });

  test("refuses a non-empty --out and leaves it untouched", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await mkdir(out);
    await writeFile(path.join(out, "keep.txt"), "keep");

    const plan = await preview(repo.root, out);

    expect(plan.conflicts).toEqual([
      {
        level: "error",
        file: out,
        message: `--out ${out} is not empty`,
        fix: "Choose a new directory or empty it",
      },
    ]);
    expect(plan.errors).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(await readdir(out)).toEqual(["keep.txt"]);
  });

  test("refuses an --out that is a file", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await writeFile(out, "a file");

    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: out,
        message: `--out ${out} is not a directory`,
        fix: "Pass a directory that does not exist or is empty",
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  test("refuses an --out inside .factory or a skill destination", async () => {
    const repo = await previewRepo();

    for (const [relative, label] of [
      [".factory/x", ".factory"],
      [".claude/skills/x", ".claude/skills"],
      [".agents/skills/x", ".agents/skills"],
    ] as const) {
      const out = repo.path(...relative.split("/"));
      const plan = await preview(repo.root, out);
      expect(plan.errors).toEqual([
        {
          level: "error",
          file: out,
          message: `--out ${out} is inside ${label}, where build would find it`,
          fix: "Choose a directory outside .factory/ and the skill destinations",
        },
      ]);
      expect(plan.writes).toEqual([]);
      expect(await pathExists(out)).toBe(false);
    }
  });

  test.skipIf(onWindows)("refuses an --out that reaches .factory through a link", async () => {
    const repo = await previewRepo();
    const link = repo.path("preview-link");
    await symlink(repo.path(".factory"), link, "dir");

    const out = path.join(link, "x");
    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: out,
        message: `--out ${out} is inside .factory, where build would find it`,
        fix: "Choose a directory outside .factory/ and the skill destinations",
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  test.skipIf(onWindows)("refuses an --out that is a link to a file", async () => {
    const repo = await previewRepo();
    const file = repo.path("target.txt");
    await writeFile(file, "a file");
    const out = repo.path("preview");
    await symlink(file, out, "file");

    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: out,
        message: `--out ${out} is not a directory`,
        fix: "Pass a directory that does not exist or is empty",
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  test.skipIf(onWindows)("compares a linked .claude on its target", async () => {
    const repo = await previewRepo();
    const linked = repo.path("linked-skills");
    await mkdir(linked);
    await symlink(linked, repo.path(".claude"), "dir");

    const out = repo.path(".claude/skills/x");
    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: out,
        message: `--out ${out} is inside .claude/skills, where build would find it`,
        fix: "Choose a directory outside .factory/ and the skill destinations",
      },
    ]);
  });

  test.skipIf(onWindows)("allows a link at --out to an empty directory outside the repository", async () => {
    const repo = await previewRepo();
    const target = await makeRepo({}, { prefix: "metafab-preview-target-" });
    const link = repo.path("preview-link");
    await symlink(target.root, link, "dir");

    try {
      const plan = await preview(repo.root, link);
      expect(plan.errors).toEqual([]);
      expect(plan.conflicts).toEqual([]);
      expect(plan.created).toBe(false);

      await writePreview(plan);
      expect(await pathExists(path.join(target.root, "AGENTS.md"))).toBe(true);
    } finally {
      await target.cleanup();
    }
  });

  test("refuses an empty --out", async () => {
    const repo = await previewRepo();

    const plan = await preview(repo.root, "");

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: "--out",
        message: "--out needs a directory",
        fix: "Pass a directory, such as --out /tmp/preview-amp",
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  test("stops before creating --out when the factory has an error", async () => {
    const repo = await previewRepo({
      ".factory/skills/hello/SKILL.md": skill(
        "hello",
        "Say hello.",
        "\n# Hello\n\n<!-- factory:when env.harness == amp -->\nNever closed.\n",
      ),
    });
    const out = repo.path("preview");

    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([
      {
        level: "error",
        file: ".factory/skills/hello/SKILL.md",
        line: 8,
        message: "factory:when on line 8 is never closed in this file",
        fix: "Add <!-- factory:endwhen --> in the same file",
      },
    ]);
    expect(plan.writes).toEqual([]);
    expect(await pathExists(out)).toBe(false);
  });

  test("writes nothing when agents is empty", async () => {
    const repo = await previewRepo({
      ".factory/metafab.yaml": "agents: []\nmetafab-skill: false\n",
    });
    const out = repo.path("preview");

    const plan = await preview(repo.root, out);

    expect(plan.errors).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(await writePreview(plan)).toEqual([]);
    expect(await pathExists(out)).toBe(false);
  });
});

describe("writePreview", () => {
  test("removes everything it created when a write fails", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview", "nested");
    const plan = await preview(repo.root, out);
    const failing = plan.writes[2]!;
    const failingPath = path.join(out, ...failing.path.split("/"));
    const writer = failingWriter(3);

    const error = await writePreview(plan, writer.io).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).exitCode).toBe(ExitCode.Failed);
    expect((error as MetafabError).problems).toEqual([writeProblem(failingPath)]);
    expect(writer.calls).toHaveLength(3);
    expect(await pathExists(repo.path("preview"))).toBe(false);
  });

  test("leaves a pre-existing empty --out empty when a write fails", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await mkdir(out);
    const plan = await preview(repo.root, out);

    const error = await writePreview(plan, failingWriter(2).io).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).exitCode).toBe(ExitCode.Failed);
    expect(await readdir(out)).toEqual([]);
  });

  test.skipIf(onWindows || asRoot)("fails without creating anything when the parent is read-only", async () => {
    const repo = await previewRepo();
    const parent = repo.path("read-only");
    await mkdir(parent);
    const out = path.join(parent, "preview");
    const plan = await preview(repo.root, out);

    try {
      await chmod(parent, 0o555);
      const error = await writePreview(plan).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).exitCode).toBe(ExitCode.Failed);
      expect((error as MetafabError).problems).toMatchObject([
        { level: "error", file: out, message: `Cannot write ${out}` },
      ]);
      expect(await pathExists(out)).toBe(false);
    } finally {
      await chmod(parent, 0o755);
    }
  });

  test("keeps what it could not remove, with one warning, and carries on", async () => {
    const repo = track(
      await makeRepo({
        ".factory/factory.yaml": "format: 2\nname: demo\nenv:\n  harness: { values: [amp] }\n",
        ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
        ".factory/skills/a/SKILL.md": skill("a", "A. Use when testing.", "\n# A\n"),
        ".factory/skills/b/SKILL.md": skill("b", "B. Use when testing.", "\n# B\n"),
        ".factory/skills/b/notes.md": "# Notes\n",
      }),
    );
    const out = repo.path("preview");
    const plan = await preview(repo.root, out);
    // Writes in order: a/SKILL.md, b/SKILL.md, b/notes.md, AGENTS.md.
    const stuck = path.join(out, ".agents/skills/a/SKILL.md");
    const failingPath = path.join(out, ".agents/skills/b/notes.md");
    const calls: string[] = [];
    const removed: string[] = [];
    const io: PreviewIo = {
      writeFile: async (target, content) => {
        calls.push(target);
        if (calls.length === 3) {
          throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
        }
        await writeFile(target, content, { flag: "wx" });
      },
      remove: async (target) => {
        removed.push(target);
        if (target === stuck) throw new Error("busy");
        const info = await lstat(target);
        if (info.isDirectory()) await rmdir(target);
        else await rm(target);
      },
    };

    const error = await writePreview(plan, io).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).exitCode).toBe(ExitCode.Failed);
    expect((error as MetafabError).problems).toEqual([
      writeProblem(failingPath),
      {
        level: "warning",
        file: stuck,
        message: `Could not remove ${stuck}; remove it by hand`,
      },
    ]);
    // The file it could not remove, and its parents, are the only entries left.
    expect(await listFiles(out)).toEqual([".agents/skills/a/SKILL.md"]);
    expect(await pathExists(path.join(out, ".agents/skills/b"))).toBe(false);
    // Rollback goes deepest first and never touches an entry the run did not make.
    expect(removed[0]).toBe(stuck);
    expect(removed).not.toContain(failingPath);
    const lengths = removed.map((target) => target.length);
    expect(lengths).toEqual([...lengths].sort((left, right) => right - left));
    for (const target of removed) expect(target.startsWith(out)).toBe(true);
  });

  test("conflicts when AGENTS.md appears after the preflight", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await mkdir(out);
    const plan = await preview(repo.root, out);
    const injected = path.join(out, "AGENTS.md");
    await writeFile(injected, "injected");

    const error = await writePreview(plan).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).exitCode).toBe(ExitCode.NotOwned);
    expect((error as MetafabError).problems).toEqual([conflictProblem(injected)]);
    expect(await readFile(injected, "utf8")).toBe("injected");
    expect(await listFiles(out)).toEqual(["AGENTS.md"]);
  });

  test("conflicts when a destination directory appears after the preflight", async () => {
    const repo = await previewRepo();
    const out = repo.path("preview");
    await mkdir(out);
    const plan = await preview(repo.root, out);
    const injected = path.join(out, ".agents");
    await mkdir(injected);

    const error = await writePreview(plan).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).exitCode).toBe(ExitCode.NotOwned);
    expect((error as MetafabError).problems).toEqual([conflictProblem(injected)]);
    expect(await readdir(injected)).toEqual([]);
    expect(await readdir(out)).toEqual([".agents"]);
  });
});
