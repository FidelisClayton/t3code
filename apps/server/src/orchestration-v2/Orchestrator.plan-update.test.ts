import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  openSession: () => Effect.die("No provider process needed for plan updates"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "plan-update" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

it.effect("thread.plan.update projects a todo_list on the thread's own run only", () =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const [own, other] = [ThreadId.make("thread:plan-own"), ThreadId.make("thread:plan-other")];
    for (const threadId of [own, other]) {
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`create:${threadId}`),
        threadId,
        projectId: ProjectId.make("project:plan-update"),
        title: threadId,
        modelSelection: { instanceId, model: "gpt-5.1-codex" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`dispatch:${threadId}`),
        threadId,
        messageId: MessageId.make(`message:${threadId}`),
        text: "Work",
        attachments: [],
        dispatchMode: { type: "defer_start" },
        createdBy: "user",
        creationSource: "web",
      });
    }
    const runOf = (threadId: ThreadId) =>
      projections.getThreadProjection(threadId).pipe(Effect.map(({ runs }) => runs[0]!.id));
    const ownRun = yield* runOf(own);
    const otherRun = yield* runOf(other);
    const update = (commandId: string, runId: typeof ownRun) =>
      orchestrator.dispatch({
        type: "thread.plan.update",
        commandId: CommandId.make(commandId),
        threadId: own,
        runId,
        steps: [{ id: "U1", text: "First", status: "running" }],
      });

    yield* update("plan-own", ownRun);
    const { plans } = yield* projections.getThreadProjection(own);
    assert.lengthOf(plans, 1);
    // The step anchor is what later turns a completion into a duration.
    assert.isDefined(
      plans[0]!.kind === "todo_list" ? plans[0]!.steps[0]?.durationAnchorAt : undefined,
    );
    assert.deepInclude(plans[0]!, { kind: "todo_list", runId: ownRun, status: "active" });

    const exit = yield* Effect.exit(update("plan-foreign", otherRun));
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause);
      assert.isTrue(error._tag === "Some" && error.value._tag === "OrchestratorDispatchError");
    }
    assert.lengthOf((yield* projections.getThreadProjection(own)).plans, 1);
  }).pipe(Effect.provide(layerTest)),
);
