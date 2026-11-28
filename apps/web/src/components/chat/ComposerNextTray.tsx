import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useId, useState, useSyncExternalStore } from "react";
import type { LegendListRef } from "@legendapp/list/react";
import { useQuietThreadVisibleTurnItems } from "../../state/entities";
import { environmentThreadDetails } from "../../state/threads";
import { cn } from "~/lib/utils";
import ChatMarkdown from "../ChatMarkdown";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { ComposerBanner } from "./ComposerBanner";
import {
  collectNextMessages,
  resolveOpenNextEntries,
  type NextEntry,
  type NextMessage,
} from "./composerNextItems";
import { parseMarkdownChoiceHref } from "./custom-blocks/markdownChoiceLinks";
import { markdownChoiceStore } from "./custom-blocks/markdownChoiceState";
import { useNextTypeLabels } from "./custom-blocks/MarkdownNextBlock";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

const RETRY_MS = 1000;
const pendingAnswers = new Set<string>();

// Clicking the in-message choice button reuses its draft, citation and selected-state path.
function answerNextChoice(
  messageId: string,
  choice: string,
  reveal: (messageId: string) => void,
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
  // The virtualized timeline unmounts rows far from the target, so bring the message in.
  reveal(messageId);
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

const dismissedKey = (threadRef: ScopedThreadRef) =>
  JSON.stringify(["next-dismissed", threadRef.environmentId, threadRef.threadId]);

// Dismissals reuse the choice store under a thread-level key, as its "dismissed" group.
function dismissNextEntry(threadRef: ScopedThreadRef, key: string) {
  const saved = markdownChoiceStore.read(dismissedKey(threadRef));
  markdownChoiceStore.write(dismissedKey(threadRef), {
    ...saved,
    selected: { ...saved.selected, dismissed: [...(saved.selected.dismissed ?? []), key] },
  });
}

function NextTrayItem({
  entry,
  multiple,
  open,
  accordion,
  threadRef,
  cwd,
  onReveal,
}: {
  entry: NextEntry;
  multiple: boolean;
  open: boolean;
  accordion: string;
  threadRef: ScopedThreadRef;
  cwd: string | undefined;
  onReveal: (messageId: string) => void;
}) {
  const gt = useGT();
  const typeLabels = useNextTypeLabels();
  const { item, messageId } = entry;
  const storageKey = JSON.stringify([threadRef.environmentId, threadRef.threadId, messageId]);
  const saved = useSyncExternalStore(
    (listener) => markdownChoiceStore.subscribe(storageKey, listener),
    () => markdownChoiceStore.read(storageKey),
  );
  const actions = (item.actions ?? []).map((action) => {
    const parsed = parseMarkdownChoiceHref(`choice:${action.choice}`);
    const values =
      parsed && Object.hasOwn(saved.selected, parsed.group)
        ? saved.selected[parsed.group]
        : undefined;
    return { action, selected: !!parsed && values?.includes(parsed.value) === true };
  });
  const queued = actions.some(({ selected }) => selected);
  const dismiss = (
    <button
      type="button"
      aria-label={gt("Dismiss this item")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dismissNextEntry(threadRef, entry.key);
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <XIcon aria-hidden="true" className="size-3.5" />
    </button>
  );
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
                onClick={() => answerNextChoice(messageId, action.choice, onReveal)}
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
        <p className="text-xs text-muted-foreground">{gt("Queued in composer: send to answer")}</p>
      ) : null}
    </div>
  );
  return multiple ? (
    <details name={accordion} open={open} className="group/item border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {head}
        {dismiss}
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-90"
        />
      </summary>
      {body}
    </details>
  ) : (
    <div className="border-t border-border">
      <div className="flex items-center gap-2.5 px-4 py-2">
        {head}
        {dismiss}
      </div>
      {body}
    </div>
  );
}

export function NextTray({
  entries,
  threadRef,
  cwd,
  onScrollToEnd,
  onScrollToMessage,
}: {
  entries: readonly NextEntry[];
  threadRef: ScopedThreadRef;
  cwd: string | undefined;
  onScrollToEnd: () => void;
  onScrollToMessage: (messageId: string) => void;
}) {
  const gt = useGT();
  const typeLabels = useNextTypeLabels();
  const accordion = useId();
  const [expanded, setExpanded] = useState(false);
  const multiple = entries.length > 1;
  const first = entries[0]?.item;
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
            {entries.length}
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
          {entries.map((entry, index) => (
            <NextTrayItem
              key={entry.key}
              entry={entry}
              multiple={multiple}
              open={index === 0}
              accordion={accordion}
              threadRef={threadRef}
              cwd={cwd}
              onReveal={(id) =>
                id === entries[0]?.messageId ? onScrollToEnd() : onScrollToMessage(id)
              }
            />
          ))}
        </ComposerBanner.Scroll>
      </CollapsiblePanel>
    </Collapsible>
  );
}

const nextMessagesAtomFamily = Atom.family((key: string) => {
  const [environmentId, threadId] = JSON.parse(key) as [string, string];
  const ref = {
    environmentId: EnvironmentId.make(environmentId),
    threadId: ThreadId.make(threadId),
  };
  const cache = new Map<string, { text: string; message: NextMessage | null }>();
  let previous: readonly NextMessage[] = [];
  return Atom.make((get) => {
    const found = collectNextMessages(
      get(environmentThreadDetails.visibleTurnItemsAtom(ref)),
      cache,
    );
    if (found.length !== previous.length || found.some((message, i) => message !== previous[i]))
      previous = found;
    return previous;
  }).pipe(Atom.setIdleTTL(0));
});

/**
 * Mounts the tray with every open item from the thread's ```next fences. Fence text comes from an
 * atom that scans only the newest assistant messages and keeps its identity while streamed deltas
 * change nothing, so this component re-renders on structure and fence changes, not per delta.
 */
export function ComposerNextTray({
  threadRef,
  cwd,
  onScrollToEnd,
  onScrollToMessage,
}: {
  threadRef: ScopedThreadRef;
  cwd: string | undefined;
  onScrollToEnd: () => void;
  onScrollToMessage: (messageId: string) => void;
}) {
  const turnItems = useQuietThreadVisibleTurnItems(threadRef);
  const messages = useAtomValue(
    nextMessagesAtomFamily(JSON.stringify([threadRef.environmentId, threadRef.threadId])),
  );
  const dismissed = useSyncExternalStore(
    (listener) => markdownChoiceStore.subscribe(dismissedKey(threadRef), listener),
    () => markdownChoiceStore.read(dismissedKey(threadRef)),
  );
  const entries = resolveOpenNextEntries(
    turnItems,
    messages,
    new Set(dismissed.selected.dismissed),
    threadRef,
  );
  if (entries.length === 0) return null;
  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root variant="info">
        <NextTray
          key={messages.at(-1)?.messageId}
          entries={entries}
          threadRef={threadRef}
          cwd={cwd}
          onScrollToEnd={onScrollToEnd}
          onScrollToMessage={onScrollToMessage}
        />
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}

/** Brings an older message's row into the virtualized timeline so its in-message choice can mount. */
export function scrollTimelineToMessage(
  list: LegendListRef | null,
  messageId: string,
  releaseFollow: () => void,
) {
  const rows = list?.getState().data as ReadonlyArray<MessagesTimelineRow> | undefined;
  const index = rows?.findIndex((row) => row.kind === "message" && row.message.id === messageId);
  if (index === undefined || index < 0) return;
  // Without releasing follow, maintainScrollAtEnd snaps the list back to the end while a turn runs.
  releaseFollow();
  void list?.scrollToIndex({ index, animated: false });
}
