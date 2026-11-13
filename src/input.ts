import { createInterface } from "node:readline";
import { ExitCode, MetafabError } from "./errors.js";

export interface RequiredValue {
  name: string;
  flag?: string;
  description: string;
  choices?: string[];
}

export interface InputIO {
  tty?: boolean;
  stdin?: NodeJS.ReadableStream;
  stderr?: (text: string) => void;
}

interface ResolvedInputIO {
  tty: boolean;
  stdin: NodeJS.ReadableStream;
  stderr: (text: string) => void;
}

export class NeedsInput extends MetafabError {
  readonly required: RequiredValue[];

  constructor(required: RequiredValue[]) {
    const names = required.map((value) => value.name).join(", ");
    super(`Required input was unavailable in non-interactive mode: ${names}`, {
      exitCode: ExitCode.NeedsInput,
      code: "needs-input",
      details: { required },
    });
    this.name = "NeedsInput";
    this.required = required;
  }
}

/** One line reader per input stream, shared by every question in a run. */
interface LineReader {
  next(): Promise<string | undefined>;
  close(): void;
}

const readers = new Map<NodeJS.ReadableStream, LineReader>();

/** Input streams whose end a reader has already seen. */
const endedStreams = new WeakSet<NodeJS.ReadableStream>();

/** `readableEnded` is on `stream.Readable`, not on the `NodeJS.ReadableStream` type. */
function hasEnded(stream: NodeJS.ReadableStream): boolean {
  const state = stream as { readableEnded?: boolean; destroyed?: boolean; closed?: boolean };
  return state.readableEnded === true || state.destroyed === true || state.closed === true;
}

const closedReader: LineReader = {
  next: async () => undefined,
  close: () => undefined,
};

/**
 * The one reader for `stdin`, created on first use. Its lines are queued, so a
 * chunk that holds several answers answers several questions. The reader is
 * paused while no question waits, so a child process that later reads standard
 * input is not starved.
 */
function readerFor(stdin: NodeJS.ReadableStream): LineReader {
  const existing = readers.get(stdin);
  if (existing !== undefined) return existing;
  // A reader removed at the end of input must not be created again: a stream
  // that already ended never announces the end a second time.
  if (endedStreams.has(stdin) || hasEnded(stdin)) return closedReader;

  const queued: string[] = [];
  const waiting: ((line: string | undefined) => void)[] = [];
  let ended = false;

  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  rl.pause();

  const settle = (): void => {
    while (waiting.length > 0 && (queued.length > 0 || ended)) {
      waiting.shift()!(queued.shift());
    }
    if (ended) {
      // Queued answers still belong to later questions; the reader goes away
      // once nothing is left to hand out.
      if (queued.length === 0 && waiting.length === 0) readers.delete(stdin);
    } else if (waiting.length === 0) {
      rl.pause();
    }
  };

  rl.on("line", (line) => {
    if (waiting.length > 0) waiting.shift()!(line);
    else queued.push(line);
    settle();
  });

  rl.on("close", () => {
    ended = true;
    if (hasEnded(stdin)) endedStreams.add(stdin);
    settle();
  });

  // A stream that is destroyed instead of ended (`destroy()` with no `end()`)
  // announces `close` but never `end`, so readline leaves its interface open.
  // Treat that as the end of input too, or the next question waits forever on
  // a dead stream.
  const onStreamClose = (): void => {
    ended = true;
    endedStreams.add(stdin);
    settle();
  };
  stdin.on("close", onStreamClose);

  const reader: LineReader = {
    next() {
      return new Promise<string | undefined>((resolve) => {
        if (queued.length > 0) {
          resolve(queued.shift());
          settle();
          return;
        }
        if (ended) {
          resolve(undefined);
          settle();
          return;
        }
        waiting.push(resolve);
        rl.resume();
      });
    },
    close() {
      stdin.off("close", onStreamClose);
      rl.close();
      readers.delete(stdin);
    },
  };

  readers.set(stdin, reader);
  return reader;
}

/** Closes every open reader. `main` calls it in `finally`. */
export function closeInput(): void {
  for (const reader of [...readers.values()]) reader.close();
  readers.clear();
}

/** @internal Test-only: how many input streams still have an open reader. */
export function openReaderCount(): number {
  return readers.size;
}

function resolveIO(io: InputIO = {}): ResolvedInputIO {
  return {
    tty: io.tty ?? process.stdin.isTTY === true,
    stdin: io.stdin ?? process.stdin,
    stderr:
      io.stderr ??
      ((text) => {
        process.stderr.write(text);
      }),
  };
}

function assertInteractive(io: ResolvedInputIO, required: RequiredValue): void {
  if (!io.tty) throw new NeedsInput([required]);
}

function promptFor(required: RequiredValue): string {
  const choices = required.choices === undefined ? "" : ` (${required.choices.join("/")})`;
  return `${required.description}${choices} `;
}

async function question(
  text: string,
  required: RequiredValue,
  io: ResolvedInputIO,
): Promise<string> {
  io.stderr(text);
  const answer = await readerFor(io.stdin).next();
  if (answer === undefined) throw new NeedsInput([required]);
  return answer.trim();
}

export async function ask(required: RequiredValue, io?: InputIO): Promise<string> {
  const resolved = resolveIO(io);
  assertInteractive(resolved, required);
  const prompt = promptFor(required);

  for (;;) {
    const answer = await question(prompt, required, resolved);
    if (answer === "" || required.choices === undefined || required.choices.includes(answer)) {
      return answer;
    }
    resolved.stderr(`Choose one of: ${required.choices.join(", ")}\n`);
  }
}

export interface ConfirmOptions {
  default?: boolean;
}

export async function confirm(required: RequiredValue, options: ConfirmOptions = {}, io?: InputIO): Promise<boolean> {
  const resolved = resolveIO(io);
  assertInteractive(resolved, required);
  const fallback = options.default ?? false;
  const prompt = `${required.description} ${fallback ? "[Y/n]" : "[y/N]"} `;

  for (;;) {
    const answer = (await question(prompt, required, resolved)).toLowerCase();
    if (answer === "") return fallback;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    resolved.stderr("Answer yes or no.\n");
  }
}
