import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownStatus = Schema.Struct({
  title: text(256),
  attention: Schema.Literals(["none", "optional"]),
  state: Schema.Literals(["planned", "in_progress", "done", "unknown"]),
  body: text(8192),
  default: Schema.optionalKey(text(512)),
  notes: Schema.optionalKey(
    Schema.NonEmptyArray(
      Schema.Struct({
        kind: Schema.Literals(["tradeoff", "reversible", "correction"]),
        text: text(512),
        detail: Schema.optionalKey(text(8192)),
      }),
    ).check(Schema.isMaxLength(6)),
  ),
});
const decode = Schema.decodeUnknownSync(MarkdownStatus, { onExcessProperty: "error" });

export function parseMarkdownStatus(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownStatusDefinition = NonNullable<ReturnType<typeof parseMarkdownStatus>>;
