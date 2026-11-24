import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { RunId, ThreadId } from "./baseSchemas.ts";
import { OrchestrationV2GetThreadProjectionError } from "./orchestrationV2.ts";

export const FORK_ORCHESTRATION_V2_WS_METHODS = {
  getMarkdownReference: "orchestration.getMarkdownReference",
  getCreatedThreads: "orchestration.getCreatedThreads",
} as const;

const MarkdownReferenceId = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?![\s\S])/),
);

export const MarkdownReferenceDefinition = Schema.Struct({
  id: MarkdownReferenceId,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(1024))),
  body: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(32768)),
});
export type MarkdownReferenceDefinition = typeof MarkdownReferenceDefinition.Type;

export const OrchestrationV2GetMarkdownReferenceInput = Schema.Struct({
  threadId: ThreadId,
  id: MarkdownReferenceId,
});
export type OrchestrationV2GetMarkdownReferenceInput =
  typeof OrchestrationV2GetMarkdownReferenceInput.Type;

export const OrchestrationV2GetMarkdownReferenceResult = Schema.Struct({
  reference: Schema.NullOr(MarkdownReferenceDefinition),
});
export type OrchestrationV2GetMarkdownReferenceResult =
  typeof OrchestrationV2GetMarkdownReferenceResult.Type;

export const OrchestrationV2GetCreatedThreadsInput = Schema.Struct({
  threadId: ThreadId,
});
export type OrchestrationV2GetCreatedThreadsInput =
  typeof OrchestrationV2GetCreatedThreadsInput.Type;

export const OrchestrationV2GetCreatedThreadsResult = Schema.Struct({
  threads: Schema.Array(Schema.Struct({ threadId: ThreadId, runId: Schema.NullOr(RunId) })),
});
export type OrchestrationV2GetCreatedThreadsResult =
  typeof OrchestrationV2GetCreatedThreadsResult.Type;

export const ForkOrchestrationV2RpcSchemas = {
  getMarkdownReference: {
    input: OrchestrationV2GetMarkdownReferenceInput,
    output: OrchestrationV2GetMarkdownReferenceResult,
  },
  getCreatedThreads: {
    input: OrchestrationV2GetCreatedThreadsInput,
    output: OrchestrationV2GetCreatedThreadsResult,
  },
} as const;

const WsOrchestrationV2GetMarkdownReferenceRpc = Rpc.make(
  FORK_ORCHESTRATION_V2_WS_METHODS.getMarkdownReference,
  {
    payload: ForkOrchestrationV2RpcSchemas.getMarkdownReference.input,
    success: ForkOrchestrationV2RpcSchemas.getMarkdownReference.output,
    error: Schema.Union([OrchestrationV2GetThreadProjectionError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2GetCreatedThreadsRpc = Rpc.make(
  FORK_ORCHESTRATION_V2_WS_METHODS.getCreatedThreads,
  {
    payload: ForkOrchestrationV2RpcSchemas.getCreatedThreads.input,
    success: ForkOrchestrationV2RpcSchemas.getCreatedThreads.output,
    error: Schema.Union([OrchestrationV2GetThreadProjectionError, EnvironmentAuthorizationError]),
  },
);

export const ForkOrchestrationV2Rpcs = [
  WsOrchestrationV2GetMarkdownReferenceRpc,
  WsOrchestrationV2GetCreatedThreadsRpc,
] as const;
