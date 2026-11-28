import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import ChatMarkdown from "../ChatMarkdown";
import { NextTray } from "./ComposerNextTray";
import type { NextEntry } from "./composerNextItems";
import type { MarkdownChoiceDraftUpdate } from "./custom-blocks/markdownChoiceDraft";
import { MarkdownAnswersContext } from "./custom-blocks/MarkdownAnswers";
import { MarkdownChatHandlersContext } from "./custom-blocks/MarkdownChatHandlers";
import "../../index.css";

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
let counter = 0;
const item = (ask: string) => ({
  type: "approve" as const,
  ask,
  details: `Details of ${ask}`,
  actions: [
    { label: `Do ${ask}`, choice: `${ask}/do`, primary: true },
    { label: `Skip ${ask}`, choice: `${ask}/skip` },
  ],
});
const message = (asks: string[]) => ({
  id: MessageId.make(`older-message-${counter++}`),
  text: "```next\n" + JSON.stringify({ items: asks.map(item) }) + "\n```",
  asks,
});

function Thread({
  messages,
  entries,
  picked,
  onChoiceDraftUpdate,
}: {
  messages: ReturnType<typeof message>[];
  entries: NextEntry[];
  picked?: Map<MessageId, string[]> | undefined;
  onChoiceDraftUpdate: (update: MarkdownChoiceDraftUpdate) => boolean;
}) {
  return (
    <>
      <MarkdownAnswersContext
        value={new Map([...(picked ?? [])].map(([id, p]) => [id, { picked: new Set(p) }]))}
      >
        <div data-assistant-citation-viewport="true">
          {messages.map((m) => (
            <div key={m.id} data-message-id={m.id}>
              <div
                data-assistant-citation-source={m.id}
                data-assistant-citation-environment={threadRef.environmentId}
                data-assistant-citation-thread={threadRef.threadId}
              >
                <MarkdownChatHandlersContext value={{ onChoiceDraftUpdate }}>
                  <ChatMarkdown
                    cwd="/workspace"
                    text={m.text}
                    customBlocks
                    threadRef={threadRef}
                    messageId={m.id}
                  />
                </MarkdownChatHandlersContext>
              </div>
            </div>
          ))}
        </div>
      </MarkdownAnswersContext>
      <NextTray
        entries={entries}
        threadRef={threadRef}
        cwd="/workspace"
        onScrollToEnd={() => {}}
        onScrollToMessage={() => {}}
      />
    </>
  );
}

const entry = (m: ReturnType<typeof message>, index: number): NextEntry => ({
  key: `${m.id}:${index}`,
  messageId: m.id,
  item: item(m.asks[index]!),
});

async function clickOlder(
  messages: ReturnType<typeof message>[],
  entries: NextEntry[],
  ask: string,
  picked?: Map<MessageId, string[]>,
) {
  const onChoiceDraftUpdate = vi.fn((_update: MarkdownChoiceDraftUpdate) => true);
  await using screen = await render(
    <Thread
      messages={messages}
      entries={entries}
      picked={picked}
      onChoiceDraftUpdate={onChoiceDraftUpdate}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Next for you ·/ }));
  await userEvent.click(screen.getByText(ask, { exact: true }).last());
  await userEvent.click(screen.getByRole("button", { name: `Do ${ask}` }));
  return onChoiceDraftUpdate;
}

it("drafts the ask of an older message", async () => {
  const older = message(["old-one"]);
  const newer = message(["new-one"]);
  const spy = await clickOlder([older, newer], [entry(newer, 0), entry(older, 0)], "old-one");
  expect(spy).toHaveBeenCalledOnce();
});

it("drafts a non-first ask of an older multi-item card (closed details)", async () => {
  const older = message(["old-a", "old-b"]);
  const newer = message(["new-one"]);
  const spy = await clickOlder([older, newer], [entry(newer, 0), entry(older, 1)], "old-b");
  expect(spy).toHaveBeenCalledOnce();
});

it("drafts an ask of an older card the user answered without picking it", async () => {
  const older = message(["old-a", "old-b"]);
  const newer = message(["new-one"]);
  const spy = await clickOlder(
    [older, newer],
    [entry(newer, 0), entry(older, 0)],
    "old-a",
    new Map([[older.id, ["unrelated/choice"]]]),
  );
  expect(spy).toHaveBeenCalledOnce();
});
