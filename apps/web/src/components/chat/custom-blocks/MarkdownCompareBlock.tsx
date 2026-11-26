/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownCompareBlock.css. */
import { useGT } from "gt-react";
import { Fragment, useRef, type CSSProperties } from "react";
import { Badge } from "~/components/ui/badge";
import { MarkdownChoiceScope, MarkdownInlineChoice } from "./MarkdownChoices";
import { parseMarkdownChoiceHref } from "./markdownChoiceLinks";
import type { MarkdownCompareDefinition } from "./markdownCompare";
import "./MarkdownCard.css";
import "./MarkdownCompareBlock.css";

export function MarkdownCompareBlock({ compare }: { compare: MarkdownCompareDefinition }) {
  const gt = useGT();
  const rootRef = useRef<HTMLElement>(null);
  const hasSummary = compare.options.some((option) => option.summary);
  const hasReason = compare.options.some((option) => option.recommended);
  // The scope reads only the choice keys, so every link can share one label.
  const choices = compare.options
    .flatMap((option) => (option.choice ? [`[x](choice:${option.choice})`] : []))
    .join(" ");
  return (
    <section
      ref={rootRef}
      className="markdown-card markdown-compare"
      aria-label={compare.title ?? gt("Comparison")}
    >
      {compare.title ? <p className="markdown-card-title">{compare.title}</p> : null}
      <MarkdownChoiceScope text={choices} rootRef={rootRef}>
        <div
          className="markdown-compare-grid"
          style={
            {
              "--compare-attributes": compare.attributes.length,
              "--compare-rows":
                compare.attributes.length + 1 + Number(hasSummary) + Number(hasReason),
            } as CSSProperties
          }
        >
          {compare.options.map((option) => {
            const choice = option.choice
              ? parseMarkdownChoiceHref(`choice:${option.choice}`)
              : null;
            return (
              <article
                className="markdown-compare-option"
                data-recommended={option.recommended ? "true" : undefined}
                key={option.id}
              >
                <div className="markdown-compare-head">
                  {choice ? (
                    <MarkdownInlineChoice choice={choice} label={option.title} card>
                      {option.title}
                    </MarkdownInlineChoice>
                  ) : (
                    <span>{option.title}</span>
                  )}
                  {option.recommended ? (
                    <Badge size="sm" variant="info">
                      {gt("Recommended")}
                    </Badge>
                  ) : null}
                </div>
                {hasSummary ? <p className="markdown-compare-summary">{option.summary}</p> : null}
                <dl className="markdown-compare-values">
                  {compare.attributes.map((attribute) => (
                    <Fragment key={attribute.id}>
                      <dt>{attribute.label}</dt>
                      <dd>
                        {Object.hasOwn(option.values, attribute.id)
                          ? option.values[attribute.id]
                          : gt("Unknown")}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
                {hasReason ? (
                  <p className="markdown-compare-reason">
                    {option.recommended
                      ? gt("Recommended: {reason}", { reason: option.recommended })
                      : null}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </MarkdownChoiceScope>
    </section>
  );
}
