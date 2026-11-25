import { use, type ReactNode } from "react";
import { MarkdownRecapBlock } from "./MarkdownRecapBlock";
import { parseMarkdownRecap } from "./markdownRecap";
import { parseMarkdownReferenceDefinition } from "@t3tools/shared/markdownReferences";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { MarkdownFormBlock } from "./MarkdownFormBlock";
import { MarkdownHtmlBlock } from "./MarkdownHtmlBlock";
import { parseMarkdownForm, type MarkdownFormDefinition } from "./markdownForm";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import { MarkdownNextBlock } from "./MarkdownNextBlock";
import { parseMarkdownNext } from "./markdownNext";

function ContextFormBlock({ form }: { form: MarkdownFormDefinition }) {
  const { onSendAppMessage } = use(MarkdownChatHandlersContext);
  return <MarkdownFormBlock form={form} onSendMessage={onSendAppMessage} />;
}

export function renderMarkdownCustomBlock({
  language,
  meta,
  source,
  threadRef,
  namedReferences,
  renderMarkdown,
}: {
  namedReferences: boolean;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
  language: string;
  meta: string | undefined;
  source: string;
  threadRef?: ScopedThreadRef | undefined;
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
  if (language === "next" && meta === undefined) {
    const next = parseMarkdownNext(source);
    return next ? (
      <MarkdownNextBlock key={source} next={next} renderMarkdown={renderMarkdown} />
    ) : null;
  }
  if (language === "form") {
    const form = parseMarkdownForm(source);
    return form ? <ContextFormBlock key={source} form={form} /> : null;
  }
  return language === "html" && meta === "render" ? (
    <MarkdownHtmlBlock html={source} {...(threadRef ? { threadRef } : {})} />
  ) : null;
}
