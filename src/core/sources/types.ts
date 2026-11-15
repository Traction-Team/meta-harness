import type { UpstreamEntry } from "../config/types.js";

export type GitRef = { type: "range"; range: string } | { type: "name"; name: string };

export type SourceSpec =
  | { kind: "npm"; name: string; requested?: string }
  | { kind: "git"; url: string; source: string; ref?: GitRef }
  | { kind: "https"; url: string }
  | { kind: "path"; path: string; source: string };

export type NpmSourceSpec = Extract<SourceSpec, { kind: "npm" }>;
export type GitSourceSpec = Extract<SourceSpec, { kind: "git" }>;
export type HttpsSourceSpec = Extract<SourceSpec, { kind: "https" }>;
export type PathSourceSpec = Extract<SourceSpec, { kind: "path" }>;

export type Resolved =
  | {
      kind: "npm";
      spec: NpmSourceSpec;
      requested: string;
      version: string;
      tarball: string;
      integrity?: string;
      deprecated?: string;
      /** The registry's reported unpacked size, when it gave one. */
      unpackedSize?: number;
      /** The registry's reported file count, when it gave one. */
      fileCount?: number;
      versioned: true;
    }
  | {
      kind: "git";
      spec: GitSourceSpec;
      commit: string;
      version?: string;
      requested?: string;
      versioned: true;
    }
  | { kind: "https"; spec: HttpsSourceSpec; versioned: false }
  | { kind: "path"; spec: PathSourceSpec; versioned: false };

export interface FetchedFab {
  factoryDir: string;
  upstream: UpstreamEntry;
  deprecated?: string;
  versioned: boolean;
  /**
   * Removes the temporary directory a fetch created. Only fetches that copy a
   * fab into a `mkdtemp` directory set it: Git and npm return cache paths, which
   * stay. Best effort and never throws, so it cannot hide the caller's error.
   */
  cleanup?: () => Promise<void>;
}

export interface ValidateFabOptions {
  sourceLabel: string;
  packageJson?: unknown;
}

export interface ValidatedFab {
  factoryDir: string;
  format: 1 | 2;
}
