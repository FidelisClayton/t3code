import { ThreadId, type OrchestrationV2ThreadProjection } from "@t3tools/contracts";
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
