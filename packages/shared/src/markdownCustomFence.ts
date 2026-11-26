const PRESENTATION_FENCES = new Set([
  "reference",
  "recap",
  "form",
  "next",
  "compare",
  "steps",
  "metrics",
  "scope",
  "risks",
  "status",
  "swatches",
  "resources",
]);

export function isPendingMarkdownComponent(language: string, meta: string | undefined): boolean {
  return (
    (PRESENTATION_FENCES.has(language) && meta === undefined) ||
    (language === "html" && meta === "render")
  );
}
