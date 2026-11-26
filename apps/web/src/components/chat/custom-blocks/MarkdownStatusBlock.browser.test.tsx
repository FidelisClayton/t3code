import * as DateTime from "effect/DateTime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import { MarkdownStatusBlock } from "./MarkdownStatusBlock";
import { parseMarkdownStatus } from "./markdownStatus";
import "../../../index.css";

const state = vi.hoisted(() => ({
  projection: null as null | { runtimeRequests: unknown[]; turnItems: unknown[] },
  childApprovals: [] as unknown[],
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.childApprovals }));
vi.mock("~/state/threads", () => ({ childThreadApprovalsAtom: () => null }));
vi.mock("~/state/entities", () => ({
  useQuietThreadProjection: () => (state.projection ? { projection: state.projection } : null),
}));

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
const status = parseMarkdownStatus(
  JSON.stringify({
    title: "Provider page updates",
    attention: "none",
    state: "in_progress",
    body: "Proceeding with violet Signing status.",
    default: "Violet Signing status",
    notes: [
      { kind: "tradeoff", text: "Same violet as Intake.", detail: "Why violet details" },
      { kind: "reversible", text: "One-line change." },
    ],
  }),
)!;
const renderStatus = (value = status, ref: typeof threadRef | undefined = threadRef) =>
  render(
    <MarkdownStatusBlock status={value} threadRef={ref} renderMarkdown={(body) => <p>{body}</p>} />,
  );

it("renders the fixture and shows no-action only when the thread has no pending request", async () => {
  state.projection = { runtimeRequests: [], turnItems: [] };
  await using screen = await renderStatus();
  await expect.element(screen.getByText("Provider page updates")).toBeVisible();
  await expect.element(screen.getByText("No action needed")).toBeVisible();
  await expect.element(screen.getByText("Default: Violet Signing status")).toBeVisible();
  await expect.element(screen.getByText("Trade-off")).toBeVisible();
  await expect.element(screen.getByText("Reversible")).toBeVisible();
  await expect.element(screen.getByText("Why violet details")).not.toBeVisible();
  await userEvent.click(screen.getByText("Same violet as Intake."));
  await expect.element(screen.getByText("Why violet details")).toBeVisible();
});

it("hides the no-action label while an approval is pending", async () => {
  state.projection = {
    runtimeRequests: [
      {
        id: "req",
        kind: "command_execution_approval",
        status: "pending",
        createdAt: DateTime.makeUnsafe("2026-11-25T00:00:00.000Z"),
        responseCapability: { type: "live" },
      },
    ],
    turnItems: [],
  };
  await using screen = await renderStatus();
  await expect.element(screen.getByText("Provider page updates")).toBeVisible();
  expect(screen.container.textContent).not.toContain("No action needed");
});

it("hides the no-action label while a question is pending", async () => {
  state.projection = {
    runtimeRequests: [
      {
        id: "req",
        kind: "user_input",
        status: "pending",
        createdAt: DateTime.makeUnsafe("2026-11-25T00:00:00.000Z"),
        responseCapability: { type: "live" },
      },
    ],
    turnItems: [{ type: "user_input_request", requestId: "req", questions: [] }],
  };
  await using screen = await renderStatus();
  await expect.element(screen.getByText("Provider page updates")).toBeVisible();
  expect(screen.container.textContent).not.toContain("No action needed");
});

it("hides the no-action label while a child thread awaits approval", async () => {
  state.projection = { runtimeRequests: [], turnItems: [] };
  state.childApprovals = [{}];
  try {
    await using screen = await renderStatus();
    await expect.element(screen.getByText("Provider page updates")).toBeVisible();
    expect(screen.container.textContent).not.toContain("No action needed");
  } finally {
    state.childApprovals = [];
  }
});

it("hides the no-action label when the thread cannot be verified", async () => {
  state.projection = null;
  await using screen = await renderStatus();
  await expect.element(screen.getByText("Provider page updates")).toBeVisible();
  expect(screen.container.textContent).not.toContain("No action needed");
});

it("shows Optional regardless of pending state", async () => {
  state.projection = null;
  await using screen = await renderStatus({ ...status, attention: "optional" }, undefined);
  await expect.element(screen.getByText("Optional")).toBeVisible();
});
