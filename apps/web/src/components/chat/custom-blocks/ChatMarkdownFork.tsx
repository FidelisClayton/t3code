// Fork hooks for ChatMarkdown. This module must only `import type` ChatMarkdown: ChatMarkdown
// imports it, so a value import would create a runtime cycle.
import type { MessageId } from "@t3tools/contracts";
import { isPendingMarkdownComponent } from "@t3tools/shared/markdownCustomFence";
import { parseMarkdownReferenceHref } from "@t3tools/shared/markdownReferences";
import { useGT } from "gt-react";
import type { Element } from "hast";
import React, { use, type ComponentProps, type ReactNode, type RefObject } from "react";
import type ChatMarkdown from "../../ChatMarkdown";
import { hastPlainTextDeep } from "../markdownHast.logic";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import {
  MarkdownChoiceCommentTails,
  MarkdownChoices,
  MarkdownInlineChoice,
} from "./MarkdownChoices";
import { parseMarkdownChoiceHref } from "./markdownChoiceLinks";
import { renderMarkdownCustomBlock } from "./MarkdownCustomBlock";
import { MarkdownReferenceLink } from "./MarkdownReferenceLink";
import { MarkdownReferenceScope } from "./MarkdownReferenceScope";
import "./ChatMarkdownFork.css";

type ChatMarkdownProps = ComponentProps<typeof ChatMarkdown>;

/** Renders a nested ChatMarkdown; ChatMarkdown passes itself in. */
export type RenderMarkdown = (props: ChatMarkdownProps) => ReactNode;

/** The renderer state these hooks read. ChatMarkdown's own state type is private. */
export interface ForkMarkdownState extends Pick<
  ChatMarkdownProps,
  | "cwd"
  | "threadRef"
  | "imageBaseDir"
  | "onUseArtifactTemplate"
  | "onRunShellCommand"
  | "sourceControlMedia"
  | "workspaceMutationId"
  | "renderContextReference"
  | "headingLevelOffset"
> {
  skills: NonNullable<ChatMarkdownProps["skills"]>;
  customBlocks: boolean;
  namedReferences: boolean;
  inline: boolean;
  isStreaming: boolean;
  messageId: MessageId | undefined;
  environmentId: ChatMarkdownProps["environmentId"] | null;
  expandMedia: ChatMarkdownProps["onImageExpand"];
}

export function isForkMarkdownHref(href: string): boolean {
  return parseMarkdownReferenceHref(href) !== null || parseMarkdownChoiceHref(href) !== null;
}

/** Reference links and inline choices; null for every other link. */
export function renderForkAnchor({
  node,
  href,
  title,
  children,
  text,
  state,
  renderMarkdown,
}: {
  node: Element | undefined;
  href: string | undefined;
  title: string | undefined;
  children: ReactNode;
  text: string;
  state: ForkMarkdownState;
  renderMarkdown: RenderMarkdown;
}): ReactNode {
  const { customBlocks, threadRef } = state;
  const referenceId = href ? parseMarkdownReferenceHref(href) : null;
  if (referenceId) {
    const start = node?.position?.start.offset;
    const end = node?.position?.end.offset;
    const copyMarkdown =
      start !== undefined && end !== undefined
        ? text.slice(start, end)
        : `[${hastPlainTextDeep(node)}](${href})`;
    return customBlocks && state.namedReferences ? (
      <MarkdownReferenceLink
        key={`${threadRef?.environmentId}:${threadRef?.threadId}:${referenceId}`}
        id={referenceId}
        threadRef={threadRef}
        copyMarkdown={copyMarkdown}
        renderBody={(body) =>
          renderMarkdown({
            text: body,
            cwd: state.cwd,
            threadRef,
            environmentId: state.environmentId ?? undefined,
            imageBaseDir: state.imageBaseDir,
            skills: state.skills,
            onUseArtifactTemplate: state.onUseArtifactTemplate,
            onRunShellCommand: state.onRunShellCommand,
            onImageExpand: state.expandMedia,
            customBlocks: true,
            namedReferences: false,
          })
        }
      >
        {children}
      </MarkdownReferenceLink>
    ) : (
      <span data-markdown-copy={copyMarkdown}>{children}</span>
    );
  }
  const choice = href ? parseMarkdownChoiceHref(href) : null;
  if (!choice) return null;
  return customBlocks ? (
    <MarkdownInlineChoice
      key={href}
      choice={choice}
      label={hastPlainTextDeep(node)}
      details={title}
    >
      {children}
    </MarkdownInlineChoice>
  ) : (
    <span>{children}</span>
  );
}

function PendingComponentPlaceholder() {
  const gt = useGT();
  return (
    <p
      className="text-xs text-muted-foreground"
      data-markdown-copy=""
      data-thread-find-ignore="true"
      data-assistant-citation-ignore="true"
    >
      {gt("Preparing component…")}
    </p>
  );
}

/** Custom blocks and the pending placeholder; null leaves the fence as a code block. */
export function renderForkFence({
  language,
  meta,
  code,
  closed,
  state,
  renderMarkdown,
}: {
  language: string;
  meta: string | undefined;
  code: string;
  closed: boolean;
  state: ForkMarkdownState;
  renderMarkdown: RenderMarkdown;
}): ReactNode {
  const { customBlocks, inline, isStreaming, threadRef } = state;
  if (!customBlocks || inline) return null;
  if (isStreaming && !closed && isPendingMarkdownComponent(language, meta))
    return <PendingComponentPlaceholder />;
  if (!closed) return null;
  return renderMarkdownCustomBlock({
    language,
    meta,
    source: code,
    threadRef,
    messageId: state.messageId,
    namedReferences: state.namedReferences,
    renderMarkdown: (
      body,
      namedReferences = state.namedReferences,
      sourceChoices = true,
      inline = false,
    ) =>
      renderMarkdown({
        text: body,
        ...(inline ? { inline, className: "markdown-inline" } : {}),
        messageId: sourceChoices ? state.messageId : undefined,
        cwd: state.cwd,
        threadRef,
        environmentId: state.environmentId ?? undefined,
        imageBaseDir: state.imageBaseDir,
        sourceControlMedia: state.sourceControlMedia,
        workspaceMutationId: state.workspaceMutationId,
        renderContextReference: state.renderContextReference,
        headingLevelOffset: state.headingLevelOffset,
        skills: state.skills,
        onUseArtifactTemplate: state.onUseArtifactTemplate,
        onRunShellCommand: state.onRunShellCommand,
        onImageExpand: state.expandMedia,
        customBlocks,
        namedReferences,
      }),
  });
}

// Choice comment tails render from the paragraph or list item that holds the choice links.
function hastHasChoiceLink(node: Element): boolean {
  return node.children.some(
    (child) =>
      child.type === "element" &&
      (child.tagName === "a"
        ? parseMarkdownChoiceHref(String(child.properties.href ?? "")) !== null
        : hastHasChoiceLink(child)),
  );
}

export function isForkMarkdownIsland(node: Element, state: { customBlocks: boolean }): boolean {
  return state.customBlocks && hastHasChoiceLink(node);
}

/** A list item's content with its comment tail before the first nested list, else at the end. */
export function ForkListItemContent({
  node,
  children,
}: {
  node: Element | undefined;
  children: ReactNode;
}) {
  const tail = { rendered: false };
  const content = React.Children.map(children, (child) => {
    if (
      !tail.rendered &&
      React.isValidElement<{ node?: { tagName?: string } }>(child) &&
      (child.type === "ul" || child.props.node?.tagName === "ol")
    ) {
      tail.rendered = true;
      return (
        <>
          <MarkdownChoiceCommentTails node={node} />
          {child}
        </>
      );
    }
    return child;
  });
  return (
    <>
      {content}
      {!tail.rendered ? <MarkdownChoiceCommentTails node={node} /> : null}
    </>
  );
}

/** Named-reference scope and choice state around the rendered markdown. */
export function ForkMarkdownRoot({
  text,
  customBlocks,
  namedReferences,
  messageId,
  threadRef,
  rootRef,
  children,
}: Pick<
  ChatMarkdownProps,
  "text" | "customBlocks" | "namedReferences" | "messageId" | "threadRef"
> & {
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { onChoiceDraftUpdate } = use(MarkdownChatHandlersContext);
  return (
    <MarkdownReferenceScope
      text={text}
      enabled={customBlocks === true && namedReferences !== false}
    >
      <MarkdownChoices
        key={JSON.stringify([threadRef?.environmentId, threadRef?.threadId, messageId])}
        text={text}
        enabled={customBlocks === true}
        rootRef={rootRef}
        source={threadRef && messageId ? { ...threadRef, messageId } : undefined}
        onChoiceDraftUpdate={onChoiceDraftUpdate}
      >
        {children}
      </MarkdownChoices>
    </MarkdownReferenceScope>
  );
}
