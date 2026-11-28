import type { Problem } from "../../errors.js";
import { normalizeProblemPath } from "../../util/fs.js";
import type { Factory } from "../factory/types.js";
import { TARGETS } from "./types.js";
import type { Automation, Target } from "./types.js";

const AUTOMATIONS_DIR = ".factory/automations";
const AUTOMATION_FILE = ".factory/automations/";

/** The fix every format 1 factory gets from the `automations` commands. */
const FORMAT_TWO_FIX = "Set format: 2 in .factory/factory.yaml";

/** The `automations` commands need a format 2 factory: automations are format 2 only. */
export function needsFormatTwo(): Problem {
  return {
    level: "error",
    file: ".factory/automations",
    message: ".factory/automations/ needs format: 2",
    fix: FORMAT_TWO_FIX,
  };
}

/** A name that is not an automation's. */
export function missingAutomation(name: string): Problem {
  return {
    level: "error",
    file: `.factory/automations/${name}`,
    message: `No automation named ${name}`,
    fix: "Run metafab automations list to see the automations",
  };
}

/** A disabled automation never runs, so no prompt is rendered for it. */
export function turnedOff(automation: Automation): Problem {
  return {
    level: "error",
    file: automation.file,
    message: `${automation.name} is turned off`,
    fix: `Set enabled: true in ${automation.file}`,
  };
}

/** A `--target` that is not one of this version's targets. */
export function unknownTarget(value: string): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: `Unknown target "${value}"`,
    fix: `Use one of: ${TARGETS.join(", ")}`,
  };
}

/** A target's account is not set, so the prompt cannot check who runs it. */
export function missingAccount(target: Target): Problem {
  const setting = target === "amp" ? "AMP_USER_EMAIL" : "git config user.email";
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: `Cannot tell which account this run acts as: ${setting} is not set`,
    fix:
      target === "amp"
        ? "Set AMP_USER_EMAIL to the account that runs this automation"
        : "Set user.email in Git config, such as git config user.email <email>",
  };
}

/** The automation is registered in another person's account. */
export function otherOwner(automation: Automation, account: string): Problem {
  return {
    level: "error",
    file: automation.file,
    message: `${automation.name} belongs to ${automation.owner}, and this run acts as ${account}`,
    fix: `Set owner to "${account}" in ${automation.file}, or run it as ${automation.owner}`,
  };
}

/** Neither `--branch` nor `origin/HEAD` named a trunk. */
export function noTrunk(): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: "Cannot tell which branch this run switches to",
    fix: "Pass --branch <trunk>",
  };
}

/** A `--branch` that `git check-ref-format --branch` refuses. */
export function badBranch(branch: string): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: `${branch} is not a branch name`,
    fix: "Pass --branch <trunk> with a branch name, such as main",
  };
}

/** Every error `check` reports in `.factory/automations/`. */
export function automationErrors(factory: Factory): Problem[] {
  return factory.problems.filter(
    (problem) =>
      problem.level === "error" &&
      (problem.file === AUTOMATIONS_DIR || problem.file.startsWith(AUTOMATION_FILE)),
  );
}

/**
 * The repository has no checkout Orca can run in: a bare repository, or a
 * linked worktree whose main checkout does not hold the factory.
 */
export function noMainCheckout(): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: "This repository has no main checkout for Orca to run in",
    fix: "Run the sync from a normal clone",
  };
}
