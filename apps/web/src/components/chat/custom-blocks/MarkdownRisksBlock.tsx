/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import { TriangleAlertIcon } from "lucide-react";
import { useGT } from "gt-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { MarkdownRisksDefinition } from "./markdownRisks";
import "./MarkdownCard.css";

const severityTone = {
  high: { icon: "text-destructive", label: "text-destructive-foreground" },
  medium: { icon: "text-warning", label: "text-warning-foreground" },
  low: { icon: "text-muted-foreground", label: "text-muted-foreground" },
};

export function MarkdownRisksBlock({ risks }: { risks: MarkdownRisksDefinition }) {
  const gt = useGT();
  const evidence = {
    verified: { label: gt("Verified"), variant: "success" },
    reported: { label: gt("Reported"), variant: "info" },
    unverified: { label: gt("Unverified"), variant: "warning" },
  } as const;
  const severity = { low: gt("Low risk"), medium: gt("Medium risk"), high: gt("High risk") };
  return (
    <div className="markdown-card">
      {risks.title ? <p className="markdown-card-title">{risks.title}</p> : null}
      <ul className="markdown-card-list flex flex-col">
        {risks.items.map((item) => {
          const tone = severityTone[item.severity ?? "low"];
          return (
            <li
              key={item.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 border-border py-2 first:pt-0 last:pb-0 not-first:border-t"
            >
              <TriangleAlertIcon aria-hidden="true" className={cn("h-lh w-4", tone.icon)} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.severity ? (
                    <span className={cn("text-xs font-medium", tone.label)}>
                      {severity[item.severity]}
                    </span>
                  ) : null}
                  <span className="ms-auto flex">
                    <Badge size="sm" variant={evidence[item.evidence].variant}>
                      {evidence[item.evidence].label}
                    </Badge>
                  </span>
                </div>
                <div>{item.impact}</div>
                {item.mitigation ? (
                  <div className="text-xs text-muted-foreground">
                    {gt("Mitigation:")} {item.mitigation}
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
