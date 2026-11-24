import type {
  OrchestrationV2GetCreatedThreadsInput,
  OrchestrationV2GetMarkdownReferenceInput,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import { extractMarkdownReferenceDefinitions } from "@t3tools/shared/markdownReferences";
import * as Effect from "effect/Effect";

import type { ThreadManagementServiceShape } from "./ThreadManagementService.ts";

export const getMarkdownReference = Effect.fn("ForkThreadQueries.getMarkdownReference")(function* (
  threadManagement: ThreadManagementServiceShape,
  input: OrchestrationV2GetMarkdownReferenceInput,
) {
  const projection = yield* threadManagement.getThreadProjection(input.threadId);
  for (let index = projection.visibleTurnItems.length - 1; index >= 0; index--) {
    const item = projection.visibleTurnItems[index]!.item;
    if (item.type !== "assistant_message" || !item.text.includes("reference")) continue;
    const definitions = extractMarkdownReferenceDefinitions(item.text);
    const reference = definitions.findLast((definition) => definition.id === input.id);
    if (reference) return { reference };
  }
  return { reference: null };
});

export const getCreatedThreads = Effect.fn("ForkThreadQueries.getCreatedThreads")(function* (
  threadManagement: ThreadManagementServiceShape,
  input: OrchestrationV2GetCreatedThreadsInput,
) {
  const { runs, turnItems } = yield* threadManagement.getThreadRecords(
    input.threadId,
    ["runs", "turnItems"],
    { turnItemTypes: ["thread_created"] },
  );
  const rolledBackRuns = new Set(
    runs.filter((run) => run.status === "rolled_back").map((run) => run.id),
  );
  const threads = new Map<ThreadId, { threadId: ThreadId; runId: RunId | null }>();
  for (const item of turnItems) {
    if (item.type !== "thread_created" || (item.runId !== null && rolledBackRuns.has(item.runId))) {
      continue;
    }
    threads.set(item.targetThreadId, { threadId: item.targetThreadId, runId: item.runId });
  }
  return { threads: [...threads.values()] };
});
