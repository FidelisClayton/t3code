import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, MessageId, ThreadId, type AssistantCitation } from "@t3tools/contracts";
import {
  collectAssistantCitations,
  serializeAssistantCitation,
} from "@t3tools/shared/assistantCitations";
import { updateMarkdownChoiceDraft } from "./markdownChoiceDraft";

const source = {
  environmentId: EnvironmentId.make("env"),
  threadId: ThreadId.make("thread"),
  messageId: MessageId.make("message"),
};
const citation: AssistantCitation = {
  version: 1,
  ...source,
  text: "Parallel",
  start: 0,
  end: 8,
  prefix: "",
  suffix: "",
};

describe("choice draft rows", () => {
  it("switches and removes owned rows while preserving prose, manual citations and edited comments", () => {
    const manual = serializeAssistantCitation({ ...citation, comment: "Manual" });
    const prose = `My answer\n${manual}`;
    let draft = updateMarkdownChoiceDraft(prose, {
      source,
      changes: [{ mode: "multi", key: "mode/parallel", selected: true, citation }],
    });
    expect(draft).toContain("Selected mode/parallel:");
    expect(draft.startsWith(prose)).toBe(true);
    const edited = draft.replace("Selected mode/parallel:", "My preference:");
    expect(
      updateMarkdownChoiceDraft(edited, {
        source,
        changes: [{ mode: "multi", key: "mode/parallel", selected: false, citation }],
      }),
    ).toBe(edited);
    const fullNote = "n".repeat(8000);
    draft = updateMarkdownChoiceDraft(draft, {
      source,
      changes: [
        {
          mode: "multi",
          key: "scope/unit",
          selected: false,
          citation: { ...citation, text: "Unit", start: 9, end: 13, comment: fullNote },
          noteChanged: true,
        },
      ],
    });
    expect(draft).toContain("Comment on unselected scope/unit:");
    expect(collectAssistantCitations(draft).at(-1)?.citation.comment).toBe(fullNote);
    draft = updateMarkdownChoiceDraft(draft, {
      source,
      changes: [
        { mode: "multi", key: "mode/parallel", selected: false, citation },
        {
          mode: "multi",
          key: "mode/serial",
          selected: true,
          citation: { ...citation, text: "Serial", start: 14, end: 20 },
        },
      ],
    });
    expect(draft).not.toContain("Selected mode/parallel:");
    expect(draft).toContain("Selected mode/serial:");
    expect(collectAssistantCitations(draft).at(-2)?.citation.comment).toBe(fullNote);
    expect(draft.startsWith(prose)).toBe(true);
    expect(
      updateMarkdownChoiceDraft(draft, {
        source,
        changes: [
          {
            mode: "multi",
            key: "mode/serial",
            selected: true,
            citation: { ...citation, text: "Serial", start: 14, end: 20 },
          },
        ],
      }),
    ).toBe(draft);
  });

  it("replaces single selections captured in another renderer without losing their edited comments", () => {
    const first = updateMarkdownChoiceDraft("My prose", {
      source,
      changes: [
        {
          mode: "single",
          key: "g/main",
          selected: true,
          citation: { ...citation, comment: "Original" },
        },
      ],
    });
    const edited = first.replace("comment=Original", "comment=Edited");
    const next = updateMarkdownChoiceDraft(edited, {
      source,
      changes: [
        {
          mode: "single",
          key: "g/detail",
          selected: true,
          citation: { ...citation, text: "Detail", start: 9, end: 15 },
        },
      ],
    });
    expect(next).not.toContain("Selected g/main:");
    expect(next).toContain("Comment on unselected g/main:");
    expect(next).toContain("Selected g/detail:");
    expect(collectAssistantCitations(next)[0]?.citation.comment).toBe("Edited");
    const back = updateMarkdownChoiceDraft(next, {
      source,
      changes: [{ mode: "single", key: "g/main", selected: true, citation }],
    });
    expect(back).not.toContain("Selected g/detail:");
    expect(back).toContain("Selected g/main:");
    expect(collectAssistantCitations(back)).toHaveLength(1);
    expect(collectAssistantCitations(back)[0]?.citation.comment).toBe("Edited");
  });

  it("keeps typed trailing newlines and replaces a row when source offsets drift", () => {
    const prose = "My answer\n";
    const staged = updateMarkdownChoiceDraft(prose, {
      source,
      changes: [{ mode: "multi", key: "g/a", selected: true, citation }],
    });
    expect(
      updateMarkdownChoiceDraft(staged, {
        source,
        changes: [{ mode: "multi", key: "g/a", selected: false, citation }],
      }),
    ).toBe(prose);
    const changed = updateMarkdownChoiceDraft(staged, {
      source,
      changes: [
        { mode: "multi", key: "g/a", selected: true, citation: { ...citation, start: 5, end: 13 } },
      ],
    });
    expect(collectAssistantCitations(changed)).toHaveLength(1);
    expect(collectAssistantCitations(changed)[0]?.citation.start).toBe(5);
  });

  it("retains draft-edited notes on selection changes and isolates sources", () => {
    const initial = updateMarkdownChoiceDraft("", {
      source,
      changes: [
        {
          mode: "multi",
          key: "g/a",
          selected: false,
          citation: { ...citation, comment: "Saved" },
          noteChanged: true,
        },
      ],
    });
    const edited = initial.replace("comment=Saved", "comment=Edited");
    const selected = updateMarkdownChoiceDraft(edited, {
      source,
      changes: [
        { mode: "multi", key: "g/a", selected: true, citation: { ...citation, comment: "Saved" } },
      ],
    });
    expect(collectAssistantCitations(selected)[0]?.citation.comment).toBe("Edited");
    expect(selected).toContain("Selected g/a:");
    const other = { ...source, messageId: MessageId.make("other") };
    expect(
      updateMarkdownChoiceDraft(selected, {
        source: other,
        changes: [
          { mode: "multi", key: "g/a", selected: false, citation: { ...citation, ...other } },
        ],
      }),
    ).toBe(selected);
  });
});
