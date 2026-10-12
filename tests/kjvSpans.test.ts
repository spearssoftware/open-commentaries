import { expect, test } from "bun:test";
import { detectQuotes, loadQuoteSources } from "../src/ingest/kjvSpans.ts";

const sources = loadQuoteSources();
const near = [{ book: "John", chapter: 3 }];

test("exact quotation within one verse", () => {
  const [q] = detectQuotes(
    "Christ said, The wind bloweth where it listeth; so it is.",
    sources,
    near,
  );
  expect(q?.span).toBe("wind bloweth where it listeth");
  expect(q?.osis).toBe("John.3.8");
  expect(q?.kjv_match).toBe("exact");
  expect(q?.kjv_text).toStartWith("The wind bloweth where it listeth");
  expect(q?.bsb_text).toStartWith("The wind blows where it wishes");
});

test("a quotation crossing a verse boundary is found", () => {
  const [q] = detectQuotes(
    "For the Word was God; the same was in the beginning with God. Amen.",
    sources,
    [{ book: "John", chapter: 1 }],
  );
  expect(q?.osis).toBe("John.1.1-John.1.2");
  expect(q?.kjv_match).toBe("exact");
});

test("common phrases and runs across a sentence end are not quotations", () => {
  const text =
    "He came to do the work of the Father. Here he is the Son of man indeed. The Word was with God. All things were made by him.";
  const quotes = detectQuotes(text, sources, [{ book: "John", chapter: 1 }]);
  expect(quotes.map((q) => q.span)).toEqual([]);
});

test("a small change in wording merges into one loose span", () => {
  const [q] = detectQuotes(
    "For God so loved the world, that he gave his only Son, that whosoever believeth in him should not perish.",
    sources,
    near,
  );
  expect(q?.osis).toBe("John.3.16");
  expect(q?.kjv_match).toBe("loose");
  expect(q?.span).toStartWith("God so loved the world");
});

test("a quoted passage that matches nothing is recorded with kjv_match none", () => {
  const quotes = detectQuotes('God is the "HE THAT IS," and heaven his dwelling.', sources, near);
  expect(quotes).toEqual([
    {
      span: "HE THAT IS,",
      osis: null,
      source: "code",
      kjv_match: "none",
      kjv_text: null,
      bsb_text: null,
      bsb_note: null,
    },
  ]);
});

test("John 5:4 has no BSB text but carries the 5:3 footnote", () => {
  const [q] = detectQuotes(
    "For an angel went down at a certain season into the pool, and troubled the water.",
    sources,
    [{ book: "John", chapter: 5 }],
  );
  expect(q?.osis).toBe("John.5.4");
  expect(q?.bsb_text).toBeNull();
  expect(q?.bsb_note).toContain("awaiting the moving of the waters");
  expect(q?.bsb_note).not.toContain("Literally");
});

test("John 8 keeps its BSB text and the 7:52 note", () => {
  const [q] = detectQuotes(
    "He that is without sin among you, let him first cast a stone.",
    sources,
    [{ book: "John", chapter: 8 }],
  );
  expect(q?.osis).toBe("John.8.7");
  expect(q?.bsb_text).not.toBeNull();
  expect(q?.bsb_note).toContain("do not include");
});
