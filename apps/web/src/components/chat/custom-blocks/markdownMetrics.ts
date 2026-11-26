import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownMetrics = Schema.Struct({
  items: Schema.NonEmptyArray(
    Schema.Struct({
      label: text(128),
      value: text(32),
      qualifier: Schema.optionalKey(text(256)),
    }),
  ).check(Schema.isMaxLength(4)),
});
const decode = Schema.decodeUnknownSync(MarkdownMetrics, { onExcessProperty: "error" });

export function parseMarkdownMetrics(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownMetricsDefinition = NonNullable<ReturnType<typeof parseMarkdownMetrics>>;
