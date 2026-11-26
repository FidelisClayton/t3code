import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import ChatMarkdown from "../../ChatMarkdown";
import type { MarkdownChoiceDraftUpdate } from "./markdownChoiceDraft";
import { MarkdownAnswersContext } from "./MarkdownAnswers";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import "../../../index.css";

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
const messageId = MessageId.make("message");
const item = (ask: string, extra: object = {}) => ({
  type: "approve",
  ask,
  details: `Details of ${ask}`,
  actions: [
    { label: `Do ${ask}`, choice: `${ask}/do`, primary: true },
    { label: `Skip ${ask}`, choice: `${ask}/skip` },
  ],
  ...extra,
});
const renderNext = (
  items: object[],
  onChoiceDraftUpdate: (update: MarkdownChoiceDraftUpdate) => boolean = () => true,
  picked?: string[],
) =>
  render(
    <MarkdownAnswersContext
      value={new Map(picked ? [[messageId, { picked: new Set(picked) }]] : [])}
    >
      <div data-assistant-citation-viewport="true">
        <div
          data-assistant-citation-source={messageId}
          data-assistant-citation-environment={threadRef.environmentId}
          data-assistant-citation-thread={threadRef.threadId}
        >
          <MarkdownChatHandlersContext value={{ onChoiceDraftUpdate }}>
            <ChatMarkdown
              cwd="/workspace"
              text={"```next\n" + JSON.stringify({ items }) + "\n```"}
              customBlocks
              threadRef={threadRef}
              messageId={messageId}
            />
          </MarkdownChatHandlersContext>
        </div>
      </div>
    </MarkdownAnswersContext>,
  );

it("keeps one item open at a time and queues the clicked action as a choice", async () => {
  const onChoiceDraftUpdate = vi.fn((_update: MarkdownChoiceDraftUpdate) => true);
  await using screen = await renderNext([item("one"), item("two")], onChoiceDraftUpdate);
  await expect.element(screen.getByText("Details of one")).toBeVisible();
  await expect.element(screen.getByText("Details of two")).not.toBeVisible();
  await expect.element(screen.getByText("Do two")).not.toBeVisible();
  await userEvent.click(screen.getByText("two", { exact: true }));
  await expect.element(screen.getByText("Details of two")).toBeVisible();
  await expect.element(screen.getByText("Details of one")).not.toBeVisible();
  await userEvent.click(screen.getByRole("radio", { name: "Do two" }));
  expect(onChoiceDraftUpdate).toHaveBeenCalledOnce();
  expect(onChoiceDraftUpdate.mock.calls[0]![0].changes[0]).toMatchObject({
    key: "two/do",
    selected: true,
  });
  await expect
    .element(screen.getByRole("radio", { name: "Do two" }))
    .toHaveAttribute("aria-checked", "true");
});

it("shows a single item open without a count or collapse control", async () => {
  await using screen = await renderNext([item("solo", { danger: true })]);
  await expect.element(screen.getByText("Details of solo")).toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "Do solo" })).toBeVisible();
  expect(screen.container.querySelector("details")).toBeNull();
});

it("renders an action label containing a newline as one action button", async () => {
  await using screen = await renderNext([
    item("multi", { actions: [{ label: "Do\nthe thing", choice: "multi/do" }] }),
  ]);
  await expect.element(screen.getByRole("radio", { name: "Do the thing" })).toBeVisible();
});

it("shows an answered card collapsed, with the picked action checked and no filled primary", async () => {
  await using screen = await renderNext([item("one"), item("two")], () => true, ["one/skip"]);
  await expect.element(screen.getByText(/^Answered/)).toBeVisible();
  expect(screen.container.textContent).not.toContain("Next for you");
  expect(screen.container.querySelector("details[open]")).toBeNull();
  await userEvent.click(screen.getByText("one", { exact: true }));
  const picked = screen.getByRole("radio", { name: "Skip one" });
  await expect.element(picked).toHaveAttribute("data-picked", "true");
  await expect
    .element(screen.getByRole("radio", { name: "Do one" }))
    .not.toHaveAttribute("data-picked");
  const primary = screen.getByRole("radio", { name: "Do one" }).element();
  expect(getComputedStyle(primary).backgroundColor).toBe(
    getComputedStyle(screen.getByRole("radio", { name: "Skip one" }).element()).backgroundColor,
  );
});

it("keeps a single answered item visible", async () => {
  await using screen = await renderNext([item("solo")], () => true, []);
  await expect.element(screen.getByText("Answered")).toBeVisible();
  await expect.element(screen.getByText("Details of solo")).toBeVisible();
});
