import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import { extractTarball } from "./extract.js";
import type { FetchedFab, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

export interface HttpsOptions {
  fetch?: typeof fetch;
}

export type ResolvedHttps = Extract<Resolved, { kind: "https" }>;

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchHttps(
  source: ResolvedHttps,
  options: HttpsOptions = {},
): Promise<FetchedFab> {
  const url = source.spec.url;
  const fetchFn = options.fetch ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    throw fetchError(`Cannot download ${url}: ${describe(error)}`, error);
  }

  if (!response.ok) {
    const status = response.statusText === "" ? `${response.status}` : `${response.status} ${response.statusText}`;
    throw fetchError(`Cannot download ${url}: HTTP ${status}`);
  }

  let data: Buffer;
  try {
    data = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw fetchError(`Cannot download ${url}: ${describe(error)}`, error);
  }

  const staging = await mkdtemp(path.join(tmpdir(), "metafab-https-"));
  const destination = await mkdtemp(path.join(tmpdir(), "metafab-https-fab-"));

  try {
    const tarball = path.join(staging, "fab.tgz");
    await writeFile(tarball, data);
    await extractTarball(tarball, destination, { flattenSingleDirectory: true });
    await validateFab(destination, { sourceLabel: url });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return {
    factoryDir: path.join(destination, ".factory"),
    upstream: { kind: "unversioned", source: url },
    versioned: false,
  };
}
