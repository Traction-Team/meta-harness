import type { Factory, PipelineEntry } from "../factory/types.js";
import { generatedComment } from "./skill.js";

export const AGENTS_MARKERS = {
  start: "<!-- factory:start -->",
  end: "<!-- factory:end -->",
};

export const CLAUDE_MARKERS = {
  start: "<!-- factory:start -->",
  end: "<!-- factory:end -->",
};

export const GITIGNORE_MARKERS = {
  start: "# metafab:start",
  end: "# metafab:end",
};

export const AGENTS_BLOCK_LINE_LIMIT = 300;

export const PIPELINE_INTRO =
  "Work moves through these workflows in order. When one ends, suggest the next.";

function stopSentence(stop: string): string {
  return /[.!?]$/.test(stop) ? stop : `${stop}.`;
}

export function renderPipelineEntry(entry: PipelineEntry, index: number): string {
  const line = `${index + 1}. \`${entry.workflow}\``;
  if (entry.stop === undefined) return line;
  return `${line}. Then stop: ${stopSentence(entry.stop)}`;
}

/**
 * The text between the factory markers in the root AGENTS.md. `standing` is the
 * rendered `.factory/AGENTS.md`; without it the source text is used as written.
 */
export function renderAgentsBlockBody(factory: Factory, standing?: string): string {
  const lines: string[] = [generatedComment(".factory"), ""];

  const text = (standing ?? factory.agentsMd ?? "").trim();
  if (text !== "") lines.push(...text.split("\n"), "");

  const pipeline = factory.factoryYaml?.pipeline ?? [];
  if (pipeline.length > 0) {
    lines.push("## Pipeline", "", PIPELINE_INTRO, "");
    for (const [index, entry] of pipeline.entries()) {
      lines.push(renderPipelineEntry(entry, index));
    }
    lines.push("");
  }

  lines.push(
    "## Factory source",
    "",
    "This repository stores its factory in `.factory/`. Edit that directory and run `metafab build`.",
    "Do not edit installed copies in `.claude/` or `.agents/`.",
  );

  return lines.join("\n");
}

/** The full root AGENTS.md block, markers included. */
export function renderAgentsBlock(factory: Factory, standing?: string): string {
  return [
    AGENTS_MARKERS.start,
    ...renderAgentsBlockBody(factory, standing).split("\n"),
    AGENTS_MARKERS.end,
  ].join("\n");
}

export function agentsBlockLineCount(factory: Factory, standing?: string): number {
  return renderAgentsBlock(factory, standing).split("\n").length;
}

export function claudeBlockBody(): string {
  return "@AGENTS.md";
}

export function gitignoreBlockBody(agents: readonly string[]): string[] {
  const lines: string[] = [];
  if (agents.includes("claude")) lines.push(".claude/skills/");
  if (agents.some((target) => target !== "claude")) lines.push(".agents/skills/");
  return lines;
}
