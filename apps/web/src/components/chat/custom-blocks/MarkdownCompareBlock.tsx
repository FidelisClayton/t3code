/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownCompareBlock.css. */
import { T, useGT, Var } from "gt-react";
import { Fragment, useRef, type CSSProperties, type FocusEvent } from "react";
import { Badge } from "~/components/ui/badge";
import { MarkdownChoiceScope, MarkdownInlineChoice } from "./MarkdownChoices";
import { parseMarkdownChoiceHref } from "./markdownChoiceLinks";
import type { MarkdownCompareDefinition } from "./markdownCompare";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import "./MarkdownCard.css";
import "./MarkdownCompareBlock.css";

// Arrow keys can focus a card the row has scrolled partly out of view; snapping finishes the move.
function revealFocusedCard(event: FocusEvent<HTMLDivElement>) {
  const card = event.target.closest("article")?.getBoundingClientRect();
  const row = event.currentTarget.getBoundingClientRect();
  if (!card) return;
  const offset =
    card.left < row.left
      ? card.left - row.left
      : card.right > row.right
        ? card.right - row.right
        : 0;
  if (offset !== 0) event.currentTarget.scrollBy({ left: offset });
}

export function MarkdownCompareBlock({
  compare,
  renderMarkdown,
}: {
  compare: MarkdownCompareDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
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
      {compare.title ? <div className="markdown-card-title">{md(compare.title)}</div> : null}
      <MarkdownChoiceScope text={choices} rootRef={rootRef}>
        <div
          className="markdown-compare-grid"
          onFocus={revealFocusedCard}
          style={
            {
              "--compare-value-rows": compare.attributes.length * 2,
              "--compare-rows":
                compare.attributes.length * 2 + 1 + Number(hasSummary) + Number(hasReason),
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
                      {md(option.title)}
                    </MarkdownInlineChoice>
                  ) : (
                    <span>{md(option.title)}</span>
                  )}
                  {option.recommended ? (
                    <Badge size="sm" variant="info">
                      {gt("Recommended")}
                    </Badge>
                  ) : null}
                </div>
                {hasSummary ? (
                  <div className="markdown-compare-summary">
                    {option.summary ? md(option.summary) : null}
                  </div>
                ) : null}
                <dl className="markdown-compare-values">
                  {compare.attributes.map((attribute) => (
                    <Fragment key={attribute.id}>
                      <dt>{md(attribute.label)}</dt>
                      <dd>
                        {Object.hasOwn(option.values, attribute.id)
                          ? md(option.values[attribute.id]!)
                          : gt("Unknown")}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
                {hasReason ? (
                  <div className="markdown-compare-reason">
                    {option.recommended ? (
                      <T>
                        Recommended: <Var>{md(option.recommended)}</Var>
                      </T>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </MarkdownChoiceScope>
    </section>
  );
}
