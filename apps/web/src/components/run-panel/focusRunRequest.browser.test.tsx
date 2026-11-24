import "../../index.css";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { usePanelPresence } from "../../panelAnimations";
import { page, userEvent } from "vite-plus/test/browser";
import { RightPanelSheet } from "../RightPanelSheet";
import { expect, it, vi } from "vite-plus/test";
vi.mock(import("../ChatMarkdown"), () => ({
  default: (({ text }: { text: string }) => <p>{text}</p>) as never,
}));
import { render } from "../../../test/render";
import { ComposerPendingUserInputPanel } from "../chat/ComposerPendingUserInputPanel";
import { useRunPanelChatControls, useRunResponseFocus } from "./RunPanel";

it.each([0, 180])(
  "reveals a collapsed question after the Sheet closes (%i ms)",
  async (animationDurationMs) => {
    const focusComposer = vi.fn();
    const toggleOption = vi.fn();
    const advance = vi.fn();
    function ResponseSheet({ fallbackFocus }: { fallbackFocus: () => void }) {
      const [open, setOpen] = useState(false);
      const presence = usePanelPresence(
        open,
        "run",
        animationDurationMs > 0,
        "parent",
        animationDurationMs,
      );
      const [composer, setComposer] = useState<HTMLDivElement | null>(null);
      const responseFocus = useRunResponseFocus({
        scopeKey: "parent",
        open,
        present: presence.present,
        composer,
        focusComposer: fallbackFocus,
      });
      return (
        <div ref={setComposer}>
          <ComposerPendingUserInputPanel
            pendingUserInputs={[
              {
                requestId: RuntimeRequestId.make("question"),
                createdAt: "2026-11-10T00:00:00Z",
                responseCapability: "live",
                dismissible: false,
                questions: [
                  {
                    id: "scope",
                    header: "Scope",
                    question: "Which migration?",
                    options: [{ label: "Incremental", description: "One table at a time" }],
                    multiSelect: false,
                  },
                ],
              },
            ]}
            cwd={undefined}
            threadRef={{
              environmentId: EnvironmentId.make("local"),
              threadId: ThreadId.make("parent"),
            }}
            respondingRequestIds={[]}
            answers={{}}
            questionIndex={0}
            onToggleOption={toggleOption}
            onAdvance={advance}
            onDismiss={() => {}}
          />
          <button type="button" onClick={() => setOpen(true)}>
            Open Run
          </button>
          {presence.present ? (
            <RightPanelSheet
              animationDurationMs={animationDurationMs}
              open={open}
              onClose={() => setOpen(false)}
              onCloseFocus={responseFocus.onCloseFocus}
            >
              <button
                type="button"
                onClick={() => {
                  responseFocus.requestFocus();
                  setOpen(false);
                }}
              >
                Respond in chat
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Close Run
              </button>
            </RightPanelSheet>
          ) : null}
        </div>
      );
    }
    await using screen = await render(<ResponseSheet fallbackFocus={focusComposer} />);
    await screen.getByTitle("Hide the question and its options").click();
    await expect.element(screen.getByTitle("Show the question and its options")).toBeVisible();
    await screen.getByRole("button", { name: "Open Run" }).click();
    await page.getByRole("button", { name: "Respond in chat" }).click();
    await expect.element(screen.getByTitle("Hide the question and its options")).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: /Incremental/ })).toBeVisible();
    expect(focusComposer).not.toHaveBeenCalled();
    expect(toggleOption).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    await screen.getByTitle("Hide the question and its options").click();
    await screen.rerender(<ResponseSheet fallbackFocus={() => focusComposer()} />);
    await expect.element(screen.getByTitle("Show the question and its options")).toHaveFocus();
    await screen.getByRole("button", { name: "Open Run" }).click();
    await expect.element(page.getByRole("button", { name: "Respond in chat" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("button", { name: "Open Run" })).toHaveFocus();
  },
);

it.each([
  { usesSheet: false, hasQuestion: true },
  { usesSheet: false, hasQuestion: false },
  { usesSheet: true, hasQuestion: true },
])(
  "Respond in chat scrolls to the end, then focuses the question or composer inline, or closes the sheet ($usesSheet, question: $hasQuestion)",
  async ({ usesSheet, hasQuestion }) => {
    const order: string[] = [];
    const scrollToEnd = vi.fn(() => order.push("scroll"));
    const closePanel = vi.fn();
    const focusComposer = vi.fn(() => order.push("composer"));
    const restores: boolean[] = [];
    function Controls() {
      const [composer, setComposer] = useState<HTMLDivElement | null>(null);
      const controls = useRunPanelChatControls({
        threadRef: null,
        buttonOpen: false,
        scrollToEnd,
        usesSheet,
        closePanel,
        scopeKey: "parent",
        open: true,
        present: true,
        composer,
        focusComposer,
      });
      return (
        <div ref={setComposer}>
          {hasQuestion ? (
            <button
              type="button"
              data-pending-user-input-toggle="expanded"
              onFocus={() => order.push("question")}
            >
              Question
            </button>
          ) : null}
          <button type="button" onClick={controls.onRespondInChat}>
            Respond in chat
          </button>
          <button type="button" onClick={() => restores.push(controls.onCloseFocus())}>
            Close focus
          </button>
        </div>
      );
    }
    await using screen = await render(<Controls />);
    await screen.getByRole("button", { name: "Close focus" }).click();
    await screen.getByRole("button", { name: "Respond in chat" }).click();
    expect(scrollToEnd).toHaveBeenCalledWith(true);
    if (usesSheet) {
      expect(closePanel).toHaveBeenCalledTimes(1);
      // requestFocus suppresses the Sheet's default focus restore so the response target wins.
      await screen.getByRole("button", { name: "Close focus" }).click();
      expect(restores).toEqual([true, false]);
      expect(focusComposer).not.toHaveBeenCalled();
    } else if (hasQuestion) {
      expect(closePanel).not.toHaveBeenCalled();
      expect(focusComposer).not.toHaveBeenCalled();
      await expect.element(screen.getByRole("button", { name: "Question" })).toHaveFocus();
      expect(order).toEqual(["scroll", "question"]);
    } else {
      expect(closePanel).not.toHaveBeenCalled();
      expect(focusComposer).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["scroll", "composer"]);
    }
  },
);
