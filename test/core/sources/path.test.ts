import { cp, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { fetchFab, parseSource, resolve } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";
import { runGitIn } from "./git-fixture.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

let root: string;
let sourceParent: string;

function pathSource(value: string): ReturnType<typeof parseSource> {
  return parseSource(value, { cwd: root });
}

async function fetchSource(
  value: string,
  options: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<typeof fetchFab>>> {
  return fetchFab(await resolve(pathSource(value)), options);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "metafab-path-"));
  sourceParent = path.join(root, "fab-acme");
  await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(sourceParent, ".factory"), {
    recursive: true,
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local path sources", () => {
  test("fetches a directory that contains .factory", async () => {
    const fetched = await fetchSource(sourceParent);

    expect(fetched.upstream).toEqual({ kind: "unversioned", source: sourceParent });
    expect(fetched.versioned).toBe(false);
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
  });

  test("fetches a .factory directory directly", async () => {
    const direct = path.join(sourceParent, ".factory");
    const fetched = await fetchSource(direct);

    expect(fetched.upstream).toEqual({ kind: "unversioned", source: direct });
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
  });

  test("records a relative source as it was given", async () => {
    const fetched = await fetchSource("./fab-acme");

    expect(fetched.upstream).toEqual({ kind: "unversioned", source: "./fab-acme" });
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
  });

  test("copies the factory so the source and the copy are isolated", async () => {
    const fetched = await fetchSource(sourceParent);
    const sourceAgents = path.join(sourceParent, ".factory", "AGENTS.md");
    const copiedAgents = path.join(fetched.factoryDir, "AGENTS.md");
    const original = await readFile(sourceAgents, "utf8");

    await writeFile(sourceAgents, "# Changed at the source\n");
    expect(await readFile(copiedAgents, "utf8")).toBe(original);

    await writeFile(copiedAgents, "# Changed in the copy\n");
    expect(await readFile(sourceAgents, "utf8")).toBe("# Changed at the source\n");

    await writeFile(path.join(sourceParent, ".factory", "new-local.md"), "new\n");
    expect(await pathExists(path.join(fetched.factoryDir, "new-local.md"))).toBe(false);
  });

  test("fails with exit 3 when the path does not exist", async () => {
    await expect(fetchSource(path.join(root, "missing-fab"))).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("names the git+file:// form for a bare Git repository", async () => {
    const repo = path.join(root, "fab.git");
    await runGitIn(root, ["init", "-q", "--bare", repo]);

    try {
      await fetchSource(repo);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.FetchFailed);
      expect(failure.code).toBe("fetch-failed");
      expect(failure.message).toContain("it is a bare Git repository");
      expect(failure.message).toContain(`git+${pathToFileURL(repo).href}`);
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("keeps the missing .factory message for a directory that is not a repository", async () => {
    const empty = path.join(root, "empty");
    await mkdir(empty, { recursive: true });

    try {
      await fetchSource(empty);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.message).toContain("the .factory directory does not exist");
      expect(failure.message).not.toContain("bare Git repository");
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("rejects a symlink that points outside the factory with exit 4", async () => {
    await writeFile(path.join(root, "outside.txt"), "outside\n");
    await symlink(path.join(root, "outside.txt"), path.join(sourceParent, ".factory", "link.md"));

    try {
      await fetchSource(sourceParent);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(failure.problems?.some((problem) => problem.message.includes("links"))).toBe(true);
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("allows a symlink whose target stays inside the factory", async () => {
    const templates = path.join(sourceParent, ".factory", "templates");
    await mkdir(path.join(templates, "base"), { recursive: true });
    await writeFile(path.join(templates, "base", "notes.md"), "base\n");
    await symlink("base", path.join(templates, "base-link"));

    const fetched = await fetchSource(sourceParent);

    expect(
      await readFile(path.join(fetched.factoryDir, "templates", "base-link", "notes.md"), "utf8"),
    ).toBe("base\n");
  });

  test("reports a dangling symbolic link once", async () => {
    await symlink("missing.md", path.join(sourceParent, ".factory", "dangling.md"));

    try {
      await fetchSource(sourceParent);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const problems = (error as MetafabError).problems ?? [];
      expect(problems).toHaveLength(1);
      expect(problems[0]?.message).toContain("does not exist");
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("cleanup removes the temporary fetch directory", async () => {
    const fetched = await fetchSource(sourceParent);
    const temporary = path.dirname(fetched.factoryDir);
    expect(await pathExists(temporary)).toBe(true);

    await fetched.cleanup?.();

    expect(await pathExists(temporary)).toBe(false);
  });

  test("cleanup never throws when the directory is already gone", async () => {
    const fetched = await fetchSource(sourceParent);
    await rm(path.dirname(fetched.factoryDir), { recursive: true, force: true });

    await expect(fetched.cleanup?.()).resolves.toBeUndefined();
  });

  test("rejects a chain of symlinks that leaves the factory with exit 4", async () => {
    const factory = path.join(sourceParent, ".factory");
    await writeFile(path.join(sourceParent, "outside"), "outside\n");
    await symlink(".", path.join(factory, "b"), "dir");
    await symlink("b/../outside", path.join(factory, "a"));

    try {
      await fetchSource(sourceParent);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(failure.problems?.some((problem) => problem.message.includes("links"))).toBe(true);
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("allows a link to a name that only begins with two dots", async () => {
    const factory = path.join(sourceParent, ".factory");
    await writeFile(path.join(factory, "..notes.md"), "notes\n");
    await symlink("..notes.md", path.join(factory, "notes-link.md"));

    const fetched = await fetchSource(sourceParent);

    expect(await readFile(path.join(fetched.factoryDir, "notes-link.md"), "utf8")).toBe(
      "notes\n",
    );
  });

  test("allows a hard link inside the factory", async () => {
    const factory = path.join(sourceParent, ".factory");
    await writeFile(path.join(factory, "hard-a.md"), "shared\n");
    await link(path.join(factory, "hard-a.md"), path.join(factory, "hard-b.md"));

    const fetched = await fetchSource(sourceParent);

    expect(await readFile(path.join(fetched.factoryDir, "hard-a.md"), "utf8")).toBe("shared\n");
    expect(await readFile(path.join(fetched.factoryDir, "hard-b.md"), "utf8")).toBe("shared\n");
  });

  test("accepts a format 2 factory and its env", async () => {
    await writeFile(
      path.join(sourceParent, ".factory", "factory.yaml"),
      [
        "format: 2",
        "name: sample-fab",
        "pipeline:",
        "  - sample-workflow",
        "env:",
        "  harness:",
        "    values: [amp, claude]",
        "",
      ].join("\n"),
    );

    const fetched = await fetchSource(sourceParent);

    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
  });

  test("refuses an unknown factory format with the upgrade fix", async () => {
    await writeFile(
      path.join(sourceParent, ".factory", "factory.yaml"),
      "format: 3\nname: sample-fab\n",
    );

    await expect(fetchSource(sourceParent)).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: [
        {
          message: "Unknown factory format 3",
          fix: "Use format 1 or 2, or upgrade @seasb/metafab",
        },
      ],
    });
  });

  test("rejects an oversize file with exit 4", async () => {
    await writeFile(
      path.join(sourceParent, ".factory", "large.bin"),
      Buffer.alloc(1024 * 1024 + 1),
    );

    await expect(fetchSource(sourceParent)).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });

  test("rejects a factory with more files than the cap", async () => {
    for (const name of ["one.md", "two.md", "three.md"]) {
      await writeFile(path.join(sourceParent, ".factory", name), `${name}\n`);
    }

    try {
      await fetchSource(sourceParent, { maxEntries: 2 });
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(
        failure.problems?.some((problem) =>
          problem.message.includes("more than 2 files, directories and links"),
        ),
      ).toBe(true);
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("counts directories against the entry cap, like an archive does", async () => {
    const tinyParent = path.join(root, "tiny-fab");
    await mkdir(path.join(tinyParent, ".factory"), { recursive: true });
    await writeFile(path.join(tinyParent, ".factory", "factory.yaml"), "format: 1\n");
    for (const name of ["one", "two"]) {
      await mkdir(path.join(tinyParent, ".factory", name), { recursive: true });
      await writeFile(path.join(tinyParent, ".factory", name, "notes.md"), `${name}\n`);
    }

    // Three files in two directories: uncounted directories keep this under the
    // cap of three, counted directories take it to five.
    try {
      await fetchSource(tinyParent, { maxEntries: 3 });
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(
        failure.problems?.some((problem) =>
          problem.message.includes("more than 3 files, directories and links"),
        ),
      ).toBe(true);
      return;
    }
    throw new Error("expected the fetch to fail");
  });

  test("counts links against the entry cap, like an archive does", async () => {
    const factory = path.join(sourceParent, ".factory");
    for (let index = 0; index < 20; index += 1) {
      await symlink("AGENTS.md", path.join(factory, `link-${index}.md`));
    }

    // Five files and directories plus twenty links: the links alone cross a cap
    // of five, so a cap that counts only regular files lets all of them through.
    await expect(fetchSource(sourceParent, { maxEntries: 5 })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });

  test("rejects a factory with more bytes in total than the cap", async () => {
    await writeFile(path.join(sourceParent, ".factory", "one.bin"), Buffer.alloc(600, 1));
    await writeFile(path.join(sourceParent, ".factory", "two.bin"), Buffer.alloc(600, 2));

    try {
      await fetchSource(sourceParent, { maxTotalSize: 1000 });
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(failure.problems?.some((problem) => problem.message.includes("in total"))).toBe(true);
      return;
    }
    throw new Error("expected the fetch to fail");
  });
});
