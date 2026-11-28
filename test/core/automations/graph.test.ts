import { afterEach, describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const FACTORY_YAML = "format: 2\nname: demo\n";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

/** An automation that runs after `names`, with optional extra frontmatter. */
function after(owner: string, names: string[], extra = ""): string {
  return `---
owner: "${owner}"
${extra}triggers:
  - after: [${names.join(", ")}]
---
Body.
`;
}

/** An automation with one schedule, so it is a valid named `after` target. */
function scheduled(owner: string, extra = ""): string {
  return `---
owner: "${owner}"
${extra}triggers:
  - schedule: { cron: "0 8 * * 1", tz: Australia/Sydney }
---
Body.
`;
}

async function problemsFor(files: Record<string, string>) {
  const repo = await makeRepo({ ".factory/factory.yaml": FACTORY_YAML, ...files });
  repos.push(repo);
  const factory = await loadFactory(repo.root);
  return factory.problems;
}

describe("after graph", () => {
  test("reports an automation that runs after itself", async () => {
    const problems = await problemsFor({
      ".factory/automations/intake/automation.md": after("*", ["intake"]),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 4,
        message: 'after names the automation itself: "intake"',
        fix: 'Remove "intake" from after',
      },
    ]);
  });

  test("reports an after name that is not an automation", async () => {
    const problems = await problemsFor({
      ".factory/automations/child/automation.md": after("*", ["ghost"]),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/child/automation.md",
        line: 4,
        message: 'after names unknown automation "ghost"',
        fix: "Name an automation in .factory/automations/, or add it",
      },
    ]);
  });

  test("reports a three-automation loop on each member, written from that member", async () => {
    const problems = await problemsFor({
      ".factory/automations/a/automation.md": after("*", ["b"]),
      ".factory/automations/b/automation.md": after("*", ["c"]),
      ".factory/automations/c/automation.md": after("*", ["a"]),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/a/automation.md",
        line: 3,
        message: "cycle: a → c → b → a",
        fix: "Remove one of the after entries in the loop",
      },
      {
        level: "error",
        file: ".factory/automations/b/automation.md",
        line: 3,
        message: "cycle: b → a → c → b",
        fix: "Remove one of the after entries in the loop",
      },
      {
        level: "error",
        file: ".factory/automations/c/automation.md",
        line: 3,
        message: "cycle: c → b → a → c",
        fix: "Remove one of the after entries in the loop",
      },
    ]);
  });

  test("reports a two-automation loop once per member", async () => {
    const problems = await problemsFor({
      ".factory/automations/a/automation.md": after("*", ["b"]),
      ".factory/automations/b/automation.md": after("*", ["a"]),
    });

    expect(problems.map((problem) => problem.message)).toEqual([
      "cycle: a → b → a",
      "cycle: b → a → b",
    ]);
  });
});

describe("owner chains", () => {
  test("allows the same owner in different letter case", async () => {
    const problems = await problemsFor({
      ".factory/automations/parent/automation.md": scheduled("mitch@example.com"),
      ".factory/automations/child/automation.md": after("Mitch@Example.COM", ["parent"]),
    });

    expect(problems).toEqual([]);
  });

  test('allows a "*" child after any parent', async () => {
    const problems = await problemsFor({
      ".factory/automations/parent/automation.md": scheduled("mitch@example.com"),
      ".factory/automations/child/automation.md": after("*", ["parent"]),
    });

    expect(problems).toEqual([]);
  });

  test('refuses a personal child after a "*" parent', async () => {
    const problems = await problemsFor({
      ".factory/automations/parent/automation.md": scheduled("*"),
      ".factory/automations/child/automation.md": after("kid@example.com", ["parent"]),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/child/automation.md",
        line: 4,
        message:
          'owner: kid@example.com cannot run after "parent", owned by *: a chained run starts in its parent\'s account',
        fix: 'Set owner to "*" or to *',
      },
    ]);
  });

  test("refuses a personal child after another person's parent", async () => {
    const problems = await problemsFor({
      ".factory/automations/parent/automation.md": scheduled("boss@example.com"),
      ".factory/automations/child/automation.md": after("kid@example.com", ["parent"]),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/child/automation.md",
        line: 4,
        message:
          'owner: kid@example.com cannot run after "parent", owned by boss@example.com: a chained run starts in its parent\'s account',
        fix: 'Set owner to "*" or to boss@example.com',
      },
    ]);
  });

  test("counts a disabled parent as a named target", async () => {
    const problems = await problemsFor({
      ".factory/automations/parent/automation.md": scheduled("mitch@example.com", "enabled: false\n"),
      ".factory/automations/child/automation.md": after("mitch@example.com", ["parent"]),
    });

    expect(problems).toEqual([]);
  });
});
