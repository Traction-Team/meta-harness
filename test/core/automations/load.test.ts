import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig } from "../../../src/core/config/load.js";
import { planBuild } from "../../../src/core/build/index.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/automations/", import.meta.url));
const FACTORY_YAML = "format: 2\nname: demo\n";

const VALID = `---
owner: "*"
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---
Body.
`;

const repos: TempRepo[] = [];

async function tempFactory(files: Record<string, string | Uint8Array> = {}): Promise<TempRepo> {
  const repo = await makeRepo({ ".factory/factory.yaml": FACTORY_YAML, ...files });
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

describe("loadAutomations", () => {
  test("loads the valid fixture's automations, run.md and bodies", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "valid"));

    expect(factory.problems).toEqual([]);
    expect(factory.automations?.runFile).toBe(".factory/automations/run.md");

    const list = factory.automations?.list ?? [];
    expect(list.map((automation) => automation.name)).toEqual(["intake", "plan-intake"]);

    const intake = list[0]!;
    expect(intake).toMatchObject({
      file: ".factory/automations/intake/automation.md",
      owner: "*",
      description: "Triage the intake backlog",
      enabled: true,
      checkout: "worktree",
      bodyLine: 7,
      triggersLine: 4,
    });
    expect(intake.triggers).toEqual([
      { kind: "schedule", cron: "0 8 * * 1,4", tz: "Australia/Sydney", line: 5 },
    ]);
    expect(intake.body).toContain("# intake");

    const follower = list[1]!;
    expect(follower.checkout).toBe("main");
    expect(follower.description).toBeUndefined();
    expect(follower.triggers).toEqual([{ kind: "after", names: ["intake"], line: 6 }]);
  });

  test("reads a CRLF automation.md and keeps its body LF", async () => {
    const source = await readFile(path.join(FIXTURES, "crlf-automation.md"));
    expect(source.includes(Buffer.from("\r\n"))).toBe(true);

    const repo = await tempFactory({ ".factory/automations/intake/automation.md": source });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([]);
    const intake = factory.automations?.list[0];
    expect(intake?.body.includes("\r")).toBe(false);
    expect(intake?.triggers).toEqual([
      { kind: "schedule", cron: "0 8 * * 1,4", tz: "Australia/Sydney", line: 4 },
    ]);
  });

  test("rejects a BOM automation.md as a skill's frontmatter would", async () => {
    const source = await readFile(path.join(FIXTURES, "bom-automation.md"));
    expect(source[0]).toBe(0xef);

    const repo = await tempFactory({ ".factory/automations/intake/automation.md": source });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 1,
        message: "Missing frontmatter: the file must start with '---'",
        fix: "Add a frontmatter block that starts with --- and ends with ---",
      },
    ]);
    expect(factory.automations?.list).toEqual([]);
  });

  test("reports a SKILL.md below automations/ and build installs nothing from it", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "skill-below"));

    expect(factory.skills).toEqual([]);
    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/SKILL.md",
        line: 1,
        message: "SKILL.md is not allowed below .factory/automations/",
        fix: "Move the skill out of .factory/automations/: build never installs anything from it",
      },
    ]);
    expect(factory.automations?.list.map((automation) => automation.name)).toEqual(["intake"]);

    const config = await loadConfig(factory.dir);
    const plan = await planBuild(factory, config, "2.0.0");
    expect(plan.writes.some((write) => write.path.includes("automations"))).toBe(false);
    expect(plan.writes.some((write) => write.path.includes("intake"))).toBe(false);
  });

  test("build installs nothing from a factory's automations", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "valid"));
    const config = await loadConfig(factory.dir);
    const plan = await planBuild(factory, config, "2.0.0");

    expect(plan.errors).toEqual([]);
    const installed = plan.writes.map((write) => write.path);
    expect(installed.some((file) => file.includes("automations"))).toBe(false);
    expect(
      installed.some((file) => file.includes("/intake/") || file.includes("/plan-intake/")),
    ).toBe(false);
  });

  test("reports every layout rule with file and line", async () => {
    const repo = await tempFactory({
      ".factory/automations/notes.txt": "not an automation\n",
      ".factory/automations/empty/readme.md": "no automation here\n",
      ".factory/automations/Bad_Name/automation.md": VALID,
      ".factory/automations/.hidden/SKILL.md": "ignored\n",
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/Bad_Name",
        line: 1,
        message: 'Automation name "Bad_Name" is not a valid Agent Skill name',
        fix: "Use a name like 'bad-name'",
      },
      {
        level: "error",
        file: ".factory/automations/empty",
        line: 1,
        message: 'Automation "empty" has no automation.md',
        fix: "Add .factory/automations/empty/automation.md, or remove the directory",
      },
      {
        level: "error",
        file: ".factory/automations/notes.txt",
        line: 1,
        message: ".factory/automations/notes.txt is not allowed directly in .factory/automations/",
        fix: "Only run.md may sit there; move it into an automation's directory or remove it",
      },
    ]);
    expect(factory.automations?.list.map((automation) => automation.name)).toEqual(["Bad_Name"]);
  });

  test("reports a SKILL.md in a directory beside automation.md", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": VALID,
      ".factory/automations/intake/nested/SKILL.md": "---\nname: nested\n---\n",
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/nested/SKILL.md",
        line: 1,
        message: "SKILL.md is not allowed below .factory/automations/",
        fix: "Move the skill out of .factory/automations/: build never installs anything from it",
      },
    ]);
  });

  test("reads enabled: false and the default checkout", async () => {
    const repo = await tempFactory({
      ".factory/automations/off/automation.md": `---
owner: "*"
enabled: false
triggers:
  - schedule: { cron: "0 8 * * 1", tz: Australia/Sydney }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([]);
    expect(factory.automations?.list[0]).toMatchObject({
      name: "off",
      enabled: false,
      checkout: "worktree",
    });
  });

  test("reports duplicate frontmatter keys as a grammar problem", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": '---\nowner: "*"\nowner: "*"\n---\nBody.\n',
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 3,
        message: "Map keys must be unique",
        fix: "Fix the YAML syntax on this line",
      },
    ]);
    expect(factory.automations?.list).toEqual([]);
  });
});

describe("automation.md frontmatter", () => {
  test("reports unknown keys and an owner that is not one email", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: one@example.com, two@example.com
colour: blue
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 3,
        message: 'Unknown key "colour" in automation.md',
        fix: "Remove the key or use owner, description, enabled, checkout, triggers",
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 2,
        message: '"owner" must be "*" or one email address',
        fix: 'Set owner: "*" or the email of the account that runs it',
      },
    ]);
    expect(factory.automations?.list).toEqual([]);
  });

  test("reports a missing owner and a missing triggers list", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": "---\ndescription: Only a description\n---\nBody.\n",
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 1,
        message: 'automation.md is missing "owner"',
        fix: 'Add owner: "*" or owner: <email>',
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 1,
        message: 'automation.md is missing "triggers"',
        fix: "Add a triggers list with a schedule or after entry",
      },
    ]);
  });

  test("reports a bad enabled, checkout and description", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
enabled: "yes"
checkout: branch
description: |
  Two
  lines
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 5,
        message: '"description" must be a single line',
        fix: "Write the description on one line",
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 3,
        message: '"enabled" must be true or false',
        fix: "Write enabled: true or enabled: false",
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: '"checkout" must be worktree or main',
        fix: "Write checkout: worktree or checkout: main",
      },
    ]);
  });

  test("reports an email address outside owner, including a nested one", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
description: Ask mitch@example.com to review
triggers:
  - after: ["mitch@example.com"]
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 3,
        message: '"description" holds an email address, and only "owner" may',
        fix: 'Remove the email address from "description", or move it to owner',
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: '"triggers" holds an email address, and only "owner" may',
        fix: 'Remove the email address from "triggers", or move it to owner',
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 5,
        message: 'after names unknown automation "mitch@example.com"',
        fix: "Name an automation in .factory/automations/, or add it",
      },
    ]);
  });
});

describe("automation triggers", () => {
  test("reports a trigger that is not exactly one of schedule or after", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
triggers:
  - {}
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
    after: [intake]
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: 'A trigger must have exactly one of "schedule" or "after"',
        fix: 'Write - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney } or - after: [<name>]',
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 5,
        message: 'A trigger must have exactly one of "schedule" or "after"',
        fix: 'Write - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney } or - after: [<name>]',
      },
    ]);
  });

  test("reports a second schedule trigger", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
  - schedule: { cron: "0 9 * * 1", tz: Australia/Sydney }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 5,
        message: "An automation has at most one schedule trigger",
        fix: "Write several times in one cron, such as 0 8,17 * * 1-5",
      },
    ]);
  });

  test("reports two equal triggers", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": VALID,
      ".factory/automations/follower/automation.md": `---
owner: "*"
triggers:
  - after: [intake]
  - after: [intake]
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/follower/automation.md",
        line: 5,
        message: "Two triggers are equal",
        fix: "Remove one of them",
      },
    ]);
  });

  test("reports a bad cron and an unknown time zone on the trigger's fields", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
triggers:
  - schedule: { cron: "99 8 * * 1", tz: Mars/Olympus }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: 'the cron "99 8 * * 1" has a bad minute part "99": 99 is outside 0-59',
        fix: "Write five fields: minute hour day of month month day of week",
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: '"Mars/Olympus" is not an IANA time zone',
        fix: "Use an IANA zone, such as Australia/Sydney",
      },
    ]);
  });

  test("reports a schedule missing cron or tz", async () => {
    const repo = await tempFactory({
      ".factory/automations/intake/automation.md": `---
owner: "*"
triggers:
  - schedule: { cron: "0 8 * * 1,4", name: morning }
---
Body.
`,
    });
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: 'Unknown key "name" in schedule',
        fix: "Use cron and tz",
      },
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: 'schedule is missing "tz"',
        fix: "Add tz: Australia/Sydney",
      },
    ]);
  });
});
