import { mkdir, readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { CONFIG_FILE, TARGETS, loadConfig, parseConfig } from "../../../src/core/config.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

const fixture = (name: string): URL => new URL(`../../fixtures/config/${name}`, import.meta.url);

interface FixtureCase {
  fixture: string;
  level: "error" | "warning";
  message: RegExp;
  line: number;
}

const fixtureCases: FixtureCase[] = [
  {
    fixture: "rule-01-invalid-yaml.yaml",
    level: "error",
    message: /^Invalid YAML:/,
    line: 2,
  },
  {
    fixture: "rule-02-unknown-key.yaml",
    level: "error",
    message: /Unknown key "publush"\..*Did you mean "publish"\?/,
    line: 1,
  },
  {
    fixture: "rule-03-wrong-type.yaml",
    level: "error",
    message: /"agents" must be a list of targets or "all"\./,
    line: 1,
  },
  {
    fixture: "rule-04-unknown-target.yaml",
    level: "error",
    message: /Unknown target "claud" in "agents"\..*Did you mean "claude"\?/,
    line: 1,
  },
  {
    fixture: "rule-05-publish-missing-version.yaml",
    level: "error",
    message: /"publish" requires "version"\./,
    line: 1,
  },
  {
    fixture: "rule-06-invalid-package-name.yaml",
    level: "error",
    message: /"publish\.name" is not a valid npm package name/,
    line: 2,
  },
  {
    fixture: "rule-07-invalid-git-url.yaml",
    level: "error",
    message: /"publish\.git" is not a Git URL\./,
    line: 2,
  },
  {
    fixture: "rule-08-branch-without-git.yaml",
    level: "error",
    message: /"publish\.branch" requires "publish\.git"\./,
    line: 3,
  },
  {
    fixture: "rule-09-invalid-version.yaml",
    level: "error",
    message: /"publish\.version" is not a semantic version: "1\.2"\./,
    line: 3,
  },
  {
    fixture: "rule-10-readme-missing.yaml",
    level: "error",
    message: /"publish\.readme" file not found: docs\/missing\.md\./,
    line: 4,
  },
  {
    fixture: "rule-11-upstream-missing-source.yaml",
    level: "error",
    message: /"upstream" requires "source"\./,
    line: 1,
  },
  {
    fixture: "duplicate-target.yaml",
    level: "warning",
    message: /Duplicate target "codex" in "agents"\./,
    line: 1,
  },
];

describe("validation fixtures", () => {
  for (const fixtureCase of fixtureCases) {
    test(`${fixtureCase.fixture} reports exactly one ${fixtureCase.level}`, async () => {
      const text = await readFile(fixture(fixtureCase.fixture), "utf8");
      const repo = await repoWith({ ".factory/metafab.yaml": text });

      const config = await loadConfig(repo.path(".factory"));

      expect(config.problems).toHaveLength(1);
      const problem = config.problems[0]!;
      expect(problem.level).toBe(fixtureCase.level);
      expect(problem.file).toBe(CONFIG_FILE);
      expect(problem.line).toBe(fixtureCase.line);
      expect(problem.message).toMatch(fixtureCase.message);
    });
  }
});

describe("the spec example", () => {
  test("parses with no problems and the expected model", async () => {
    const text = await readFile(fixture("spec-example.yaml"), "utf8");

    const config = parseConfig(text);

    expect(config.problems).toEqual([]);
    expect(config.agents).toEqual(["claude", "codex"]);
    expect(config.metafabSkill).toBe(true);
    expect(config.publish).toEqual({
      name: "@seasb/fab-mark4",
      git: "git@github.com:seasb/fab-mark4.git",
      branch: "main",
      version: "1.2.0",
      description: "Plan, build, and review work in slices with a person at each decision.",
      license: "MIT",
      access: "public",
      readme: "docs/fab-readme.md",
      keywords: ["planning", "review"],
      exclude: ["skills/our-api/**", "workflows/deploy-production/**"],
    });
    expect(config.upstream).toEqual({
      kind: "npm",
      source: "@seasb/fab-base",
      requested: "^2.0.0",
      version: "2.1.0",
    });
  });
});

describe("rule 7: Git URLs", () => {
  test.each([
    "git@github.com:seasb/fab-mark4.git",
    "ssh://git@github.com/seasb/fab-mark4.git",
    "git+ssh://git@github.com/seasb/fab-mark4.git",
    "https://github.com/seasb/fab-mark4.git",
    "git+https://github.com/seasb/fab-mark4.git",
    "file:///tmp/fab-mark4.git",
    "git+file:///tmp/fab-mark4.git",
    // Git reads `#` literally in a file path, so the README encodes it to keep
    // it out of the ref.
    "file:///srv/my#fab-mark4.git",
    "git+file:///srv/my#fab-mark4.git",
    "file://localhost/tmp/fab-mark4.git",
    "git+file://localhost/tmp/fab-mark4.git",
    // Its userinfo is a credential: the README drops it, leaving `localhost`,
    // which `import` accepts.
    "file://user:token@localhost/tmp/fab-mark4.git",
    "file:///C:/fabs/fab-mark4.git",
    `file://C:\\fabs\\fab-mark4.git`,
  ])("accepts %s", (url) => {
    const config = parseConfig(`publish:\n  git: ${url}\n  version: 1.2.0\n`);

    expect(config.problems).toEqual([]);
  });

  test("rejects a URL that is not a Git URL", () => {
    const config = parseConfig("publish:\n  git: ftp://example.com/fab.git\n  version: 1.2.0\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toBe(`"publish.git" is not a Git URL.`);
    expect(config.problems[0]?.fix).toBe(
      "Use git@host:path, ssh://, git+ssh://, https://, git+https://, file:// or git+file://.",
    );
  });

  test.each(["file://machine/tmp/fab.git", "git+file://machine/tmp/fab.git"])(
    "rejects %s, a file URL that names a host",
    (url) => {
      // Git ignores the host of a file URL and reads the path, so publish would
      // succeed; the generated README would then name an `import` that refuses
      // the host. The URL is refused where it is written instead, with a fix
      // that says how a path is written rather than repeating "use file://".
      const config = parseConfig(`publish:\n  git: ${url}\n  version: 1.2.0\n`);

      expect(config.problems).toHaveLength(1);
      expect(config.problems[0]?.message).toBe(`"publish.git" names a host in a file URL.`);
      expect(config.problems[0]?.fix).toBe(
        "Write the path with three slashes, such as file:///srv/fabs/fab.git.",
      );
    },
  );
});

describe("rule 9: semantic versions", () => {
  test.each(["1.2.0", "0.0.1", "2.0.0-beta.1", "v1.2.0"])("accepts %s", (version) => {
    const config = parseConfig(`publish:\n  name: "@seasb/fab-mark4"\n  version: "${version}"\n`);

    expect(config.problems).toEqual([]);
  });
});

describe("rule 2: unknown keys", () => {
  test("suggests the closest top-level key", () => {
    const config = parseConfig("publush:\n  name: example\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toContain(`Did you mean "publish"?`);
  });

  test("suggests the closest key inside publish", () => {
    const config = parseConfig(
      "publish:\n  nme: example\n  name: '@seasb/fab-mark4'\n  version: 1.2.0\n",
    );

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toContain(`Did you mean "name"?`);
  });

  test("suggests the closest key inside upstream", () => {
    const config = parseConfig(
      "upstream:\n  surce: example\n  source: '@seasb/fab-base'\n  version: 1.2.0\n",
    );

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toContain(`Did you mean "source"?`);
  });

  test.each([
    ["true: x\n", `Unknown key "true".`],
    ["1: x\n", `Unknown key "1".`],
    [
      "publish:\n  name: '@seasb/fab-mark4'\n  version: 1.2.0\n  true: x\n",
      `Unknown key "true" in "publish".`,
    ],
    [
      "upstream:\n  source: '@seasb/fab-base'\n  version: 1.2.0\n  1: x\n",
      `Unknown key "1" in "upstream".`,
    ],
  ])("reports a non-string key in %s", (text, message) => {
    const config = parseConfig(text);

    expect(config.problems.map((problem) => problem.message)).toContain(message);
  });
});

describe("aliases", () => {
  test("accepts an agents alias that resolves to a target name", () => {
    const config = parseConfig(
      [
        "publish:",
        "  name: '@seasb/fab-mark4'",
        "  version: 1.2.0",
        "  description: &target claude",
        "agents: [*target]",
        "",
      ].join("\n"),
    );

    expect(config.problems).toEqual([]);
    expect(config.agents).toEqual(["claude"]);
  });
});

describe("rule 5: publish requirements", () => {
  test("accepts a publish with only a name", () => {
    const config = parseConfig("publish:\n  name: '@seasb/fab-mark4'\n  version: 1.2.0\n");

    expect(config.problems).toEqual([]);
  });

  test("accepts a publish with only a git URL", () => {
    const config = parseConfig("publish:\n  git: git@github.com:seasb/fab-mark4.git\n  version: 1.2.0\n");

    expect(config.problems).toEqual([]);
  });

  test("requires a name or a git URL", () => {
    const config = parseConfig("publish:\n  version: 1.2.0\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toBe(`"publish" requires "name" or "git".`);
  });
});

describe("rule 10: readme", () => {
  const config = (readme: string): string =>
    `publish:\n  name: "@seasb/fab-mark4"\n  version: 1.2.0\n  readme: ${JSON.stringify(readme)}\n`;

  test("accepts a repository-relative readme that exists", async () => {
    const repo = await repoWith({
      ".factory/metafab.yaml": config("docs/fab-readme.md"),
      "docs/fab-readme.md": "# Fab\n",
    });

    const loaded = await loadConfig(repo.path(".factory"));

    expect(loaded.problems).toEqual([]);
  });

  test("reports a repository-relative readme that does not exist", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": config("docs/fab-readme.md") });

    const loaded = await loadConfig(repo.path(".factory"));

    expect(loaded.problems).toHaveLength(1);
    expect(loaded.problems[0]?.message).toBe(`"publish.readme" file not found: docs/fab-readme.md.`);
  });

  test("checks an absolute readme as given", async () => {
    const missing = await repoWith({ ".factory/metafab.yaml": "" });
    await writeFile(
      missing.path(".factory", "metafab.yaml"),
      config(missing.path("docs", "fab-readme.md")),
    );
    expect((await loadConfig(missing.path(".factory"))).problems).toHaveLength(1);

    const present = await repoWith({ ".factory/metafab.yaml": "" });
    await writeFile(
      present.path(".factory", "metafab.yaml"),
      config(present.path("docs", "fab-readme.md")),
    );
    await mkdir(present.path("docs"), { recursive: true });
    await writeFile(present.path("docs", "fab-readme.md"), "# Fab\n");
    expect((await loadConfig(present.path(".factory"))).problems).toEqual([]);
  });

  test("does not check the readme without a repository root", () => {
    const config = parseConfig("publish:\n  name: '@seasb/fab-mark4'\n  version: 1.2.0\n  readme: missing.md\n");

    expect(config.problems).toEqual([]);
  });
});

describe("rule 11: upstream requirements", () => {
  test("requires a version for an npm source", () => {
    const config = parseConfig("upstream:\n  source: '@seasb/fab-base'\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toBe(`"upstream" npm source requires "version".`);
  });

  test("requires a commit for a Git source", () => {
    const config = parseConfig("upstream:\n  source: github:seasb/fab-mark4\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toBe(`"upstream" Git source requires "commit".`);
  });

  test("accepts an unversioned upstream with only a source", () => {
    const config = parseConfig("upstream:\n  source: ../platform/.factory\n");

    expect(config.problems).toEqual([]);
  });

  test.each([
    ["upstream:\n  source: '@seasb/fab-base'\n  version: ''\n", `"upstream" npm source requires "version".`],
    ["upstream:\n  source: '@seasb/fab-base'\n  version: '   '\n", `"upstream" npm source requires "version".`],
    ["upstream:\n  source: github:seasb/fab-mark4\n  commit: ''\n", `"upstream" Git source requires "commit".`],
    ["upstream:\n  source: ''\n", `"upstream" requires "source".`],
    ["upstream:\n  source: '   '\n", `"upstream" requires "source".`],
  ])("treats empty values as absent in %s", (text, message) => {
    const config = parseConfig(text);

    expect(config.problems.map((problem) => problem.message)).toContain(message);
  });
});

describe("rule 3: wrong types", () => {
  test.each([
    ["metafab-skill: 'yes'\n", `"metafab-skill" must be a boolean.`],
    ["publish: nope\n", `"publish" must be a map.`],
    ["upstream: nope\n", `"upstream" must be a map.`],
    ["agents: [claude, 7]\n", `"agents" must contain only target names.`],
    ["publish:\n  name: '@seasb/fab-mark4'\n  version: 1.2.0\n  keywords: planning\n", `"publish.keywords" must be a list of strings.`],
    ["upstream:\n  source: 7\n", `"upstream.source" must be a string.`],
  ])("reports %s", (text, message) => {
    const config = parseConfig(text);

    expect(config.problems.map((problem) => problem.message)).toContain(message);
  });

  test("a non-mapping document is an error with defaults", () => {
    const config = parseConfig("just a string\n");

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.message).toBe("metafab.yaml must be a mapping.");
    expect(config.agents).toEqual(TARGETS);
  });
});
