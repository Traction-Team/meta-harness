import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import { extractTarball } from "./extract.js";
import { redact } from "./redact.js";
import type { FetchedFab, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

export const MAX_TARBALL_SIZE = 50 * 1024 * 1024;
export const DEFAULT_HTTPS_TIMEOUT_MS = 60_000;

export interface HttpsOptions {
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

export type ResolvedHttps = Extract<Resolved, { kind: "https" }>;

class DownloadTooLarge extends Error {}

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (response.body === null) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new DownloadTooLarge();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchHttps(
  source: ResolvedHttps,
  options: HttpsOptions = {},
): Promise<FetchedFab> {
  const url = source.spec.url;
  const fetchFn = options.fetch ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_TARBALL_SIZE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTPS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let data: Buffer;
  try {
    try {
      response = await fetchFn(url, { signal: controller.signal, redirect: "follow" });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw fetchError(`Cannot download ${url}: ${describe(error)}`, error);
    }

    if (!response.ok) {
      const status = response.statusText === "" ? `${response.status}` : `${response.status} ${response.statusText}`;
      throw fetchError(`Cannot download ${url}: HTTP ${status}`);
    }

    try {
      data = await readBody(response, maxBytes);
    } catch (error) {
      if (error instanceof DownloadTooLarge) {
        throw new MetafabError(
          `Cannot download ${redact(url)}: the tarball is larger than ${maxBytes} bytes`,
          { exitCode: ExitCode.InvalidFab, code: "invalid-fab" },
        );
      }
      if (controller.signal.aborted) throw error;
      throw fetchError(`Cannot download ${url}: ${describe(error)}`, error);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw fetchError(`Cannot download ${url}: timed out after ${timeoutMs} ms`, error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
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
