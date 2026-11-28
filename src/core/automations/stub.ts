import { runGit } from "../../util/git.js";
import { toLF } from "../../util/text.js";
import { metafabInvocation, shQuote } from "../hooks/script.js";
import type { Automation, Target } from "./types.js";

export interface StubInput {
  /** `name` in `factory.yaml`, for the marker. */
  factoryName: string;
  automation: Automation;
  target: Target;
  /** The trunk the run switches to, without `origin/`. */
  trunk: string;
  /** The factory root relative to the repository root, POSIX, `.` at the root. */
  factoryRelDir: string;
  cliVersion: string;
}

/** The first line of a stub: the marker sync uses to recognise its registrations. */
export function stubMarker(name: string, factoryName: string): string {
  return `Run the factory automation \`${name}\` from the \`${factoryName}\` factory.`;
}

const CLEAN_STEP =
  "Run `git status --porcelain --untracked-files=all`. If it prints anything or fails, report that this run needs a clean checkout, and stop.";

const PROMPT_STEP =
  "If it fails, report what it printed, and stop. Otherwise follow what it printed: those are this run's instructions.";

/**
 * The text a target registers for one automation, as the spec's The stub says.
 * It holds no part of the body: the run renders the prompt when it starts, so a
 * body edit takes effect without a sync.
 *
 * For `checkout: main` the clean-checkout and detach steps are left out for
 * Orca, which runs in the main checkout as it is. Amp always has them, because
 * an orb is its own clone.
 */
export function renderStub(input: StubInput): string {
  const { factoryName, automation, target, trunk, factoryRelDir, cliVersion } = input;
  const directory = shQuote(factoryRelDir);
  const mainCli = `"$main"/${directory}/node_modules/.bin/metafab`;
  const args = `automations prompt ${automation.name} --target ${target}`;
  const lookup = metafabInvocation(mainCli, cliVersion, args).join("; ");
  const prompt = `Run \`(cd "$(git rev-parse --show-toplevel)"/${directory} && ${lookup}; fi)\`. ${PROMPT_STEP}`;

  const steps: string[] = [];
  if (automation.checkout === "worktree" || target === "amp") {
    steps.push(CLEAN_STEP);
    steps.push(`Run \`git fetch origin && git switch --detach origin/${shQuote(trunk)}\`.`);
  }
  steps.push(prompt);

  const lines = [
    stubMarker(automation.name, factoryName),
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * The remote's default branch: `git symbolic-ref --short
 * refs/remotes/origin/HEAD`, without `origin/`. Undefined when Git cannot say,
 * as outside a repository or when no remote HEAD is set.
 */
export async function defaultTrunk(repoRoot: string): Promise<string | undefined> {
  let stdout: string;
  try {
    const result = await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      cwd: repoRoot,
    });
    if (result.exitCode !== 0) return undefined;
    stdout = result.stdout;
  } catch {
    return undefined;
  }

  const value = stdout.trim();
  if (value === "") return undefined;
  return value.startsWith("origin/") ? value.slice("origin/".length) : value;
}

/**
 * The factory root relative to the repository root, POSIX and `.` at the root,
 * as the Git hooks name it: `git rev-parse --show-prefix` in the factory root.
 */
export async function relativeFactoryDir(root: string): Promise<string> {
  let stdout: string;
  try {
    const result = await runGit(["rev-parse", "--show-prefix"], { cwd: root });
    if (result.exitCode !== 0) return ".";
    stdout = result.stdout;
  } catch {
    return ".";
  }

  // Remove only what Git adds: the terminating newline, and the separator after
  // the last directory. Trimming would eat a leading space in the directory's
  // own name.
  const prefix = toLF(stdout).replace(/\n$/, "").replace(/\/+$/, "");
  return prefix === "" ? "." : prefix;
}
