import { runGit } from "../../util/git.js";
import type { Target } from "./types.js";

/**
 * The account a target runs an automation as: `AMP_USER_EMAIL` for Amp, and
 * `git config --get user.email` in the factory's repository for Orca. A missing
 * or empty setting is `undefined`, so the caller names the setting to set.
 */
export async function account(target: Target, root: string): Promise<string | undefined> {
  if (target === "amp") {
    const value = process.env.AMP_USER_EMAIL?.trim() ?? "";
    return value === "" ? undefined : value;
  }

  let stdout: string;
  try {
    const result = await runGit(["config", "--get", "user.email"], { cwd: root });
    if (result.exitCode !== 0) return undefined;
    stdout = result.stdout;
  } catch {
    // Git missing or unable to answer is the same as no `user.email`: the
    // caller reports the setting that is missing.
    return undefined;
  }

  const value = stdout.trim();
  return value === "" ? undefined : value;
}
