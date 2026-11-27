import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { collectAssistantCitations } from "@t3tools/shared/assistantCitations";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import { findAssistantCitationSourceAnchor } from "../../../lib/assistantTextSelection";
import ChatMarkdown from "../../ChatMarkdown";
import { updateMarkdownChoiceDraft, type MarkdownChoiceDraftUpdate } from "./markdownChoiceDraft";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import "../../../index.css";

const bambu = {
  title: "Choose a connection method",
  attributes: [
    { id: "remote", label: "Remote printing" },
    { id: "cloud", label: "Cloud dependency" },
    { id: "handy", label: "Bambu Handy" },
  ],
  options: [
    {
      id: "cloud",
      title: "Cloud",
      summary: "Keep Bambu Handy",
      values: { remote: "Yes", cloud: "Yes", handy: "Yes" },
      recommended: "Least setup",
      choice: "mode/cloud",
    },
    {
      id: "local",
      title: "Local + Developer Mode",
      summary: "Direct LAN control",
      values: { remote: "No*", handy: "No*" },
      choice: "mode/local",
    },
  ],
};

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
// Selections persist per message, so each render gets a message of its own.
let messages = 0;

function Message({
  value,
  messageId,
  onChoiceDraftUpdate,
  before = "",
}: {
  value: object;
  before?: string;
  messageId: MessageId;
  onChoiceDraftUpdate: (update: MarkdownChoiceDraftUpdate) => boolean;
}) {
  return (
    <div data-assistant-citation-viewport="true">
      <div
        data-assistant-citation-source={messageId}
        data-assistant-citation-environment={threadRef.environmentId}
        data-assistant-citation-thread={threadRef.threadId}
      >
        <MarkdownChatHandlersContext value={{ onChoiceDraftUpdate }}>
          <ChatMarkdown
            cwd="/workspace"
            text={before + "```compare\n" + JSON.stringify(value) + "\n```"}
            customBlocks
            threadRef={threadRef}
            messageId={messageId}
          />
        </MarkdownChatHandlersContext>
      </div>
    </div>
  );
}

const renderCompare = (
  value: object,
  onChoiceDraftUpdate = (_: MarkdownChoiceDraftUpdate) => true,
) => {
  const messageId = MessageId.make(`compare-${++messages}`);
  return render(
    <Message value={value} messageId={messageId} onChoiceDraftUpdate={onChoiceDraftUpdate} />,
  );
};

it("renders options, values, unknown fallback and recommendation without preselecting", async () => {
  await using screen = await renderCompare(bambu);
  await expect.element(screen.getByText("Choose a connection method")).toBeVisible();
  await expect.element(screen.getByText("Direct LAN control")).toBeVisible();
  await expect.element(screen.getByText("Recommended: Least setup")).toBeVisible();
  expect(screen.container.textContent).toContain("Unknown");
  await expect
    .element(screen.getByRole("radio", { name: "Cloud" }))
    .toHaveAttribute("aria-checked", "false");
});

it("keeps options without a choice as plain cards", async () => {
  await using screen = await renderCompare({
    ...bambu,
    options: bambu.options.map(({ choice: _choice, ...option }) => option),
  });
  await expect.element(screen.getByText("Local + Developer Mode")).toBeVisible();
  expect(screen.container.querySelector("[role=radio]")).toBeNull();
});

it("queues the clicked card as a choice", async () => {
  const onChoiceDraftUpdate = vi.fn((_update: MarkdownChoiceDraftUpdate) => true);
  await using screen = await renderCompare(bambu, onChoiceDraftUpdate);
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Direct LAN control" }));
  expect(onChoiceDraftUpdate.mock.calls[0]![0].changes[0]).toMatchObject({
    key: "mode/local",
    selected: true,
  });
});

it("shows Unknown for attribute ids that name Object.prototype members", async () => {
  await using screen = await renderCompare({
    ...bambu,
    options: bambu.options.map((option) => ({ ...option, values: {} })),
    attributes: [
      { id: "__proto__", label: "Proto" },
      { id: "constructor", label: "Ctor" },
    ],
  });
  await expect.element(screen.getByText("Proto").first()).toBeVisible();
  expect(screen.container.textContent?.match(/Unknown/g)).toHaveLength(4);
});

it("selects one card at a time by click or arrow key, with one tab stop", async () => {
  await using screen = await renderCompare(bambu);
  const cloud = screen.getByRole("radio", { name: "Cloud" });
  const local = screen.getByRole("radio", { name: "Local + Developer Mode" });
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Keep Bambu Handy" }));
  await expect.element(cloud).toHaveAttribute("aria-checked", "true");
  await expect.element(local).toHaveAttribute("aria-checked", "false");
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Direct LAN control" }));
  await expect.element(local).toHaveAttribute("aria-checked", "true");
  await expect.element(cloud).toHaveAttribute("aria-checked", "false");
  await expect.element(local).toHaveFocus();
  await expect.element(local).toHaveAttribute("tabindex", "0");
  await expect.element(cloud).toHaveAttribute("tabindex", "-1");
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(cloud).toHaveFocus();
  await expect.element(cloud).toHaveAttribute("aria-checked", "true");
  await expect.element(local).toHaveAttribute("aria-checked", "false");
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(local).toHaveFocus();
  await expect.element(local).toHaveAttribute("aria-checked", "true");
});

it("stages the selected card in the composer draft and moves it with the selection", async () => {
  const messageId = MessageId.make(`compare-${++messages}`);
  function WithDraft() {
    const [draft, setDraft] = useState("My answer");
    return (
      <>
        <Message
          value={bambu}
          messageId={messageId}
          onChoiceDraftUpdate={(update) => {
            setDraft((current) => updateMarkdownChoiceDraft(current, update));
            return true;
          }}
        />
        <textarea aria-label="Draft" value={draft} readOnly />
      </>
    );
  }
  await using screen = await render(<WithDraft />);
  const draft = () =>
    (screen.container.querySelector("textarea[aria-label=Draft]") as HTMLTextAreaElement).value;
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Direct LAN control" }));
  await expect.poll(draft).toContain("My answer\nSelected mode/local:");
  const citation = collectAssistantCitations(draft())[0]!.citation;
  expect(citation.text).toBe("Local + Developer Mode");
  expect(findAssistantCitationSourceAnchor(document, citation)?.range.toString()).toBe(
    "Local + Developer Mode",
  );
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Keep Bambu Handy" }));
  await expect.poll(draft).toContain("Selected mode/cloud:");
  expect(draft()).not.toContain("Selected mode/local:");
  expect(collectAssistantCitations(draft())[0]!.citation.text).toBe("Cloud");
});

it("keeps one radio group, one tab stop and one draft row when a group spans prose and a card", async () => {
  const messageId = MessageId.make(`compare-${++messages}`);
  const shared = {
    ...bambu,
    options: [
      { ...bambu.options[0], choice: "g/a" },
      { ...bambu.options[1], choice: "g/b" },
    ],
  };
  function WithDraft() {
    const [draft, setDraft] = useState("");
    return (
      <>
        <Message
          value={shared}
          messageId={messageId}
          before={"Pick [Prose](choice:g/a) or [Other](choice:g/c)\n\n"}
          onChoiceDraftUpdate={(update) => {
            setDraft((current) => updateMarkdownChoiceDraft(current, update));
            return true;
          }}
        />
        <textarea aria-label="Draft" value={draft} readOnly />
      </>
    );
  }
  await using screen = await render(<WithDraft />);
  const draft = () =>
    (screen.container.querySelector("textarea[aria-label=Draft]") as HTMLTextAreaElement).value;
  const radios = () => Array.from(screen.container.querySelectorAll<HTMLElement>("[role=radio]"));
  await expect.poll(() => radios().length).toBe(4);
  expect(screen.container.querySelectorAll("[role=radiogroup]:not([hidden])")).toHaveLength(1);
  expect(radios().filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  await userEvent.click(screen.getByRole("radio", { name: "Other" }));
  await expect
    .poll(() => radios().find((radio) => radio.tabIndex === 0)?.textContent)
    .toBe("Other");
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(screen.getByRole("radio", { name: "Cloud" })).toHaveFocus();
  await expect
    .element(screen.getByRole("radio", { name: "Cloud" }))
    .toHaveAttribute("aria-checked", "true");
  expect(radios().filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  await expect.poll(() => draft().match(/Selected g\//g)).toHaveLength(1);
});

it("keeps four options in one scrolling row and scrolls the focused card into view", async () => {
  const messageId = MessageId.make(`compare-${++messages}`);
  const four = {
    attributes: [{ id: "cost", label: "Cost" }],
    options: ["a", "b", "c", "d"].map((id) => ({
      id,
      title: `Option ${id}`,
      values: { cost: "Low" },
      choice: `pick/${id}`,
    })),
  };
  await using screen = await render(
    <div style={{ inlineSize: 360 }}>
      <Message value={four} messageId={messageId} onChoiceDraftUpdate={() => true} />
    </div>,
  );
  const row = screen.container.querySelector<HTMLElement>(".markdown-compare-grid")!;
  const cards = Array.from(row.querySelectorAll("article"));
  expect(new Set(cards.map((card) => card.getBoundingClientRect().top)).size).toBe(1);
  expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
  await userEvent.click(screen.getByRole("article").filter({ hasText: "Option a" }));
  for (let step = 0; step < 3; step++) await userEvent.keyboard("{ArrowRight}");
  await expect.element(screen.getByRole("radio", { name: "Option d" })).toHaveFocus();
  await expect
    .poll(() => {
      const card = cards[3]!.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return card.left >= bounds.left && card.right <= bounds.right;
    })
    .toBe(true);
});
