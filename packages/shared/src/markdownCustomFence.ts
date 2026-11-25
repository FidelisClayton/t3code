export function isPendingMarkdownComponent(language: string, meta: string | undefined): boolean {
  return (
    ((language === "reference" ||
      language === "recap" ||
      language === "form" ||
      language === "next") &&
      meta === undefined) ||
    (language === "html" && meta === "render")
  );
}
