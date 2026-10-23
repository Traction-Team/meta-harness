import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
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

async function question(text: string, io: ResolvedInputIO): Promise<string> {
  const output = new Writable({
    write(chunk, _encoding, callback) {
      io.stderr(String(chunk));
      callback();
    },
  });
  const rl = createInterface({ input: io.stdin, output });
  try {
    return (await rl.question(text)).trim();
  } finally {
    rl.close();
  }
}

export async function ask(required: RequiredValue, io?: InputIO): Promise<string> {
  const resolved = resolveIO(io);
  assertInteractive(resolved, required);
  const prompt = promptFor(required);

  for (;;) {
    const answer = await question(prompt, resolved);
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
    const answer = (await question(prompt, resolved)).toLowerCase();
    if (answer === "") return fallback;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    resolved.stderr("Answer yes or no.\n");
  }
}
