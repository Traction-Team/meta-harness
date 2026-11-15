import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "tar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import type { Problem } from "../../../src/errors.js";
import { extractTarball } from "../../../src/core/sources/extract.js";
import { fetchFab, parseSource, resolve } from "../../../src/core/sources/index.js";
import { LINK_CREATE_FIX } from "../../../src/core/sources/problems.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, symlink: vi.fn(actual.symlink) };
});

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

let root: string;

function denySymlinkCreation(): void {
  vi.mocked(symlink).mockRejectedValueOnce(
    Object.assign(new Error("EPERM: operation not permitted, symlink"), { code: "EPERM" }),
  );
}

async function failureFrom(run: () => Promise<unknown>): Promise<Problem[]> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(MetafabError);
    return (error as MetafabError).problems ?? [];
  }
  throw new Error("expected the fetch to fail");
}

function expectOnlyCreationMessage(problems: Problem[]): void {
  expect(problems).toHaveLength(1);
  const message = problems[0]?.message ?? "";
  expect(message).toContain("links could not be created");
  expect(message).not.toContain("does not exist");
  expect(problems[0]?.fix).toBe(LINK_CREATE_FIX);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "metafab-links-"));
});

afterEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(symlink).mockReset();
  vi.mocked(symlink).mockImplementation(actual.symlink);
  await rm(root, { recursive: true, force: true });
});

describe("a link whose creation fails", () => {
  test("is reported only by its creation message when copying a local path", async () => {
    const source = path.join(root, "fab-acme");
    await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(source, ".factory"), {
      recursive: true,
    });
    await symlink("AGENTS.md", path.join(source, ".factory", "link.md"));

    denySymlinkCreation();
    const resolved = await resolve(parseSource(source, { cwd: root }));
    const messages = await failureFrom(() => fetchFab(resolved));

    expectOnlyCreationMessage(messages);
  });

  test("is reported only by its creation message when extracting a tarball", async () => {
    const staging = path.join(root, "staging");
    await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(staging, ".factory"), {
      recursive: true,
    });
    await symlink("AGENTS.md", path.join(staging, ".factory", "link.md"));
    const archive = path.join(root, "fab.tar");
    await tar.c({ file: archive, cwd: staging, portable: true }, [".factory"]);

    denySymlinkCreation();
    const messages = await failureFrom(() => extractTarball(archive, path.join(root, "out")));

    expectOnlyCreationMessage(messages);
  });
});
