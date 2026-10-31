import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { prepareFab } from "../../../src/core/publish/index.js";
import type { PreparedFab } from "../../../src/core/publish/index.js";
import { MetafabError } from "../../../src/errors.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const BOTH_TARGETS = [
  "publish:",
  '  name: "@seasb/fab-demo"',
  "  git: git@github.com:acme/fab-demo.git",
  "  version: 1.2.0",
  "",
].join("\n");

const repos: TempRepo[] = [];
const prepared: PreparedFab[] = [];

afterEach(async () => {
  await Promise.all(prepared.splice(0).map((fab) => fab.cleanup()));
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function prepare(publish?: string): Promise<{ target: TempRepo; fab: PreparedFab }> {
  const target = await makePublishRepo(publish === undefined ? {} : { publish });
  repos.push(target);
  const { factory, config } = await loadRepo(target);
  const fab = await prepareFab(factory, config);
  prepared.push(fab);
  return { target, fab };
}

function fileSize(root: string, file: string): Promise<number> {
  return stat(path.join(root, ...file.split("/"))).then((info) => info.size);
}

describe("prepareFab", () => {
  test("reports the files, their total size and both targets", async () => {
    const { fab } = await prepare(BOTH_TARGETS);

    expect(fab.targets).toEqual(["npm", "git"]);
    expect(fab.files).toContain("README.md");
    expect(fab.files).toContain("package.json");
    expect(fab.files).toContain(".factory/skills/git/SKILL.md");
    expect(fab.files).not.toContain(".factory/metafab.yaml");
    expect(fab.files).not.toContain(".factory/README.md");
    expect([...fab.files].sort()).toEqual(fab.files);

    let size = 0;
    for (const file of fab.files) size += await fileSize(fab.root, file);
    expect(fab.size).toBe(size);

    expect(await readFile(path.join(fab.root, "README.md"), "utf8")).toBe("# Demo project readme\n");
    const packageJson = JSON.parse(
      await readFile(path.join(fab.root, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(packageJson).toMatchObject({
      name: "@seasb/fab-demo",
      version: "1.2.0",
      files: [".factory", "README.md"],
      metafab: { format: 1 },
    });
  });

  test("the Git target writes no package.json", async () => {
    const { fab } = await prepare(
      ["publish:", "  git: git@github.com:acme/fab-demo.git", "  version: 1.2.0", ""].join("\n"),
    );

    expect(fab.targets).toEqual(["git"]);
    expect(fab.files).not.toContain("package.json");
  });

  test("the npm target writes package.json and no Git files", async () => {
    const { fab } = await prepare();

    expect(fab.targets).toEqual(["npm"]);
    expect(fab.files).toContain("package.json");
  });

  test("the generated README lists only the staged skills", async () => {
    const target = await makePublishRepo({
      publish: [
        "publish:",
        '  name: "@seasb/fab-demo"',
        "  version: 1.2.0",
        "  exclude:",
        "    - skills/git",
        "",
      ].join("\n"),
    });
    repos.push(target);
    await rm(target.path(".factory", "README.md"));
    const { factory, config } = await loadRepo(target);

    const fab = await prepareFab(factory, config);
    prepared.push(fab);
    const readme = await readFile(path.join(fab.root, "README.md"), "utf8");

    expect(readme).toContain("- `plan` — Plan a slice. Use when starting.");
    expect(readme).not.toContain("`git`");
    expect(readme).not.toContain("Git conventions.");
  });

  test("cleanup removes the temporary fab", async () => {
    const { fab } = await prepare();

    await fab.cleanup();

    await expect(stat(fab.root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("refuses a repository without a publish section", async () => {
    const target = await makePublishRepo({ publish: "" });
    repos.push(target);
    const { factory, config } = await loadRepo(target);

    const error = (await prepareFab(factory, config).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-not-configured");
    expect(error.problems?.[0]?.file).toBe(".factory/metafab.yaml");
  });

  test("refuses a publish section without a version", async () => {
    const target = await makePublishRepo({
      publish: ["publish:", '  name: "@seasb/fab-demo"', ""].join("\n"),
    });
    repos.push(target);
    const { factory, config } = await loadRepo(target);

    const error = (await prepareFab(factory, config).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-missing-setting");
  });
});
