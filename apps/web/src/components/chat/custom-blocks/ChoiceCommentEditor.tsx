import { ASSISTANT_CITATION_MAX_COMMENT_LENGTH } from "@t3tools/contracts";
import { T, useGT, Var } from "gt-react";
import { useRef, useState, type RefObject } from "react";

import { textDirection } from "~/textDirection";

import { Button } from "../../ui/button";

export function ChoiceCommentEditor({
  comment: initialComment,
  inputRef,
  onSubmit,
  onCancel,
  onDraftChange,
}: {
  comment: string | undefined;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (comment: string) => boolean;
  onCancel: () => void;
  onDraftChange?: (comment: string) => void;
}) {
  const gt = useGT();
  const [comment, setComment] = useState(initialComment ?? "");
  const localInputRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = inputRef ?? localInputRef;
  const updateComment = (text: string) => {
    setComment(text);
    onDraftChange?.(text);
  };
  const commentTooLong = comment.length > ASSISTANT_CITATION_MAX_COMMENT_LENGTH;
  const submit = () => {
    if (!commentTooLong) onSubmit(comment);
  };

  return (
    <div
      data-citation-comment-editor="true"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label={gt("Comment on selected text")}
        aria-description={gt("Enter to save the comment; Shift+Enter for a new line.")}
        aria-invalid={commentTooLong || undefined}
        placeholder={gt("Add an optional comment...")}
        rows={2}
        dir={textDirection(comment)}
        className="field-sizing-content block max-h-40 min-h-16 w-full resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        value={comment}
        onChange={(event) => updateComment(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {commentTooLong ? (
        <p role="status" className="pt-1 text-xs text-destructive">
          <T>
            Comments can contain up to{" "}
            <Var>{ASSISTANT_CITATION_MAX_COMMENT_LENGTH.toLocaleString()}</Var> characters.
          </T>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xs"
            // Escape cancels; keep Tab from the comment on Save so Enter cannot discard a new comment.
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onCancel}
          >
            <T>Cancel</T>
          </Button>
          <Button
            size="xs"
            disabled={commentTooLong}
            onPointerDown={(event) => event.preventDefault()}
            onClick={submit}
          >
            {commentTooLong
              ? gt("Shorten comment")
              : gt("Save", { $context: "verb, saves the comment" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
