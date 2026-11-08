import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withEnv } from "./env.js";

let hooksDirectory: string | undefined;

/**
 * Git runs `core.hooksPath` hooks from a repository it clones or the user's
 * configuration, and a hook is code from outside the fab; fetching and
 * publishing must never run one. `core.hooksPath=/dev/null` is the usual
 * shorthand, but it only works because of a Git special case; an empty
 * directory is a real directory on every platform, so no hook can be found
 * there.
 */
export function disabledHooksConfig(): string {
  if (hooksDirectory === undefined) {
    const directory = mkdtempSync(path.join(tmpdir(), "metafab-hooks-"));
    hooksDirectory = directory;
    process.once("exit", () => {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // best effort: the temporary directory is empty
      }
    });
  }
  return `core.hooksPath=${hooksDirectory}`;
}

/**
 * The environment every Git call runs with. A credential prompt would hang a
 * non-interactive command, so it is turned off unless the caller allows it.
 */
export function gitEnvironment(
  env: NodeJS.ProcessEnv | undefined,
  interactive: boolean | undefined,
): NodeJS.ProcessEnv {
  return withEnv(
    env ?? process.env,
    interactive === true ? {} : { GIT_TERMINAL_PROMPT: "0" },
  );
}

/** The trimmed, non-empty lines of stderr, then stdout, then the message. */
export function gitMessage(failure: {
  stdout?: string;
  stderr?: string;
  message?: string;
}): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  const lines = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");
  return lines.join("\n") || "git failed";
}

/**
 * The conversion attributes both publish and fetch turn off: line endings,
 * filters, `ident`, and the working-tree encoding must never rewrite a fab's
 * bytes.
 */
export const VERBATIM_TEXT_ATTRIBUTES = "-text -eol -filter -ident -working-tree-encoding";
