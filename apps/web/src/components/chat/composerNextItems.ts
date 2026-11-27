import type { MessageId, ScopedThreadRef } from "@t3tools/contracts";
import type {
  useQuietThreadVisibleTurnItems,
  useThreadVisibleTurnItems,
} from "../../state/entities";
import { choiceRows } from "./custom-blocks/markdownChoiceDraft";
import { parseMarkdownChoiceHref } from "./custom-blocks/markdownChoiceLinks";
import { findLastMarkdownNext, type MarkdownNextDefinition } from "./custom-blocks/markdownNext";

/** Only the newest assistant messages are scanned, so a long thread stays cheap. */
const NEXT_LOOKBACK = 30;

type Items = ReturnType<typeof useThreadVisibleTurnItems>;
export type QuietItems = ReturnType<typeof useQuietThreadVisibleTurnItems>;
export type NextMessage = { id: string; messageId: MessageId; next: MarkdownNextDefinition };
export type NextEntry = {
  key: string;
  messageId: MessageId;
  item: MarkdownNextDefinition["items"][number];
};

/** Settled assistant messages among the newest ones that end with a valid ```next fence, oldest first. */
export function collectNextMessages(
  items: Items,
  cache: Map<string, { text: string; message: NextMessage | null }>,
) {
  const found: NextMessage[] = [];
  let scanned = 0;
  for (let index = items.length - 1; index >= 0 && scanned < NEXT_LOOKBACK; index -= 1) {
    const item = items[index]!.item;
    if (item.type !== "assistant_message") continue;
    scanned += 1;
    if (item.streaming || !item.text.includes("```next")) continue;
    let cached = cache.get(item.id);
    if (cached?.text !== item.text) {
      const next = findLastMarkdownNext(item.text);
      cached = {
        text: item.text,
        message: next ? { id: item.id, messageId: item.messageId, next } : null,
      };
      cache.set(item.id, cached);
    }
    if (cached.message) found.push(cached.message);
  }
  return found.toReversed();
}

const groupsOf = (item: NextEntry["item"]) =>
  (item.actions ?? []).flatMap((action) => {
    const parsed = parseMarkdownChoiceHref(`choice:${action.choice}`);
    return parsed ? [parsed.group] : [];
  });

/**
 * Every open item of the thread's ```next fences, newest message first. An item closes when one of
 * its choices was sent, a later fence repeats its choice group or ask, or the user dismissed it;
 * an item without actions also closes once any user message follows its message.
 */
export function resolveOpenNextEntries(
  turnItems: QuietItems,
  messages: readonly NextMessage[],
  dismissed: ReadonlySet<string>,
  thread: ScopedThreadRef,
) {
  const last = turnItems.findLast(
    ({ item }) => item.type === "assistant_message" || item.type === "user_message",
  )?.item;
  if (!last || (last.type === "assistant_message" && last.streaming)) return [];
  const position = new Map<string, number>(turnItems.map(({ item }, index) => [item.id, index]));
  const users = turnItems.flatMap(({ item }, index) =>
    item.type === "user_message" ? [{ index, text: item.text }] : [],
  );
  const groups = new Set<string>();
  const asks = new Set<string>();
  const open: NextEntry[] = [];
  for (const message of messages.toReversed()) {
    const at = position.get(message.id);
    if (at === undefined) continue;
    const later = users.filter((user) => user.index > at);
    const sent = new Set(
      later.flatMap((user) =>
        user.text.includes("t3-citation:")
          ? choiceRows(user.text, { ...thread, messageId: message.messageId })
              .filter((row) => row.selected)
              .map((row) => row.key.slice(0, row.key.indexOf("/")))
          : [],
      ),
    );
    const newGroups: string[] = [];
    const newAsks: string[] = [];
    message.next.items.forEach((item, index) => {
      const itemGroups = groupsOf(item);
      const key = `${message.messageId}:${index}`;
      const closed =
        dismissed.has(key) ||
        asks.has(item.ask) ||
        itemGroups.some((group) => groups.has(group) || sent.has(group)) ||
        (itemGroups.length === 0 && later.length > 0);
      if (!closed) open.push({ key, messageId: message.messageId, item });
      newAsks.push(item.ask);
      newGroups.push(...itemGroups);
    });
    for (const group of newGroups) groups.add(group);
    for (const ask of newAsks) asks.add(ask);
  }
  return open;
}
