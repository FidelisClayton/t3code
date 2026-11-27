/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import { useGT } from "gt-react";
import { TriangleAlertIcon } from "lucide-react";

import "./MarkdownCard.css";

const SUMMARY_KEYS = ["title", "label", "ask", "summary", "body"];
const MAX_LINES = 3;

/** Readable string fields of the JSON, top level first, then one level of array items. */
function summarizeInvalidBlock(source: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return [];
  }
  const lines: string[] = [];
  const pick = (record: unknown) => {
    if (typeof record !== "object" || record === null) return;
    for (const key of SUMMARY_KEYS) {
      const text = (record as Record<string, unknown>)[key];
      if (typeof text === "string" && text.trim()) lines.push(text.trim());
    }
  };
  pick(value);
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) for (const item of child) pick(item);
    }
  }
  return lines.slice(0, MAX_LINES);
}

/** Closed component fence that failed to parse: a short summary, with the raw JSON one click away. */
export function MarkdownInvalidBlock({ language, source }: { language: string; source: string }) {
  const gt = useGT();
  const lines = summarizeInvalidBlock(source);
  return (
    <div className="markdown-card" data-markdown-copy="" data-testid="markdown-invalid-block">
      <div className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
        <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
        {gt("Couldn't show this {block} block", { block: language })}
      </div>
      {lines.map((line, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- Immutable list, lines can repeat.
        <div className="line-clamp-2 text-muted-foreground" key={index}>
          {line}
        </div>
      ))}
      <details>
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground">
          {gt("Show raw")}
        </summary>
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
          <code>{source}</code>
        </pre>
      </details>
    </div>
  );
}
