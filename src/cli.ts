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
import { closeInput, NeedsInput } from "./input.js";
import { renderResult } from "./output.js";
import type { CommandResult } from "./output.js";
import { normalizeProblemPath } from "./util/fs.js";
import { didYouMean } from "./util/suggest.js";
import { cliVersion } from "./util/version.js";
import { automationsListCommand } from "./commands/automations-list.js";
import { automationsPromptCommand } from "./commands/automations-prompt.js";
import { automationsStubCommand } from "./commands/automations-stub.js";
import { buildCommand } from "./commands/build.js";
import { checkCommand } from "./commands/check.js";
import { createCommand } from "./commands/create.js";
import { detachCommand } from "./commands/detach.js";
import { diffCommand } from "./commands/diff.js";
import { envCommand, envSetCommand, envUnsetCommand } from "./commands/env.js";
import { importCommand } from "./commands/import.js";
import { initCommand } from "./commands/init.js";
import { mapCommand } from "./commands/map.js";
import { pipelineAddCommand } from "./commands/pipeline-add.js";
import { pipelineRemoveCommand } from "./commands/pipeline-remove.js";
import { publishCommand } from "./commands/publish.js";
import { updateCommand } from "./commands/update.js";
import type {
  CommandDefinition,
  CommandOptionDefinition,
  CommandOptionValue,
  CommandOptions,
} from "./commands/types.js";

export const COMMANDS: readonly CommandDefinition[] = [
  initCommand,
  buildCommand,
  createCommand,
  pipelineAddCommand,
  pipelineRemoveCommand,
  mapCommand,
  checkCommand,
  automationsListCommand,
  automationsPromptCommand,
  automationsStubCommand,
  envCommand,
  envSetCommand,
  envUnsetCommand,
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

/** The global flags' names, for the `-<word>` hint before a command name. */
const GLOBAL_FLAG_NAMES = ["json", "help", "version"];

/** The fix line an unexpected error carries: it is a defect in Metafab, not in the repository. */
const BUG_FIX = "This is a bug in metafab. Report it with the command you ran and this message";

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
 * `--help`, `-h` or a repeated `-h` such as `-hh`, anywhere after the command
 * name and before a `--`, asks for help: `h` is the only short option any
 * command declares, so those are exactly the tokens `parseArgs` reads as
 * `help: true` with no unknown letter. Any other word after one dash is a group
 * of short options, so `-help` and `-jh` are unknown options, not help.
 */
function isHelpToken(token: string): boolean {
  return token === "--help" || /^-h+$/.test(token);
}

/**
 * The option name a `-<word>` token spells, when `names` has it: `-help` gives
 * `help`. Only a word longer than one letter counts, so `-h` and `--help` give
 * nothing. `parseArgs` rejects such a token on its first letter (`Unknown option
 * '-e'` for `-help`), so this names the token the person typed instead.
 */
function singleDashOption(token: string, names: readonly string[]): string | undefined {
  if (!token.startsWith("-") || token.startsWith("--")) return undefined;
  const word = token.slice(1);
  if (word.length < 2) return undefined;
  return names.includes(word) ? word : undefined;
}

/**
 * The `-<word>` spelling of an option that `parseArgs` rejects first, or
 * undefined when it rejects another token first. The tokens are walked the way
 * `parseArgs` reads them: a known option, a known option's value and a
 * positional argument all pass, and the first token that does not ends the walk.
 * So `publish --bogus -dry-run` keeps its `--bogus` error, and only
 * `publish -dry-run --bogus` gets the hint.
 */
function rejectedSingleDashOption(
  args: readonly string[],
  options: CommandOptions,
): string | undefined {
  const names = Object.keys(options);
  const shorts = new Map<string, CommandOptionDefinition>();
  for (const option of Object.values(options)) {
    if (option.short !== undefined) shorts.set(option.short, option);
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    if (token === "--") return undefined;

    if (token.startsWith("--")) {
      const name = token.slice(2).split("=")[0]!;
      const option = options[name];
      if (option === undefined) return undefined;
      if (option.type === "string" && !token.includes("=")) {
        // A value that starts with a dash is ambiguous to `parseArgs`, which
        // then rejects the option itself rather than the value.
        const value = args[index + 1];
        if (value === undefined || value.startsWith("-")) return undefined;
        index += 1;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      let known = true;
      for (let at = 1; at < token.length; at += 1) {
        const option = shorts.get(token[at]!);
        if (option === undefined) {
          known = false;
          break;
        }
        if (option.type === "string") {
          // The rest of the cluster is the value, or else the next token is.
          if (at === token.length - 1) {
            const value = args[index + 1];
            if (value === undefined || value.startsWith("-")) return undefined;
            index += 1;
          }
          break;
        }
      }
      if (!known) return singleDashOption(token, names);
    }
  }

  return undefined;
}

/**
 * `--help`, `-h` or `-hh` after the command name, before a `--`, wins over every
 * other flag and argument. The leading words name the command (`pipeline add`),
 * the `pipeline` group, or nothing (the global help, also for an unknown name).
 */
function helpTarget(
  tokens: readonly string[],
  commands: readonly CommandDefinition[],
  globalHelpFlag: boolean,
): HelpTarget | undefined {
  const end = tokens.indexOf("--");
  const beforeDash = end === -1 ? tokens : tokens.slice(0, end);
  const wantsHelp = globalHelpFlag || beforeDash.some(isHelpToken);
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
    if (name === "pipeline" || name === "automations") return { kind: "group", group: name };
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
    const help = commandHelp(target.definition, commands);
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
  // A command that writes text alone (`textOnly`) puts its whole output in
  // `summary`, and a failure writes nothing to standard output: its problems
  // go to standard error. The flag is Metafab's, not part of the result.
  const textOnly = result.textOnly === true;
  const shown: CommandResult = { ...result };
  delete shown.textOnly;

  const rendered = renderResult(shown, { json });
  if (json || !textOnly || result.exitCode === ExitCode.Ok) stdout(rendered.stdout);
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
    problems: error.problems ?? [],
  };
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

function renderBug(
  error: unknown,
  command: string,
  json: boolean,
  stdout: Write,
  stderr: Write,
): number {
  const message = error instanceof Error ? error.message : String(error);

  if (json) {
    // A stack helps a person reporting a bug, but is noise in a machine-read
    // result, so the JSON branch writes the bug as a problem instead.
    stdout(
      `${JSON.stringify(
        {
          ok: false,
          command,
          exitCode: ExitCode.Failed,
          error: message,
          problems: [{ level: "error", file: "metafab", message, fix: BUG_FIX }],
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const text = error instanceof Error ? error.stack ?? error.message : String(error);
    stderr(`${text}\n  fix: ${BUG_FIX}\n`);
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
        {
          ok: true,
          command: "version",
          exitCode: ExitCode.Ok,
          problems: [],
          summary: version,
          version,
        },
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
    } else if (first === "automations") {
      const second = tokens[1];
      if (second === undefined || second === "--json" || second === "--json=true") {
        return emit(
          failure(
            "automations",
            "The automations command requires a subcommand.",
            'Run "metafab automations --help" to see its subcommands.',
          ),
          failureJson,
          stdout,
          stderr,
        );
      }
      requested = `automations ${second}`;
      consumed = 2;
      candidates = commands
        .filter((command) => command.name.startsWith("automations "))
        .map((command) => command.name);
    } else if (first === "env") {
      // Unlike `pipeline`, `env` alone is a command: only `set` and `unset`
      // name a subcommand, and any other word is an argument `env` refuses.
      const second = tokens[1];
      if (second === "set" || second === "unset") {
        requested = `env ${second}`;
        consumed = 2;
      }
    }

    const definition = findCommand(commands, requested);
    if (definition === undefined) {
      const suggestion = didYouMean(requested, candidates);
      const globalWord = singleDashOption(first, GLOBAL_FLAG_NAMES);
      return emit(
        failure(
          "metafab",
          `Unknown command: ${requested}`,
          globalWord === undefined
            ? suggestion ?? "Run metafab --help to see the available commands."
            : `Did you mean --${globalWord}?`,
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
      const word = rejectedSingleDashOption(tokens.slice(consumed), options);
      const helpHint = `Run metafab ${definition.name} --help to see its options`;
      return emit(
        failure(
          definition.name,
          word === undefined ? message : `Unknown option '-${word}'`,
          word === undefined ? helpHint : `Did you mean --${word}? ${helpHint}`,
        ),
        failureJson,
        stdout,
        stderr,
      );
    }

    if (parsed.values.json === true) json = true;
    // A global `--json` before the command reaches the command the same way.
    if (json && parsed.values.json !== true) parsed.values.json = true;

    // A safety net that today's options cannot reach: `h` is the only short
    // option any command declares, so every token `parseArgs` reads as `help`
    // is one `isHelpToken` caught above. It stays for a command that adds a
    // short boolean option, such as `short: "f"`: `-fh` would then pass
    // `parseArgs` with `help: true` and still must print help, not run.
    if (parsed.values.help === true) {
      return emit(
        renderHelp({ kind: "command", definition }, commands, helpJson),
        helpJson,
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
    return renderBug(error, commandName, json, stdout, stderr);
  } finally {
    // An open reader on process.stdin would keep the process alive.
    closeInput();
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
