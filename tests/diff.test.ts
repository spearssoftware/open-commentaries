import { expect, test } from "bun:test";
import { readSections } from "../src/ingest/ingest.ts";
import { diffWords } from "../src/local-review/diff.ts";
import { sourceTexts } from "../src/local-review/source.ts";

test("word diff marks removed and added words and keeps the rest", () => {
  expect(diffWords("Verses 1-5 The plainest reason why", "The plainest reason, why")).toEqual([
    { type: "del", text: "Verses 1-5" },
    { type: "same", text: "The plainest" },
    { type: "add", text: "reason," },
    { type: "del", text: "reason" },
    { type: "same", text: "why" },
  ]);
  expect(diffWords("same words", "same  words")).toEqual([{ type: "same", text: "same words" }]);
});

test("ingest changes no section's source text except removing verse labels and chapter titles", () => {
  const sections = readSections("John");
  const sources = sourceTexts("John", sections);
  const unexpected = sections.flatMap((s) => {
    const source = sources[s.id];
    if (!source) return [`${s.id}: no source entry`];
    return diffWords(source, [s.heading, s.original_text].filter(Boolean).join(" "))
      .filter((o) => o.type !== "same")
      .filter(
        (o) => !(o.type === "del" && /^(Verses? [\d, -]+|Chapter \d+|\d+ Chapter)$/.test(o.text)),
      )
      .map((o) => `${s.id}: ${o.type} "${o.text}"`);
  });
  expect(unexpected).toEqual([]);
});
