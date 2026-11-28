import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Stream from "effect/Stream";

import * as ThreadCommandExecutor from "../../../orchestration-v2/ThreadCommandExecutor.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import * as PlanHandlers from "./handlers.ts";
import { PlanToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread:plan");
const steps = [
  { id: "U1", text: "First", status: "running" as const },
  { id: "U2", text: "Second", status: "pending" as const },
];

const run = (activeRunId: RunId | null) =>
  Effect.gen(function* () {
    const dispatched: Array<unknown> = [];
    const layerDependencies = Layer.mergeAll(
      ThreadCommandExecutor.layer,
      Layer.succeed(
        SecureRandom.SecureRandom,
        SecureRandom.make((size) => new Uint8Array(size).fill(7)),
      ),
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("environment:plan"),
        requestNamespace: "provider:plan",
        thread: {
          threadId,
          providerSessionId: "provider:plan",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
      }),
      Layer.mock(ThreadManagement.ThreadManagementService)({
        getThreadShell: () => Effect.succeed(liveThreadShell(threadId, { activeRunId })),
        dispatch: (command) => {
          dispatched.push(command);
          return Effect.succeed({ sequence: 1 } as never);
        },
      }),
    );
    const results = yield* Effect.gen(function* () {
      const toolkit = yield* PlanToolkit;
      const tool = (params: { steps: typeof steps; source?: { title: string; url: string } }) =>
        toolkit.handle("t3_plan_update", params).pipe(
          Stream.unwrap,
          Stream.runCollect,
          Effect.map((parts) => parts.at(-1)?.result),
        );
      return [
        yield* tool({ steps }),
        yield* tool({ steps, source: { title: "Plan", url: "https://example.com/p" } }),
      ] as const;
    }).pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(PlanHandlers.layer).pipe(
          Layer.provideMerge(layerDependencies),
        ),
      ),
    );
    return { dispatched, results };
  });

it.effect("dispatches the caller's steps on its active run and turns source into a link", () =>
  Effect.gen(function* () {
    const { dispatched, results } = yield* run(RunId.make("run:1"));
    expect(results[0]).toEqual({ steps: 2 });
    expect(dispatched[0]).toMatchObject({
      type: "thread.plan.update",
      threadId,
      runId: "run:1",
      steps,
    });
    expect(dispatched[0]).not.toHaveProperty("explanation");
    expect(dispatched[1]).toMatchObject({ explanation: "[Plan](https://example.com/p)" });
  }),
);

it.effect("fails clearly when the thread has no active run", () =>
  Effect.gen(function* () {
    const { dispatched, results } = yield* run(null);
    expect(dispatched).toEqual([]);
    expect(results[0]).toMatchObject({ code: "parent_not_active" });
  }),
);
