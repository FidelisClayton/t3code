import { use, type ReactNode } from "react";
import { MarkdownRecapBlock } from "./MarkdownRecapBlock";
import { parseMarkdownRecap } from "./markdownRecap";
import { parseMarkdownReferenceDefinition } from "@t3tools/shared/markdownReferences";
import type { MessageId, ScopedThreadRef } from "@t3tools/contracts";
import { MarkdownFormBlock } from "./MarkdownFormBlock";
import { MarkdownHtmlBlock } from "./MarkdownHtmlBlock";
import { parseMarkdownForm, type MarkdownFormDefinition } from "./markdownForm";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import { MarkdownNextBlock } from "./MarkdownNextBlock";
import { parseMarkdownNext } from "./markdownNext";
import { MarkdownCompareBlock } from "./MarkdownCompareBlock";
import { parseMarkdownCompare } from "./markdownCompare";
import { MarkdownStepsBlock } from "./MarkdownStepsBlock";
import { parseMarkdownSteps } from "./markdownSteps";
import { MarkdownMetricsBlock } from "./MarkdownMetricsBlock";
import { parseMarkdownMetrics } from "./markdownMetrics";
import { MarkdownScopeBlock } from "./MarkdownScopeBlock";
import { parseMarkdownScope } from "./markdownScope";
import { MarkdownRisksBlock } from "./MarkdownRisksBlock";
import { parseMarkdownRisks } from "./markdownRisks";
import { MarkdownStatusBlock } from "./MarkdownStatusBlock";
import { parseMarkdownStatus } from "./markdownStatus";
import { MarkdownSwatchesBlock } from "./MarkdownSwatchesBlock";
import { parseMarkdownSwatches } from "./markdownSwatches";
import { MarkdownResourcesBlock } from "./MarkdownResourcesBlock";
import { parseMarkdownResources } from "./markdownResources";

function ContextFormBlock({ form }: { form: MarkdownFormDefinition }) {
  const { onSendAppMessage } = use(MarkdownChatHandlersContext);
  return <MarkdownFormBlock form={form} onSendMessage={onSendAppMessage} />;
}

export function renderMarkdownCustomBlock({
  language,
  meta,
  source,
  threadRef,
  messageId,
  namedReferences,
  renderMarkdown,
}: {
  namedReferences: boolean;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
  language: string;
  meta: string | undefined;
  source: string;
  threadRef?: ScopedThreadRef | undefined;
  messageId?: MessageId | undefined;
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
      <MarkdownNextBlock
        key={source}
        next={next}
        messageId={messageId}
        renderMarkdown={renderMarkdown}
      />
    ) : null;
  }
  if (meta === undefined) {
    const block = renderPresentationBlock(language, source, threadRef, renderMarkdown);
    if (block !== undefined) return block;
  }
  if (language === "form") {
    const form = parseMarkdownForm(source);
    return form ? <ContextFormBlock key={source} form={form} /> : null;
  }
  return language === "html" && meta === "render" ? (
    <MarkdownHtmlBlock html={source} {...(threadRef ? { threadRef } : {})} />
  ) : null;
}

function renderPresentationBlock(
  language: string,
  source: string,
  threadRef: ScopedThreadRef | undefined,
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode,
): ReactNode | undefined {
  switch (language) {
    case "compare": {
      const compare = parseMarkdownCompare(source);
      return compare ? <MarkdownCompareBlock key={source} compare={compare} /> : null;
    }
    case "steps": {
      const steps = parseMarkdownSteps(source);
      return steps ? (
        <MarkdownStepsBlock key={source} steps={steps} renderMarkdown={renderMarkdown} />
      ) : null;
    }
    case "metrics": {
      const metrics = parseMarkdownMetrics(source);
      return metrics ? <MarkdownMetricsBlock key={source} metrics={metrics} /> : null;
    }
    case "scope": {
      const scope = parseMarkdownScope(source);
      return scope ? <MarkdownScopeBlock key={source} scope={scope} /> : null;
    }
    case "risks": {
      const risks = parseMarkdownRisks(source);
      return risks ? <MarkdownRisksBlock key={source} risks={risks} /> : null;
    }
    case "status": {
      const status = parseMarkdownStatus(source);
      return status ? (
        <MarkdownStatusBlock
          key={source}
          status={status}
          threadRef={threadRef}
          renderMarkdown={renderMarkdown}
        />
      ) : null;
    }
    case "swatches": {
      const swatches = parseMarkdownSwatches(source);
      return swatches ? <MarkdownSwatchesBlock key={source} swatches={swatches} /> : null;
    }
    case "resources": {
      const resources = parseMarkdownResources(source);
      return resources ? (
        <MarkdownResourcesBlock
          key={source}
          resources={resources}
          renderMarkdown={renderMarkdown}
        />
      ) : null;
    }
    default:
      return undefined;
  }
}
