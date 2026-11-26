import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownRisks } from "./markdownRisks";

const risks = {
  title: "Risks to validate",
  items: [
    {
      title: "Dates",
      impact: "Different calendar library; highest behavior risk",
      mitigation: "Manual QA",
      evidence: "unverified",
      severity: "high",
    },
    { title: "Tailwind / Vite Ruby", impact: "Scanning untested", evidence: "unverified" },
    { title: "Base UI", impact: "Portal bubbling and Select reset issues", evidence: "reported" },
  ],
};
const parse = (value: unknown) => parseMarkdownRisks(JSON.stringify(value));
const first = risks.items[0]!;

describe("Markdown risks", () => {
  it("accepts the migration fixture", () => {
    expect(parse(risks)?.items).toHaveLength(3);
  });
  it("rejects invalid input", () => {
    expect(parseMarkdownRisks("{")).toBeNull();
    expect(parseMarkdownRisks(JSON.stringify(risks) + " ".repeat(65536))).toBeNull();
    expect(parse({ ...risks, extra: 1 })).toBeNull();
    expect(parse({ items: [] })).toBeNull();
    expect(parse({ items: Array.from({ length: 13 }, () => first) })).toBeNull();
    expect(parse({ items: [{ ...first, evidence: "guess" }] })).toBeNull();
    expect(parse({ items: [{ ...first, evidence: undefined }] })).toBeNull();
    expect(parse({ items: [{ ...first, severity: "critical" }] })).toBeNull();
    expect(parse({ items: [{ ...first, impact: " " }] })).toBeNull();
    expect(parse({ items: [{ ...first, extra: 1 }] })).toBeNull();
  });
  it("allows omitted title, mitigation and severity", () => {
    expect(parse({ items: [{ title: "A", impact: "B", evidence: "verified" }] })).not.toBeNull();
  });
});
