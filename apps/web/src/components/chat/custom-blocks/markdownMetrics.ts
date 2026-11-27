import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownMetrics = Schema.Struct({
  items: Schema.NonEmptyArray(
    Schema.Struct({
      label: text(128),
      value: text(32),
      qualifier: Schema.optionalKey(text(256)),
      tone: Schema.optionalKey(Schema.Literals(["good", "warn", "bad"])),
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

// "+14.419 / −185" or "+1,234 −56": a plus count and a minus count, GitHub diff style.
const DIFF_VALUE = /^(\+\d[\d.,]*)(\s*\/\s*|\s+)([-−]\d[\d.,]*)$/;

export function parseDiffValue(value: string) {
  const match = DIFF_VALUE.exec(value.trim());
  return match ? { added: match[1]!, separator: match[2]!, removed: match[3]! } : null;
}
