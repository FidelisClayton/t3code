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
import { useRunResponseFocus } from "./RunPanel";

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
