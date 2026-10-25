import type { UpstreamEntry } from "../config/types.js";

export type GitRef = { type: "range"; range: string } | { type: "name"; name: string };

export type SourceSpec =
  | { kind: "npm"; name: string; requested?: string }
  | { kind: "git"; url: string; source: string; ref?: GitRef }
  | { kind: "https"; url: string }
  | { kind: "path"; path: string };

export type NpmSourceSpec = Extract<SourceSpec, { kind: "npm" }>;
export type GitSourceSpec = Extract<SourceSpec, { kind: "git" }>;
export type HttpsSourceSpec = Extract<SourceSpec, { kind: "https" }>;
export type PathSourceSpec = Extract<SourceSpec, { kind: "path" }>;

export type Resolved =
  | {
      kind: "npm";
      spec: NpmSourceSpec;
      version: string;
      tarball: string;
      integrity?: string;
      deprecated?: string;
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
}

export interface ValidateFabOptions {
  sourceLabel: string;
  packageJson?: unknown;
}

export interface ValidatedFab {
  factoryDir: string;
  format: 1;
}
