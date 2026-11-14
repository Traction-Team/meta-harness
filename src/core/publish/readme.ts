import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { PublishConfig } from "../config/types.js";
import type { Factory, Skill } from "../factory/index.js";
import { importSourceForGitUrl, sourceWithoutCredentials } from "../sources/parse.js";

const IMPORT_COMMAND = "npx @seasb/metafab import";

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function readError(file: string, fix: string): MetafabError {
  return new MetafabError(`Cannot read file ${file}`, {
    exitCode: ExitCode.Failed,
    code: "publish-readme-unreadable",
    problems: [
      {
        level: "error",
        file,
        line: 1,
        message: `Cannot read file ${file}`,
        fix,
      },
    ],
  });
}

async function readReadme(target: string, file: string): Promise<string> {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if (isAbsentError(error)) throw readError(file, "Create the file or remove publish.readme");
    throw readError(file, "Check its permissions");
  }
}

function skillSummary(skill: Skill): string | undefined {
  const description = skill.frontmatter["description"];
  if (typeof description === "string" && description.trim() !== "") return description.trim();
  return skill.title;
}

function skillLine(skill: Skill): string {
  const summary = skillSummary(skill);
  return summary === undefined ? `- \`${skill.name}\`` : `- \`${skill.name}\` — ${summary}`;
}

/**
 * The source an importer names: the npm package when there is one, else the Git
 * URL without credentials, in the form `import` accepts (`https://` and
 * `file://` gain `git+`). The README is published, so a token in `publish.git`
 * must never reach it.
 */
export function publishSource(publish: PublishConfig): string | undefined {
  if (publish.name !== undefined) return publish.name;
  if (publish.git === undefined) return undefined;
  return importSourceForGitUrl(sourceWithoutCredentials(publish.git));
}

/**
 * The README written when a project has neither `publish.readme` nor
 * `.factory/README.md`: what the factory is, how it runs and how to import it.
 */
export function generateReadme(factory: Factory, publish: PublishConfig): string {
  const name = factory.factoryYaml?.name ?? publish.name ?? "factory";
  const description = factory.factoryYaml?.description ?? publish.description;
  const lines: string[] = [`# ${name}`, ""];

  if (description !== undefined) lines.push(description, "");

  const pipeline = factory.factoryYaml?.pipeline ?? [];
  if (pipeline.length > 0) {
    lines.push("## Pipeline", "");
    pipeline.forEach((entry, index) => {
      const stop = entry.stop === undefined ? "" : ` — stop: ${entry.stop}`;
      lines.push(`${index + 1}. \`${entry.workflow}\`${stop}`);
    });
    lines.push("");
  }

  const workflows = factory.skills.filter((skill) => skill.isWorkflow);
  if (workflows.length > 0) {
    lines.push("## Workflows", "", ...workflows.map(skillLine), "");
  }

  const skills = factory.skills.filter((skill) => !skill.isWorkflow);
  if (skills.length > 0) {
    lines.push("## Skills", "", ...skills.map(skillLine), "");
  }

  lines.push(
    "## Install",
    "",
    "Install this factory with Metafab:",
    "",
    "```sh",
    `${IMPORT_COMMAND} ${publishSource(publish) ?? "<source>"}`,
    "```",
    "",
  );

  return lines.join("\n");
}

/**
 * The README at the fab root: `publish.readme`, else `.factory/README.md`, else
 * a generated one. `.factory/README.md` is never copied into the fab itself.
 *
 * The generated README describes `published`, the staged factory, so a name or
 * description that `publish.exclude` removes is not published.
 */
export async function resolveReadme(
  repositoryRoot: string,
  factory: Factory,
  publish: PublishConfig,
  published: Factory = factory,
): Promise<string> {
  if (publish.readme !== undefined) {
    const target = path.isAbsolute(publish.readme)
      ? publish.readme
      : path.join(repositoryRoot, publish.readme);
    return readReadme(target, publish.readme);
  }

  const factoryReadme = path.join(factory.dir, "README.md");
  try {
    return await readFile(factoryReadme, "utf8");
  } catch (error) {
    if (isAbsentError(error)) return generateReadme(published, publish);
    throw readError(".factory/README.md", "Check its permissions");
  }
}
