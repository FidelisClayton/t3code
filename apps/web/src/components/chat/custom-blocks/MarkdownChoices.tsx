import { useStableCallback } from "~/hooks/useStableCallback";
import { CircleIcon, CircleDotIcon, SquareIcon, SquareCheckIcon } from "lucide-react";
import {
  createContext,
  use,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
  useId,
  type ReactNode,
  type RefObject,
  type ComponentProps,
} from "react";
import type { Element, ElementContent } from "hast";
import { hastPlainTextDeep } from "../markdownHast.logic";
import { cn } from "~/lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../../ui/popover";
import { AssistantCitationCommentEditor } from "../AssistantCitationCommentEditor";
import { resolveAssistantCitationCommentDismissal } from "../assistantCitationCommentDismissal";
import {
  analyzeMarkdownChoices,
  parseMarkdownChoiceHref,
  type MarkdownChoice,
  type MarkdownChoiceSelection,
} from "./markdownChoices";

import { captureAssistantTextRange } from "~/lib/assistantTextSelection";
import {
  markdownChoiceStore,
  applyMarkdownChoiceStateChange,
  type MarkdownChoiceStateChange,
  reconcileMarkdownChoiceState,
  type MarkdownChoiceState,
} from "./markdownChoiceState";
import type { MarkdownChoiceDraftUpdate, MarkdownChoiceSource } from "./markdownChoiceDraft";

const MarkdownChoicesContext = createContext<{
  rootRef: RefObject<HTMLElement | null>;
  id: string;
  groups: ReturnType<typeof analyzeMarkdownChoices>["groups"];
  selected: MarkdownChoiceSelection;
  notes: ReadonlyMap<string, string>;
  register: (key: string, button: HTMLButtonElement | null) => void;
  toggle: (choice: MarkdownChoice) => void;
  saveNote: (key: string, comment: string) => boolean;
} | null>(null);

export function MarkdownChoices({
  text,
  enabled,
  rootRef,
  children,
  source,
  onChoiceDraftUpdate,
}: {
  text: string;
  enabled: boolean;
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  source?: MarkdownChoiceSource | undefined;
  onChoiceDraftUpdate?: ((update: MarkdownChoiceDraftUpdate) => boolean) | undefined;
}) {
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // oxlint-disable-next-line t3code/no-manual-memo -- Compiler groups this parse with selection and note updates.
  const { groups, options } = useMemo(
    () => analyzeMarkdownChoices(enabled ? text : ""),
    [text, enabled],
  );
  const storageKey = source
    ? JSON.stringify([source.environmentId, source.threadId, source.messageId])
    : null;
  const subscribe = (listener: () => void) =>
    storageKey ? markdownChoiceStore.subscribe(storageKey, listener) : () => {};
  const getSnapshot = () => (storageKey ? markdownChoiceStore.read(storageKey) : null);
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [local, setLocal] = useState<MarkdownChoiceState>({ selected: {}, notes: {} });
  const saved = persisted ?? local;
  const current = reconcileMarkdownChoiceState(saved, options);
  const selected = current.selected;
  const notes = new Map(Object.entries(current.notes));
  const update = (change: MarkdownChoiceStateChange, keys: string[]) => {
    const previous = storageKey ? markdownChoiceStore.read(storageKey) : saved;
    const next = applyMarkdownChoiceStateChange(previous, change);
    const noteChanged = change.kind === "note";
    const visible = reconcileMarkdownChoiceState(next, options);
    const changes = keys.flatMap((key) => {
      if (!source || !onChoiceDraftUpdate) return [];
      const button = buttons.current.get(key);
      const option = options.get(key);
      const root = rootRef.current;
      if (!button || !option || !root) return [];
      const range = button.ownerDocument.createRange();
      range.selectNodeContents(button);
      const viewport = root.closest<HTMLElement>("[data-assistant-citation-viewport]");
      if (!viewport) return [];
      const captured = captureAssistantTextRange(viewport, range);
      if (!captured) return [];
      const comment = visible.notes[key];
      return [
        {
          key,
          mode: option.mode,
          selected:
            (Object.hasOwn(visible.selected, option.group)
              ? visible.selected[option.group]
              : undefined
            )?.includes(option.value) ?? false,
          citation: {
            version: 1 as const,
            ...source,
            ...captured.selector,
            ...(comment ? { comment } : {}),
          },
          noteChanged,
        },
      ];
    });
    if (
      source &&
      onChoiceDraftUpdate &&
      (!changes.length || !onChoiceDraftUpdate({ source, changes }))
    )
      return false;
    if (storageKey) markdownChoiceStore.write(storageKey, next);
    else setLocal(next);
    return true;
  };
  return (
    <MarkdownChoicesContext
      value={{
        rootRef,
        id,
        groups,
        selected,
        notes,
        register: (key, button) => {
          if (button) buttons.current.set(key, button);
          else buttons.current.delete(key);
        },
        toggle: (choice) => {
          const keys =
            choice.mode === "single"
              ? [
                  ...new Set([
                    ...(Object.hasOwn(selected, choice.group) ? selected[choice.group]! : []),
                    choice.value,
                  ]),
                ].map((value) => `${choice.group}/${value}`)
              : [`${choice.group}/${choice.value}`];
          update(
            {
              kind: "selection",
              choice,
              selected: !(
                Object.hasOwn(selected, choice.group) &&
                selected[choice.group]!.includes(choice.value)
              ),
            },
            keys,
          );
        },
        saveNote: (key, comment) => update({ kind: "note", key, comment }, [key]),
      }}
    >
      {children}
      {Array.from(groups, ([group, mode]) =>
        mode === "single" ? (
          <span
            key={group}
            role="radiogroup"
            aria-label={group}
            className="sr-only"
            ref={(node) => {
              if (!node) return;
              const radios = Array.from(
                node
                  .closest(".chat-markdown")
                  ?.querySelectorAll<HTMLButtonElement>(
                    `button[data-choice-message="${id}"][data-choice-group="${group}"][role="radio"]`,
                  ) ?? [],
              );
              node.setAttribute("aria-owns", radios.map((radio) => radio.id).join(" "));
              const selectedValues = Object.hasOwn(selected, group) ? selected[group] : undefined;
              const tabStop =
                radios.find((radio) => selectedValues?.includes(radio.dataset.choiceValue!)) ??
                radios[0];
              for (const radio of radios) radio.tabIndex = radio === tabStop ? 0 : -1;
            }}
          />
        ) : null,
      )}
    </MarkdownChoicesContext>
  );
}

export function MarkdownInlineChoice({
  choice,
  children,
  label,
}: {
  choice: MarkdownChoice;
  children: ReactNode;
  label: string;
}) {
  const state = use(MarkdownChoicesContext);
  const choiceId = useId();
  const phraseRef = useRef<HTMLButtonElement>(null);
  const key = `${choice.group}/${choice.value}`;
  const registerPhrase = useStableCallback((button: HTMLButtonElement | null) => {
    phraseRef.current = button;
    state?.register(key, button);
  });
  if (!state || state.groups.get(choice.group) !== choice.mode) return <span>{children}</span>;
  const comment = state.notes.get(key);
  const selected =
    Object.hasOwn(state.selected, choice.group) &&
    state.selected[choice.group]!.includes(choice.value);
  const Icon =
    choice.mode === "single"
      ? selected
        ? CircleDotIcon
        : CircleIcon
      : selected
        ? SquareCheckIcon
        : SquareIcon;
  return (
    <span
      className="group/choice relative inline"
      data-markdown-copy={`[${label}](${choice.mode === "single" ? "choice" : "choices"}:${key})`}
    >
      <button
        ref={registerPhrase}
        type="button"
        id={choiceId}
        role={choice.mode === "single" ? "radio" : "checkbox"}
        aria-checked={selected}
        data-choice-message={state.id}
        data-choice-group={choice.group}
        data-choice-value={choice.value}
        tabIndex={choice.mode === "multi" ? 0 : -1}
        aria-description={comment ? "Has comment" : undefined}
        className={cn(
          "inline cursor-pointer rounded-sm text-inherit hover:text-primary active:bg-accent focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11",
          selected && "underline decoration-primary underline-offset-3",
        )}
        onClick={() => state.toggle(choice)}
        onKeyDown={(event) => {
          if (choice.mode !== "single" || event.nativeEvent.isComposing) return;
          const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : 0;
          if (!step) return;
          const radios = Array.from(
            state.rootRef.current?.querySelectorAll<HTMLButtonElement>(
              `button[data-choice-message="${state.id}"][data-choice-group="${choice.group}"][role="radio"]`,
            ) ?? [],
          );
          const index = radios.indexOf(event.currentTarget);
          if (index < 0) return;
          event.preventDefault();
          const next = radios[(index + step + radios.length) % radios.length]!;
          next.focus();
          if (next.getAttribute("aria-checked") !== "true") next.click();
        }}
      >
        <Icon aria-hidden="true" className="me-1 inline size-3.5 align-[-0.15em]" />
        {children}
        {comment ? (
          <span
            className="ms-1 inline-block size-1 rounded-full bg-primary align-super"
            aria-hidden="true"
          />
        ) : null}
      </button>
      <MarkdownChoiceComment options={[{ ...choice, label }]} anchorRef={phraseRef} />
    </span>
  );
}

function MarkdownChoiceCommentAction({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "absolute inset-s-0 bottom-full z-1 opacity-0 pointer-events-none cursor-pointer whitespace-nowrap rounded border border-border bg-popover px-1.5 text-xs leading-5 text-popover-foreground group-hover/choice:opacity-100 group-hover/choice:pointer-events-auto group-focus-within/choice:opacity-100 group-focus-within/choice:pointer-events-auto data-popup-open:opacity-100 data-popup-open:pointer-events-auto active:bg-accent focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:hidden [@media(hover:none)]:hidden",
        className,
      )}
      {...props}
    />
  );
}

type CommentOption = MarkdownChoice & { label: string };

export function MarkdownChoiceCommentTails({ node }: { node: Element | undefined }) {
  const state = use(MarkdownChoicesContext);
  if (!state || !node) return null;
  const groups = new Map<string, CommentOption[]>();
  const visit = (child: ElementContent) => {
    if (child.type !== "element") return;
    // Paragraphs and nested lists render their own tails.
    if (["p", "li", "ul", "ol"].includes(child.tagName)) return;
    const choice =
      child.tagName === "a" ? parseMarkdownChoiceHref(String(child.properties.href ?? "")) : null;
    if (choice && state.groups.get(choice.group) === choice.mode) {
      const options = groups.get(choice.group) ?? [];
      if (!options.some((option) => option.value === choice.value))
        options.push({ ...choice, label: hastPlainTextDeep(child) });
      groups.set(choice.group, options);
    }
    for (const descendant of child.children) visit(descendant);
  };
  for (const child of node.children) visit(child);
  return Array.from(groups, ([group, options]) => (
    <MarkdownChoiceComment key={group} options={options} tail />
  ));
}

function MarkdownChoiceComment({
  options,
  anchorRef: suppliedAnchorRef,
  tail = false,
}: {
  options: CommentOption[];
  anchorRef?: RefObject<HTMLButtonElement | null>;
  tail?: boolean;
}) {
  const state = use(MarkdownChoicesContext)!;
  const defaultTarget =
    options.find(
      (option) =>
        Object.hasOwn(state.selected, option.group) &&
        state.selected[option.group]!.includes(option.value),
    ) ?? options[0]!;
  const [target, setTarget] = useState(defaultTarget);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = suppliedAnchorRef ?? triggerRef;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<string | null>(null);
  const pickerId = useId();
  const key = `${target.group}/${target.value}`;
  const label = target.label;
  const comment = state.notes.get(key);
  const hasNotes = options.some((option) => state.notes.has(`${option.group}/${option.value}`));
  const save = (value: string) => {
    if (!state.saveNote(key, value)) return false;
    setOpen(false);
    return true;
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          draftRef.current = null;
          setTarget(defaultTarget);
        } else {
          const dismissal = resolveAssistantCitationCommentDismissal({
            reason: details.reason,
            draft: draftRef.current,
            savedComment: comment,
          });
          if (dismissal.kind === "keep-open") {
            details.cancel();
            inputRef.current?.focus({ preventScroll: true });
            return;
          }
          if (dismissal.kind === "commit" && !state.saveNote(key, dismissal.comment)) {
            details.cancel();
            inputRef.current?.focus({ preventScroll: true });
            return;
          }
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        aria-label={
          tail
            ? `${hasNotes ? "Edit comment" : "Comment"} on ${options[0]!.group}`
            : `${comment ? "Edit comment" : "Comment"} on ${label}`
        }
        render={tail ? <MarkdownChoiceCommentTail /> : <MarkdownChoiceCommentAction />}
      >
        {(tail ? hasNotes : comment) ? "Edit comment" : "Comment"}
      </PopoverTrigger>
      {open ? (
        <PopoverPopup
          anchor={anchorRef}
          width="md"
          padding="compact"
          aria-label={`Comment on ${label}`}
          initialFocus={() => {
            inputRef.current?.focus({ preventScroll: true });
            return false;
          }}
          finalFocus={() => {
            const active = document.activeElement;
            if (active === document.body || (active !== null && popupRef.current?.contains(active)))
              anchorRef.current?.focus({ preventScroll: true });
            return false;
          }}
          ref={popupRef}
        >
          <div className="bg-popover">
            <p className="mbs-1 max-h-16 overflow-y-auto px-1 text-xs text-muted-foreground">
              {label}
            </p>
            {tail && options.length > 1 ? (
              <div
                role="radiogroup"
                aria-label="Comment source"
                className="flex flex-wrap gap-x-3 px-1 text-xs text-muted-foreground"
              >
                {options.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1"
                  >
                    <input
                      type="radio"
                      name={`comment-source-${pickerId}`}
                      checked={option.value === target.value}
                      onChange={() => {
                        const dismissal = resolveAssistantCitationCommentDismissal({
                          reason: "source-change",
                          draft: draftRef.current,
                          savedComment: comment,
                        });
                        if (dismissal.kind === "keep-open") {
                          inputRef.current?.focus({ preventScroll: true });
                          return;
                        }
                        if (
                          dismissal.kind === "commit" &&
                          !state.saveNote(key, dismissal.comment)
                        ) {
                          inputRef.current?.focus({ preventScroll: true });
                          return;
                        }
                        draftRef.current = null;
                        setTarget(option);
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : null}
            <AssistantCitationCommentEditor
              key={key}
              citation={{ comment }}
              inputRef={inputRef}
              onDraftChange={(value) => {
                draftRef.current = value;
              }}
              onSubmit={save}
              onCancel={() => setOpen(false)}
            />
          </div>
        </PopoverPopup>
      ) : null}
    </Popover>
  );
}

function MarkdownChoiceCommentTail({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      data-choice-tail="true"
      data-markdown-copy=""
      data-thread-find-ignore="true"
      className={cn(
        "relative ms-1 hidden cursor-pointer border-0 bg-transparent p-0 touch-manipulation align-baseline text-xs leading-4.5 text-muted-foreground underline underline-offset-3 active:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:inline-block [@media(hover:none)]:inline-block after:absolute after:inset-x-0 after:inset-y-[min(0px,calc((100%_-_44px)/2))]",
        className,
      )}
      {...props}
    />
  );
}
