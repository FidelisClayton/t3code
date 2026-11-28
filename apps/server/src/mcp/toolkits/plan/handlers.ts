import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpToolAccess from "../../McpToolAccess.ts";
import { dispatchFailure, newCommandId, readCaller } from "../../threadAccess.ts";
import { PlanToolkit } from "./tools.ts";

const handlers = {
  t3_plan_update: McpToolAccess.actsAsCaller(({ steps, source }) =>
    Effect.gen(function* () {
      const { threads, caller } = yield* readCaller();
      const runId = caller?.activeRunId;
      if (caller === undefined || runId === null || runId === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "This thread has no active run to record a plan on.",
        });
      }
      yield* threads
        .dispatch({
          type: "thread.plan.update",
          commandId: yield* newCommandId(),
          threadId: caller.id,
          runId,
          steps,
          ...(source === undefined ? {} : { explanation: `[${source.title}](${source.url})` }),
        })
        .pipe(Effect.mapError(dispatchFailure));
      return { steps: steps.length };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof PlanToolkit.tools>;

export const layer = McpToolAccess.toLayer(PlanToolkit, handlers);
