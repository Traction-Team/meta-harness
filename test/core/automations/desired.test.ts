import { afterEach, describe, expect, test } from "vitest";
import { desiredSet, isManaged } from "../../../src/core/automations/index.js";
import { stubMarker } from "../../../src/core/automations/stub.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { MetafabError } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

interface Definition {
  owner?: string;
  enabled?: boolean;
  checkout?: "worktree" | "main";
  cron?: string;
  after?: string[];
}

function automationFile(definition: Definition): string {
  const lines = ["---", `owner: "${definition.owner ?? "*"}"`];
  if (definition.enabled === false) lines.push("enabled: false");
  if (definition.checkout !== undefined) lines.push(`checkout: ${definition.checkout}`);
  if (definition.after !== undefined) {
    lines.push("triggers:", `  - after: [${definition.after.join(", ")}]`);
  } else {
    lines.push(
      "triggers:",
      `  - schedule: { cron: "${definition.cron ?? "0 8 * * 1,4"}", tz: Australia/Sydney }`,
    );
  }
  lines.push("---", "", "Do the work.", "");
  return lines.join("\n");
}

const repos: TempRepo[] = [];

async function factoryWith(definitions: Record<string, Definition>): Promise<TempRepo> {
  const files: Record<string, string> = {
    ".factory/factory.yaml": "format: 2\nname: dragonfly\n",
  };
  for (const [name, definition] of Object.entries(definitions)) {
    files[`.factory/automations/${name}/automation.md`] = automationFile(definition);
  }
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

describe("desiredSet", () => {
  test("takes the enabled scheduled automations this account owns, in name order", async () => {
    const repo = await factoryWith({
      intake: { owner: "*" },
      personal: { owner: "Owner@Example.com", checkout: "main" },
      "someone-else": { owner: "other@example.com" },
    });
    const factory = await loadFactory(repo.root);

    const entries = await desiredSet(factory, "orca", "owner@example.com", "main");

    expect(entries.map((entry) => entry.name)).toEqual(["intake", "personal"]);
    expect(entries[0]).toMatchObject({
      title: "automation: intake",
      cron: "0 8 * * 1,4",
      tz: "Australia/Sydney",
      checkout: "worktree",
    });
    expect(entries[0]!.stub.startsWith(stubMarker("intake", "dragonfly"))).toBe(true);
    expect(entries[0]!.stub).toContain("--target orca");
    expect(entries[1]!.checkout).toBe("main");
  });

  test("leaves out a disabled, after-only or other owner's automation", async () => {
    const repo = await factoryWith({
      everyone: { owner: "*" },
      disabled: { owner: "*", enabled: false },
      follower: { owner: "*", after: ["everyone"] },
      other: { owner: "other@example.com" },
    });
    const factory = await loadFactory(repo.root);

    const entries = await desiredSet(factory, "orca", "someone@example.com", "main");

    expect(entries.map((entry) => entry.name)).toEqual(["everyone"]);
  });

  test("stops with the automation problems before returning a set", async () => {
    const repo = await factoryWith({
      intake: { owner: "*" },
      broken: { owner: "*", cron: "99 8 * * 1" },
    });
    const factory = await loadFactory(repo.root);

    const failure = await desiredSet(factory, "orca", "owner@example.com", "main").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(MetafabError);
    const error = failure as MetafabError;
    expect(error.exitCode).toBe(1);
    expect(error.problems?.map((problem) => problem.message).join("\n")).toContain(
      "99 is outside 0-59",
    );
  });
});

describe("isManaged", () => {
  const prompt = (name: string, factory: string): string =>
    `${stubMarker(name, factory)}\n\n1. Do the work.\n`;

  test("names the automation a matching title and marker belong to", () => {
    expect(isManaged({ title: "automation: intake", prompt: prompt("intake", "dragonfly") }, "dragonfly")).toBe(
      "intake",
    );
  });

  test("refuses a marker that names another factory", () => {
    expect(
      isManaged({ title: "automation: intake", prompt: prompt("intake", "dragonfly") }, "other"),
    ).toBeUndefined();
  });

  test("refuses a first line that differs by one word", () => {
    const wrong = `${stubMarker("intake", "dragonfly").replace("Run the", "Start the")}\n\nDo it.\n`;
    expect(isManaged({ title: "automation: intake", prompt: wrong }, "dragonfly")).toBeUndefined();
  });

  test("refuses a title for another name", () => {
    expect(
      isManaged({ title: "automation: other", prompt: prompt("intake", "dragonfly") }, "dragonfly"),
    ).toBeUndefined();
  });

  test("refuses a title that is not an automation's", () => {
    expect(
      isManaged({ title: "intake", prompt: prompt("intake", "dragonfly") }, "dragonfly"),
    ).toBeUndefined();
  });
});
