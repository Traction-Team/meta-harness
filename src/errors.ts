export enum ExitCode {
  Ok = 0,
  Failed = 1,
  NeedsInput = 2,
  FetchFailed = 3,
  InvalidFab = 4,
  NotOwned = 5,
}

export interface Problem {
  level: "error" | "warning";
  file: string;
  line?: number;
  message: string;
  fix?: string;
}

export interface MetafabErrorOptions {
  exitCode?: ExitCode;
  code?: string;
  problems?: Problem[];
  details?: unknown;
  cause?: unknown;
}

export class MetafabError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string;
  readonly problems?: Problem[];
  readonly details?: unknown;

  constructor(message: string, options: MetafabErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MetafabError";
    this.exitCode = options.exitCode ?? ExitCode.Failed;
    this.code = options.code ?? "error";
    this.problems = options.problems;
    this.details = options.details;
  }
}
