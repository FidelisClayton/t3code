import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { NextTray } from "./ComposerNextTray";
import { markdownChoiceStore } from "./custom-blocks/markdownChoiceState";
import type { MarkdownNextDefinition } from "./custom-blocks/markdownNext";
import "../../index.css";

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
let counter = 0;
const freshMessageId = () => MessageId.make(`tray-message-${counter++}`);
const item = (ask: string) => ({
  type: "approve" as const,
  ask,
  details: `Details of ${ask}`,
  actions: [
    { label: `Do ${ask}`, choice: `${ask}/do`, primary: true },
    { label: `Skip ${ask}`, choice: `${ask}/skip` },
  ],
});
const next: MarkdownNextDefinition = { items: [item("one"), item("two"), item("three")] };

it("starts collapsed, expands to the first item and clicks the in-message choice", async () => {
  const onClick = vi.fn();
  const messageId = freshMessageId();
  await using screen = await render(
    <>
      <div data-message-id={messageId}>
        <button type="button" data-choice-group="one" data-choice-value="do" onClick={onClick} />
      </div>
      <NextTray
        next={next}
        threadRef={threadRef}
        messageId={messageId}
        cwd="/workspace"
        onScrollToEnd={() => {}}
      />
    </>,
  );
  await expect.element(screen.getByText("Next for you")).toBeVisible();
  await expect.element(screen.getByText("Details of one")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Next for you · 3/ }));
  await expect.element(screen.getByText("Details of one")).toBeVisible();
  await expect.element(screen.getByText("Details of two")).not.toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Do one" }));
  expect(onClick).toHaveBeenCalledOnce();
  markdownChoiceStore.write(
    JSON.stringify([threadRef.environmentId, threadRef.threadId, messageId]),
    {
      selected: { one: ["do"] },
      notes: {},
    },
  );
  await expect
    .element(screen.getByRole("button", { name: "Do one" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.element(screen.getByText("Queued in composer: send to answer")).toBeVisible();
});

it("scrolls once and clicks the in-message button once after it mounts", async () => {
  const messageId = freshMessageId();
  const onScrollToEnd = vi.fn();
  const onClick = vi.fn();
  await using screen = await render(
    <NextTray
      next={next}
      threadRef={threadRef}
      messageId={messageId}
      cwd="/workspace"
      onScrollToEnd={onScrollToEnd}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Next for you · 3/ }));
  const action = screen.getByRole("button", { name: "Do one" });
  await userEvent.click(action);
  await userEvent.click(action);
  expect(onScrollToEnd).toHaveBeenCalledOnce();
  const row = document.createElement("div");
  row.dataset.messageId = messageId;
  const button = document.createElement("button");
  button.dataset.choiceGroup = "one";
  button.dataset.choiceValue = "do";
  button.addEventListener("click", onClick);
  row.append(button);
  document.body.append(row);
  try {
    await expect.poll(() => onClick.mock.calls.length).toBe(1);
    expect(onClick).toHaveBeenCalledOnce();
  } finally {
    row.remove();
  }
});
