import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

export type MarkdownChoice = { mode: "single" | "multi"; group: string; value: string };
export type MarkdownChoiceSelection = Readonly<Record<string, readonly string[]>>;

export function parseMarkdownChoiceHref(href: string): MarkdownChoice | null {
  const match = /^(choice|choices):([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})$/.exec(href);
  if (!match || match[0] !== href) return null;
  return { mode: match[1] === "choice" ? "single" : "multi", group: match[2]!, value: match[3]! };
}

export function analyzeMarkdownChoices(text: string) {
  const groups = new Map<string, MarkdownChoice["mode"] | "conflict">();
  const options = new Map<string, MarkdownChoice>();
  if (!/choices?:/.test(text)) return { groups, options };
  const tree = fromMarkdown(text);
  const definitions = new Map<string, string>();
  const visit = (node: Nodes, onNode: (node: Nodes) => void) => {
    onNode(node);
    if ("children" in node) for (const child of node.children) visit(child, onNode);
  };
  visit(tree, (node) => {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
  });
  visit(tree, (node) => {
    const href =
      node.type === "link"
        ? node.url
        : node.type === "linkReference"
          ? definitions.get(node.identifier)
          : undefined;
    const choice = href ? parseMarkdownChoiceHref(href) : null;
    if (!choice) return;
    options.set(`${choice.group}/${choice.value}`, choice);
    const previous = groups.get(choice.group);
    groups.set(choice.group, previous && previous !== choice.mode ? "conflict" : choice.mode);
  });
  for (const [key, choice] of options) {
    if (groups.get(choice.group) === "conflict") options.delete(key);
  }
  return { groups, options };
}

export function toggleMarkdownChoice(
  state: MarkdownChoiceSelection,
  choice: MarkdownChoice,
): MarkdownChoiceSelection {
  const selected = Object.hasOwn(state, choice.group) ? state[choice.group]! : [];
  return {
    ...state,
    [choice.group]: selected.includes(choice.value)
      ? selected.filter((value) => value !== choice.value)
      : choice.mode === "single"
        ? [choice.value]
        : [...selected, choice.value],
  };
}
