import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tar from "tar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import {
  fetchFab,
  MAX_HTTPS_REDIRECTS,
  redirectTarget,
  resolve,
} from "../../../src/core/sources/index.js";
import type { HttpsSourceSpec } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

let root: string;
let server: ReturnType<typeof createServer>;
let base: string;
let chunkedData: Buffer;
const requests = new Map<string, number>();

function specFor(relativePath: string): HttpsSourceSpec {
  return { kind: "https", url: `${base}${relativePath}` };
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "metafab-https-"));

  const fabRoot = path.join(root, "fab-root");
  await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(fabRoot, ".factory"), {
    recursive: true,
  });

  const wrappedParent = path.join(root, "wrapped-parent");
  const wrapped = path.join(wrappedParent, "fab-acme-1.0.0");
  await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(wrapped, ".factory"), {
    recursive: true,
  });
  await writeFile(path.join(wrapped, "README.md"), "# Wrapped fab\n");

  const rootTarball = path.join(root, "root.tgz");
  const wrappedTarball = path.join(root, "wrapped.tgz");
  await tar.c({ gzip: true, file: rootTarball, cwd: fabRoot, portable: true }, [".factory"]);
  chunkedData = await readFile(rootTarball);
  await tar.c({ gzip: true, file: wrappedTarball, cwd: wrappedParent, portable: true }, [
    "fab-acme-1.0.0",
  ]);

  const files = new Map<string, string>([
    ["/root.tgz", rootTarball],
    ["/wrapped.tgz", wrappedTarball],
  ]);

  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
    if (pathname === "/large.tgz") {
      response.writeHead(200, { "content-type": "application/gzip" });
      response.write(Buffer.alloc(4 * 1024));
      response.end(Buffer.alloc(4 * 1024));
      return;
    }
    if (pathname === "/slow.tgz") {
      response.writeHead(200, { "content-type": "application/gzip" });
      response.flushHeaders();
      return;
    }
    if (pathname === "/hang.tgz") {
      return;
    }
    if (pathname === "/chunked.tgz") {
      response.writeHead(200, { "content-type": "application/gzip" });
      const chunkSize = Math.max(1, Math.ceil(chunkedData.byteLength / 10));
      for (let offset = 0; offset < chunkedData.byteLength; offset += chunkSize) {
        response.write(chunkedData.subarray(offset, offset + chunkSize));
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
      }
      response.end();
      return;
    }
    const file = files.get(pathname);
    if (file === undefined) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/gzip" });
    response.end(await readFile(file));
  });

  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server !== undefined) {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
  await rm(root, { recursive: true, force: true });
}, 120_000);

describe("https tarball sources", { timeout: 60_000 }, () => {
  test("resolves an https source as unversioned", async () => {
    const spec = specFor("/root.tgz");
    const resolved = await resolve(spec);

    expect(resolved).toEqual({ kind: "https", spec, versioned: false });
  });

  test("fetches a tarball with .factory at the archive root", async () => {
    const url = `${base}/root.tgz`;
    const fetched = await fetchFab(await resolve(specFor("/root.tgz")));

    expect(fetched.upstream).toEqual({ kind: "unversioned", source: url });
    expect(fetched.versioned).toBe(false);
    expect(path.basename(fetched.factoryDir)).toBe(".factory");
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
  });

  test("records the source without a signed query", async () => {
    const resolved = await resolve({
      kind: "https",
      url: `${base}/root.tgz?X-Amz-Signature=secret`,
    });
    const fetched = await fetchFab(resolved);

    expect(fetched.upstream.source).toBe(`${base}/root.tgz`);
  });

  test("records an upper-case scheme without a signed query", async () => {
    const upper = base.replace(/^http:/, "HTTP:");
    const resolved = await resolve({
      kind: "https",
      url: `${upper}/root.tgz?X-Amz-Signature=secret`,
    });
    const fetched = await fetchFab(resolved);

    expect(fetched.upstream.source).toBe(`${upper}/root.tgz`);
  });

  test("fetches a tarball with .factory under a single top-level directory", async () => {
    const fetched = await fetchFab(await resolve(specFor("/wrapped.tgz")));

    expect(fetched.upstream.source).toBe(`${base}/wrapped.tgz`);
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
    expect(await pathExists(path.join(path.dirname(fetched.factoryDir), "README.md"))).toBe(true);
  });

  test("cleanup removes the temporary fetch directory", async () => {
    const fetched = await fetchFab(await resolve(specFor("/root.tgz")));
    const temporary = path.dirname(fetched.factoryDir);
    expect(await pathExists(temporary)).toBe(true);

    await fetched.cleanup?.();

    expect(await pathExists(temporary)).toBe(false);
  });

  test("cleanup never throws when the directory is already gone", async () => {
    const fetched = await fetchFab(await resolve(specFor("/root.tgz")));
    await rm(path.dirname(fetched.factoryDir), { recursive: true, force: true });

    await expect(fetched.cleanup?.()).resolves.toBeUndefined();
  });

  test("fails with exit 3 for an HTTP error", async () => {
    const resolved = await resolve(specFor("/missing.tgz"));
    await expect(fetchFab(resolved)).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("fails with exit 4 when the download exceeds the size cap", async () => {
    const resolved = await resolve(specFor("/large.tgz"));
    await expect(fetchFab(resolved, { maxBytes: 1024 })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });

  test("fails with exit 3 when the download stops sending data", async () => {
    const resolved = await resolve(specFor("/slow.tgz"));
    await expect(fetchFab(resolved, { idleTimeoutMs: 50 })).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("fails with exit 3 when no response arrives", async () => {
    const resolved = await resolve(specFor("/hang.tgz"));
    await expect(fetchFab(resolved, { timeoutMs: 50 })).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("keeps downloading while chunks arrive within the idle timeout", async () => {
    const resolved = await resolve(specFor("/chunked.tgz"));
    const fetched = await fetchFab(resolved, { idleTimeoutMs: 500, timeoutMs: 500 });

    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
  });

  test("refuses a redirect from https to plain http", async () => {
    const resolved = await resolve({ kind: "https", url: "https://example.com/fab.tgz" });
    const redirecting = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://example.com/fab.tgz" },
      })) as typeof fetch;

    await expect(fetchFab(resolved, { fetch: redirecting })).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("allows an https redirect that stays on https", async () => {
    expect(redirectTarget("https://example.com/a.tgz", "/b.tgz")).toBe(
      "https://example.com/b.tgz",
    );
    expect(redirectTarget("https://example.com/a.tgz", "https://cdn.example/b.tgz")).toBe(
      "https://cdn.example/b.tgz",
    );
    // The local test server is http, so an http source may stay on http.
    expect(redirectTarget("http://127.0.0.1/a.tgz", "/b.tgz")).toBe(
      "http://127.0.0.1/b.tgz",
    );
  });

  test("stops after the redirect limit", async () => {
    const resolved = await resolve({ kind: "https", url: "https://example.com/fab.tgz" });
    const looping = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/fab.tgz" },
      })) as typeof fetch;

    await expect(fetchFab(resolved, { fetch: looping })).rejects.toThrow(
      `more than ${MAX_HTTPS_REDIRECTS} redirects`,
    );
  });

  test("never caches an https source", async () => {
    const before = requests.get("/root.tgz") ?? 0;
    const first = await fetchFab(await resolve(specFor("/root.tgz")));
    const second = await fetchFab(await resolve(specFor("/root.tgz")));

    expect(requests.get("/root.tgz")).toBe(before + 2);
    expect(first.factoryDir).not.toBe(second.factoryDir);
  });
});
