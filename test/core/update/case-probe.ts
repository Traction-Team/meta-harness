import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathExists } from "../../../src/util/fs.js";

/**
 * True when the test filesystem treats two names that differ only in case as
 * one name. A test that needs sibling paths such as `skills/` and `SKILLS/`,
 * or a rename that changes only the case of a spelling, can only run where this
 * is false.
 */
export async function caseInsensitiveFilesystem(): Promise<boolean> {
  const dir = await mkdtemp(path.join(tmpdir(), "metafab-case-probe-"));
  try {
    await writeFile(path.join(dir, "probe"), "");
    return await pathExists(path.join(dir, "PROBE"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
