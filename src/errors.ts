export enum ExitCode {
  Ok = 0,
  Failed = 1,
  NeedsInput = 2,
  FetchFailed = 3,
  InvalidFab = 4,
  NotOwned = 5,
}

interface ProblemBase {
  file: string;
  line?: number;
  message: string;
}

/** A problem that failed the command: the person needs the next step. */
export interface ErrorProblem extends ProblemBase {
  level: "error";
  fix: string;
}

/** A problem that only reports something. A warning has a fix when there is one. */
export interface WarningProblem extends ProblemBase {
  level: "warning";
  fix?: string;
}

export type Problem = ErrorProblem | WarningProblem;

export interface MetafabErrorOptions {
  exitCode?: ExitCode;
  code?: string;
  problems: Problem[];
  details?: unknown;
  cause?: unknown;
}

export class MetafabError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string;
  readonly problems?: Problem[];
  readonly details?: unknown;

  constructor(message: string, options: MetafabErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MetafabError";
    this.exitCode = options.exitCode ?? ExitCode.Failed;
    this.code = options.code ?? "error";
    this.problems = options.problems;
    this.details = options.details;
  }
}
