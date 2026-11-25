import type { MessageId, ScopedThreadRef } from "@t3tools/contracts";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useId, useState, useSyncExternalStore } from "react";
import { useAssistantMessageText, useQuietThreadVisibleTurnItems } from "../../state/entities";
import { cn } from "~/lib/utils";
import ChatMarkdown from "../ChatMarkdown";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { ComposerBanner } from "./ComposerBanner";
import { parseMarkdownChoiceHref } from "./custom-blocks/markdownChoiceLinks";
import { markdownChoiceStore } from "./custom-blocks/markdownChoiceState";
import { findLastMarkdownNext, type MarkdownNextDefinition } from "./custom-blocks/markdownNext";
import { useNextTypeLabels } from "./custom-blocks/MarkdownNextBlock";

const RETRY_MS = 1000;
const pendingAnswers = new Set<string>();

// Clicking the in-message choice button reuses its draft, citation and selected-state path.
function answerNextChoice(
  messageId: string,
  choice: string,
  scrollToEnd: () => void,
  timeoutMs = RETRY_MS,
) {
  const parsed = parseMarkdownChoiceHref(`choice:${choice}`);
  if (!parsed) return;
  const messageSelector = `[data-message-id="${CSS.escape(messageId)}"]`;
  const find = () =>
    document.querySelector<HTMLButtonElement>(
      `${messageSelector} button[data-choice-group="${parsed.group}"][data-choice-value="${parsed.value}"]`,
    );
  const found = find();
  if (found) return found.click();
  const key = `${messageId}:${choice}`;
  if (pendingAnswers.has(key)) return;
  pendingAnswers.add(key);
  // The virtualized timeline unmounts rows far from the end, so bring the latest rows in.
  scrollToEnd();
  const deadline = performance.now() + timeoutMs;
  const retry = () =>
    requestAnimationFrame(() => {
      const button = find();
      if (button) {
        pendingAnswers.delete(key);
        button.click();
      } else if (performance.now() < deadline) retry();
      else {
        pendingAnswers.delete(key);
        document.querySelector(messageSelector)?.scrollIntoView({ block: "center" });
      }
    });
  retry();
}

const plain = (markdown: string) =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function NextTray({
  next,
  threadRef,
  messageId,
  cwd,
  onScrollToEnd,
}: {
  next: MarkdownNextDefinition;
  threadRef: ScopedThreadRef;
  messageId: MessageId;
  cwd: string | undefined;
  onScrollToEnd: () => void;
}) {
  const gt = useGT();
  const typeLabels = useNextTypeLabels();
  const accordion = useId();
  const [expanded, setExpanded] = useState(false);
  const storageKey = JSON.stringify([threadRef.environmentId, threadRef.threadId, messageId]);
  const saved = useSyncExternalStore(
    (listener) => markdownChoiceStore.subscribe(storageKey, listener),
    () => markdownChoiceStore.read(storageKey),
  );
  const multiple = next.items.length > 1;
  const first = next.items[0];
  if (!first) return null;
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger
        render={<ComposerBanner.Row render={<button type="button" />} />}
        title={expanded ? gt("Hide what is next for you") : gt("Show what is next for you")}
        data-next-tray-toggle={expanded ? "expanded" : "collapsed"}
        className="px-4 py-1.5"
      >
        <ComposerBanner.Content>
          <ComposerBanner.Dot className="text-primary" />
          <span className="flex-none text-muted-foreground">
            <span className="font-medium text-foreground">{gt("Next for you")}</span>
            {" · "}
            {next.items.length}
          </span>
          {expanded ? null : (
            <span className="ms-1 min-w-0 flex-1 truncate text-foreground/85">
              <span
                className={cn(
                  "me-1.5 text-2xs font-semibold uppercase tracking-wide text-primary",
                  first.danger && "text-destructive",
                )}
              >
                {typeLabels[first.type]}
              </span>
              {plain(first.ask)}
            </span>
          )}
        </ComposerBanner.Content>
        <ComposerBanner.Actions className="gap-0">
          <ComposerBanner.ToggleIcon expanded={expanded} />
        </ComposerBanner.Actions>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ComposerBanner.Scroll className="max-h-[60dvh]">
          {next.items.map((item, index) => {
            const actions = (item.actions ?? []).map((action) => {
              const parsed = parseMarkdownChoiceHref(`choice:${action.choice}`);
              const values =
                parsed && Object.hasOwn(saved.selected, parsed.group)
                  ? saved.selected[parsed.group]
                  : undefined;
              return { action, selected: !!parsed && values?.includes(parsed.value) === true };
            });
            const queued = actions.some(({ selected }) => selected);
            const head = (
              <>
                <span
                  className={cn(
                    "min-w-14 shrink-0 whitespace-nowrap text-2xs font-semibold uppercase tracking-wide text-primary",
                    item.danger && "text-destructive",
                  )}
                >
                  {typeLabels[item.type]}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm [&_p]:m-0",
                    multiple &&
                      "[&_p]:truncate group-open/item:[&_p]:overflow-visible group-open/item:[&_p]:whitespace-normal",
                  )}
                >
                  <ChatMarkdown text={item.ask} cwd={cwd} threadRef={threadRef} />
                </span>
              </>
            );
            const body = (
              <div className="flex flex-col gap-2.5 pb-3 ps-4 pe-4 sm:ps-18">
                {item.details ? (
                  <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground [&_p]:m-0">
                    <ChatMarkdown text={item.details} cwd={cwd} threadRef={threadRef} />
                  </div>
                ) : null}
                {actions.length ? (
                  <div className="flex flex-wrap gap-2">
                    {actions.map(({ action, selected }) => {
                      return (
                        <button
                          key={action.choice}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => answerNextChoice(messageId, action.choice, onScrollToEnd)}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring",
                            action.primary &&
                              (item.danger
                                ? "border-transparent bg-destructive text-white hover:bg-destructive/90"
                                : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"),
                            selected &&
                              cn(
                                "ring-2 ring-offset-2 ring-offset-card",
                                item.danger ? "ring-destructive" : "ring-primary",
                              ),
                          )}
                        >
                          {selected ? <CheckIcon aria-hidden="true" className="size-3.5" /> : null}
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {queued ? (
                  <p className="text-xs text-muted-foreground">
                    {gt("Queued in composer: send to answer")}
                  </p>
                ) : null}
              </div>
            );
            return multiple ? (
              <details
                // oxlint-disable-next-line react/no-array-index-key -- Items are immutable for a message.
                key={index}
                name={accordion}
                open={index === 0}
                className="group/item border-t border-border"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  {head}
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-90"
                  />
                </summary>
                {body}
              </details>
            ) : (
              // oxlint-disable-next-line react/no-array-index-key -- Items are immutable for a message.
              <div key={index} className="border-t border-border">
                <div className="flex items-center gap-2.5 px-4 py-2">{head}</div>
                {body}
              </div>
            );
          })}
        </ComposerBanner.Scroll>
      </CollapsiblePanel>
    </Collapsible>
  );
}

type TurnItems = ReturnType<typeof useQuietThreadVisibleTurnItems>;

function latestNextMessage(turnItems: TurnItems) {
  const latest = turnItems.findLast(
    ({ item }) => item.type === "assistant_message" || item.type === "user_message",
  )?.item;
  return latest?.type === "assistant_message" && !latest.streaming ? latest : null;
}

export function resolveNextTray(turnItems: TurnItems, text: string | null | undefined) {
  const message = latestNextMessage(turnItems);
  const next = message && text ? findLastMarkdownNext(text) : null;
  return message && next ? { message, next } : null;
}

/** Mounts the tray for the latest assistant message when it ends with a ```next fence nobody replied to. */
export function ComposerNextTray({
  threadRef,
  cwd,
  onScrollToEnd,
}: {
  threadRef: ScopedThreadRef;
  cwd: string | undefined;
  onScrollToEnd: () => void;
}) {
  const turnItems = useQuietThreadVisibleTurnItems(threadRef);
  const text = useAssistantMessageText(threadRef, latestNextMessage(turnItems)?.id);
  const target = resolveNextTray(turnItems, text);
  if (!target) return null;
  const { message, next } = target;
  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root variant="info">
        <NextTray
          key={message.messageId + text}
          next={next}
          threadRef={threadRef}
          messageId={message.messageId}
          cwd={cwd}
          onScrollToEnd={onScrollToEnd}
        />
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}
