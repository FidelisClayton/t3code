import { ASSISTANT_CITATION_MAX_COMMENT_LENGTH } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { StateStorage } from "~/lib/storage";
import {
  toggleMarkdownChoice,
  type MarkdownChoice,
  type MarkdownChoiceSelection,
} from "./markdownChoices";

const SavedChoices = Schema.Struct({
  selected: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  notes: Schema.Record(Schema.String, Schema.String),
});
const decodeSavedChoices = Schema.decodeSync(Schema.fromJsonString(SavedChoices));

export type MarkdownChoiceState = {
  selected: MarkdownChoiceSelection;
  notes: Readonly<Record<string, string>>;
};

export type MarkdownChoiceStateChange =
  | { kind: "selection"; choice: MarkdownChoice; selected: boolean }
  | { kind: "note"; key: string; comment: string };

export function applyMarkdownChoiceStateChange(
  saved: MarkdownChoiceState,
  change: MarkdownChoiceStateChange,
): MarkdownChoiceState {
  if (change.kind === "note") {
    const notes = { ...saved.notes };
    if (change.comment.trim()) notes[change.key] = change.comment.trim();
    else delete notes[change.key];
    return { ...saved, notes };
  }
  const { choice } = change;
  const values = Object.hasOwn(saved.selected, choice.group) ? saved.selected[choice.group]! : [];
  const selected =
    choice.mode === "single" && change.selected
      ? { ...saved.selected, [choice.group]: [choice.value] }
      : values.includes(choice.value) === change.selected
        ? saved.selected
        : toggleMarkdownChoice(saved.selected, choice);
  return { ...saved, selected };
}

export function reconcileMarkdownChoiceState(
  saved: MarkdownChoiceState,
  options: ReadonlyMap<string, MarkdownChoice>,
): MarkdownChoiceState {
  const selected = new Map<string, string[]>();
  const notes = new Map<string, string>();
  for (const [key, choice] of options) {
    const values = Object.hasOwn(saved.selected, choice.group)
      ? saved.selected[choice.group]
      : undefined;
    if (
      values?.includes(choice.value) &&
      (choice.mode === "multi" || !selected.get(choice.group)?.length)
    ) {
      const group = selected.get(choice.group) ?? [];
      group.push(choice.value);
      selected.set(choice.group, group);
    }
    const note = saved.notes[key];
    if (note && note.length <= ASSISTANT_CITATION_MAX_COMMENT_LENGTH) notes.set(key, note);
  }
  return { selected: Object.fromEntries(selected), notes: Object.fromEntries(notes) };
}

export function createMarkdownChoiceStore(storage: Pick<StateStorage, "getItem" | "setItem">) {
  const memory = new Map<string, MarkdownChoiceState>();
  const listeners = new Map<string, Set<() => void>>();
  const read = (key: string): MarkdownChoiceState => {
    let saved = memory.get(key);
    if (!saved) {
      try {
        const raw = storage.getItem(`t3code:markdown-choices:v1:${key}`);
        if (typeof raw === "string") saved = decodeSavedChoices(raw);
      } catch {
        /* Browser storage is optional; reading marks also work in memory. */
      }
    }
    saved ??= { selected: {}, notes: {} };
    memory.set(key, saved);
    return saved;
  };
  const write = (key: string, state: MarkdownChoiceState) => {
    memory.set(key, state);
    try {
      storage.setItem(`t3code:markdown-choices:v1:${key}`, JSON.stringify(state));
    } catch {
      /* Keep this session usable when browser storage is unavailable. */
    }
    for (const listener of listeners.get(key) ?? []) listener();
  };
  return {
    read,
    write,
    subscribe(key: string, listener: () => void) {
      const subscribers = listeners.get(key) ?? new Set<() => void>();
      subscribers.add(listener);
      listeners.set(key, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
      };
    },
  };
}

export const markdownChoiceStore = createMarkdownChoiceStore({
  getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
});
