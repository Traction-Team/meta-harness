import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { npmInvocation } from "../../../src/core/sources/npm-cli.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const VERDACCIO_BIN = path.join(
  path.dirname(require.resolve("verdaccio/package.json")),
  "bin",
  "verdaccio",
);

export interface Registry {
  readonly root: string;
  readonly url: string;
  readonly npmrc: string;
  readonly env: NodeJS.ProcessEnv;
  publishFab(options: FabPackageOptions): Promise<void>;
  deprecate(name: string, version: string, message: string): Promise<void>;
  stripIntegrity(name: string): Promise<void>;
  stop(): Promise<void>;
}

export interface FabPackageOptions {
  name: string;
  version: string;
  factoryDir: string;
  metafab?: { format: number } | null;
  deprecated?: string;
  scripts?: Record<string, string>;
  files?: string[];
  extraFiles?: Record<string, string>;
}

export interface StartRegistryOptions {
  timeoutMs?: number;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") {
    throw new Error("cannot allocate a free port");
  }
  return address.port;
}

function authLine(url: string, token: string): string {
  return `${url.replace(/^https?:/, "")}:_authToken=${token}`;
}

async function createUser(url: string): Promise<string> {
  const body = JSON.stringify({
    name: "metafab",
    password: "metafab-test-password",
    email: "metafab@example.com",
  });
  const response = await fetch(`${url}-/user/org.couchdb.user:metafab`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
  const payload: unknown = await response.json().catch(() => undefined);
  const token =
    typeof payload === "object" && payload !== null && "token" in payload
      ? (payload as { token?: unknown }).token
      : undefined;
  if (typeof token !== "string" || token === "") {
    throw new Error(`verdaccio did not return a token: ${JSON.stringify(payload)}`);
  }
  return token;
}

async function waitForRegistry(url: string, child: ChildProcess, logs: string[], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`verdaccio exited before it was ready:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${url}-/ping`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`verdaccio did not start within ${timeoutMs}ms:\n${logs.join("")}`);
}

function runningOptions(registry: Registry): { cwd: string; env: NodeJS.ProcessEnv } {
  return { cwd: registry.root, env: registry.env };
}

async function runNpm(registry: Registry, args: string[]): Promise<void> {
  try {
    const npm = await npmInvocation({ env: registry.env });
    await execFileAsync(npm.command, [...npm.args, ...args], {
      ...runningOptions(registry),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const detail = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message;
    throw new Error(`npm ${args.join(" ")} failed:\n${detail}`);
  }
}

export async function startRegistry(options: StartRegistryOptions = {}): Promise<Registry> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-registry-"));
  const storage = path.join(root, "storage");
  const htpasswd = path.join(root, "htpasswd");
  const npmrc = path.join(root, "npmrc");
  const npmCache = path.join(root, "npm-cache");
  await mkdir(storage, { recursive: true });

  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const config = path.join(root, "config.yaml");
  await writeFile(
    config,
    [
      `storage: ${storage}`,
      "max_body_size: 100mb",
      "auth:",
      "  htpasswd:",
      `    file: ${htpasswd}`,
      "    max_users: 1000",
      "uplinks: {}",
      "packages:",
      "  '@scope/*':",
      "    access: $all",
      "    publish: $authenticated",
      "  '**':",
      "    access: $all",
      "    publish: $authenticated",
      "log:",
      "  type: stdout",
      "  format: pretty",
      "  level: warn",
      "",
    ].join("\n"),
  );

  const logs: string[] = [];
  const child = spawn(
    process.execPath,
    [VERDACCIO_BIN, "--config", config, "--listen", `127.0.0.1:${port}`],
    { cwd: root, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));

  try {
    await waitForRegistry(url, child, logs, options.timeoutMs ?? 30_000);
  } catch (error) {
    child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  const token = await createUser(url);
  await writeFile(npmrc, `registry=${url}\n${authLine(url, token)}\n`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_userconfig: npmrc,
    npm_config_cache: npmCache,
    npm_config_registry: url,
  };

  const registry: Registry = {
    root,
    url,
    npmrc,
    env,
    async publishFab(packageOptions: FabPackageOptions): Promise<void> {
      const safeName = packageOptions.name.replace(/[^A-Za-z0-9._-]+/g, "-");
      const packageRoot = path.join(root, "packages", `${safeName}-${packageOptions.version}`);
      await mkdir(packageRoot, { recursive: true });
      await cp(packageOptions.factoryDir, path.join(packageRoot, ".factory"), {
        recursive: true,
      });

      const packageJson: Record<string, unknown> = {
        name: packageOptions.name,
        version: packageOptions.version,
        description: "A test fab",
        keywords: ["metafab", "factory"],
        license: "MIT",
        files: packageOptions.files ?? [".factory"],
      };
      if (packageOptions.metafab !== null) {
        packageJson.metafab = packageOptions.metafab ?? { format: 1 };
      }
      if (packageOptions.scripts !== undefined) packageJson.scripts = packageOptions.scripts;

      await writeFile(
        path.join(packageRoot, "package.json"),
        `${JSON.stringify(packageJson, null, 2)}\n`,
      );
      for (const [relativePath, content] of Object.entries(packageOptions.extraFiles ?? {})) {
        const target = path.join(packageRoot, ...relativePath.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }

      await runNpm(registry, [
        "publish",
        packageRoot,
        "--registry",
        url,
        "--access",
        "public",
        "--ignore-scripts",
      ]);

      if (packageOptions.deprecated !== undefined) {
        await registry.deprecate(
          packageOptions.name,
          packageOptions.version,
          packageOptions.deprecated,
        );
      }
    },
    async deprecate(name: string, version: string, message: string): Promise<void> {
      await runNpm(registry, [
        "deprecate",
        `${name}@${version}`,
        message,
        "--registry",
        url,
      ]);
    },
    async stripIntegrity(name: string): Promise<void> {
      const metadataPath = path.join(storage, ...name.split("/"), "package.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        versions?: Record<string, { dist?: Record<string, unknown> }>;
      };
      for (const version of Object.values(metadata.versions ?? {})) {
        if (version.dist !== undefined) delete version.dist.integrity;
      }
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    },
    async stop(): Promise<void> {
      if (child.exitCode === null) {
        const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        await exited;
        clearTimeout(timer);
      }
      await rm(root, { recursive: true, force: true });
    },
  };

  return registry;
}
