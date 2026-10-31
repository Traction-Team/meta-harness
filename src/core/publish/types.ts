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
