#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ExitCode, MetafabError } from "./errors.js";
import { NeedsInput } from "./input.js";
import { renderResult } from "./output.js";
import type { CommandResult } from "./output.js";
import { normalizeProblemPath } from "./util/fs.js";
import { didYouMean } from "./util/suggest.js";
import { buildCommand } from "./commands/build.js";
import { checkCommand } from "./commands/check.js";
import { createCommand } from "./commands/create.js";
import { detachCommand } from "./commands/detach.js";
import { diffCommand } from "./commands/diff.js";
import { importCommand } from "./commands/import.js";
import { initCommand } from "./commands/init.js";
import { mapCommand } from "./commands/map.js";
import { pipelineAddCommand } from "./commands/pipeline-add.js";
import { pipelineRemoveCommand } from "./commands/pipeline-remove.js";
import { publishCommand } from "./commands/publish.js";
import { renameCommand } from "./commands/rename.js";
import { updateCommand } from "./commands/update.js";
import type { CommandDefinition, CommandOptionValue } from "./commands/types.js";

export const COMMANDS: readonly CommandDefinition[] = [
  initCommand,
  buildCommand,
  createCommand,
  renameCommand,
  pipelineAddCommand,
  pipelineRemoveCommand,
  mapCommand,
  checkCommand,
  importCommand,
  updateCommand,
  diffCommand,
  detachCommand,
  publishCommand,
];

export interface CliIO {
  cwd?: string;
  tty?: boolean;
  stdin?: NodeJS.ReadableStream;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

type Write = (text: string) => void;

interface GlobalFlags {
  json: boolean;
  help: boolean;
  version: boolean;
  rest: string[];
}

const GLOBAL_FLAGS = new Set(["--json", "--json=true", "--help", "-h", "--version"]);

function splitGlobalFlags(argv: readonly string[]): GlobalFlags {
  const rest: string[] = [];
  for (const token of argv) {
    if (!GLOBAL_FLAGS.has(token)) rest.push(token);
  }
  return {
    json: argv.includes("--json") || argv.includes("--json=true"),
    help: argv.includes("--help") || argv.includes("-h"),
    version: argv.includes("--version"),
    rest,
  };
}

function packageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function helpText(commands: readonly CommandDefinition[]): string {
  const width = Math.max(...commands.map((command) => command.name.length)) + 2;
  return [
    "metafab <command> [options]",
    "",
    "Commands:",
    ...commands.map((command) => `  ${command.name.padEnd(width)}${command.description}`),
    "",
    "Options:",
    "  --json     Write one JSON object to stdout",
    "  -h, --help Show this help",
    "  --version  Show the metafab version",
  ].join("\n");
}

function emit(result: CommandResult, json: boolean, stdout: Write, stderr: Write): number {
  const rendered = renderResult(result, { json });
  stdout(rendered.stdout);
  if (rendered.stderr !== "") stderr(rendered.stderr);
  return result.exitCode;
}

function failure(command: string, message: string, fix: string, details?: unknown): CommandResult {
  const result: CommandResult = {
    ok: false,
    command,
    exitCode: ExitCode.Failed,
    summary: message,
    problems: [{ level: "error", file: normalizeProblemPath("metafab"), message, fix }],
  };
  if (details !== undefined) result.details = details;
  return result;
}

function fromMetafabError(command: string, error: MetafabError): CommandResult {
  const result: CommandResult = {
    ok: false,
    command,
    exitCode: error.exitCode,
    code: error.code,
    summary: error.message,
  };
  if (error.problems !== undefined) result.problems = error.problems;
  if (error.details !== undefined) result.details = error.details;
  return result;
}

function renderNeedsInput(error: NeedsInput, command: string, json: boolean, stdout: Write, stderr: Write): number {
  if (json) {
    stdout(`${JSON.stringify({ ok: false, command, required: error.required }, null, 2)}\n`);
    return error.exitCode;
  }

  stdout(`${command}: needs input\n`);
  const lines = ["Required values:"];
  for (const value of error.required) {
    const flag = value.flag === undefined ? "" : ` (${value.flag})`;
    const choices = value.choices === undefined ? "" : ` [${value.choices.join(", ")}]`;
    lines.push(`  ${value.name}${flag}${choices}: ${value.description}`);
  }
  stderr(`${lines.join("\n")}\n`);
  return error.exitCode;
}

function renderBug(error: unknown, json: boolean, stdout: Write, stderr: Write): number {
  if (json) {
    const message = error instanceof Error ? error.message : String(error);
    stdout(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  } else {
    const text = error instanceof Error ? error.stack ?? error.message : String(error);
    stderr(`${text}\n`);
  }
  return ExitCode.Failed;
}

function findCommand(commands: readonly CommandDefinition[], name: string): CommandDefinition | undefined {
  return commands.find((command) => command.name === name);
}

export async function main(
  argv: readonly string[],
  io: CliIO = {},
  commands: readonly CommandDefinition[] = COMMANDS,
): Promise<number> {
  const stdout: Write = io.stdout ?? ((text) => process.stdout.write(text));
  const stderr: Write = io.stderr ?? ((text) => process.stderr.write(text));
  const global = splitGlobalFlags(argv);
  const json = global.json;
  let commandName = "metafab";

  try {
    if (global.help) {
      return emit(
        { ok: true, command: "help", exitCode: ExitCode.Ok, summary: helpText(commands) },
        json,
        stdout,
        stderr,
      );
    }

    if (global.version) {
      const version = packageVersion();
      return emit(
        { ok: true, command: "version", exitCode: ExitCode.Ok, summary: version, version },
        json,
        stdout,
        stderr,
      );
    }

    const tokens = global.rest;
    if (tokens.length === 0) {
      return emit(
        { ok: true, command: "help", exitCode: ExitCode.Ok, summary: helpText(commands) },
        json,
        stdout,
        stderr,
      );
    }

    const first = tokens[0]!;
    let requested = first;
    let consumed = 1;
    let candidates = commands.map((command) => command.name);

    if (first === "pipeline") {
      const second = tokens[1];
      if (second === undefined) {
        return emit(
          failure(
            "pipeline",
            "The pipeline command requires a subcommand.",
            'Use "metafab pipeline add" or "metafab pipeline remove".',
          ),
          json,
          stdout,
          stderr,
        );
      }
      requested = `pipeline ${second}`;
      consumed = 2;
      candidates = commands
        .filter((command) => command.name.startsWith("pipeline "))
        .map((command) => command.name);
    }

    const definition = findCommand(commands, requested);
    if (definition === undefined) {
      const suggestion = didYouMean(requested, candidates);
      return emit(
        failure(
          "metafab",
          `Unknown command: ${requested}`,
          suggestion ?? "Run metafab --help to see the available commands.",
          { command: requested, suggestion },
        ),
        json,
        stdout,
        stderr,
      );
    }

    commandName = definition.name;
    let parsed: { positionals: string[]; values: Record<string, CommandOptionValue | undefined> };
    try {
      parsed = parseArgs({
        args: tokens.slice(consumed),
        options: definition.options ?? {},
        allowPositionals: true,
        strict: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return emit(
        failure(definition.name, message, "Run metafab --help to see the available commands."),
        json,
        stdout,
        stderr,
      );
    }

    const result = await definition.run({
      cwd: io.cwd ?? process.cwd(),
      positionals: parsed.positionals,
      options: parsed.values,
      io: {
        tty: io.tty ?? process.stdin.isTTY === true,
        stdin: io.stdin,
        stderr,
      },
    });
    return emit(result, json, stdout, stderr);
  } catch (error) {
    if (error instanceof NeedsInput) {
      return renderNeedsInput(error, commandName, json, stdout, stderr);
    }
    if (error instanceof MetafabError) {
      return emit(fromMetafabError(commandName, error), json, stdout, stderr);
    }
    return renderBug(error, json, stdout, stderr);
  }
}

function isEntryPoint(entry: string | undefined): boolean {
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(entry));
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
