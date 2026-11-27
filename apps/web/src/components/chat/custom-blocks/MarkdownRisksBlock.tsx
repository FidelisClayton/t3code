/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import { TriangleAlertIcon } from "lucide-react";
import { useGT } from "gt-react";

import { cn } from "~/lib/utils";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import type { MarkdownRisksDefinition } from "./markdownRisks";
import "./MarkdownCard.css";

const severityTone = {
  high: { icon: "text-destructive", label: "text-destructive-foreground" },
  medium: { icon: "text-warning", label: "text-warning-foreground" },
  low: { icon: "text-muted-foreground", label: "text-muted-foreground" },
};

// Severity owns the row's color; evidence only draws the eye when the claim is unverified.
const evidenceTone = {
  verified: "text-muted-foreground",
  reported: "text-muted-foreground",
  unverified: "text-warning-foreground",
};

export function MarkdownRisksBlock({
  risks,
  renderMarkdown,
}: {
  risks: MarkdownRisksDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  const evidence = {
    verified: gt("Verified"),
    reported: gt("Reported"),
    unverified: gt("Unverified"),
  };
  const severity = { low: gt("Low risk"), medium: gt("Medium risk"), high: gt("High risk") };
  return (
    <div className="markdown-card">
      {risks.title ? <div className="markdown-card-title">{md(risks.title)}</div> : null}
      <ul className="markdown-card-list flex flex-col">
        {risks.items.map((item) => {
          const tone = severityTone[item.severity ?? "low"];
          return (
            <li
              key={item.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 border-border py-2.5 first:pt-0 last:pb-0 not-first:border-t"
            >
              <TriangleAlertIcon aria-hidden="true" className={cn("h-lh w-4", tone.icon)} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-foreground">{md(item.title)}</span>
                  <span className="flex items-baseline gap-1.5 text-xs">
                    {item.severity ? (
                      <>
                        <span className={cn("font-medium", tone.label)}>
                          {severity[item.severity]}
                        </span>
                        <span aria-hidden="true" className="text-muted-foreground/60">
                          ·
                        </span>
                      </>
                    ) : null}
                    <span className={evidenceTone[item.evidence]}>{evidence[item.evidence]}</span>
                  </span>
                </div>
                <div className="text-foreground/80">{md(item.impact)}</div>
                {item.mitigation ? (
                  <div className="mt-0.5 text-(length:--markdown-text-compact) text-muted-foreground">
                    <span className="font-medium text-foreground/80">{gt("Mitigation:")}</span>{" "}
                    {md(item.mitigation)}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
