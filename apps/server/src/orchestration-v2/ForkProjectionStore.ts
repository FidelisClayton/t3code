import {
  ThreadId,
  type OrchestrationV2PlanStep,
  type OrchestrationV2ThreadPlanProgress,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";

const encodeIdList = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

export type ShellCreatedThreadRow = {
  readonly thread_id: string;
  readonly target_thread_id: string;
};

export const selectShellCreatedThreadRows =
  (sql: SqlClient.SqlClient) => (threadIds: ReadonlyArray<ThreadId>) =>
    sql<ShellCreatedThreadRow>`
        SELECT DISTINCT i.thread_id, json_extract(i.payload_json, '$.targetThreadId') AS target_thread_id
        FROM orchestration_v2_projection_turn_items i
        LEFT JOIN orchestration_v2_projection_runs r ON r.run_id = i.run_id
        WHERE i.type = 'thread_created'
          AND (r.status IS NULL OR r.status <> 'rolled_back')
          AND i.thread_id IN (SELECT value FROM json_each(${encodeIdList(threadIds)}))
        ORDER BY i.thread_id, target_thread_id
      `;

export const createdThreadIdsByThreadId = (rows: ReadonlyArray<ShellCreatedThreadRow>) => {
  const ids = new Map<ThreadId, ThreadId[]>();
  for (const row of rows) {
    const ownerId = ThreadId.make(row.thread_id);
    const targets = ids.get(ownerId) ?? [];
    targets.push(ThreadId.make(row.target_thread_id));
    ids.set(ownerId, targets);
  }
  return ids;
};

export const createdThreadIdsFromProjection = (
  projection: Pick<OrchestrationV2ThreadProjection, "thread" | "runs" | "turnItems">,
) => {
  const rolledBackRunIds = new Set(
    projection.runs.filter((run) => run.status === "rolled_back").map((run) => run.id),
  );
  return [
    ...new Set(
      projection.turnItems.flatMap((item) =>
        item.type === "thread_created" &&
        item.threadId === projection.thread.id &&
        (item.runId === null || !rolledBackRunIds.has(item.runId))
          ? [item.targetThreadId]
          : [],
      ),
    ),
  ].toSorted();
};

export type ShellPlanRow = {
  readonly thread_id: string;
  readonly steps_json: string | null;
  readonly updated_at: string | null;
};

/** Stamps todo_list plans with the event time so the sidebar can tell a stale plan from a live one. */
export const stampPlanUpdatedAt = <Plan extends { readonly kind: string }>(
  plan: Plan,
  updatedAt: DateTime.Utc,
): Plan => (plan.kind === "todo_list" ? { ...plan, updatedAt } : plan);

/** The plan predates the user's latest message; plans without a stamp are never stale. */
const planIsStale = (
  updatedAt: DateTime.Utc | null | undefined,
  latestUserAuthoredMessageAt: DateTime.Utc | null | undefined,
) =>
  updatedAt != null &&
  latestUserAuthoredMessageAt != null &&
  DateTime.isGreaterThan(latestUserAuthoredMessageAt, updatedAt);

const decodeSteps = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ text: Schema.String, status: Schema.String })),
  ),
);

const progressFromSteps = (
  steps: ReadonlyArray<Pick<OrchestrationV2PlanStep, "text" | "status">>,
): OrchestrationV2ThreadPlanProgress => ({
  completed: steps.filter((step) => step.status === "completed").length,
  total: steps.length,
  current:
    (
      steps.find((step) => step.status === "running") ??
      steps.find((step) => step.status === "pending")
    )?.text ?? null,
});

/** Latest todo_list plan per thread: highest run ordinal, ties go to the highest plan id. */
export const selectShellPlanRows =
  (sql: SqlClient.SqlClient) => (threadIds: ReadonlyArray<ThreadId>) =>
    sql<ShellPlanRow>`
        SELECT thread_id, json_extract(payload_json, '$.steps') AS steps_json,
          json_extract(payload_json, '$.updatedAt') AS updated_at
        FROM orchestration_v2_projection_plans
        WHERE plan_id IN (
          SELECT plan_id FROM (
            SELECT p.plan_id,
              ROW_NUMBER() OVER (
                PARTITION BY p.thread_id ORDER BY COALESCE(r.ordinal, -1) DESC, p.plan_id DESC
              ) AS rank
            FROM orchestration_v2_projection_plans p
            LEFT JOIN orchestration_v2_projection_runs r ON r.run_id = p.run_id
            WHERE p.kind = 'todo_list'
              AND p.status <> 'superseded'
              AND (r.status IS NULL OR r.status <> 'rolled_back')
              AND p.thread_id IN (SELECT value FROM json_each(${encodeIdList(threadIds)}))
          )
          WHERE rank = 1
        )
      `;

export const planProgressByThreadId = (
  rows: ReadonlyArray<ShellPlanRow>,
  latestUserAuthoredMessageAt: (threadId: ThreadId) => DateTime.Utc | null | undefined,
) =>
  new Map(
    rows.flatMap((row) =>
      row.steps_json === null ||
      planIsStale(
        row.updated_at === null ? null : DateTime.makeUnsafe(row.updated_at),
        latestUserAuthoredMessageAt(ThreadId.make(row.thread_id)),
      )
        ? []
        : [[ThreadId.make(row.thread_id), progressFromSteps(decodeSteps(row.steps_json))] as const],
    ),
  );

/** Shell fragment: spread into the shell so an absent plan omits the key. */
export const planProgressField = (progress: OrchestrationV2ThreadPlanProgress | undefined) =>
  progress === undefined ? {} : { planProgress: progress };

export const planProgressFromProjection = (
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "plans" | "turnItems">,
  latestUserAuthoredMessageAt: DateTime.Utc | null,
) => {
  const runById = new Map(projection.runs.map((run) => [run.id, run]));
  let plan: (typeof projection.plans)[number] | null = null;
  let planOrdinal = -1;
  for (const candidate of projection.plans) {
    if (candidate.kind !== "todo_list" || candidate.status === "superseded") continue;
    const run = candidate.runId === null ? undefined : runById.get(candidate.runId);
    if (run?.status === "rolled_back") continue;
    const ordinal = run?.ordinal ?? -1;
    if (
      plan === null ||
      ordinal > planOrdinal ||
      (ordinal === planOrdinal && candidate.id > plan.id)
    ) {
      plan = candidate;
      planOrdinal = ordinal;
    }
  }
  if (plan?.kind !== "todo_list" || planIsStale(plan.updatedAt, latestUserAuthoredMessageAt)) {
    return undefined;
  }
  const planId = plan.id;
  const item = plan.detailInTurnItem
    ? projection.turnItems.findLast((item) => item.type === "todo_list" && item.planId === planId)
    : undefined;
  return progressFromSteps(item?.type === "todo_list" ? item.steps : plan.steps);
};
