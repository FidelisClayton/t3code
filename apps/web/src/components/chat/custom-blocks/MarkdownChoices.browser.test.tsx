import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { collectAssistantCitations } from "@t3tools/shared/assistantCitations";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../../test/render";
import "../../../index.css";
import ChatMarkdown from "../../ChatMarkdown";
import { MarkdownChatHandlersContext } from "./MarkdownChatHandlers";
import { updateMarkdownChoiceDraft } from "./markdownChoiceDraft";

const details = "Compile-time extraction with macros; closest to today's msg().";
const text = `Qual é o destino? [i18next](choice:i18n/i18next) · [Lingui](choice:i18n/lingui "${details}")`;
const threadRef = {
  environmentId: EnvironmentId.make("details-env"),
  threadId: ThreadId.make("details-thread"),
};
const messageId = MessageId.make("details-message");

function Fixture() {
  const [draft, setDraft] = useState("");
  return (
    <>
      {/* Expose the touch-only info button in the fine-pointer browser fixture. */}
      <style>{"button[aria-label='Show details'] { display: inline-flex !important; }"}</style>
      <div data-assistant-citation-viewport="true">
        <div
          data-assistant-citation-source={messageId}
          data-assistant-citation-environment={threadRef.environmentId}
          data-assistant-citation-thread={threadRef.threadId}
        >
          <MarkdownChatHandlersContext
            value={{
              onChoiceDraftUpdate: (update) => {
                setDraft((current) => updateMarkdownChoiceDraft(current, update));
                return true;
              },
            }}
          >
            <ChatMarkdown
              cwd="/workspace"
              text={text}
              customBlocks
              threadRef={threadRef}
              messageId={messageId}
            />
          </MarkdownChatHandlersContext>
        </div>
      </div>
      <output data-testid="draft">{draft}</output>
    </>
  );
}

describe("inline choice details", () => {
  it("shows a link title on hover and focus, and from the info button", async () => {
    await using screen = await render(<Fixture />);
    const lingui = screen.getByRole("radio", { name: "Lingui", exact: true });
    expect(screen.getByRole("button", { name: "Show details" }).elements()).toHaveLength(1);

    await userEvent.hover(lingui);
    await expect.element(page.getByText(details)).toBeVisible();
    await userEvent.unhover(lingui);
    await expect.element(page.getByText(details)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show details" }));
    await expect.element(page.getByText(details)).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByText(details)).not.toBeInTheDocument();

    lingui.element().focus();
    await expect.element(page.getByText(details)).toBeVisible();
  });

  it("leaves untitled choices unchanged and keeps the title out of the draft", async () => {
    await using screen = await render(<Fixture />);
    const plain = screen.getByRole("radio", { name: "i18next", exact: true });
    await userEvent.hover(plain);
    expect(plain.element().getAttribute("aria-description")).toBeNull();
    expect(screen.container.querySelectorAll("button[aria-label='Show details']")).toHaveLength(1);

    await userEvent.click(screen.getByRole("radio", { name: "Lingui", exact: true }));
    const draft = screen.getByTestId("draft").element().textContent ?? "";
    expect(draft).toContain("Selected i18n/lingui:");
    expect(draft).not.toContain("Compile-time");
    expect(collectAssistantCitations(draft)[0]!.citation.text).toBe("Lingui");
  });
});
