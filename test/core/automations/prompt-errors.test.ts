import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { isolateGitConfig } from "../hooks/helpers.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FACTORY_YAML = [
  "format: 2",
  "name: errors-demo",
  "",
  "env:",
  "  harness:",
  "    values: [amp, opencode]",
  "",
].join("\n");

const INTAKE = [
  "---",
  'owner: "*"',
  "triggers:",
  '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
  "---",
  "",
  "# intake",
  "",
  "Triage the backlog.",
  "",
].join("\n");

const FIRST = "Run the factory automation `intake` unattended. Nobody is watching this session.";

const repos: TempRepo[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
  savedEnvironment = Object.entries(process.env).filter(([key]) =>
    key.toUpperCase().startsWith("FACTORY_ENV_"),
  );
  for (const [key] of savedEnvironment) delete process.env[key];
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  isolation.restore();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

/** A format 2 factory with `intake` and any other files a case needs. */
async function factoryRepo(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo({
    ".factory/factory.yaml": FACTORY_YAML,
    ".factory/automations/intake/automation.md": INTAKE,
    ...files,
  });
  repos.push(repo);
  return repo;
}

function prompt(repo: TempRepo): ReturnType<typeof runCli> {
  return runCli(["automations", "prompt", "intake"], { cwd: repo.root, tty: false });
}

describe("metafab automations prompt: errors that stop it", () => {
  test("an error in run.md stops the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/run.md":
        "# Run instructions\n\n<!-- factory:when env.harness == amp -->\nAsk first.\n",
    });

    const result = await prompt(repo);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".factory/automations/run.md:3");
    expect(result.stderr).toContain("never closed");
  });

  test("an error in a partial that run.md imports stops the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/run.md":
        "# Run instructions\n\n<!-- factory:import ../partials/broken.md -->\n",
      ".factory/partials/broken.md":
        "<!-- factory:switch env.harness -->\n<!-- factory:case amp -->\nAmp only.\n",
    });

    const result = await prompt(repo);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".factory/partials/broken.md:1");
    expect(result.stderr).toContain("never closed");
  });

  test("an error in a partial that a partial imports stops the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/run.md":
        "# Run instructions\n\n<!-- factory:import ../partials/outer.md -->\n",
      ".factory/partials/outer.md": "# Outer\n\n<!-- factory:import inner.md -->\n",
      ".factory/partials/inner.md":
        "<!-- factory:when env.harness == opencode -->\nOpenCode only.\n",
    });

    const result = await prompt(repo);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".factory/partials/inner.md:1");
    expect(result.stderr).toContain("never closed");
  });

  test("an error in an automation on its after line stops the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/intake/automation.md":
        '---\nowner: "*"\ntriggers:\n  - after: [parent]\n---\n\n# intake\n\nTriage.\n',
      ".factory/automations/parent/automation.md":
        '---\nowner: "*"\ntriggers:\n  - schedule: { cron: "99 8 * * 1", tz: Australia/Sydney }\n---\n\n# parent\n\nPlan.\n',
    });

    const result = await prompt(repo);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".factory/automations/parent/automation.md:4");
    expect(result.stderr).toContain("99 is outside 0-59");
  });

  test("a loop through the automation stops the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/intake/automation.md":
        '---\nowner: "*"\ntriggers:\n  - after: [other]\n---\n\n# intake\n\nTriage.\n',
      ".factory/automations/other/automation.md":
        '---\nowner: "*"\ntriggers:\n  - after: [intake]\n---\n\n# other\n\nPlan.\n',
    });

    const result = await prompt(repo);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cycle: intake → other → intake");
  });

  test("an error in an unrelated automation does not stop the prompt", async () => {
    const repo = await factoryRepo({
      ".factory/automations/broken/automation.md":
        '---\nowner: "*"\ntriggers:\n  - schedule: { cron: "99 8 * * 1", tz: Australia/Sydney }\n---\n\n# broken\n\nPlan.\n',
    });

    const result = await prompt(repo);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout.startsWith(FIRST)).toBe(true);
  });
});

describe.skipIf(process.platform === "win32")(
  "metafab automations prompt: a symbolic link on the route",
  () => {
    /** run.md imports `.factory/partials/link.md`, a link to a broken partial. */
    async function linkedPartial(
      files: Record<string, string> = {},
    ): Promise<TempRepo> {
      const repo = await factoryRepo({
        ".factory/automations/run.md":
          "# Run instructions\n\n<!-- factory:import ../partials/link.md -->\n",
        ".factory/shared/real.md":
          "<!-- factory:when env.harness == amp -->\nAsk first.\n",
        ...files,
      });
      await mkdir(path.join(repo.root, ".factory/partials"), { recursive: true });
      await symlink(
        "../shared/real.md",
        path.join(repo.root, ".factory/partials/link.md"),
      );
      return repo;
    }

    test("an error in a symlinked partial stops the prompt under the name run.md imports", async () => {
      const repo = await linkedPartial();

      const result = await prompt(repo);

      expect(result.code).toBe(ExitCode.Failed);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(".factory/partials/link.md:1");
      expect(result.stderr).toContain("never closed");
    });

    test("the same broken partial imported only by another automation does not stop it", async () => {
      const repo = await linkedPartial({
        ".factory/automations/run.md": "# Run instructions\n\nAsk first.\n",
        ".factory/automations/other/automation.md": [
          "---",
          'owner: "*"',
          "triggers:",
          '  - schedule: { cron: "0 9 * * 1", tz: Australia/Sydney }',
          "---",
          "",
          "# other",
          "",
          "<!-- factory:import ../../partials/link.md -->",
          "",
        ].join("\n"),
      });

      const check = await runCli(["check", "--json"], { cwd: repo.root, tty: false });
      const reported = JSON.parse(check.stdout) as { problems?: { file: string }[] };
      expect(reported.problems?.some((problem) => problem.file === ".factory/partials/link.md")).toBe(
        true,
      );

      const result = await prompt(repo);

      expect(result.code, result.stderr).toBe(ExitCode.Ok);
      expect(result.stdout.startsWith(FIRST)).toBe(true);
    });
  },
);
