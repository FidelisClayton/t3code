import type { ReactNode } from "react";

/** Renders a block field as nested chat Markdown; `inline` keeps it inside the field's own text. */
export type RenderBlockMarkdown = (
  body: string,
  namedReferences?: boolean,
  sourceChoices?: boolean,
  inline?: boolean,
) => ReactNode;

// Most fields are plain text, which skips a nested renderer per field.
const INLINE_MARKDOWN = /[`*_~[<&\\]|:\/\/|www\./;

/** A short text field with inline Markdown (code, emphasis, links) in the surrounding type. */
export function inlineMarkdown(text: string, renderMarkdown: RenderBlockMarkdown): ReactNode {
  return INLINE_MARKDOWN.test(text) ? renderMarkdown(text, undefined, false, true) : text;
}
