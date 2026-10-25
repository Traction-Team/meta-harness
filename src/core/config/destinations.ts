import type { Destination, Target } from "./types.js";

export const CLAUDE_SKILLS_DIRECTORY = ".claude/skills";
export const AGENTS_SKILLS_DIRECTORY = ".agents/skills";

export function destinationDirectory(target: Target): string {
  return target === "claude" ? CLAUDE_SKILLS_DIRECTORY : AGENTS_SKILLS_DIRECTORY;
}

export function destinations(targets: Target[]): Destination[] {
  const byDirectory = new Map<string, Destination>();

  for (const target of targets) {
    const directory = destinationDirectory(target);
    const existing = byDirectory.get(directory);
    if (existing === undefined) {
      byDirectory.set(directory, { directory, targets: [target] });
    } else if (!existing.targets.includes(target)) {
      existing.targets.push(target);
    }
  }

  return [...byDirectory.values()];
}
