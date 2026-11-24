/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownReferenceLink.css. */
import type {
  OrchestrationV2GetMarkdownReferenceResult,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { T, useGT, Var } from "gt-react";
import { XIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { orchestrationEnvironment } from "../../../state/orchestration";
import { useEnvironmentQuery } from "../../../state/query";
import { Button } from "../../ui/button";
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../../ui/popover";
import { useMarkdownReference } from "./MarkdownReferenceScope";
import "./MarkdownReferenceLink.css";

export function MarkdownReferenceLink({
  id,
  children,
  copyMarkdown,
  threadRef,
  renderBody,
}: {
  id: string;
  children: ReactNode;
  copyMarkdown: string;
  threadRef: ScopedThreadRef | undefined;
  renderBody: (body: string) => ReactNode;
}) {
  const gt = useGT();
  const local = useMarkdownReference(id);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [missing, setMissing] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const restoringFocus = useRef(false);
  const hoverDismissed = useRef(false);
  const returnFocus = useRef(false);
  const query = useEnvironmentQuery<OrchestrationV2GetMarkdownReferenceResult, unknown>(
    open && !local && !missing && threadRef
      ? orchestrationEnvironment.markdownReference({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, id },
        })
      : null,
  );
  const reference =
    local ?? (!query.isPending && query.error === null ? query.data?.reference : undefined);
  const notFound =
    open &&
    !local &&
    (threadRef === undefined ||
      (query.isSuccess && !query.isPending && query.data?.reference === null));
  if (notFound) {
    setMissing(true);
    setOpen(false);
    setPinned(false);
  }

  if (missing && local) setMissing(false);
  if (missing && !local) return <span data-markdown-copy={copyMarkdown}>{children}</span>;
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next && details.reason === "trigger-hover" && hoverDismissed.current) {
          details.cancel();
          return;
        }
        if (details.reason === "trigger-press") {
          if (open && !pinned) {
            setPinned(true);
            if (!next) details.cancel();
            return;
          }
          setPinned(next);
        } else if (pinned && details.reason === "trigger-hover") {
          details.cancel();
          return;
        }
        if (!next) {
          hoverDismissed.current = details.reason !== "trigger-hover";
          setPinned(false);
          returnFocus.current = details.reason === "escape-key" || details.reason === "close-press";
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        openOnHover={!pinned}
        nativeButton={false}
        render={
          <span
            ref={trigger}
            className="markdown-reference-label"
            data-markdown-copy={copyMarkdown}
          />
        }
        onPointerEnter={() => {
          hoverDismissed.current = false;
        }}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(":focus-visible")) {
            hoverDismissed.current = false;
            setOpen(true);
          }
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        keepMounted
        width="lg"
        padding="compact"
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        touchBackdrop
        initialFocus={false}
        finalFocus={() => {
          if (returnFocus.current) {
            restoringFocus.current = true;
            trigger.current?.focus({ preventScroll: true });
            restoringFocus.current = false;
          }
          return false;
        }}
      >
        {open ? (
          <div className="rounded-md bg-popover p-1 text-sm">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <PopoverTitle>{reference?.title ?? gt("Reference")}</PopoverTitle>
                {reference?.summary ? (
                  <p className="[margin-block-start:--spacing(2)] text-muted-foreground">
                    {reference.summary}
                  </p>
                ) : null}
              </div>
              <PopoverClose
                render={<Button variant="ghost" size="icon-xs" aria-label={gt("Close briefing")} />}
              >
                <XIcon />
              </PopoverClose>
            </div>
            <div className="[margin-block-start:--spacing(3)]">
              {reference ? (
                renderBody(reference.body)
              ) : query.error ? (
                <div role="alert">
                  <p>
                    <T>
                      Unable to load this reference: <Var>{query.error}</Var>
                    </T>
                  </p>
                  <Button variant="ghost" size="sm" onClick={query.refresh}>
                    <T>Retry</T>
                  </Button>
                </div>
              ) : (
                <p role="status">
                  <T>Loading reference…</T>
                </p>
              )}
            </div>
          </div>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
