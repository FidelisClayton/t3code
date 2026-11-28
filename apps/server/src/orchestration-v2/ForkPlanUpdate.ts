import {
  NodeId,
  PlanId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2InternalCommand,
  type OrchestrationV2PlanArtifact,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { withPlanStepDurations } from "./ProviderEventIngestor.ts";
import type { ProjectionStoreV2Shape } from "./ProjectionStore.ts";

type PlanUpdateCommand = Extract<
  OrchestrationV2InternalCommand,
  { readonly type: "thread.plan.update" }
>;

/** One plan per thread and run: later calls replace its steps. */
export function buildMcpPlan(
  command: PlanUpdateCommand,
): Extract<OrchestrationV2PlanArtifact, { readonly kind: "todo_list" }> {
  const key = `mcp:${command.threadId}:${command.runId}`;
  return {
    id: PlanId.make(`plan:${key}`),
    threadId: command.threadId,
    runId: command.runId,
    nodeId: NodeId.make(`plan-node:${key}`),
    status: "active",
    kind: "todo_list",
    steps: command.steps,
    ...(command.explanation === undefined ? {} : { explanation: command.explanation }),
  };
}

/** The run must belong to the command's thread; step timings carry over from the stored plan. */
export const buildPlanUpdatedEvent = Effect.fn("ForkPlanUpdate.buildPlanUpdatedEvent")(function* <
  E,
>(
  command: PlanUpdateCommand,
  projectionStore: Pick<ProjectionStoreV2Shape, "getThreadRecords" | "getPlan">,
  toError: (cause: unknown) => E,
) {
  const { runs } = yield* projectionStore
    .getThreadRecords(command.threadId, ["runs"], { runIds: [command.runId] })
    .pipe(Effect.mapError(toError));
  if (!runs.some((run) => run.id === command.runId && run.threadId === command.threadId)) {
    return yield* Effect.fail(
      toError(`Run ${command.runId} does not belong to thread ${command.threadId}.`),
    );
  }
  const built = buildMcpPlan(command);
  const previous = yield* projectionStore
    .getPlan(command.threadId, built.id)
    .pipe(Effect.mapError(toError));
  const occurredAt = yield* DateTime.now;
  const payload = withPlanStepDurations(
    built,
    previous?.kind === "todo_list" ? previous : undefined,
    occurredAt,
  );
  return {
    type: "plan.updated",
    threadId: command.threadId,
    runId: command.runId,
    nodeId: payload.nodeId,
    occurredAt,
    payload,
  } satisfies Omit<Extract<OrchestrationV2DomainEvent, { type: "plan.updated" }>, "id">;
});
