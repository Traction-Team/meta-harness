import type { Condition } from "./condition.js";
import type { Branch, MarkdownDocument, Node } from "./directives.js";
import { classify } from "./scenarios.js";
import type { EnvSelection, EnvVariable } from "./types.js";

export interface RenderContext {
  variables: readonly EnvVariable[];
  selection: EnvSelection;
}

type SwitchNode = Extract<Node, { kind: "switch" }>;

/**
 * Renders a parsed Markdown document for the selection: a block that applies to
 * every scenario is kept unlabelled, one that applies to none is removed, and a
 * partial match is kept after its label line. Directive lines are gone already,
 * and text lines are written unchanged.
 */
export function renderDocument(document: MarkdownDocument, context: RenderContext): string {
  return renderNodes(document.nodes, [], context).join("\n");
}

/**
 * True when the document renders at least one non-blank text line for the
 * selection. `renderDocument` adds a `**<label>:**` line before a block that
 * applies to only some values, even when the block holds only blank lines, so a
 * document can render something and still have nothing to do. `check`'s
 * empty-body rule and `prompt` both ask this, so they agree on what empty means.
 */
export function rendersContent(document: MarkdownDocument, context: RenderContext): boolean {
  return hasContent(document.nodes, [], context);
}

function hasContent(
  nodes: readonly Node[],
  enclosing: readonly Condition[],
  context: RenderContext,
): boolean {
  for (const node of nodes) {
    if (node.kind === "text") {
      if (node.text.trim() !== "") return true;
      continue;
    }

    // An import has no text of its own: its children count in place.
    if (node.kind === "import") {
      if (hasContent(node.children, enclosing, context)) return true;
      continue;
    }

    if (node.kind === "when") {
      const applies = classify(node.condition, enclosing, context.selection, context.variables);
      if (applies.kind === "none") continue;
      if (hasContent(node.children, [...enclosing, node.condition], context)) return true;
      continue;
    }

    for (const branch of node.branches) {
      const condition = branchCondition(node, branch);
      const applies = classify(condition, enclosing, context.selection, context.variables);
      if (applies.kind === "none") continue;
      if (hasContent(branch.children, [...enclosing, condition], context)) return true;
    }
  }

  return false;
}

function renderNodes(
  nodes: readonly Node[],
  enclosing: readonly Condition[],
  context: RenderContext,
): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.kind === "text") {
      lines.push(node.text);
      continue;
    }

    // An import has no text of its own: its children are rendered in place,
    // classified with the conditions that enclose the import line.
    if (node.kind === "import") {
      lines.push(...renderNodes(node.children, enclosing, context));
      continue;
    }

    if (node.kind === "when") {
      const applies = classify(node.condition, enclosing, context.selection, context.variables);
      if (applies.kind === "none") continue;
      const inner = renderNodes(node.children, [...enclosing, node.condition], context);
      if (inner.length === 0) continue;
      if (applies.kind === "some") lines.push(`${node.indent}**${applies.label}:**`);
      lines.push(...inner);
      continue;
    }

    for (const branch of node.branches) {
      const condition = branchCondition(node, branch);
      const applies = classify(condition, enclosing, context.selection, context.variables);
      if (applies.kind === "none") continue;
      const inner = renderNodes(branch.children, [...enclosing, condition], context);
      if (inner.length === 0) continue;
      if (applies.kind === "some") lines.push(`${branch.indent}**${applies.label}:**`);
      lines.push(...inner);
    }
  }

  return lines;
}

/**
 * A branch as the condition it stands for: `env.<variable> in [<its values>]`,
 * and for `default` the negation over every value the switch's cases name.
 */
function branchCondition(node: SwitchNode, branch: Branch): Condition {
  return {
    kind: "test",
    variable: node.variable,
    values:
      branch.kind === "case"
        ? [...branch.values]
        : node.branches.flatMap((entry) => entry.values),
    negate: branch.kind === "default",
  };
}
