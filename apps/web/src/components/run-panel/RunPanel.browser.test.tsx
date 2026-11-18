import {
  EnvironmentId,
  PlanId,
  NodeId,
  RunId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
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
  await expect
    .element(screen.getByRole("button", { name: "Verifier Running · Subagent Reading schema" }))
    .toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.getByText("Reading schema")).toBeVisible();
  await screen.getByRole("button", { name: /Verifier/ }).click();
  await expect.element(screen.getByText("Check the migration")).toBeVisible();
  await screen.rerender(
    panel(model([{ ...row, progress: "Checking rollback", result: "Migration verified" }])),
  );
  await expect.element(screen.getByText("Checking rollback")).toBeVisible();
  await expect.element(screen.getByText("Migration verified")).toBeVisible();
  await screen.getByRole("button", { name: "Working 1", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: /Verifier/ })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Working 1", exact: true }).click();
  await expect.element(screen.getByText("Check the migration")).not.toBeInTheDocument();
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
  await expect
    .element(screen.getByRole("button", { name: "Finished 1", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.getByRole("button", { name: /Verifier/ })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Finished 1", exact: true }).click();
  await screen.getByRole("button", { name: /Verifier/ }).click();
  await expect.element(screen.getByText("Agent finished · Subagent")).toBeVisible();
  await expect.element(screen.getByText("Checked schema")).toBeVisible();
  await screen.getByRole("button", { name: "Finished 1", exact: true }).click();
  await screen.getByRole("button", { name: "Finished 1", exact: true }).click();
  await expect.element(screen.getByText("Checked schema")).not.toBeInTheDocument();
});

it("scopes selection and section defaults to the environment and thread", async () => {
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
  for (const ref of [
    { ...threadRef, environmentId: EnvironmentId.make("other") },
    { ...threadRef, environmentId: EnvironmentId.make("other"), threadId: ThreadId.make("other") },
  ]) {
    await screen.getByRole("button", { name: "Working 1", exact: true }).click();
    await screen.rerender(panel(data, { ref }));
    await expect
      .element(screen.getByRole("button", { name: "Working 1", exact: true }))
      .toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByText("Private task detail")).not.toBeInTheDocument();
    await screen.getByRole("button", { name: /Verifier/ }).click();
    await expect.element(screen.getByText("Private task detail")).toBeVisible();
  }
  await screen.rerender(panel(data));
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
        { key: "worker", kind: "subagent", title: "Verifier", status: "running", group: "working" },
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
  await screen.getByRole("button", { name: "Working 1", exact: true }).click();
  await expect.element(screen.getByText("Selected child activity")).toBeVisible();
  await screen.getByRole("button", { name: "Needs a look 1", exact: true }).click();
  await expect.element(screen.getByText("Selected child activity")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Needs a look 1", exact: true }).click();
  await expect.element(screen.getByText("Selected child activity")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: /Builder/ }))
    .toHaveAttribute("aria-expanded", "false");
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
  await screen.getByRole("button", { name: "Activity", exact: true }).click();
  await expect.element(screen.getByText("Parent execution context")).toBeVisible();
  await screen.getByRole("button", { name: "Activity", exact: true }).click();
  await expect.element(screen.getByText("Parent execution context")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Run database migration")).toBeVisible();
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
  await screen.getByRole("button", { name: "Plan", exact: true }).click();
  await screen.rerender(panel(data, { connected: false }));
  await expect.element(screen.getByText("Read schema", { exact: true })).not.toBeInTheDocument();
  await screen.rerender(panel(data, { ref: { ...threadRef, threadId: ThreadId.make("other") } }));
  await expect.element(screen.getByText("Read schema", { exact: true })).toBeVisible();
});

it("folds groups independently with keyboard activation and keeps live counts while closed", async () => {
  const groups = [
    ["attention", "Needs a look"],
    ["working", "Working"],
    ["upNext", "Up next"],
    ["unavailable", "Unavailable"],
  ] as const;
  const rows: RunPanelRow[] = groups.map(([group]) => ({
    key: group,
    title: `${group} task`,
    group,
    kind: "subagent",
    status: "running",
  }));
  await using screen = await render(panel(model(rows)));
  for (const [group, title] of groups) {
    const header = screen.getByRole("button", { name: `${title} 1`, exact: true });
    await expect.element(header).toHaveAttribute("aria-expanded", "true");
    await header.click();
    await expect
      .element(screen.getByText(`${group} task`, { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(header).toHaveAttribute("aria-expanded", "false");
  }
  await screen.rerender(
    panel(model([...rows, { ...rows[1]!, key: "second", title: "Second worker" }])),
  );
  const working = screen.getByRole("button", { name: "Working 2", exact: true });
  await expect.element(working).toHaveAttribute("aria-expanded", "false");
  await screen.rerender(panel(model(rows.filter((row) => row.group !== "working"))));
  await screen.rerender(panel(model(rows)));
  const header = screen.getByRole("button", { name: "Working 1", exact: true });
  await expect.element(header).toHaveAttribute("aria-expanded", "false");
  (header.element() as HTMLButtonElement).focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByText("working task", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("upNext task", { exact: true })).not.toBeInTheDocument();
  await userEvent.keyboard(" ");
  await expect.element(screen.getByText("working task", { exact: true })).not.toBeInTheDocument();
});
