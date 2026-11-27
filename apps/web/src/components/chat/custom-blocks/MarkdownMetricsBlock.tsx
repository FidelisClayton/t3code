/* oxlint-disable shadcn/no-unknown-classes -- Card styles are imported from MarkdownCard.css. */
import { cn } from "~/lib/utils";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import { parseDiffValue, type MarkdownMetricsDefinition } from "./markdownMetrics";
import "./MarkdownCard.css";

export function MarkdownMetricsBlock({
  metrics,
  renderMarkdown,
}: {
  metrics: MarkdownMetricsDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  // Only a value the agent marked good or bad takes color; the rest stay neutral.
  const tones = {
    good: "text-success-foreground",
    warn: "text-warning-foreground",
    bad: "text-destructive-foreground",
  };
  return (
    <div className="markdown-card">
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-3">
        {metrics.items.map((item) => {
          const diff = item.tone ? null : parseDiffValue(item.value);
          return (
            <div key={item.label} className="flex min-w-0 flex-col">
              <dt className="text-sm leading-snug">{md(item.label)}</dt>
              <dd
                data-tone={item.tone}
                className={cn(
                  "-order-1 m-0 text-2xl leading-tight font-semibold tabular-nums",
                  item.tone ? tones[item.tone] : "text-foreground",
                )}
              >
                {diff ? (
                  <>
                    <span className="text-success-foreground">{diff.added}</span>
                    {diff.separator}
                    <span className="text-destructive-foreground">{diff.removed}</span>
                  </>
                ) : (
                  md(item.value)
                )}
              </dd>
              {item.qualifier ? (
                <dd className="m-0 text-xs leading-snug text-muted-foreground">
                  {md(item.qualifier)}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
