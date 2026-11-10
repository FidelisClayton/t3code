import {
  EnvironmentId,
  PlanId,
  NodeId,
  RunId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
vi.mock(import("../ChatMarkdown"), () => ({
  default: (({ text }: { text: string }) => <div>{text}</div>) as never,
}));
import { render } from "../../../test/render";
import { RunPanelView } from "./RunPanel";
import type { RunPanelModel, RunPanelRow } from "./runPanelModel";

const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("parent") };
function model(rows: RunPanelRow[]): RunPanelModel {
  return { rows, plan: null, pendingRequests: { approvals: [], userInputs: [] } };
}
function panel(
  data: RunPanelModel,
  options: {
    ref?: typeof threadRef;
    connected?: boolean;
    onRespond?: () => void;
    status?: Parameters<typeof RunPanelView>[0]["status"];
  } = {},
) {
  return (
    <RunPanelView
      threadRef={options.ref ?? threadRef}
      model={data}
      status={options.status ?? "live"}
      connected={options.connected ?? true}
      error={null}
      onRespondInChat={options.onRespond ?? (() => {})}
      renderChild={() => <p>Selected child activity</p>}
      renderParent={() => <p>Parent execution context</p>}
    />
  );
}

it("shows task details in place and updates progress without a new turn", async () => {
  const row: RunPanelRow = {
    key: "worker",
    kind: "subagent",
    title: "Verifier",
    status: "running",
    group: "working",
    detail: "Check the migration",
    progress: "Reading schema",
  };
  await using screen = await render(panel(model([row])));
  await expect.element(screen.getByText("Check the migration")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: /Verifier/ }).click();
  await expect.element(screen.getByText("Check the migration")).toBeVisible();
  await screen.rerender(
    panel(model([{ ...row, progress: "Checking rollback", result: "Migration verified" }])),
  );
  await expect.element(screen.getByText("Checking rollback")).toBeVisible();
  await expect.element(screen.getByText("Migration verified")).toBeVisible();
  expect(screen.router?.state.location.pathname).toBe("/");
});

it("discloses finished executions without claiming the feature is complete", async () => {
  await using screen = await render(
    panel(
      model([
        {
          key: "done",
          kind: "subagent",
          title: "Verifier",
          status: "completed",
          group: "finished",
          result: "Checked schema",
        },
      ]),
    ),
  );
  expect(screen.container.querySelector("details")?.open).toBe(false);
  await screen.getByText("Finished", { exact: false }).first().click();
  await screen.getByRole("button", { name: /Verifier/ }).click();
  await expect.element(screen.getByText("Agent finished · Subagent")).toBeVisible();
  await expect.element(screen.getByText("Checked schema")).toBeVisible();
});

it("scopes selection to the environment and thread", async () => {
  const data = model([
    {
      key: "same-key",
      kind: "subagent",
      title: "Verifier",
      status: "running",
      group: "working",
      detail: "Private task detail",
    },
  ]);
  await using screen = await render(panel(data));
  await screen.getByRole("button", { name: /Verifier/ }).click();
  await expect.element(screen.getByText("Private task detail")).toBeVisible();
  await screen.rerender(
    panel(data, { ref: { ...threadRef, environmentId: EnvironmentId.make("other") } }),
  );
  await expect.element(screen.getByText("Private task detail")).not.toBeInTheDocument();
});

it("opens child detail only on selection and exposes the scoped thread route", async () => {
  const ref = { environmentId: EnvironmentId.make("remote"), threadId: ThreadId.make("child") };
  await using screen = await render(
    panel(
      model([
        {
          key: "child",
          kind: "child",
          title: "Builder",
          status: "waiting",
          group: "attention",
          pendingRequestHint: "approval",
          thread: ref,
        },
      ]),
    ),
  );
  await expect.element(screen.getByText("Selected child activity")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: /Builder/ }).click();
  await expect.element(screen.getByText("Request pending · Child thread")).toBeVisible();
  await expect.element(screen.getByText("Selected child activity")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Open thread" }))
    .toHaveAttribute("href", "/remote/child");
  await screen.getByRole("button", { name: /Builder/ }).click();
  await expect.element(screen.getByText("Selected child activity")).not.toBeInTheDocument();
});

it("offers the existing chat response path only for a live, resumable request", async () => {
  const respond = vi.fn();
  const data = model([
    {
      key: "parent",
      kind: "parent",
      title: "Parent",
      status: "waiting",
      group: "attention",
      thread: threadRef,
    },
  ]);
  const pendingRequests: RunPanelModel["pendingRequests"] = {
    approvals: [
      {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        createdAt: "2026-11-10T00:00:00Z",
        detail: "Run database migration",
        responseCapability: "live",
      },
    ],
    userInputs: [],
  };
  const requested = { ...data, pendingRequests };
  await using screen = await render(panel(requested, { onRespond: respond }));
  await expect.element(screen.getByText("Run database migration")).toBeVisible();
  await screen.getByRole("button", { name: "Respond in chat" }).click();
  expect(respond).toHaveBeenCalledOnce();
  await expect.element(screen.getByText("Parent execution context")).not.toBeInTheDocument();
  await screen.getByText("Activity", { exact: true }).click();
  await expect.element(screen.getByText("Parent execution context")).toBeVisible();
  await screen.rerender(panel(requested, { connected: false, onRespond: respond }));
  await expect
    .element(screen.getByRole("button", { name: "Respond in chat" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Activity snapshot")).toBeVisible();
});

it("marks unfinished plan steps as last reported when their execution ends or becomes stale", async () => {
  const runId = RunId.make("plan-run");
  const row: RunPanelRow = {
    key: "parent",
    runId,
    kind: "parent",
    title: "Parent",
    status: "running",
    group: "working",
    thread: threadRef,
  };
  const data: RunPanelModel = {
    ...model([row]),
    plan: {
      id: PlanId.make("plan"),
      threadId: threadRef.threadId,
      runId,
      nodeId: NodeId.make("plan"),
      kind: "todo_list",
      status: "active",
      steps: [
        { id: "done", text: "Read schema", status: "completed" },
        { id: "work", text: "Apply migration", status: "running" },
      ],
    },
  };
  await using screen = await render(panel(data));
  await expect
    .element(screen.getByText("Apply migration · Running", { exact: true }))
    .toBeVisible();
  await screen.rerender(
    panel({ ...data, rows: [{ ...row, status: "completed", group: "finished" }] }),
  );
  await expect
    .element(screen.getByText("Apply migration · Last reported running", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Read schema", { exact: true })).toBeVisible();
  await screen.rerender(panel(data, { connected: false }));
  await expect
    .element(screen.getByText("Apply migration · Last reported running", { exact: true }))
    .toBeVisible();
  await screen.rerender(panel({ ...data, rows: [{ ...row, runId: RunId.make("different-run") }] }));
  await expect
    .element(screen.getByText("Apply migration · Last reported running", { exact: true }))
    .toBeVisible();
  await screen.rerender(panel(data, { status: "cached" }));
  await expect
    .element(screen.getByText("Apply migration · Last reported running", { exact: true }))
    .toBeVisible();
  await screen.rerender(panel(data));
  await expect
    .element(screen.getByText("Apply migration · Running", { exact: true }))
    .toBeVisible();
});
