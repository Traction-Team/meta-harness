import { chmod } from "node:fs/promises";
import { loadConfig } from "../../../src/core/config/load.js";
import type { Config } from "../../../src/core/config/types.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Factory } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

export function skill(name: string, description: string, title = name): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${title}\n`;
}

export interface PublishRepoOptions {
  publish?: string;
  files?: RepoFiles;
}

export function publishFiles(options: PublishRepoOptions = {}): RepoFiles {
  return {
    ".factory/factory.yaml": [
      "format: 1",
      "name: demo",
      "description: A demo factory.",
      "pipeline:",
      "  - plan",
      "  - build: { stop: The lead approves the result }",
      "",
    ].join("\n"),
    ".factory/metafab.yaml": [
      "metafab-skill: false",
      options.publish ??
        ["publish:", '  name: "@seasb/fab-demo"', "  version: 1.2.0", ""].join("\n"),
      "",
    ].join("\n"),
    ".factory/AGENTS.md": "# Agents\n",
    ".factory/README.md": "# Demo project readme\n",
    ".factory/workflows/plan/SKILL.md": skill("plan", "Plan a slice. Use when starting."),
    ".factory/workflows/build/SKILL.md": skill("build", "Build a slice. Use when planning is done."),
    ".factory/skills/git/SKILL.md": skill("git", "Git conventions."),
    ".factory/scripts/release.sh": "#!/bin/sh\necho release\n",
    ...options.files,
  };
}

/** A valid factory with a `publish` section and an executable script. */
export async function makePublishRepo(options: PublishRepoOptions = {}): Promise<TempRepo> {
  const repo = await makeRepo(publishFiles(options));
  await chmod(repo.path(".factory", "scripts", "release.sh"), 0o755);
  return repo;
}

export async function loadRepo(repo: TempRepo): Promise<{ factory: Factory; config: Config }> {
  const factory = await loadFactory(repo.root);
  const config = await loadConfig(factory.dir);
  return { factory, config };
}
