import { chmod, mkdir, readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TARGETS, loadConfig } from "../../../src/core/config.js";
import { unreadableConfigCode } from "../../../src/core/config/load.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const repos: TempRepo[] = [];

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockReset();
  vi.mocked(readFile).mockImplementation(actual.readFile);
});

afterEach(async () => {
  vi.mocked(readFile).mockReset();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

function readError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

describe("loadConfig", () => {
  test("a missing metafab.yaml is an empty config with defaults", async () => {
    const repo = await repoWith();

    const config = await loadConfig(repo.path(".factory"));

    expect(config.agents).toEqual(TARGETS);
    expect(config.metafabSkill).toBe(true);
    expect(config.problems).toEqual([]);
    expect(unreadableConfigCode(config)).toBeUndefined();
  });

  test("reads .factory/metafab.yaml below the given factory directory", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": "agents: []\nmetafab-skill: false\n" });

    const config = await loadConfig(repo.path(".factory"));

    expect(config.agents).toEqual([]);
    expect(config.metafabSkill).toBe(false);
    expect(unreadableConfigCode(config)).toBeUndefined();
  });

  test("reports invalid YAML without throwing", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": "agents: [claude\n" });

    const config = await loadConfig(repo.path(".factory"));

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.file).toBe(".factory/metafab.yaml");
    expect(config.problems[0]?.fix).toBe("Fix the YAML syntax on this line");
    expect(config.agents).toEqual(TARGETS);
    expect(unreadableConfigCode(config)).toBeUndefined();
  });

  test("reports an injected EIO as Cannot read and keeps the code", async () => {
    const repo = await repoWith();
    vi.mocked(readFile).mockRejectedValueOnce(readError("EIO", "i/o error, read"));

    const config = await loadConfig(repo.path(".factory"));

    expect(config.problems).toEqual([
      {
        level: "error",
        file: ".factory/metafab.yaml",
        line: 1,
        message: "Cannot read .factory/metafab.yaml",
        fix: "Check its permissions",
      },
    ]);
    expect(unreadableConfigCode(config)).toBe("EIO");
  });

  test("reports an injected ENOTDIR as unreadable too", async () => {
    const repo = await repoWith();
    vi.mocked(readFile).mockRejectedValueOnce(readError("ENOTDIR", "not a directory"));

    const config = await loadConfig(repo.path(".factory"));

    expect(config.problems[0]?.message).toBe("Cannot read .factory/metafab.yaml");
    expect(unreadableConfigCode(config)).toBe("ENOTDIR");
  });

  test("rethrows an error without a code instead of reporting a read problem", async () => {
    const repo = await repoWith();
    vi.mocked(readFile).mockRejectedValueOnce(new Error("something unexpected"));

    await expect(loadConfig(repo.path(".factory"))).rejects.toThrow("something unexpected");
  });

  test("a directory named metafab.yaml is a real EISDIR read problem", async () => {
    const repo = await repoWith();
    await mkdir(repo.path(".factory", "metafab.yaml"), { recursive: true });

    const config = await loadConfig(repo.path(".factory"));

    expect(config.problems[0]?.message).toBe("Cannot read .factory/metafab.yaml");
    expect(unreadableConfigCode(config)).toBe("EISDIR");
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "an unreadable metafab.yaml is one Cannot read problem, not a throw",
    async () => {
      const repo = await repoWith({ ".factory/metafab.yaml": "agents: []\n" });
      const configFile = repo.path(".factory", "metafab.yaml");
      await chmod(configFile, 0o000);

      try {
        const config = await loadConfig(repo.path(".factory"));

        expect(config.problems).toEqual([
          {
            level: "error",
            file: ".factory/metafab.yaml",
            line: 1,
            message: "Cannot read .factory/metafab.yaml",
            fix: "Check its permissions",
          },
        ]);
        expect(config.agents).toEqual(TARGETS);
        expect(config.metafabSkill).toBe(true);
        expect(unreadableConfigCode(config)).toBe("EACCES");
      } finally {
        await chmod(configFile, 0o644);
      }
    },
  );
});
