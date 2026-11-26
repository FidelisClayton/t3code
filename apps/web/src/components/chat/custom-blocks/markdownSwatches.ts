import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownSwatches = Schema.Struct({
  title: Schema.optionalKey(text(256)),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      label: text(128),
      role: text(256),
      hex: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))),
      illustrative: Schema.optionalKey(Schema.Boolean),
    }),
  ).check(Schema.isMaxLength(12)),
});
const decode = Schema.decodeUnknownSync(MarkdownSwatches, { onExcessProperty: "error" });

export function parseMarkdownSwatches(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownSwatchesDefinition = NonNullable<ReturnType<typeof parseMarkdownSwatches>>;
