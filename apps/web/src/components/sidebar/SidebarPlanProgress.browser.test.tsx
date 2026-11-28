import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";
import { SidebarPlanProgress } from "./SidebarPlanProgress";

const environmentId = EnvironmentId.make("plan-progress-environment");
const threadId = ThreadId.make("plan-progress-thread");
type Thread = Parameters<typeof SidebarPlanProgress>[0]["thread"];
const subagent = (taskId: string) => ({ taskId, kind: "subagent" as const });

const running: Thread["runtime"] = {
  status: "running",
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: null,
  lastError: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const idle = { ...running, status: "idle" as const };

function line(thread: Partial<Thread>, onThreadActivate = vi.fn(), isRouteThread = false) {
  return (
    <SidebarPlanProgress
      thread={{
        environmentId,
        id: threadId,
        pendingBackgroundTasks: [],
        runtime: running,
        ...thread,
      }}
      isRouteThread={isRouteThread}
      onThreadActivate={onThreadActivate}
    />
  );
}

it("shows the step count, current step and running agents only while the plan is unfinished", async () => {
  const planProgress = { completed: 3, total: 10, current: "U3 Plan agent" };
  await using screen = await render(
    line({
      planProgress,
      pendingBackgroundTasks: [
        subagent("agent-1"),
        subagent("agent-2"),
        { taskId: "build", kind: "command" },
      ],
    }),
  );
  const button = screen.getByTestId("sidebar-plan-progress");
  await expect
    .element(button)
    .toHaveAccessibleName("Open Run: 3 of 10 plan steps done, now U3 Plan agent, 2 agents running");
  await expect.element(button).toHaveTextContent("3/10·U3 Plan agent·2 agents");

  await screen.rerender(
    line({ planProgress, pendingBackgroundTasks: [{ taskId: "build", kind: "command" }] }),
  );
  await expect
    .element(button)
    .toHaveAccessibleName("Open Run: 3 of 10 plan steps done, now U3 Plan agent");
  await expect.element(button).toHaveTextContent("3/10·U3 Plan agent");

  await screen.rerender(line({ planProgress: { completed: 10, total: 10, current: null } }));
  await expect.element(button).not.toBeInTheDocument();
  await screen.rerender(line({}));
  await expect.element(button).not.toBeInTheDocument();
});

it("opens the thread with the Run panel without running the row's click", async () => {
  const initial = useRightPanelStore.getState();
  using _store = { [Symbol.dispose]: () => useRightPanelStore.setState(initial, true) };
  const onThreadActivate = vi.fn();
  const onRowClick = vi.fn();
  const planProgress = { completed: 1, total: 4, current: null };
  await using screen = await render(
    <div onClick={onRowClick}>{line({ planProgress }, onThreadActivate)}</div>,
  );
  await screen.getByRole("button", { name: "Open Run: 1 of 4 plan steps done" }).click();

  const threadRef = scopeThreadRef(environmentId, threadId);
  expect(onThreadActivate).toHaveBeenCalledWith(threadRef);
  expect(onRowClick).not.toHaveBeenCalled();
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef)
      .activeSurfaceId,
  ).toBe("run");
});

it("hides an unfinished plan once the run ended, but keeps it while delegates hold the thread", async () => {
  const planProgress = { completed: 3, total: 10, current: "U3 Plan agent" };
  await using screen = await render(line({ planProgress, runtime: idle }));
  const button = screen.getByTestId("sidebar-plan-progress");
  await expect.element(button).not.toBeInTheDocument();
  await screen.rerender(line({ planProgress, runtime: null }));
  await expect.element(button).not.toBeInTheDocument();
  await screen.rerender(line({ planProgress, runtime: running }));
  await expect.element(button).toBeInTheDocument();
  await screen.rerender(
    line({
      planProgress,
      runtime: idle,
      pendingBackgroundTasks: [{ taskId: "pr", kind: "command" }],
    }),
  );
  await expect.element(button).not.toBeInTheDocument();
  await screen.rerender(
    line({
      planProgress,
      runtime: idle,
      pendingBackgroundTasks: [{ taskId: "agent-1", kind: "subagent" }],
    }),
  );
  await expect.element(button).toBeInTheDocument();
});

it("on the route thread opens the Run panel without activating the thread", async () => {
  const initial = useRightPanelStore.getState();
  using _store = { [Symbol.dispose]: () => useRightPanelStore.setState(initial, true) };
  const onThreadActivate = vi.fn();
  await using screen = await render(
    line({ planProgress: { completed: 1, total: 4, current: null } }, onThreadActivate, true),
  );
  await screen.getByTestId("sidebar-plan-progress").click();
  expect(onThreadActivate).not.toHaveBeenCalled();
  expect(
    selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      scopeThreadRef(environmentId, threadId),
    ).activeSurfaceId,
  ).toBe("run");
});
