import * as Schema from "effect/Schema";
import { parseMarkdownChoiceHref } from "./markdownChoiceLinks";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const id = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/));
const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;

const MarkdownCompare = Schema.Struct({
  title: Schema.optionalKey(text(256)),
  attributes: Schema.NonEmptyArray(Schema.Struct({ id, label: text(128) })).check(
    Schema.isMaxLength(12),
    Schema.makeFilter((attributes) => unique(attributes.map((attribute) => attribute.id))),
  ),
  options: Schema.NonEmptyArray(
    Schema.Struct({
      id,
      title: text(128),
      summary: Schema.optionalKey(text(512)),
      values: Schema.Record(Schema.String, text(512)),
      recommended: Schema.optionalKey(text(512)),
      choice: Schema.optionalKey(
        Schema.String.check(
          Schema.makeFilter((value) => parseMarkdownChoiceHref(`choice:${value}`) !== null),
        ),
      ),
    }),
  ).check(
    Schema.isMinLength(2),
    Schema.isMaxLength(4),
    Schema.makeFilter((options) => unique(options.map((option) => option.id))),
    Schema.makeFilter((options) =>
      unique(options.flatMap((option) => (option.choice ? [option.choice] : []))),
    ),
    Schema.makeFilter(
      (options) =>
        new Set(options.flatMap((option) => (option.choice ? [option.choice.split("/")[0]] : [])))
          .size <= 1,
    ),
  ),
}).check(
  Schema.makeFilter((compare) => {
    const known = new Set(compare.attributes.map((attribute) => attribute.id));
    return compare.options.every((option) =>
      Object.keys(option.values).every((key) => known.has(key)),
    );
  }),
);
const decode = Schema.decodeUnknownSync(MarkdownCompare, { onExcessProperty: "error" });

export function parseMarkdownCompare(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownCompareDefinition = NonNullable<ReturnType<typeof parseMarkdownCompare>>;
