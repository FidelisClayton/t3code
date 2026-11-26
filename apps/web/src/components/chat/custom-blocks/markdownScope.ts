import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownScope = Schema.Struct({
  title: text(256),
  unit: text(64),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      label: text(128),
      count: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0)),
      note: Schema.optionalKey(text(256)),
    }),
  ).check(Schema.isMaxLength(20)),
  overlapping: Schema.optionalKey(Schema.Boolean),
  caveat: Schema.optionalKey(text(1024)),
});
const decode = Schema.decodeUnknownSync(MarkdownScope, { onExcessProperty: "error" });

export function parseMarkdownScope(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownScopeDefinition = NonNullable<ReturnType<typeof parseMarkdownScope>>;
