import { MessageId, ProviderDriverKind, ThreadId, TurnItemId } from "@t3tools/contracts";
import type { ProviderAdapterV2Event } from "@t3tools/provider-core/server/ProviderAdapter";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import { makeAssistantStreamingFilter, splitBufferedAssistantText } from "./assistantStreaming.ts";

describe("V2 assistant streaming", () => {
  it("keeps code fences intact", () => {
    expect(splitBufferedAssistantText("Intro\n\n```ts\nx()\n\n")).toEqual({
      ready: "Intro\n\n",
      rest: "```ts\nx()\n\n",
    });
    expect(splitBufferedAssistantText("```ts\nx()\n```\nrest")).toEqual({
      ready: "```ts\nx()\n```\n",
      rest: "rest",
    });
  });
});

it("holds a streamed section heading until its content has a boundary", () => {
  expect(splitBufferedAssistantText("Intro\n\n## Results\n\n")).toEqual({
    ready: "Intro\n\n",
    rest: "## Results\n\n",
  });
  expect(splitBufferedAssistantText("**Results**\n\nBody\n\nNext")).toEqual({
    ready: "**Results**\n\nBody\n\n",
    rest: "Next",
  });
});

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
      expect(emittedText(filter(event(intro), 0))).toBe(intro);
      const open = intro + header + '{"private":"buffered"';
      expect(filter(event(open), 200)).toBeNull();
      expect(emittedText(filter(event(open), 400))).toBe(intro + header);
      expect(filter(event(open + " more body"), 800)).toBeNull();
      const closed = open + (header.startsWith("~") ? "\n~~~\n" : "\n```\n");
      expect(emittedText(filter(event(closed), 1000))).toBe(closed);
      const final = event(closed + "Final tail", false);
      expect(filter(final, 1001)).toBe(final);
      const stopped = event(open, false);
      expect(filter(stopped, 1002)).toBe(stopped);
      expect(makeAssistantStreamingFilter("turn")(event(open), 0)).toBeNull();
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
        makeAssistantStreamingFilter("paragraph")(
          messageEvent(`${intro}\`\`\`${info}\nprivate`),
          0,
        ),
      ),
    ).toBe(intro);
  }
  expect(
    emittedText(
      makeAssistantStreamingFilter("paragraph")(
        itemEvent(`${intro}\`\`\`recap\nprivate`, true, true),
        0,
      ),
    ),
  ).toBe(intro);
});
