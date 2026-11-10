import type { AssistantCitation } from "@t3tools/contracts";
import {
  collectAssistantCitations,
  serializeAssistantCitation,
  withAssistantCitationComment,
} from "@t3tools/shared/assistantCitations";
import type { MarkdownChoice } from "./markdownChoices";

export type MarkdownChoiceSource = Pick<
  AssistantCitation,
  "environmentId" | "threadId" | "messageId"
>;
export type MarkdownChoiceDraftUpdate = {
  source: MarkdownChoiceSource;
  changes: readonly {
    key: string;
    mode: MarkdownChoice["mode"];
    selected: boolean;
    citation: AssistantCitation;
    noteChanged?: boolean;
  }[];
};

function choiceRows(prompt: string, source: MarkdownChoiceSource) {
  return collectAssistantCitations(prompt).flatMap((match) => {
    const { citation, start, end } = match;
    if (
      citation.environmentId !== source.environmentId ||
      citation.threadId !== source.threadId ||
      citation.messageId !== source.messageId ||
      (end !== prompt.length && prompt[end] !== "\n")
    )
      return [];
    const rowStart = prompt.lastIndexOf("\n", start - 1) + 1;
    const prefix =
      /^(Selected|Comment on unselected) ([A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}): $/.exec(
        prompt.slice(rowStart, start),
      );
    return prefix
      ? [{ ...match, rowStart, key: prefix[2]!, selected: prefix[1] === "Selected" }]
      : [];
  });
}

function replaceChoiceRow(
  prompt: string,
  row: ReturnType<typeof choiceRows>[number],
  replacement: string,
) {
  const end = !replacement && prompt[row.end] === "\n" ? row.end + 1 : row.end;
  return prompt.slice(0, row.rowStart) + replacement + prompt.slice(end);
}

export function updateMarkdownChoiceDraft(prompt: string, update: MarkdownChoiceDraftUpdate) {
  let next = prompt;
  for (const change of update.changes) {
    if (change.mode === "single" && change.selected) {
      const group = change.key.slice(0, change.key.indexOf("/"));
      const displaced = choiceRows(next, update.source).filter(
        (row) => row.selected && row.key !== change.key && row.key.startsWith(`${group}/`),
      );
      for (const row of displaced.toReversed()) {
        next = replaceChoiceRow(
          next,
          row,
          row.citation.comment
            ? `Comment on unselected ${row.key}: ${serializeAssistantCitation(row.citation)}`
            : "",
        );
      }
    }
    const owned = choiceRows(next, update.source).find((row) => row.key === change.key);
    const citation =
      owned && !change.noteChanged
        ? withAssistantCitationComment(change.citation, owned.citation.comment ?? "")
        : change.citation;
    const row =
      change.selected || citation.comment
        ? `${change.selected ? "Selected" : "Comment on unselected"} ${change.key}: ${serializeAssistantCitation(citation)}`
        : "";
    if (owned) next = replaceChoiceRow(next, owned, row);
    else if (row) next += `${next && !next.endsWith("\n") ? "\n" : ""}${row}`;
  }
  return next;
}
