import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  projection: null as OrchestrationV2ThreadProjection | null,
  shells: [] as ReturnType<typeof import("../../test-fixtures").makeThreadFixture>[],
  query: null as Atom.Atom<
    AsyncResult.AsyncResult<{ threads: { threadId: ThreadId; runId: null }[] }>
  > | null,
}));
vi.mock("../../state/entities", () => ({
  useQuietThreadProjection: () => (state.projection ? { projection: state.projection } : null),
  useQuietThreadShells: () => state.shells,
  useThreadStatus: () => "live",
  useAssistantMessageText: () => "",
}));
vi.mock("../../state/environments", () => ({
  useEnvironment: () => ({ connection: { phase: "connected" } }),
}));
vi.mock("../../state/orchestration", () => ({
  orchestrationEnvironment: { createdThreads: () => state.query },
}));
vi.mock("../ChatMarkdown", () => ({ default: () => null }));
import { render } from "../../../test/render";
import { makeThreadFixture, makeThreadProjectionFixture } from "../../test-fixtures";
import { RunPanelButton } from "./RunPanel";

function setup() {
  state.projection = makeThreadProjectionFixture();
  state.shells = [];
  state.query = null;
  return state.projection;
}

it("counts historical requests and refreshes associations before streamed events age out", async () => {
  state.projection = setup();
  const historical = ThreadId.make("historical");
  const recent = ThreadId.make("recent");
  state.shells = [historical, recent].map((id) =>
    makeThreadFixture({
      id,
      environmentId: EnvironmentId.make("local"),
      hasPendingUserInput: true,
    }),
  );
  let persisted = [{ threadId: historical, runId: null }];
  let fetches = 0;
  state.query = Atom.make(() => {
    fetches += 1;
    return AsyncResult.success({ threads: persisted });
  });
  const registry = AtomRegistry.make();
  const ui = () => (
    <RegistryContext.Provider value={registry}>
      <RunPanelButton
        threadRef={{
          environmentId: EnvironmentId.make("local"),
          threadId: state.projection!.thread.id,
        }}
        open={false}
      />
    </RegistryContext.Provider>
  );
  await using screen = await render(ui());
  await expect
    .element(screen.getByRole("button", { name: "Open Run, 1 need a look" }))
    .toBeVisible();
  const before = fetches;
  persisted = [...persisted, { threadId: recent, runId: null }];
  const now = DateTime.makeUnsafe("2026-11-10T00:00:00Z");
  state.projection = {
    ...state.projection,
    turnItems: [
      {
        id: TurnItemId.make("created"),
        threadId: state.projection.thread.id,
        runId: null,
        nodeId: null,
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 1,
        status: "completed",
        title: null,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
        type: "thread_created",
        targetThreadId: recent,
        targetRunId: null,
        targetProviderInstanceId: state.projection.thread.providerInstanceId,
        targetModel: "codex",
      },
    ],
  };
  await screen.rerender(ui());
  await vi.waitFor(() => expect(fetches).toBeGreaterThan(before));
  state.projection = { ...state.projection, turnItems: [] };
  await screen.rerender(ui());
  await expect
    .element(screen.getByRole("button", { name: "Open Run, 2 need a look" }))
    .toBeVisible();
  const after = fetches;
  state.projection = { ...state.projection };
  await screen.rerender(ui());
  expect(fetches).toBe(after);
  persisted = [{ threadId: historical, runId: null }];
  state.projection = {
    ...state.projection,
    runs: [
      {
        id: RunId.make("source"),
        threadId: state.projection.thread.id,
        ordinal: 1,
        providerInstanceId: state.projection.thread.providerInstanceId,
        modelSelection: state.projection.thread.modelSelection,
        providerThreadId: null,
        userMessageId: MessageId.make("prompt"),
        rootNodeId: null,
        activeAttemptId: null,
        status: "rolled_back",
        requestedAt: now,
        startedAt: now,
        completedAt: now,
        checkpointId: null,
        contextHandoffId: null,
      },
    ],
  };
  await screen.rerender(ui());
  await expect
    .element(screen.getByRole("button", { name: "Open Run, 1 need a look" }))
    .toBeVisible();
});
