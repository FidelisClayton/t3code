import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownRisks = Schema.Struct({
  title: Schema.optionalKey(text(256)),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      title: text(256),
      impact: text(1024),
      mitigation: Schema.optionalKey(text(1024)),
      evidence: Schema.Literals(["verified", "reported", "unverified"]),
      severity: Schema.optionalKey(Schema.Literals(["low", "medium", "high"])),
    }),
  ).check(Schema.isMaxLength(12)),
});
const decode = Schema.decodeUnknownSync(MarkdownRisks, { onExcessProperty: "error" });

export function parseMarkdownRisks(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownRisksDefinition = NonNullable<ReturnType<typeof parseMarkdownRisks>>;
