import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { cliVersion } from "../../util/version.js";
import type { Factory } from "../factory/types.js";
import { automationErrors } from "./problems.js";
import { promptProblems } from "./prompt.js";
import { relativeFactoryDir, renderStub, stubMarker } from "./stub.js";
import type { Automation, Target } from "./types.js";

/** One automation a target's sync registers. */
export interface DesiredEntry {
  name: string;
  title: string;
  cron: string;
  tz: string;
  checkout: "worktree" | "main";
  /** The text the target registers, from `renderStub`. */
  stub: string;
}

/** The title every registration sync owns starts with. */
const TITLE_PREFIX = "automation: ";

function scheduleOf(automation: Automation): { cron: string; tz: string } | undefined {
  for (const trigger of automation.triggers) {
    if (trigger.kind === "schedule") return trigger;
  }
  return undefined;
}

/**
 * Every problem that stops a sync: the errors in `.factory/automations/`, plus
 * the dependency errors that stop a prompt for an automation, such as an error
 * in `run.md` or in a partial either of them imports. A file that several
 * automations depend on reports each of its problems once.
 */
async function syncProblems(factory: Factory): Promise<Problem[]> {
  const problems = automationErrors(factory);
  for (const automation of factory.automations?.list ?? []) {
    problems.push(...(await promptProblems(automation.name, factory)));
  }

  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = `${problem.file}\u0000${problem.line ?? 0}\u0000${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The set a target's sync makes the target match: one entry per enabled
 * automation with a schedule trigger, owned by `account` or `"*"`, in name
 * order. Any automation error, including one in a file its prompt depends on,
 * stops it before the target is touched.
 */
export async function desiredSet(
  factory: Factory,
  target: Target,
  account: string,
  trunk: string,
): Promise<DesiredEntry[]> {
  const problems = await syncProblems(factory);
  if (problems.length > 0) {
    throw new MetafabError("The automations have errors", {
      exitCode: ExitCode.Failed,
      code: "automation-errors",
      problems,
    });
  }

  const yaml = factory.factoryYaml;
  if (yaml === undefined || yaml.format !== 2) return [];

  const wanted = (factory.automations?.list ?? []).filter(
    (automation) =>
      automation.enabled &&
      scheduleOf(automation) !== undefined &&
      (automation.owner === "*" || automation.owner.toLowerCase() === account.toLowerCase()),
  );
  if (wanted.length === 0) return [];

  const factoryRelDir = await relativeFactoryDir(factory.root);
  const version = cliVersion();

  return wanted.map((automation) => {
    const schedule = scheduleOf(automation)!;
    return {
      name: automation.name,
      title: `${TITLE_PREFIX}${automation.name}`,
      cron: schedule.cron,
      tz: schedule.tz,
      checkout: automation.checkout,
      stub: renderStub({
        factoryName: yaml.name,
        automation,
        target,
        trunk,
        factoryRelDir,
        cliVersion: version,
      }),
    };
  });
}

/**
 * The automation name a registration is managed for, or undefined when it is
 * not this factory's: the title must be `automation: <name>`, and the prompt's
 * first line must be the marker for that name and factory.
 */
export function isManaged(
  entry: { title: string; prompt: string },
  factoryName: string,
): string | undefined {
  if (!entry.title.startsWith(TITLE_PREFIX)) return undefined;
  const name = entry.title.slice(TITLE_PREFIX.length);
  if (name === "") return undefined;
  const firstLine = toLF(entry.prompt).split("\n")[0] ?? "";
  return firstLine === stubMarker(name, factoryName) ? name : undefined;
}
