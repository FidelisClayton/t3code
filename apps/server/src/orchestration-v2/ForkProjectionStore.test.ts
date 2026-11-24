import { assert, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  type ModelSelection,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const layerTest = Layer.mergeAll(
  ProjectionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
  SqlitePersistence.layerMemory,
);
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.4",
} satisfies ModelSelection;
const driver = ProviderDriverKind.make("codex");
const providerInstanceId = modelSelection.instanceId;

const traceSqlStatements = () => {
  const statements: Array<string> = [];
  const queryTransactions: Array<string | null> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      const end = span.end.bind(span);
      span.end = (endTime, exit) => {
        end(endTime, exit);
        const query = span.attributes.get("db.query.text");
        if (typeof query === "string") {
          statements.push(query);
          let parent = Option.getOrUndefined(span.parent);
          while (parent?._tag === "Span" && parent.name !== "sql.transaction") {
            parent = Option.getOrUndefined(parent.parent);
          }
          queryTransactions.push(parent?._tag === "Span" ? parent.spanId : null);
        }
      };
      return span;
    },
  });
  return { statements, tracer, queryTransactions };
};

const assertProjectScopedShells = Effect.fn("assertProjectScopedShells")(function* (
  suffix: string,
) {
  const projectionStore = yield* ProjectionStore.ProjectionStoreV2;
  const now = yield* DateTime.now;
  const projectId = ProjectId.make(`project:${suffix}:a`);
  const otherProjectId = ProjectId.make(`project:${suffix}:b`);
  const activeThreadId = ThreadId.make(`thread:${suffix}:a-active`);
  const archivedThreadId = ThreadId.make(`thread:${suffix}:a-archived`);
  const forkThreadId = ThreadId.make(`thread:${suffix}:a-fork`);
  const sourceThreadId = ThreadId.make(`thread:${suffix}:b-source`);
  const otherThreadId = ThreadId.make(`thread:${suffix}:b-other`);
  const sourceRunId = RunId.make(`run:${suffix}:b-source`);
  const sourceNodeId = NodeId.make(`node:${suffix}:b-source`);
  const createThread = (input: {
    readonly threadId: ThreadId;
    readonly projectId: ProjectId;
    readonly archived?: boolean;
    readonly forkedFromRunOf?: ThreadId;
  }) =>
    projectionStore.apply({
      id: EventId.make(`event:${input.threadId}:created`),
      type: "thread.created",
      threadId: input.threadId,
      occurredAt: now,
      payload: {
        createdBy: "user",
        creationSource: "web",
        id: input.threadId,
        projectId: input.projectId,
        title: input.threadId,
        providerInstanceId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        activeProviderThreadId: null,
        lineage:
          input.forkedFromRunOf === undefined
            ? { parentThreadId: null, relationshipToParent: null, rootThreadId: input.threadId }
            : {
                parentThreadId: input.forkedFromRunOf,
                relationshipToParent: "fork",
                rootThreadId: input.forkedFromRunOf,
              },
        forkedFrom:
          input.forkedFromRunOf === undefined
            ? null
            : { type: "run", threadId: input.forkedFromRunOf, runId: sourceRunId },
        createdAt: now,
        updatedAt: now,
        archivedAt: input.archived === true ? now : null,
        settledOverride: null,
        settledAt: null,
        lastVisitedAt: null,
        deletedAt: null,
      },
    });

  yield* createThread({ threadId: sourceThreadId, projectId: otherProjectId, archived: true });
  yield* createThread({ threadId: otherThreadId, projectId: otherProjectId });
  yield* createThread({ threadId: activeThreadId, projectId });
  yield* createThread({ threadId: archivedThreadId, projectId, archived: true });
  yield* createThread({ threadId: forkThreadId, projectId, forkedFromRunOf: sourceThreadId });
  yield* projectionStore.apply({
    id: EventId.make(`event:${suffix}:source-run`),
    type: "run.created",
    threadId: sourceThreadId,
    runId: sourceRunId,
    nodeId: sourceNodeId,
    driver,
    occurredAt: now,
    payload: {
      id: sourceRunId,
      threadId: sourceThreadId,
      ordinal: 1,
      providerInstanceId,
      modelSelection,
      providerThreadId: null,
      userMessageId: MessageId.make(`message:${suffix}:source-user`),
      rootNodeId: sourceNodeId,
      activeAttemptId: null,
      status: "completed",
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      checkpointId: null,
      contextHandoffId: null,
    },
  });
  yield* projectionStore.apply({
    id: EventId.make(`event:${suffix}:source-item`),
    type: "turn-item.updated",
    threadId: sourceThreadId,
    runId: sourceRunId,
    occurredAt: now,
    payload: {
      id: TurnItemId.make(`turn-item:${suffix}:source`),
      threadId: sourceThreadId,
      runId: sourceRunId,
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
      type: "assistant_message",
      messageId: MessageId.make(`message:${suffix}:source-assistant`),
      text: "Source answer",
      streaming: false,
    },
  });

  const unscoped = yield* projectionStore.getShellSnapshot();
  const inProject = (thread: { readonly projectId: ProjectId }) => thread.projectId === projectId;
  const active = yield* projectionStore.getShellSnapshot({ projectId, location: "active" });
  assert.deepEqual(active.threads, unscoped.threads.filter(inProject));
  assert.deepEqual(active.archivedThreads, []);
  assert.sameMembers(
    active.threads.map((thread) => thread.id),
    [activeThreadId, forkThreadId],
  );
  const fork = active.threads.find((thread) => thread.id === forkThreadId);
  assert.isAbove(fork?.visibleItemCount ?? 0, 0);

  const all = yield* projectionStore.getShellSnapshot({ projectId });
  assert.deepEqual(all.threads, active.threads);
  assert.deepEqual(all.archivedThreads, unscoped.archivedThreads.filter(inProject));
  assert.sameMembers(
    all.archivedThreads.map((thread) => thread.id),
    [archivedThreadId],
  );
  const missingThreadId = ThreadId.make(`thread:${suffix}:missing`);
  const targeted = yield* projectionStore.getShellSnapshot({
    threadIds: [forkThreadId, archivedThreadId, missingThreadId],
  });
  for (const threadId of [forkThreadId, archivedThreadId, missingThreadId]) {
    assert.deepEqual(
      [...targeted.threads, ...targeted.archivedThreads].find((shell) => shell.id === threadId) ??
        null,
      yield* projectionStore.getThreadShell(threadId),
    );
  }
  return { projectId, activeThreadId, forkThreadId, otherThreadId, sourceThreadId };
});

it.effect("reads only local durable creation links in bounded shell queries", () =>
  Effect.gen(function* () {
    const store = yield* ProjectionStore.ProjectionStoreV2;
    const sql = yield* SqlClient.SqlClient;
    const now = yield* DateTime.now;
    const { projectId, activeThreadId, forkThreadId, sourceThreadId } =
      yield* assertProjectScopedShells("creation-shell");
    const target = ThreadId.make("thread:creation-shell:unavailable-target");
    const rolledBackRun = RunId.make("run:creation-shell:rolled-back");
    const secondTarget = ThreadId.make("thread:creation-shell:second-target");
    const rolledBackTarget = ThreadId.make("thread:rolled-back-child");
    const sourceProjection = yield* store.getThreadProjection(sourceThreadId);
    const sourceRun = sourceProjection.runs[0]!;
    for (const [owner, runId, targetThreadId, ordinal] of [
      [activeThreadId, null, target, 1],
      [activeThreadId, null, target, 2],
      [sourceThreadId, sourceRun.id, ThreadId.make("thread:source-child"), 3],
      [activeThreadId, rolledBackRun, rolledBackTarget, 4],
      [activeThreadId, null, secondTarget, 5],
    ] as const) {
      yield* store.apply({
        id: EventId.make(`event:creation-shell:${ordinal}`),
        type: "turn-item.updated",
        threadId: owner,
        occurredAt: now,
        payload: {
          id: TurnItemId.make(`item:creation-shell:${ordinal}`),
          threadId: owner,
          runId,
          nodeId: null,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal,
          status: "completed",
          title: null,
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          type: "thread_created",
          targetThreadId,
          targetRunId: null,
          targetProviderInstanceId: providerInstanceId,
          targetModel: modelSelection.model,
        },
      });
    }
    assert.sameMembers(
      [...((yield* store.getThreadShell(activeThreadId))?.createdThreadIds ?? [])],
      [target, secondTarget, rolledBackTarget],
    );
    yield* store.apply({
      id: EventId.make("event:creation-shell:rolled-back"),
      type: "run.created",
      threadId: activeThreadId,
      runId: rolledBackRun,
      occurredAt: now,
      payload: {
        ...sourceRun,
        id: rolledBackRun,
        threadId: activeThreadId,
        status: "rolled_back",
      },
    });
    const { statements, tracer } = traceSqlStatements();
    const snapshot = yield* store
      .getShellSnapshot({ projectId, location: "active" })
      .pipe(Effect.withTracer(tracer));
    assert.sameMembers(
      snapshot.threads.map((thread) => thread.id),
      [activeThreadId, forkThreadId],
    );
    for (const threadId of [activeThreadId, forkThreadId]) {
      const expected = threadId === activeThreadId ? [secondTarget, target] : [];
      assert.deepEqual(
        snapshot.threads.find((thread) => thread.id === threadId)?.createdThreadIds,
        expected,
      );
      assert.deepEqual((yield* store.getThreadShell(threadId))?.createdThreadIds, expected);
      assert.deepEqual(
        ProjectionStore.threadShellFromProjection(yield* store.getThreadProjection(threadId))
          .createdThreadIds,
        expected,
      );
    }
    const decode = yield* sql.withTransaction(
      store.readShellSnapshot({ projectId, location: "active" }),
    );
    assert.deepEqual(yield* decode, snapshot);
    const queries = statements.filter((statement) =>
      statement.includes("i.type = 'thread_created'"),
    );
    assert.lengthOf(queries, 1);
    const plan = yield* sql.unsafe<{ readonly detail: string }>(`EXPLAIN QUERY PLAN ${queries[0]}`);
    assert.isTrue(
      plan.some((row) =>
        /USING (COVERING )?INDEX orchestration_v2_projection_turn_items_/.test(row.detail),
      ),
    );
  }).pipe(Effect.provide(layerTest)),
);
