/** A configured `publish` target: an npm package or a Git fab repository. */
export type PublishTargetName = "npm" | "git";

/** What a publish reports before it publishes: the fab files, their size and the targets. */
export interface PublishReport {
  /** Every fab file, relative to the fab root, in sorted order. */
  files: string[];
  /** Total size of `files` in bytes. */
  size: number;
  targets: PublishTargetName[];
}

/** A `.factory/` copied into a temporary fab directory. */
export interface StagedFab {
  /** The temporary fab root. Remove it with `cleanup`. */
  root: string;
  /** `<root>/.factory`, the factory the fab carries. */
  factoryDir: string;
  cleanup(): Promise<void>;
}

/** A staged fab that is ready to publish: README, `package.json` and the report data. */
export interface PreparedFab extends StagedFab, PublishReport {}

export interface StageOptions {
  /** `publish.exclude` globs, relative to `.factory/`. */
  exclude?: readonly string[];
}

/** How one target ended: published now, already published with the same content, or failed. */
export type PublishStatus = "published" | "skipped" | "failed";

export interface PublishTargetResult {
  target: PublishTargetName;
  status: PublishStatus;
  /** One line for the report; a failure detail is never a stack trace. */
  detail: string;
}

export interface PublishResult {
  version: string;
  /** One entry per configured target, in `PreparedFab.targets` order. */
  targets: PublishTargetResult[];
}

export interface PublishOptions {
  /** npm dist-tag from `--tag`. The Git target ignores it. */
  tag?: string;
  /** `--json` is present. It never enables a Git credential prompt. */
  json?: boolean;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Receives npm's output as it is produced. Defaults to `process.stderr`. */
  stderr?: (text: string) => void;
  /**
   * Whether Git may prompt for a credential. Defaults to a terminal standard
   * input with no `--json`, as `import` does.
   */
  interactive?: boolean;
}
