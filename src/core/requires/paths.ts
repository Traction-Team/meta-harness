import { isDotGitName } from "../../util/git-names.js";

/** Every `requires` template is written as a repository-relative path under this prefix. */
export const FACTORY_TEMPLATES_PREFIX = ".factory/templates/";

/**
 * Targets rule 12 refuses: Metafab's own tree, the skill trees `build` and
 * `import` write, and the root files they own. The comparison ignores case, and
 * a path below one of them is refused with it.
 */
export const FORBIDDEN_REQUIREMENT_TARGETS = [
  ".factory",
  ".claude/skills",
  ".agents/skills",
  "agents.md",
  "claude.md",
  ".gitignore",
  ".gitattributes",
] as const;

/**
 * Directories that hold a target of `FORBIDDEN_REQUIREMENT_TARGETS`, so the
 * directory itself is refused: `build` needs it to stay a directory, and a
 * requirement with a template there would create it as a file. A path below one
 * is still allowed, such as `.claude/settings.json`.
 */
export const FORBIDDEN_REQUIREMENT_DIRECTORIES = [".claude", ".agents"] as const;

/** Characters no `requires` path may hold: Windows refuses them in a name. */
const FORBIDDEN_CHARACTER = /[\\:*?"<>|\u0000-\u001f\u007f]/;

/** A Windows device name, with or without an extension, in any letter case. */
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * A `template` written as a repository-relative path, as everything inside
 * `.factory/` is: `Skill.relDir`, `FileTree` keys, conflict and change paths.
 * Rule 13 guarantees the prefix; this only drops it.
 */
export function factoryRelative(template: string): string {
  return template.slice(".factory/".length);
}

function isForbiddenTarget(folded: string): boolean {
  return FORBIDDEN_REQUIREMENT_TARGETS.some(
    (target) => folded === target || folded.startsWith(`${target}/`),
  );
}

/**
 * The first rule a `requires` path breaks, as a phrase for
 * `Required path "<path>" <phrase>`, or `undefined` when the path is safe.
 * Rule 12 of the factory format: a repository-relative file path outside
 * Metafab's own files, which Windows, Git and every case-insensitive
 * filesystem can create.
 */
export function requirementPathProblem(value: string): string | undefined {
  if (value === "") return "is empty";
  if (value.startsWith("/")) return "leaves the repository";
  if (value.includes("\\")) return "uses a backslash";
  if (value.endsWith("/")) return "ends with a slash";

  const segments = value.split("/");
  if (segments.includes("")) return "has an empty segment";
  if (segments.includes("..")) return "leaves the repository";
  if (segments.includes(".")) return 'has a "." segment';
  if (FORBIDDEN_CHARACTER.test(value)) return "contains a character Windows cannot use";
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" "))) {
    return "has a segment that ends in a dot or a space";
  }
  if (segments.some((segment) => WINDOWS_DEVICE_NAME.test(segment))) {
    return "uses a Windows device name";
  }
  if (segments.some((segment) => isDotGitName(segment))) return "is read by Git as .git";

  const folded = value.toLowerCase();
  if (folded === ".factory" || folded.startsWith(".factory/")) return "is inside .factory/";
  if (isForbiddenTarget(folded)) return "is a file Metafab writes";
  if (FORBIDDEN_REQUIREMENT_DIRECTORIES.some((directory) => folded === directory)) {
    return "is a directory that holds a file Metafab writes";
  }

  return undefined;
}
