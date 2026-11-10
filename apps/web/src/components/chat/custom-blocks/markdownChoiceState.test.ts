import { describe, expect, it } from "vite-plus/test";
import { createMemoryStorage } from "~/lib/storage";
import {
  createMarkdownChoiceStore,
  reconcileMarkdownChoiceState,
  applyMarkdownChoiceStateChange,
  type MarkdownChoiceState,
} from "./markdownChoiceState";
import { analyzeMarkdownChoices } from "./markdownChoices";
const options = analyzeMarkdownChoices(
  "[A](choice:g/a) [B](choice:g/b) [Unit](choices:check/unit)",
).options;

describe("saved reading choices", () => {
  it("roundtrips marks, isolates scopes and reconciles removed/conflicting options", () => {
    const storage = createMemoryStorage();
    const first = createMarkdownChoiceStore(storage);
    first.write("env/thread/message", {
      selected: { g: ["a", "b", "gone"] },
      notes: { "g/a": "My note", "g/gone": "Old", "check/unit": "n".repeat(8000) },
    });
    const reopened = createMarkdownChoiceStore(storage);
    const streamed = reopened.read("env/thread/message");
    expect(
      reconcileMarkdownChoiceState(
        streamed,
        analyzeMarkdownChoices("[Unit](choices:check/unit)").options,
      ),
    ).toEqual({
      selected: {},
      notes: { "check/unit": "n".repeat(8000) },
    });

    expect(reconcileMarkdownChoiceState(streamed, options)).toEqual({
      selected: { g: ["a"] },
      notes: { "g/a": "My note", "check/unit": "n".repeat(8000) },
    });
    for (const key of ["other/thread/message", "env/other/message", "env/thread/other"])
      expect(reopened.read(key)).toEqual({ selected: {}, notes: {} });
    expect(
      reconcileMarkdownChoiceState(
        reopened.read("env/thread/message"),
        analyzeMarkdownChoices("[A](choice:g/a) [B](choices:g/b)").options,
      ),
    ).toEqual({ selected: {}, notes: {} });
  });
  it("merges explicit changes without erasing later streamed or independently rendered marks", () => {
    let state: MarkdownChoiceState = {
      selected: { later: ["saved"], main: ["old"], multi: ["later"] },
      notes: { "later/saved": "Kept", "main/old": "Old note" },
    };
    state = applyMarkdownChoiceStateChange(state, {
      kind: "selection",
      choice: { mode: "single", group: "main", value: "new" },
      selected: true,
    });
    state = applyMarkdownChoiceStateChange(state, {
      kind: "selection",
      choice: { mode: "multi", group: "details", value: "unit" },
      selected: true,
    });
    state = applyMarkdownChoiceStateChange(state, {
      kind: "selection",
      choice: { mode: "multi", group: "multi", value: "current" },
      selected: true,
    });
    state = applyMarkdownChoiceStateChange(state, {
      kind: "note",
      key: "main/new",
      comment: "New note",
    });
    state = applyMarkdownChoiceStateChange(state, { kind: "note", key: "main/old", comment: "" });
    state = applyMarkdownChoiceStateChange(state, {
      kind: "selection",
      choice: { mode: "multi", group: "multi", value: "current" },
      selected: false,
    });
    expect(state).toEqual({
      selected: { later: ["saved"], main: ["new"], details: ["unit"], multi: ["later"] },
      notes: { "later/saved": "Kept", "main/new": "New note" },
    });
  });
  it("accepts literal group names without inheriting object properties", () => {
    const store = createMarkdownChoiceStore(createMemoryStorage());
    const options = analyzeMarkdownChoices(
      "[A](choice:__proto__/a) [B](choice:constructor/b) [C](choice:toString/c)",
    ).options;
    store.write("literal", {
      selected: Object.fromEntries([["__proto__", ["a"]]]),
      notes: { "constructor/b": "Just a note" },
    });
    expect(reconcileMarkdownChoiceState(store.read("literal"), options)).toEqual({
      selected: Object.fromEntries([["__proto__", ["a"]]]),
      notes: { "constructor/b": "Just a note" },
    });
  });
  it("rejects malformed saved data and retains interactions when browser storage fails", () => {
    const storage = createMemoryStorage();
    storage.setItem("t3code:markdown-choices:v1:bad", '{"selected":{"g":"a"},"notes":{}}');
    expect(createMarkdownChoiceStore(storage).read("bad")).toEqual({
      selected: {},
      notes: {},
    });
    const blocked = createMarkdownChoiceStore({
      getItem() {
        throw Error("Blocked");
      },
      setItem() {
        throw Error("Full");
      },
    });
    blocked.write("scope", { selected: { g: ["b"] }, notes: { "g/b": "Kept" } });
    expect(blocked.read("scope")).toEqual({
      selected: { g: ["b"] },
      notes: { "g/b": "Kept" },
    });
  });
});
