import { assert, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  type ModelSelection,
  NodeId,
  PlanId,
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

it.effect("shell planProgress follows the latest todo_list plan by run ordinal", () =>
  Effect.gen(function* () {
    const store = yield* ProjectionStore.ProjectionStoreV2;
    const sql = yield* SqlClient.SqlClient;
    const now = yield* DateTime.now;
    const { projectId, activeThreadId, forkThreadId, sourceThreadId } =
      yield* assertProjectScopedShells("plan-shell");
    const sourceRun = (yield* store.getThreadProjection(sourceThreadId)).runs[0]!;
    const runs = [
      [RunId.make("run:plan-shell:old"), 10],
      [RunId.make("run:plan-shell:new"), 11],
    ] as const;
    for (const [id, ordinal] of runs) {
      yield* store.apply({
        id: EventId.make(`event:${id}`),
        type: "run.created",
        threadId: activeThreadId,
        runId: id,
        occurredAt: now,
        payload: { ...sourceRun, id, threadId: activeThreadId, ordinal },
      });
    }
    const step = (id: string, status: "pending" | "running" | "completed") => ({
      id,
      text: `step ${id}`,
      status,
    });
    const plans = [
      [
        activeThreadId,
        runs[1][0],
        [step("a", "completed"), step("b", "pending"), step("c", "running")],
      ],
      // Written later but belongs to an older run, so it must lose.
      [activeThreadId, runs[0][0], [step("z", "pending")]],
      [forkThreadId, null, [step("d", "completed")]],
    ] as const;
    for (const [index, [threadId, runId, steps]] of plans.entries()) {
      yield* store.apply({
        id: EventId.make(`event:plan-shell:${index}`),
        type: "plan.updated",
        threadId,
        occurredAt: now,
        payload: {
          id: PlanId.make(`plan:plan-shell:${index}`),
          threadId,
          runId,
          nodeId: NodeId.make(`node:plan-shell:${index}`),
          status: "active",
          kind: "todo_list",
          steps,
        },
      });
    }
    const expected = new Map([
      [activeThreadId, { completed: 1, total: 3, current: "step c" }],
      [forkThreadId, { completed: 1, total: 1, current: null }],
    ]);
    const snapshot = yield* store.getShellSnapshot({ projectId, location: "active" });
    for (const [threadId, progress] of expected) {
      assert.deepEqual(
        snapshot.threads.find((thread) => thread.id === threadId)?.planProgress,
        progress,
      );
      assert.deepEqual((yield* store.getThreadShell(threadId))?.planProgress, progress);
      assert.deepEqual(
        ProjectionStore.threadShellFromProjection(yield* store.getThreadProjection(threadId))
          .planProgress,
        progress,
      );
    }
    assert.isUndefined(
      snapshot.threads.find((thread) => thread.id === sourceThreadId)?.planProgress,
    );
    const decode = yield* sql.withTransaction(
      store.readShellSnapshot({ projectId, location: "active" }),
    );
    assert.deepEqual(yield* decode, snapshot);
  }).pipe(Effect.provide(layerTest)),
);

it.effect("shell planProgress agrees across SQL and projection for filtered and tied plans", () =>
  Effect.gen(function* () {
    const store = yield* ProjectionStore.ProjectionStoreV2;
    const sql = yield* SqlClient.SqlClient;
    const now = yield* DateTime.now;
    const { projectId, activeThreadId, sourceThreadId } =
      yield* assertProjectScopedShells("plan-filters");
    const sourceRun = (yield* store.getThreadProjection(sourceThreadId)).runs[0]!;
    let event = 0;
    const addRun = (name: string, ordinal: number, status?: "rolled_back") => {
      const id = RunId.make(`run:plan-filters:${name}`);
      return store
        .apply({
          id: EventId.make(`event:plan-filters:${event++}`),
          type: "run.created",
          threadId: activeThreadId,
          runId: id,
          occurredAt: now,
          payload: {
            ...sourceRun,
            id,
            threadId: activeThreadId,
            ordinal,
            ...(status === undefined ? {} : { status }),
          },
        })
        .pipe(Effect.as(id));
    };
    const addPlan = (
      name: string,
      runId: RunId,
      options: { status?: "active" | "superseded"; detailInTurnItem?: true; steps: number },
    ) =>
      store.apply({
        id: EventId.make(`event:plan-filters:${event++}`),
        type: "plan.updated",
        threadId: activeThreadId,
        occurredAt: now,
        payload: {
          id: PlanId.make(`plan:plan-filters:${name}`),
          threadId: activeThreadId,
          runId,
          nodeId: NodeId.make(`node:plan-filters:${name}`),
          status: options.status ?? "active",
          kind: "todo_list",
          steps: Array.from({ length: options.steps }, (_, index) => ({
            id: `s${index}`,
            text: `step ${index}`,
            status: "pending" as const,
          })),
          ...(options.detailInTurnItem === undefined ? {} : { detailInTurnItem: true as const }),
        },
      });
    const expectTotal = Effect.fn(function* (total: number | undefined) {
      const fromSql = (yield* store.getShellSnapshot({
        projectId,
        location: "active",
      })).threads.find((thread) => thread.id === activeThreadId)?.planProgress;
      const fromShell = (yield* store.getThreadShell(activeThreadId))?.planProgress;
      const fromProjection = ProjectionStore.threadShellFromProjection(
        yield* store.getThreadProjection(activeThreadId),
      ).planProgress;
      for (const progress of [fromSql, fromShell, fromProjection]) {
        assert.strictEqual(progress?.total, total);
      }
    });

    yield* expectTotal(undefined);
    // Two plans on one run: the higher plan id wins in both paths, whatever the write order.
    const tieRun = yield* addRun("tie", 100);
    yield* addPlan("b", tieRun, { steps: 2 });
    yield* addPlan("a", tieRun, { steps: 1 });
    yield* expectTotal(2);
    // A superseded plan on a newer run is ignored.
    yield* addPlan("superseded", yield* addRun("superseded", 101), {
      status: "superseded",
      steps: 5,
    });
    yield* expectTotal(2);
    // A rolled-back run's plan is ignored.
    yield* addPlan("rolled-back", yield* addRun("rolled-back", 102, "rolled_back"), { steps: 6 });
    yield* expectTotal(2);
    // A plan whose detail lives in a turn item still counts.
    yield* addPlan("detail", yield* addRun("detail", 103), { detailInTurnItem: true, steps: 3 });
    yield* expectTotal(3);

    const { statements, tracer } = traceSqlStatements();
    yield* store
      .getShellSnapshot({ projectId, location: "active" })
      .pipe(Effect.withTracer(tracer));
    const query = statements.find(
      (statement) => statement.includes("ROW_NUMBER()") && statement.includes("projection_plans"),
    );
    assert.isDefined(query);
    // The ranking subquery reads plan keys, not payloads.
    assert.notMatch(query!, /json_extract\(p\./);
    const plan = (yield* sql.unsafe<{ readonly detail: string }>(`EXPLAIN QUERY PLAN ${query}`))
      .map((row) => row.detail)
      .join("\n");
    assert.include(plan, "orchestration_v2_projection_plans_thread_idx");
  }).pipe(Effect.provide(layerTest)),
);

it.effect(
  "shell planProgress hides a plan older than the user's latest message on every path",
  () =>
    Effect.gen(function* () {
      const store = yield* ProjectionStore.ProjectionStoreV2;
      const now = yield* DateTime.now;
      const { projectId, activeThreadId } = yield* assertProjectScopedShells("plan-stale");
      const at = (seconds: number) => DateTime.add(now, { seconds });
      const writePlan = (seconds: number) =>
        store.apply({
          id: EventId.make(`event:plan-stale:plan:${seconds}`),
          type: "plan.updated",
          threadId: activeThreadId,
          occurredAt: at(seconds),
          payload: {
            id: PlanId.make("plan:plan-stale"),
            threadId: activeThreadId,
            runId: null,
            nodeId: NodeId.make("node:plan-stale"),
            status: "active",
            kind: "todo_list",
            steps: [{ id: "a", text: "step a", status: "pending" }],
          },
        });
      const expectShown = Effect.fn(function* (shown: boolean) {
        const fromSnapshot = (yield* store.getShellSnapshot({
          projectId,
          location: "active",
        })).threads.find((thread) => thread.id === activeThreadId)?.planProgress;
        const fromShell = (yield* store.getThreadShell(activeThreadId))?.planProgress;
        const fromProjection = ProjectionStore.threadShellFromProjection(
          yield* store.getThreadProjection(activeThreadId),
        ).planProgress;
        for (const progress of [fromSnapshot, fromShell, fromProjection]) {
          assert.strictEqual(progress !== undefined, shown);
        }
      });

      yield* writePlan(0);
      yield* expectShown(true);
      yield* store.apply({
        id: EventId.make("event:plan-stale:message"),
        type: "message.updated",
        threadId: activeThreadId,
        occurredAt: at(10),
        payload: {
          id: MessageId.make("message:plan-stale"),
          threadId: activeThreadId,
          runId: null,
          nodeId: null,
          role: "user",
          text: "next question",
          attachments: [],
          streaming: false,
          createdBy: "user",
          creationSource: "web",
          createdAt: at(10),
          updatedAt: at(10),
        },
      });
      yield* expectShown(false);
      // Steering: the agent updates the plan after the user spoke, so the line returns.
      yield* writePlan(20);
      yield* expectShown(true);
    }).pipe(Effect.provide(layerTest)),
);
