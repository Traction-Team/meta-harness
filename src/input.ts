import { createInterface } from "node:readline/promises";
import { ExitCode, MetafabError } from "./errors.js";

export interface RequiredValue {
  name: string;
  flag?: string;
  description: string;
  choices?: string[];
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

function assertInteractive(required: RequiredValue): void {
  if (process.stdin.isTTY !== true) throw new NeedsInput([required]);
}

function promptFor(required: RequiredValue): string {
  const choices = required.choices === undefined ? "" : ` (${required.choices.join("/")})`;
  return `${required.description}${choices} `;
}

async function question(text: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(text)).trim();
  } finally {
    rl.close();
  }
}

export async function ask(required: RequiredValue): Promise<string> {
  assertInteractive(required);
  const prompt = promptFor(required);

  for (;;) {
    const answer = await question(prompt);
    if (answer === "" || required.choices === undefined || required.choices.includes(answer)) {
      return answer;
    }
    process.stderr.write(`Choose one of: ${required.choices.join(", ")}\n`);
  }
}

export interface ConfirmOptions {
  default?: boolean;
}

export async function confirm(required: RequiredValue, options: ConfirmOptions = {}): Promise<boolean> {
  assertInteractive(required);
  const fallback = options.default ?? false;
  const prompt = `${required.description} ${fallback ? "[Y/n]" : "[y/N]"} `;

  for (;;) {
    const answer = (await question(prompt)).toLowerCase();
    if (answer === "") return fallback;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    process.stderr.write("Answer yes or no.\n");
  }
}
