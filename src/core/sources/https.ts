import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import { extractTarball } from "./extract.js";
import { redact, stripSourceCredentials } from "./redact.js";
import type { FetchedFab, Resolved } from "./types.js";
import { dropPayloadFiles, validateFab } from "./validate.js";

// The compressed download cap is deliberately larger than the 64 MiB extracted
// total (MAX_FAB_TOTAL_SIZE), so a fab at that total is rejected for its size,
// not for how well it compressed. npm and HTTPS share this one constant.
export const MAX_TARBALL_SIZE = 80 * 1024 * 1024;
export const DEFAULT_HTTPS_TIMEOUT_MS = 60_000;
export const DEFAULT_HTTPS_IDLE_TIMEOUT_MS = 60_000;
export const MAX_HTTPS_REDIRECTS = 5;

export interface HttpsOptions {
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
}

export type ResolvedHttps = Extract<Resolved, { kind: "https" }>;

class DownloadTooLarge extends Error {}
class DownloadIdle extends Error {}

interface ReadResult {
  done: boolean;
  value?: Uint8Array;
}

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

/**
 * The cleanup hook for a fetch that copied a fab into a temporary directory.
 * Best effort: a failed removal never throws, so it cannot hide the caller's
 * own error or result.
 */
function tempCleanup(directory: string): () => Promise<void> {
  return async () => {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      // Nothing to report: the directory is temporary either way.
    }
  };
}

/**
 * The URL a redirect points at, or an error when following it would leave
 * HTTPS. The tests use a local HTTP server, so an HTTP source may redirect to
 * HTTP; a production HTTPS source may never fall back to a plain connection.
 */
export function redirectTarget(current: string, location: string): string {
  let next: URL;
  let from: URL;
  try {
    from = new URL(current);
    next = new URL(location, current);
  } catch {
    throw fetchError(`Cannot download ${current}: the redirect location is not a valid URL`);
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") {
    throw fetchError(
      `Cannot download ${current}: a redirect to ${next.protocol} is not allowed`,
    );
  }
  if (from.protocol === "https:" && next.protocol !== "https:") {
    throw fetchError(
      `Cannot download ${current}: a redirect from https to ${next.protocol}//${next.host} is not allowed`,
    );
  }
  return next.toString();
}

async function readBody(
  response: Response,
  maxBytes: number,
  idleTimeoutMs: number,
  onIdle: () => void,
): Promise<Buffer> {
  if (response.body === null) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const read = reader.read();
      read.catch(() => undefined);
      let idleTimer: NodeJS.Timeout | undefined;
      const idle = new Promise<never>((_resolve, reject) => {
        idleTimer = setTimeout(() => {
          reject(new DownloadIdle());
          onIdle();
        }, idleTimeoutMs);
      });
      let result: ReadResult;
      try {
        result = await Promise.race([read, idle]);
      } finally {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
      }
      const { done, value } = result;
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
    try {
      reader.releaseLock();
    } catch {
      void reader.cancel().catch(() => undefined);
    }
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
  const responseTimeoutMs = options.timeoutMs ?? DEFAULT_HTTPS_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_HTTPS_IDLE_TIMEOUT_MS;
  const controller = new AbortController();

  let timer: NodeJS.Timeout | undefined;
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  let response: Response;
  let data: Buffer;
  let currentUrl = url;
  let redirects = 0;
  timer = setTimeout(() => controller.abort(), responseTimeoutMs);
  try {
    for (;;) {
      try {
        response = await fetchFn(currentUrl, { signal: controller.signal, redirect: "manual" });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw fetchError(`Cannot download ${url}: ${describe(error)}`, error);
      }

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get("location");
      if (location === null) {
        throw fetchError(`Cannot download ${url}: the redirect has no Location header`);
      }
      if (redirects >= MAX_HTTPS_REDIRECTS) {
        throw fetchError(`Cannot download ${url}: more than ${MAX_HTTPS_REDIRECTS} redirects`);
      }
      await response.body?.cancel().catch(() => undefined);
      currentUrl = redirectTarget(currentUrl, location);
      redirects += 1;
    }

    clearTimer();

    if (!response.ok) {
      const status = response.statusText === "" ? `${response.status}` : `${response.status} ${response.statusText}`;
      throw fetchError(`Cannot download ${url}: HTTP ${status}`);
    }

    try {
      data = await readBody(response, maxBytes, idleTimeoutMs, () => controller.abort());
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
    if (error instanceof DownloadIdle) {
      throw fetchError(
        `Cannot download ${url}: no data received for ${idleTimeoutMs} ms`,
        error,
      );
    }
    if (controller.signal.aborted) {
      throw fetchError(`Cannot download ${url}: no response after ${responseTimeoutMs} ms`, error);
    }
    throw error;
  } finally {
    clearTimer();
  }

  const staging = await mkdtemp(path.join(tmpdir(), "metafab-https-"));
  const destination = await mkdtemp(path.join(tmpdir(), "metafab-https-fab-"));

  try {
    const tarball = path.join(staging, "fab.tgz");
    await writeFile(tarball, data);
    await extractTarball(tarball, destination, { flattenSingleDirectory: true });
    await dropPayloadFiles(destination);
    await validateFab(destination, { sourceLabel: url });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return {
    factoryDir: path.join(destination, ".factory"),
    upstream: { kind: "unversioned", source: stripSourceCredentials(url) },
    versioned: false,
    cleanup: tempCleanup(destination),
  };
}
