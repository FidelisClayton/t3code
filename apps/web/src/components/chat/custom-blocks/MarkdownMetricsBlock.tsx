/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import type { MarkdownMetricsDefinition } from "./markdownMetrics";
import "./MarkdownCard.css";

export function MarkdownMetricsBlock({ metrics }: { metrics: MarkdownMetricsDefinition }) {
  return (
    <div className="markdown-card">
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-3">
        {metrics.items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col">
            <dt className="text-sm leading-snug">{item.label}</dt>
            <dd className="-order-1 m-0 text-2xl leading-tight font-semibold tabular-nums text-foreground">
              {item.value}
            </dd>
            {item.qualifier ? (
              <dd className="m-0 text-xs leading-snug text-muted-foreground">{item.qualifier}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
