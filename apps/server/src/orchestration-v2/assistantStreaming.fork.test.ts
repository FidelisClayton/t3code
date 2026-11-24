import { MessageId, ProviderDriverKind, ThreadId, TurnItemId } from "@t3tools/contracts";
import type { ProviderAdapterV2Event } from "@t3tools/provider-core/server/ProviderAdapter";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";
import { makeAssistantStreamingFilter } from "./assistantStreaming.ts";

const at = DateTime.makeUnsafe("2026-11-09T12:00:00.000Z");
function messageEvent(text: string, streaming = true): ProviderAdapterV2Event {
  return {
    type: "message.updated",
    driver: ProviderDriverKind.make("codex"),
    message: {
      id: MessageId.make("message"),
      threadId: ThreadId.make("thread"),
      runId: null,
      nodeId: null,
      role: "assistant",
      text,
      attachments: [],
      streaming,
      createdBy: "agent",
      creationSource: "provider",
      createdAt: at,
      updatedAt: at,
    },
  };
}
function itemEvent(text: string, streaming = true, reasoning = false): ProviderAdapterV2Event {
  const base = {
    id: TurnItemId.make("item"),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status: "running" as const,
    title: null,
    startedAt: at,
    completedAt: null,
    updatedAt: at,
    text,
    streaming,
  };
  return {
    type: "turn_item.updated",
    driver: ProviderDriverKind.make("codex"),
    turnItem: reasoning
      ? { ...base, type: "reasoning" }
      : { ...base, type: "assistant_message", messageId: MessageId.make("message") },
  };
}
function emittedText(event: ProviderAdapterV2Event | null) {
  return event?.type === "message.updated"
    ? event.message.text
    : event?.type === "turn_item.updated" &&
        (event.turnItem.type === "assistant_message" || event.turnItem.type === "reasoning")
      ? event.turnItem.text
      : null;
}

it.each([messageEvent, itemEvent])(
  "exposes only recognized custom headers between throttled paragraph updates",
  (event) => {
    for (const header of ["```reference\n", "```recap\n", "```form\n", "~~~html render\r\n"]) {
      const filter = makeAssistantStreamingFilter("paragraph");
      const intro = "Intro\n\n";
      expect(emittedText(filter.filter(event(intro), 0))).toBe(intro);
      const open = intro + header + '{"private":"buffered"';
      expect(filter.filter(event(open), 200)).toBeNull();
      expect(emittedText(filter.filter(event(open), 400))).toBe(intro + header);
      expect(filter.filter(event(open + " more body"), 800)).toBeNull();
      expect(filter.takeIdleFlushes(1600)).toEqual([]);
      const closed = open + (header.startsWith("~") ? "\n~~~\n" : "\n```\n");
      expect(emittedText(filter.filter(event(closed), 2000))).toBe(closed);
      const final = event(closed + "Final tail", false);
      expect(filter.filter(final, 2001)).toBe(final);
      const stopped = event(open, false);
      expect(filter.filter(stopped, 2002)).toBe(stopped);
      expect(makeAssistantStreamingFilter("turn").filter(event(open), 0)).toBeNull();
      const idleFilter = makeAssistantStreamingFilter("paragraph");
      idleFilter.filter(event(intro), 0);
      idleFilter.filter(event(open), 200);
      expect(idleFilter.takeIdleFlushes(999)).toEqual([]);
      expect(idleFilter.takeIdleFlushes(1000).map(emittedText)).toEqual([intro + header]);
      expect(idleFilter.takeIdleFlushes(2000)).toEqual([]);
    }
  },
);

it("keeps ordinary fences, partial names, metadata and reasoning buffered", () => {
  const intro = "Intro\n\n";
  for (const info of [
    "ts",
    "referenceMore",
    "rec",
    "reference extra",
    "recap extra",
    "form extra",
    "html",
    "html render extra",
  ]) {
    expect(
      emittedText(
        makeAssistantStreamingFilter("paragraph").filter(
          messageEvent(`${intro}\`\`\`${info}\nprivate`),
          0,
        ),
      ),
    ).toBe(intro);
  }
  expect(
    emittedText(
      makeAssistantStreamingFilter("paragraph").filter(
        itemEvent(`${intro}\`\`\`recap\nprivate`, true, true),
        0,
      ),
    ),
  ).toBe(intro);
});
