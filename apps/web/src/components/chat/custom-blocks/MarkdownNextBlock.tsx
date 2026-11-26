import type { MessageId } from "@t3tools/contracts";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useId, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { MarkdownPickedContext, useMarkdownAnswer } from "./MarkdownAnswers";
import type { MarkdownNextDefinition } from "./markdownNext";

type Item = MarkdownNextDefinition["items"][number];

// Actions render as inline choice links so they share MarkdownChoices' selection and draft path;
// this wrapper only restyles the generated choice buttons as buttons.
const actionStyles =
  "[&_p]:m-0 [&_p]:flex [&_p]:flex-wrap [&_p]:items-center [&_p]:gap-2 [&_button[role]]:inline-flex [&_button[role]]:min-h-8 [&_button[role]]:items-center [&_button[role]]:rounded-lg [&_button[role]]:border [&_button[role]]:border-input [&_button[role]]:bg-popover [&_button[role]]:px-3 [&_button[role]]:text-sm [&_button[role]]:font-medium [&_button[role]]:no-underline [&_button[role]]:shadow-xs/5 [&_button[role]_svg]:hidden [&_button[data-picked]_svg]:inline! [&_button[data-picked]]:ring-2 [&_button[data-picked]]:ring-inset [&_button[data-picked]]:ring-ring [&_button[role]]:hover:bg-accent/50 [&_button[role][aria-checked=true]]:ring-2 [&_button[role][aria-checked=true]]:ring-inset [&_button[role][aria-checked=true]]:ring-ring [&_strong]:font-normal [&_strong_button[role]]:border-primary [&_strong_button[role]]:bg-primary [&_strong_button[role]]:text-primary-foreground! [&_strong_button[role]]:hover:bg-primary/90";
const answeredActionStyles =
  "[&_strong_button[role]]:border-input [&_strong_button[role]]:bg-popover [&_strong_button[role]]:text-foreground! [&_strong_button[role]]:hover:bg-accent/50";
const dangerActionStyles =
  "[&_strong_button[role]]:border-destructive [&_strong_button[role]]:bg-destructive [&_strong_button[role]]:hover:bg-destructive/90 [&_strong_button[role]]:text-white!";

export function useNextTypeLabels() {
  const gt = useGT();
  return {
    test: gt("Test", { $context: "type of action the user has to do" }),
    decide: gt("Decide", { $context: "type of action the user has to do" }),
    review: gt("Review", { $context: "type of action the user has to do" }),
    approve: gt("Approve", { $context: "type of action the user has to do" }),
    unblock: gt("Unblock", { $context: "type of action the user has to do" }),
  };
}

const NO_PICKED: ReadonlySet<string> = new Set();
const escapeLabel = (label: string) => label.replace(/\s+/g, " ").replace(/[\\[\]`*_<>&]/g, "\\$&");

export function MarkdownNextBlock({
  next,
  messageId,
  renderMarkdown,
}: {
  next: MarkdownNextDefinition;
  messageId?: MessageId | undefined;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
}) {
  const gt = useGT();
  const answer = useMarkdownAnswer(messageId);
  const answered = answer !== undefined;
  const accordion = useId();
  const multiple = next.items.length > 1;
  const typeLabels = useNextTypeLabels();
  const head = (item: Item) => (
    <>
      <span className="mt-0.5 min-w-16 shrink-0 whitespace-nowrap text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {typeLabels[item.type]}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 font-medium [&_p]:m-0",
          multiple &&
            "[&_p]:truncate group-open/item:[&_p]:overflow-visible group-open/item:[&_p]:whitespace-normal",
        )}
      >
        {renderMarkdown(item.ask, undefined, false)}
      </span>
    </>
  );
  const body = (item: Item) => (
    <div className="flex flex-col gap-3 px-3 pb-3">
      {item.details ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground [&_p]:m-0">
          {renderMarkdown(item.details)}
        </div>
      ) : null}
      {item.actions?.length ? (
        <MarkdownPickedContext value={answer?.picked ?? NO_PICKED}>
          <div
            className={cn(
              actionStyles,
              answered ? answeredActionStyles : item.danger && dangerActionStyles,
            )}
          >
            {renderMarkdown(
              item.actions
                .map((action) => {
                  const link = `[${escapeLabel(action.label)}](choice:${action.choice})`;
                  return action.primary ? `**${link}**` : link;
                })
                .join(" "),
            )}
          </div>
        </MarkdownPickedContext>
      ) : null}
    </div>
  );
  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground",
        answered && "bg-muted/20 text-muted-foreground",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {answered ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        )}
        {answered ? gt("Answered") : gt("Next for you")}
        {multiple ? (
          <span
            className={cn(
              "ms-auto rounded-full bg-muted px-2 py-0.5 tabular-nums",
              !answered && "text-foreground",
            )}
          >
            {next.items.length}
          </span>
        ) : null}
      </div>
      {next.items.map((item, index) => {
        const danger = item.danger && "border-s-2 border-s-destructive bg-destructive/4";
        return multiple ? (
          <details
            // oxlint-disable-next-line react/no-array-index-key -- Each immutable card remounts when its source changes.
            key={index}
            name={accordion}
            open={!answered && index === 0}
            className={cn("group/item border-b border-border last:border-b-0", danger)}
          >
            <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              {head(item)}
              <ChevronDownIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180"
              />
            </summary>
            {body(item)}
          </details>
        ) : (
          // oxlint-disable-next-line react/no-array-index-key -- Each immutable card remounts when its source changes.
          <div key={index} className={danger || undefined}>
            <div className="flex items-start gap-2 px-3 py-2.5">{head(item)}</div>
            {body(item)}
          </div>
        );
      })}
    </div>
  );
}
