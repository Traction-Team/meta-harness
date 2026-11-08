import type { Document } from "yaml";
import type { Problem } from "../../errors.js";

export type Target = "claude" | "codex" | "cursor" | "opencode" | "copilot";

export const TARGETS: Target[] = ["claude", "codex", "cursor", "opencode", "copilot"];

export interface PublishConfig {
  name?: string;
  git?: string;
  branch?: string;
  version?: string;
  description?: string;
  license?: string;
  access?: "public" | "restricted";
  readme?: string;
  keywords?: string[];
  exclude?: string[];
}

export type UpstreamEntry =
  | { kind: "npm"; source: string; requested: string; version: string }
  | { kind: "git"; source: string; requested?: string; version?: string; commit: string }
  | { kind: "unversioned"; source: string };

export interface Destination {
  directory: string;
  targets: Target[];
}

export interface Config {
  agents: Target[];
  agentsRaw: "all" | Target[] | undefined;
  metafabSkill: boolean;
  gitHooks: boolean;
  gitHooksRaw: boolean | undefined;
  publish?: PublishConfig;
  upstream?: UpstreamEntry;
  doc: Document;
  problems: Problem[];
}
