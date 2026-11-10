import {
  MarkdownReferenceDefinition,
  OrchestrationV2GetMarkdownReferenceInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { Nodes } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

const isReferenceId = Schema.is(OrchestrationV2GetMarkdownReferenceInput.fields.id);
const decodeDefinition = Schema.decodeUnknownSync(MarkdownReferenceDefinition, {
  onExcessProperty: "error",
});
const parser = unified().use(remarkParse);

export function parseMarkdownReferenceHref(href: string): string | null {
  if (!href.startsWith("ref:")) return null;
  const id = href.slice(4);
  return isReferenceId(id) ? id : null;
}

export function parseMarkdownReferenceDefinition(
  source: string,
): MarkdownReferenceDefinition | null {
  if (source.length > 65536) return null;
  try {
    return decodeDefinition(JSON.parse(source));
  } catch {
    return null;
  }
}

export function extractMarkdownReferenceDefinitions(
  text: string,
): readonly MarkdownReferenceDefinition[] {
  const definitions: MarkdownReferenceDefinition[] = [];
  const visit = (node: Nodes): void => {
    if (node.type === "code" && node.lang === "reference" && !node.meta) {
      const start = node.position?.start;
      const end = node.position?.end;
      if (start?.offset === undefined || end?.offset === undefined || start.line === end.line)
        return;
      const source = text.slice(start.offset, end.offset);
      const opening = /^(`{3,}|~{3,})[ \t]*reference[ \t]*(?:\r?\n|\r)/.exec(source);
      // MDAST also emits code nodes for unclosed fences; only a real closing line publishes a definition.
      const closing = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/.exec(
        source.slice(Math.max(source.lastIndexOf("\n"), source.lastIndexOf("\r")) + 1),
      );
      if (
        !opening ||
        !closing ||
        opening[1]![0] !== closing[1]![0] ||
        closing[1]!.length < opening[1]!.length
      )
        return;
      const definition = parseMarkdownReferenceDefinition(node.value);
      if (definition) definitions.push(definition);
    } else if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(parser.parse(text));
  return definitions;
}
