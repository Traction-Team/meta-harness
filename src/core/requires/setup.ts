import { chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { confirm } from "../../input.js";
import type { InputIO, RequiredValue } from "../../input.js";
import { isInsideAbsolute } from "../sources/containment.js";
import { inspectRequirement } from "./inspect.js";
import type { RequirementResult } from "./inspect.js";

export const SETUP_QUESTION =
  "Create the missing files from the fab's templates? Existing files are never changed.";

function creatable(results: RequirementResult[]): RequirementResult[] {
  return results.filter((result) => result.state === "missing" && result.template !== undefined);
}

/**
 * The required value for the setup consent. The caller collects it with the
 * adoption value, so one `NeedsInput` can name both.
 */
export function setupRequired(results: RequirementResult[]): RequiredValue {
  const paths = creatable(results).map((result) => result.path);
  return {
    name: "setup",
    flag: "--setup",
    description: `Create the missing repository files the factory needs: ${paths.join(", ")}. Pass --setup to create them or --no-setup to skip`,
  };
}

/**
 * The list printed before the setup question: only the entries that can be
 * created, in `factory.yaml` order. A present, blocked or template-less entry
 * is not worth asking about; the review summary shows it after the import.
 */
export function describeRequirementList(results: RequirementResult[]): string {
  const entries = creatable(results);
  if (entries.length === 0) return "";

  const width = Math.max(...entries.map((entry) => entry.path.length));
  const lines = ["The factory needs these files, which are missing:"];
  for (const entry of entries) {
    lines.push(`  ${entry.path.padEnd(width)}  ${entry.description}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Whether to create the missing files: a flag wins, a terminal is asked with
 * yes as the default, and no terminal means the caller must report `--setup`.
 * The list goes to stderr, so `--json` output stays one JSON object.
 */
export async function decideSetup(
  results: RequirementResult[],
  choice: boolean | undefined,
  io: InputIO,
  tty: boolean,
): Promise<boolean | "needs-input"> {
  if (creatable(results).length === 0) return false;
  if (choice !== undefined) return choice;
  if (!tty) return "needs-input";

  const stderr =
    io.stderr ??
    ((text: string) => {
      process.stderr.write(text);
    });
  stderr(describeRequirementList(results));

  return confirm(
    { name: "setup", flag: "--setup", description: SETUP_QUESTION },
    { default: true },
    { ...io, stderr, tty },
  );
}

/**
 * Marks each file the person chose not to create. A requirement without a
 * template stays `missing`: nobody was asked about it, and `check` reports it.
 */
export function declineRequirements(results: RequirementResult[]): RequirementResult[] {
  return results.map((result) =>
    result.state === "missing" && result.template !== undefined
      ? { ...result, state: "declined" as const }
      : result,
  );
}

/**
 * Why a template cannot be copied, as a phrase, or `undefined` when it can.
 * Reading follows a link in any parent directory, so a `.factory/templates/`
 * entry that is a link to an outside directory would copy bytes from outside
 * `.factory/`. Rule 13 refuses such a tree, but `update` copies from the merged
 * tree before its build validates it, so creation checks too.
 */
async function templateRefusal(root: string, template: string): Promise<string | undefined> {
  const factory = await realpath(path.join(root, ".factory")).catch(() => undefined);
  const resolved = await realpath(path.join(root, ...template.split("/"))).catch(() => undefined);
  if (factory === undefined || resolved === undefined || !isInsideAbsolute(factory, resolved)) {
    return `its template ${template} is not a regular file inside .factory/`;
  }
  return undefined;
}

/**
 * Creates each agreed file from its template. The template's bytes are copied
 * unchanged, so CRLF, a BOM and binary content survive; the new file is 0755
 * when the template has any executable bit and 0644 otherwise. Each path is
 * inspected again first, and the file is created exclusively, so an entry that
 * appeared since the preflight is `present` and never replaced.
 *
 * A failure is a warning and the import continues; one file never stops the
 * rest. `problems` collects those warnings for the command's report.
 */
export async function createRequirements(
  root: string,
  results: RequirementResult[],
  problems: Problem[] = [],
): Promise<RequirementResult[]> {
  const updated: RequirementResult[] = [];

  for (const result of results) {
    if (result.state !== "missing" || result.template === undefined) {
      updated.push(result);
      continue;
    }

    const current = await inspectRequirement(root, result);
    if (current.state !== "missing") {
      updated.push(current);
      continue;
    }

    const template = result.template;
    const templatePath = path.join(root, ...template.split("/"));
    const target = path.join(root, ...result.path.split("/"));

    const refusal = await templateRefusal(root, template);
    if (refusal !== undefined) {
      updated.push({ ...result, state: "failed", reason: refusal });
      problems.push({
        level: "warning",
        file: result.path,
        message: `Could not create ${result.path}: ${refusal}`,
        fix: `Replace ${template} with a file inside .factory/templates/`,
      });
      continue;
    }

    try {
      const info = await stat(templatePath);
      const bytes = await readFile(templatePath);
      const mode = (info.mode & 0o111) !== 0 ? 0o755 : 0o644;

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode });
      await chmod(target, mode);
      updated.push({ ...result, state: "created" });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "EIO";
      if (code === "EEXIST") {
        updated.push({ ...result, state: "present" });
        continue;
      }

      updated.push({ ...result, state: "failed", reason: code });
      problems.push({
        level: "warning",
        file: result.path,
        message: `Could not create ${result.path}: ${code}`,
        fix: `Copy ${template} to ${result.path}`,
      });
    }
  }

  return updated;
}
