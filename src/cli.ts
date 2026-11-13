#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ExitCode, MetafabError } from "./errors.js";
import {
  GLOBAL_OPTIONS,
  commandHelp,
  globalHelp,
  groupHelp,
  renderCommandHelp,
  renderGroupHelp,
} from "./help.js";
import { NeedsInput } from "./input.js";
import { renderResult } from "./output.js";
import type { CommandResult } from "./output.js";
import { normalizeProblemPath } from "./util/fs.js";
import { didYouMean } from "./util/suggest.js";
import { cliVersion } from "./util/version.js";
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
import { updateCommand } from "./commands/update.js";
import type { CommandDefinition, CommandOptionValue, CommandOptions } from "./commands/types.js";

export const COMMANDS: readonly CommandDefinition[] = [
  initCommand,
  buildCommand,
  createCommand,
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
  let json = false;
  let help = false;
  let version = false;
  let index = 0;

  while (index < argv.length && GLOBAL_FLAGS.has(argv[index]!)) {
    const token = argv[index]!;
    if (token === "--json" || token === "--json=true") json = true;
    else if (token === "--version") version = true;
    else help = true;
    index += 1;
  }

  return { json, help, version, rest: argv.slice(index) };
}

function hasJsonFlag(argv: readonly string[]): boolean {
  return argv.some((token) => token === "--json" || token === "--json=true");
}

/** Which help a command line asks for, or undefined when it asks for none. */
type HelpTarget =
  | { kind: "command"; definition: CommandDefinition }
  | { kind: "group"; group: string }
  | { kind: "global" };

/**
 * `--help` or `-h` anywhere after the command name, before a `--`, wins over every
 * other flag and argument. The leading words name the command (`pipeline add`), the
 * `pipeline` group, or nothing (the global help, also for an unknown name).
 */
function helpTarget(
  tokens: readonly string[],
  commands: readonly CommandDefinition[],
  globalHelpFlag: boolean,
): HelpTarget | undefined {
  const end = tokens.indexOf("--");
  const beforeDash = end === -1 ? tokens : tokens.slice(0, end);
  const wantsHelp =
    globalHelpFlag || beforeDash.some((token) => token === "--help" || token === "-h");
  if (!wantsHelp) return undefined;

  const names: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) break;
    names.push(token);
  }

  if (names.length >= 2) {
    const definition = findCommand(commands, `${names[0]} ${names[1]}`);
    if (definition !== undefined) return { kind: "command", definition };
  }
  if (names.length >= 1) {
    const name = names[0]!;
    const definition = findCommand(commands, name);
    if (definition !== undefined) return { kind: "command", definition };
    if (name === "pipeline") return { kind: "group", group: name };
  }
  return { kind: "global" };
}

/** The help result: rendered as `summary` for a person, as data with `--json`. */
function renderHelp(
  target: HelpTarget,
  commands: readonly CommandDefinition[],
  json: boolean,
): CommandResult {
  const result: CommandResult = { ok: true, command: "help", exitCode: ExitCode.Ok, problems: [] };

  if (target.kind === "command") {
    const help = commandHelp(target.definition);
    result.help = help;
    if (!json) result.summary = renderCommandHelp(help);
  } else if (target.kind === "group") {
    const help = groupHelp(target.group, commands);
    result.help = help;
    if (!json) result.summary = renderGroupHelp(help);
  } else {
    const help = globalHelp(commands);
    result.commands = help.commands;
    if (!json) result.summary = help.text;
  }

  return result;
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
    stdout(
      `${JSON.stringify({ ok: false, command, exitCode: error.exitCode, required: error.required }, null, 2)}\n`,
    );
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
    stdout(`${JSON.stringify({ ok: false, exitCode: ExitCode.Failed, error: message }, null, 2)}\n`);
  } else {
    const text = error instanceof Error ? error.stack ?? error.message : String(error);
    stderr(`${text}\n`);
  }
  return ExitCode.Failed;
}

function findCommand(commands: readonly CommandDefinition[], name: string): CommandDefinition | undefined {
  return commands.find((command) => command.name === name);
}

function parseCommandArgs(
  args: readonly string[],
  options: CommandOptions,
): { positionals: string[]; values: Record<string, CommandOptionValue | undefined> } {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("argument is ambiguous")) throw error;
    const relaxed = parseArgs({ args, options, allowPositionals: true, strict: false });
    for (const key of Object.keys(relaxed.values)) {
      if (!(key in options)) throw new Error(`Unknown option: --${key}`);
    }
    return relaxed;
  }
}

export async function main(
  argv: readonly string[],
  io: CliIO = {},
  commands: readonly CommandDefinition[] = COMMANDS,
): Promise<number> {
  const stdout: Write = io.stdout ?? ((text) => process.stdout.write(text));
  const stderr: Write = io.stderr ?? ((text) => process.stderr.write(text));
  const global = splitGlobalFlags(argv);
  let json = global.json;
  const helpJson = json || hasJsonFlag(argv);
  const failureJson = helpJson;
  let commandName = "metafab";

  try {
    // Help is decided before the pipeline branch and before the command's options are
    // parsed, so `import --bogus --help` and `pipeline add -h` still print help.
    const tokens = global.rest;
    const target = helpTarget(tokens, commands, global.help);
    if (target !== undefined) {
      return emit(renderHelp(target, commands, helpJson), helpJson, stdout, stderr);
    }

    if (global.version) {
      const version = cliVersion();
      return emit(
        { ok: true, command: "version", exitCode: ExitCode.Ok, summary: version, version },
        json,
        stdout,
        stderr,
      );
    }

    if (tokens.length === 0) {
      return emit(renderHelp({ kind: "global" }, commands, helpJson), helpJson, stdout, stderr);
    }

    const first = tokens[0]!;
    let requested = first;
    let consumed = 1;
    let candidates = commands.map((command) => command.name);

    if (first === "pipeline") {
      const second = tokens[1];
      if (second === undefined || second === "--json" || second === "--json=true") {
        return emit(
          failure(
            "pipeline",
            "The pipeline command requires a subcommand.",
            'Use "metafab pipeline add" or "metafab pipeline remove".',
          ),
          failureJson,
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
        failureJson,
        stdout,
        stderr,
      );
    }

    commandName = definition.name;
    const options: CommandOptions = {
      ...definition.options,
      ...GLOBAL_OPTIONS,
    };
    let parsed: { positionals: string[]; values: Record<string, CommandOptionValue | undefined> };
    try {
      parsed = parseCommandArgs(tokens.slice(consumed), options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return emit(
        failure(
          definition.name,
          message,
          `Run metafab ${definition.name} --help to see its options`,
        ),
        failureJson,
        stdout,
        stderr,
      );
    }

    if (parsed.values.json === true) json = true;
    // A global `--json` before the command reaches the command the same way.
    if (json && parsed.values.json !== true) parsed.values.json = true;

    if (parsed.values.help === true) {
      return emit(
        renderHelp({ kind: "command", definition }, commands, json),
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
