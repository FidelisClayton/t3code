import {
  AuthOrchestrationReadScope,
  FORK_ORCHESTRATION_V2_WS_METHODS,
  OrchestrationV2GetThreadProjectionError,
  type OrchestrationV2GetCreatedThreadsInput,
  type OrchestrationV2GetMarkdownReferenceInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ForkThreadQueries from "./orchestration-v2/ForkThreadQueries.ts";
import type { ThreadManagementServiceShape } from "./orchestration-v2/ThreadManagementService.ts";

// Literal `as const` objects keep the exhaustiveness checks on the upstream registries.
export const FORK_RPC_REQUIRED_SCOPES = {
  [FORK_ORCHESTRATION_V2_WS_METHODS.getMarkdownReference]: AuthOrchestrationReadScope,
  [FORK_ORCHESTRATION_V2_WS_METHODS.getCreatedThreads]: AuthOrchestrationReadScope,
} as const;

export const FORK_RPC_AGGREGATES = {
  [FORK_ORCHESTRATION_V2_WS_METHODS.getMarkdownReference]: "orchestration",
  [FORK_ORCHESTRATION_V2_WS_METHODS.getCreatedThreads]: "orchestration",
} as const;

export const makeForkWsHandlers = (threadManagement: ThreadManagementServiceShape) =>
  ({
    [FORK_ORCHESTRATION_V2_WS_METHODS.getMarkdownReference]: (
      input: OrchestrationV2GetMarkdownReferenceInput,
    ) =>
      ForkThreadQueries.getMarkdownReference(threadManagement, input).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationV2GetThreadProjectionError({
              threadId: input.threadId,
              message: "Failed to load Markdown reference",
              cause,
            }),
        ),
      ),
    [FORK_ORCHESTRATION_V2_WS_METHODS.getCreatedThreads]: (
      input: OrchestrationV2GetCreatedThreadsInput,
    ) =>
      ForkThreadQueries.getCreatedThreads(threadManagement, input).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationV2GetThreadProjectionError({
              threadId: input.threadId,
              message: "Failed to load created threads",
              cause,
            }),
        ),
      ),
  }) as const;
