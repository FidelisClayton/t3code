/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import { useGT } from "gt-react";
import { InfoIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { MarkdownScopeDefinition } from "./markdownScope";
import "./MarkdownCard.css";

export function MarkdownScopeBlock({ scope }: { scope: MarkdownScopeDefinition }) {
  const gt = useGT();
  const max = Math.max(...scope.items.map((item) => item.count));
  const hasNotes = scope.items.some((item) => item.note);
  return (
    <div className="markdown-card">
      <p className="markdown-card-title">{scope.title}</p>
      <ul className="markdown-card-list grid grid-cols-[fit-content(45%)_minmax(3rem,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        {scope.items.map((item, index) => {
          const emphasized = hasNotes ? item.note !== undefined : item.count === max;
          return (
            <li
              // oxlint-disable-next-line react/no-array-index-key -- Immutable list, labels can repeat.
              key={index}
              className="col-span-full grid grid-cols-subgrid items-center"
            >
              <span className={cn("min-w-0", emphasized && "font-medium text-foreground")}>
                {item.label}
                {item.note ? (
                  <span className="ms-1.5 text-xs font-medium text-warning-foreground">
                    {item.note}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-clip rounded-full bg-foreground/8">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    emphasized ? "bg-warning" : "bg-primary/55",
                  )}
                  style={{ width: max > 0 ? `${(item.count / max) * 100}%` : "0%" }}
                />
              </span>
              <span
                className={cn(
                  "text-end tabular-nums",
                  emphasized ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {item.count.toLocaleString()} {scope.unit}
              </span>
            </li>
          );
        })}
      </ul>
      {scope.overlapping || scope.caveat ? (
        <p className="markdown-card-footnote">
          <InfoIcon aria-hidden="true" />
          <span className="flex flex-col">
            {scope.overlapping ? (
              <span>{gt("Categories overlap, so counts don't add up")}</span>
            ) : null}
            {scope.caveat ? <span>{scope.caveat}</span> : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}
