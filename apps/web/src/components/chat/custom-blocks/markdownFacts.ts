import * as Schema from "effect/Schema";

/** Lucide icon names an agent may use; the prompt lists the same set. */
const FACT_ICONS = [
  "circle-x",
  "triangle-alert",
  "info",
  "circle-check",
  "git-pull-request",
  "git-branch",
  "package",
  "key-round",
  "files",
  "file-code",
  "wrench",
  "database",
  "server",
  "shield",
  "clock",
  "bug",
  "gauge",
  "terminal",
  "link",
  "users",
] as const;
export type FactIcon = (typeof FACT_ICONS)[number];

const FACT_TONES = ["problem", "warn", "info", "ok"] as const;
export type FactTone = (typeof FACT_TONES)[number];

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const MarkdownFacts = Schema.Struct({
  title: Schema.optionalKey(text(128)),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      title: text(128),
      brief: text(280),
      details: Schema.optionalKey(text(8192)),
      tone: Schema.optionalKey(Schema.Literals(FACT_TONES)),
      icon: Schema.optionalKey(Schema.Literals(FACT_ICONS)),
    }),
  ).check(Schema.isMaxLength(12)),
});
const decode = Schema.decodeUnknownSync(MarkdownFacts, { onExcessProperty: "error" });

export function parseMarkdownFacts(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownFactsDefinition = NonNullable<ReturnType<typeof parseMarkdownFacts>>;

/** Counts per tone in severity order, leaving out tones no item uses and untoned items. */
export function factToneCounts(items: MarkdownFactsDefinition["items"]) {
  return FACT_TONES.map((tone) => ({
    tone,
    count: items.filter((item) => item.tone === tone).length,
  })).filter((entry) => entry.count > 0);
}
