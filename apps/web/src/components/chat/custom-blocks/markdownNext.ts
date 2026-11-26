import * as Schema from "effect/Schema";
import { parseMarkdownChoiceHref } from "./markdownChoiceLinks";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownNext = Schema.Struct({
  items: Schema.NonEmptyArray(
    Schema.Struct({
      type: Schema.Literals(["test", "decide", "review", "approve", "unblock"]),
      ask: text(2048),
      details: Schema.optionalKey(text(32768)),
      danger: Schema.optionalKey(Schema.Boolean),
      actions: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            label: text(128),
            choice: Schema.String.check(
              Schema.makeFilter((value) => parseMarkdownChoiceHref(`choice:${value}`) !== null),
            ),
            primary: Schema.optionalKey(Schema.Boolean),
            danger: Schema.optionalKey(Schema.Boolean),
          }),
        )
          .check(Schema.isMaxLength(4))
          .check(
            Schema.makeFilter((actions) => actions.filter((action) => action.primary).length <= 1),
          ),
      ),
    }),
  ).check(Schema.isMaxLength(8)),
});
const decode = Schema.decodeUnknownSync(MarkdownNext, { onExcessProperty: "error" });

export function parseMarkdownNext(source: string) {
  if (source.length > 262144) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownNextDefinition = NonNullable<ReturnType<typeof parseMarkdownNext>>;

const NEXT_FENCE = /^```next[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

/** The last closed, meta-free ```next fence of a message, or null when absent or invalid. */
export function findLastMarkdownNext(text: string) {
  if (!text.includes("```next")) return null;
  let last: string | undefined;
  for (const match of text.matchAll(NEXT_FENCE)) last = match[1];
  return last === undefined ? null : parseMarkdownNext(last);
}
