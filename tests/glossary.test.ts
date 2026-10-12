import { expect, test } from "bun:test";
import {
  type CandidatesFile,
  loadCandidates,
  mergeReply,
  readCandidates,
} from "../src/glossary/candidates.ts";
import {
  checkGlossaries,
  contentHash,
  type Glossaries,
  PROTECTED,
  readGlossaries,
  unapproved,
} from "../src/glossary/check.ts";

const candidates = loadCandidates();

const emptyCandidates = (): CandidatesFile => ({
  book: "Test",
  prompt_version: "test",
  models: {},
  calls: [],
  candidates: [],
});

test("collecting another book's candidates refuses to overwrite the committed file", () => {
  expect(() => readCandidates("Mark")).toThrow("move it aside");
});

test("committed glossaries are well-formed, lock every protected word, and cover every theological candidate", () => {
  expect(checkGlossaries(readGlossaries(), candidates)).toEqual([]);
});

test("candidates come from both model families for every chapter", () => {
  const chapters = new Set(candidates.calls.map((c) => c.chapter));
  for (const chapter of chapters) {
    expect(
      candidates.calls
        .filter((c) => c.chapter === chapter)
        .map((c) => c.family)
        .sort(),
    ).toEqual(["claude", "gpt"]);
  }
  expect(chapters.size).toBe(22);
});

const minimal = (): Glossaries => ({
  locked: {
    approved: null,
    entries: PROTECTED.map((term) => ({ term, kind: "protected" as const, forms: [term] })),
    allowed_to_change: [{ term: "doctrine", reason: "common word" }],
  },
  drift: {
    approved: null,
    entries: [
      { word: "prevent", forms: ["prevent"], sense: "go before", replacements: ["go before"] },
    ],
  },
  strength: {
    approved: null,
    entries: [{ word: "shall", senses: { future: ["will"], obligation: ["must"] } }],
  },
});

test("a missing protected word or an uncovered theological term is reported", () => {
  const g = minimal();
  g.locked.entries = g.locked.entries.filter((e) => e.term !== "the Jews");
  const file = emptyCandidates();
  mergeReply(file, "claude", 1, {
    theological_terms: [
      { term: "Regeneration", note: "" },
      { term: "doctrine", note: "" },
    ],
    drift_words: [],
    strength_words: [],
  });
  expect(checkGlossaries(g, file)).toEqual([
    'locked.json: protected word "the Jews" is missing',
    'theological term "Regeneration" is neither locked nor allowed to change',
  ]);
});

test("shall must record both senses", () => {
  const g = minimal();
  g.strength.entries = [{ word: "shall", equivalents: ["will"] }];
  expect(checkGlossaries(g)).toContain(
    'strength.json: "shall" needs senses.future and senses.obligation',
  );
});

test("merging counts each family's reports and keeps chapters", () => {
  const file = emptyCandidates();
  const reply = {
    theological_terms: [{ term: "Grace", note: "n" }],
    drift_words: [],
    strength_words: [],
  };
  mergeReply(file, "claude", 1, reply);
  mergeReply(file, "gpt", 2, { ...reply, theological_terms: [{ term: "grace", note: "m" }] });
  expect(file.candidates).toHaveLength(1);
  expect(file.candidates[0]?.found_by).toEqual({ claude: 1, gpt: 1 });
  expect(file.candidates[0]?.chapters).toEqual([1, 2]);
});

test("approval lapses when a glossary's content changes", () => {
  const g = minimal();
  for (const file of [g.locked, g.drift, g.strength]) {
    file.approved = "2026-10-12";
    file.approved_hash = contentHash(file);
  }
  expect(unapproved(g)).toEqual([]);
  g.drift.entries[0]?.replacements.push("anticipate");
  expect(unapproved(g)).toEqual(["drift.json"]);
});
