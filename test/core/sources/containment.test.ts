import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { containmentRootAbsolute, isInsideAbsolute } from "../../../src/core/sources/containment.js";

let destination: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), "metafab-containment-"));
  destination = path.join(base, "out");
  await mkdir(path.join(destination, ".factory"), { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(destination), { recursive: true, force: true });
});

describe("containment root", () => {
  test("roots a link at .factory when a symlinked parent stores it there", async () => {
    // `alias` is spelled differently from `.factory` but is the same directory
    // on disk, so a link stored under `alias/` really lives inside the factory.
    await symlink(".factory", path.join(destination, "alias"), "dir");
    await mkdir(path.join(destination, ".factory", "skills"), { recursive: true });
    await writeFile(path.join(destination, ".factory", "skills", "base.md"), "base\n");
    await writeFile(path.join(destination, "outside.md"), "outside\n");

    const storedLink = path.join(destination, "alias", "skills", "leak.md");
    const root = await containmentRootAbsolute(storedLink, destination);

    expect(root).toBe(await realpath(path.join(destination, ".factory")));
    // The consequence of the root: a target outside the factory is not contained.
    expect(
      isInsideAbsolute(root, await realpath(path.join(destination, "outside.md"))),
    ).toBe(false);
    expect(
      isInsideAbsolute(root, await realpath(path.join(destination, "alias", "skills", "base.md"))),
    ).toBe(true);
  });

  test("roots a link at the destination when no ancestor is .factory", async () => {
    await mkdir(path.join(destination, "assets"), { recursive: true });
    await writeFile(path.join(destination, "assets", "notes.md"), "notes\n");

    const root = await containmentRootAbsolute(
      path.join(destination, "assets", "notes.md"),
      destination,
    );

    expect(root).toBe(await realpath(destination));
  });
});
