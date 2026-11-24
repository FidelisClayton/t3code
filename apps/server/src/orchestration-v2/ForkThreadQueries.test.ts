import { expect, it } from "@effect/vitest";
import { RunId, ThreadId, type OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as CommandReceiptStore from "./CommandReceiptStore.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";
import * as ForkThreadQueries from "./ForkThreadQueries.ts";

const layerReceiptsTest = CommandReceiptStore.layer.pipe(
  Layer.provide(SqlitePersistence.layerMemory),
);

it.effect(
  "resolves saved Markdown references from visible assistant history, newest valid first",
  () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:references");
      const forkId = ThreadId.make("thread:references:fork");
      const otherId = ThreadId.make("thread:references:other");
      const definition = (title: string, id = "linear/E-406") =>
        "```reference\n" + JSON.stringify({ id, title, body: "Saved **briefing**" }) + "\n```";
      const rows = [
        {
          visibility: "inherited",
          sourceThreadId: threadId,
          item: {
            type: "assistant_message",
            text: definition("old", "linear/old") + "\n\n" + definition("superseded"),
          },
        },
        ...Array.from({ length: 120 }, () => ({
          item: { type: "assistant_message", text: "ordinary answer" },
        })),
        {
          item: {
            type: "assistant_message",
            text: definition("first") + "\n\n" + definition("newest"),
          },
        },
        { item: { type: "assistant_message", text: definition("incomplete").slice(0, -3) } },
        { item: { type: "assistant_message", text: "```reference\n{}\n```" } },
        {
          item: {
            type: "user_message",
            text: definition("forged user") + "\n\n" + definition("user only", "linear/user"),
          },
        },
        { item: { type: "tool_call", text: definition("forged tool") } },
        { item: { type: "proposed_plan", markdown: definition("forged plan") } },
      ];
      const layerTest = ThreadManagementService.layer.pipe(
        Layer.provide(Layer.mock(ProviderSessionManager.ProviderSessionManagerV2)({})),
        Layer.provide(
          Layer.mock(Orchestrator.OrchestratorV2)({
            getThreadProjection: (id) =>
              Effect.succeed({
                visibleTurnItems: id === otherId ? [] : id === forkId ? rows.slice(0, 1) : rows,
              } as unknown as OrchestrationV2ThreadProjection),
          }),
        ),
        Layer.provide(ServerSettings.layerTest()),
        Layer.provide(layerReceiptsTest),
      );
      const service = yield* ThreadManagementService.ThreadManagementService.pipe(
        Effect.provide(layerTest),
      );
      expect(
        (yield* ForkThreadQueries.getMarkdownReference(service, { threadId, id: "linear/E-406" }))
          .reference?.title,
      ).toBe("newest");
      expect(
        (yield* ForkThreadQueries.getMarkdownReference(service, { threadId, id: "linear/old" }))
          .reference?.title,
      ).toBe("old");
      expect(
        (yield* ForkThreadQueries.getMarkdownReference(service, {
          threadId: forkId,
          id: "linear/old",
        })).reference?.title,
      ).toBe("old");
      expect(
        yield* ForkThreadQueries.getMarkdownReference(service, {
          threadId: otherId,
          id: "linear/old",
        }),
      ).toEqual({
        reference: null,
      });
      expect(
        yield* ForkThreadQueries.getMarkdownReference(service, { threadId, id: "linear/user" }),
      ).toEqual({
        reference: null,
      });
      expect(
        yield* ForkThreadQueries.getMarkdownReference(service, { threadId, id: "linear/missing" }),
      ).toEqual({
        reference: null,
      });
    }),
);

it.effect(
  "lists historical created threads once, using the latest association and excluding rolled-back runs",
  () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:created-threads");
      const oldRun = RunId.make("run:old");
      const currentRun = RunId.make("run:current");
      const rolledBackRun = RunId.make("run:rolled-back");
      const oldChild = ThreadId.make("thread:old-child");
      const duplicateChild = ThreadId.make("thread:duplicate-child");
      const unscopedChild = ThreadId.make("thread:unscoped-child");
      const rolledBackChild = ThreadId.make("thread:rolled-back-child");
      const created = (targetThreadId: ThreadId, runId: RunId | null) => ({
        type: "thread_created",
        targetThreadId,
        runId,
      });
      const turnItems = [
        created(oldChild, oldRun),
        created(duplicateChild, oldRun),
        ...Array.from({ length: 120 }, () => ({ type: "assistant_message", runId: currentRun })),
        created(duplicateChild, currentRun),
        created(unscopedChild, null),
        created(rolledBackChild, rolledBackRun),
        created(duplicateChild, rolledBackRun),
      ];
      const layerTest = ThreadManagementService.layer.pipe(
        Layer.provide(Layer.mock(ProviderSessionManager.ProviderSessionManagerV2)({})),
        Layer.provide(
          Layer.mock(Orchestrator.OrchestratorV2)({
            getThreadRecords: (_id, _fields, filter) =>
              Effect.succeed({
                thread: { id: threadId },
                runs: [
                  { id: oldRun, status: "completed" },
                  { id: currentRun, status: "running" },
                  { id: rolledBackRun, status: "rolled_back" },
                ],
                turnItems: turnItems.filter((item) =>
                  filter?.turnItemTypes?.some((type) => type === item.type),
                ),
              } as unknown as OrchestrationV2ThreadProjection),
          }),
        ),
        Layer.provide(ServerSettings.layerTest()),
        Layer.provide(layerReceiptsTest),
      );
      const service = yield* ThreadManagementService.ThreadManagementService.pipe(
        Effect.provide(layerTest),
      );
      expect(yield* ForkThreadQueries.getCreatedThreads(service, { threadId })).toEqual({
        threads: [
          { threadId: oldChild, runId: oldRun },
          { threadId: duplicateChild, runId: currentRun },
          { threadId: unscopedChild, runId: null },
        ],
      });
    }),
);
