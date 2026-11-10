import type { ReactNode } from "react";
import { MarkdownRecapBlock } from "./MarkdownRecapBlock";
import { parseMarkdownRecap } from "./markdownRecap";
import { parseMarkdownReferenceDefinition } from "@t3tools/shared/markdownReferences";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { MarkdownFormBlock } from "./MarkdownFormBlock";
import { MarkdownHtmlBlock } from "./MarkdownHtmlBlock";
import { parseMarkdownForm } from "./markdownForm";

export function renderMarkdownCustomBlock({
  language,
  meta,
  source,
  threadRef,
  onSendMessage,
  namedReferences,
  renderMarkdown,
}: {
  namedReferences: boolean;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
  language: string;
  meta: string | undefined;
  source: string;
  threadRef?: ScopedThreadRef | undefined;
  onSendMessage?: ((text: string) => Promise<void>) | undefined;
}) {
  if (language === "reference" && meta === undefined && parseMarkdownReferenceDefinition(source))
    return <></>;
  if (language === "recap" && meta === undefined) {
    const recap = parseMarkdownRecap(source);
    return recap ? (
      <MarkdownRecapBlock
        key={source}
        recap={recap}
        threadRef={threadRef}
        namedReferences={namedReferences}
        renderMarkdown={renderMarkdown}
      />
    ) : null;
  }
  if (language === "form") {
    const form = parseMarkdownForm(source);
    return form ? (
      <MarkdownFormBlock key={source} form={form} onSendMessage={onSendMessage} />
    ) : null;
  }
  return language === "html" && meta === "render" ? (
    <MarkdownHtmlBlock html={source} {...(threadRef ? { threadRef } : {})} />
  ) : null;
}
