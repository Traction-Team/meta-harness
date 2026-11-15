import { ExitCode } from "./errors.js";
import type { Problem } from "./errors.js";

export interface CommandResult {
  ok: boolean;
  command: string;
  exitCode: ExitCode;
  problems: Problem[];
  summary?: string;
  [key: string]: unknown;
}

export interface RenderOptions {
  json?: boolean;
}

export interface RenderedResult {
  stdout: string;
  stderr: string;
}

export function formatProblem(problem: Problem): string {
  const location = problem.line === undefined ? problem.file : `${problem.file}:${problem.line}`;
  const lines = [`${location}: ${problem.level}: ${problem.message}`];
  if (problem.fix !== undefined) lines.push(`  fix: ${problem.fix}`);
  return lines.join("\n");
}

export function formatProblems(problems: readonly Problem[]): string {
  return problems.map(formatProblem).join("\n");
}

export function summarizeResult(result: CommandResult): string {
  if (result.summary !== undefined && result.summary !== "") return result.summary;
  const problems = result.problems ?? [];
  const errors = problems.filter((problem) => problem.level === "error").length;
  const warnings = problems.filter((problem) => problem.level === "warning").length;
  const status = result.ok ? "ok" : "failed";
  const counts: string[] = [];
  if (errors > 0) counts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0) counts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  const suffix = counts.length === 0 ? "" : ` (${counts.join(", ")})`;
  return `${result.command}: ${status}${suffix}`;
}

export function renderResult(result: CommandResult, options: RenderOptions = {}): RenderedResult {
  if (options.json === true) {
    return { stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: "" };
  }

  const summary = summarizeResult(result);
  const stdout = summary.endsWith("\n") ? summary : `${summary}\n`;
  const problems = result.problems ?? [];
  const stderr = problems.length === 0 ? "" : `${formatProblems(problems)}\n`;
  return { stdout, stderr };
}
