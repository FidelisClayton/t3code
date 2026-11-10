import { describe, expect, it, vi } from "vite-plus/test";
import { extractMarkdownReferenceDefinitions } from "@t3tools/shared/markdownReferences";
vi.mock(import("@t3tools/shared/markdownReferences"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    extractMarkdownReferenceDefinitions: vi.fn(actual.extractMarkdownReferenceDefinitions),
  };
});
import { createMarkdownReferenceIndex } from "./markdownReferences";

const definition = (title = "First") =>
  "```reference\n" + JSON.stringify({ id: "linear/E-406", title, body: "**Details**" }) + "\n```";

describe("conversation Markdown references", () => {
  it("keeps the latest definition independently of mounted rows and honors deletion and revision", () => {
    const index = createMarkdownReferenceIndex();
    index.replace([
      { id: "a", text: definition() },
      { id: "b", text: definition("Latest") },
    ]);
    expect(index.snapshot().get("linear/E-406")?.title).toBe("Latest");
    index.replace([{ id: "a", text: definition() }]);
    expect(index.snapshot().get("linear/E-406")?.title).toBe("First");
    index.replace([
      { id: "a", text: definition() + "\n\n" + definition("Middle") + "\n\n" + definition() },
    ]);
    expect(index.snapshot().get("linear/E-406")?.title).toBe("First");
    index.replace([{ id: "a", text: "removed" }]);
    expect(index.snapshot().size).toBe(0);
  });

  it("publishes only closed streamed declarations and keeps them through quiet timeline updates", () => {
    const index = createMarkdownReferenceIndex();
    const incomplete = definition().slice(0, -3);
    index.replace([{ id: "a", text: incomplete }]);
    expect(index.snapshot().size).toBe(0);
    index.stream("a", definition());
    expect(index.snapshot().get("linear/E-406")?.title).toBe("First");
    index.replace([{ id: "a", text: incomplete }]);
    expect(index.snapshot().size).toBe(1);
    index.replace([{ id: "a", text: incomplete, revision: "rewound" }]);
    expect(index.snapshot().size).toBe(0);
    index.replace([]);
    expect(index.snapshot().size).toBe(0);
    index.replace([
      { id: "old", text: definition("Prior") },
      { id: "a", text: definition() },
    ]);
    index.stream("a", definition() + "\n\n" + definition("Latest"));
    expect(index.snapshot().get("linear/E-406")?.title).toBe("Latest");
    index.stream("a", definition("Latest") + "\n\n" + definition());
    expect(index.snapshot().get("linear/E-406")?.title).toBe("First");
    index.stream("a", "removed");
    expect(index.snapshot().get("linear/E-406")?.title).toBe("Prior");
  });

  it("reuses unchanged messages and completed stream blocks without notifying on ordinary tokens", () => {
    vi.mocked(extractMarkdownReferenceDefinitions).mockClear();
    const index = createMarkdownReferenceIndex();
    const listener = vi.fn();
    index.subscribe(listener);
    const text = definition();
    const messages = [
      { id: "a", text },
      { id: "b", text: "Ordinary prose" },
    ];
    index.replace(messages);
    const reference = index.snapshot().get("linear/E-406");
    const snapshot = index.snapshot();
    index.replace(messages);
    using reads = vi.spyOn(snapshot, "get");
    index.stream("a", text + "\n\nMore text");
    index.stream("a", text + "\n\nMore text grows");
    index.stream("b", "Ordinary prose keeps streaming");
    expect(reads).not.toHaveBeenCalled();
    expect(index.snapshot().get("linear/E-406")).toBe(reference);
    expect(index.snapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(extractMarkdownReferenceDefinitions).toHaveBeenCalledTimes(1);
    reads.mockClear();
    index.stream("a", text.replace('"title":"First"', '"title": "First"'));
    expect(reads).not.toHaveBeenCalled();
    expect(index.snapshot()).toBe(snapshot);
    expect(createMarkdownReferenceIndex().snapshot().size).toBe(0);
  });
});
