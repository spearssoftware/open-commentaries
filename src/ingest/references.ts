// Scripture references in a section, in text order. Marked-up references use their osisRef;
// plain-text ones ("ver. 16", "v. 5", "ch. 3:5", "ch. iii.", "Joh 1:14") are resolved against the
// section's book and chapter.
import { bookByAbbreviation } from "../bible/books.ts";
import type { RefSpan } from "../sources/osis.ts";
import type { Reference } from "../types.ts";

export interface ParsedReference {
  start: number;
  end: number;
  osis: string;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

export function romanToNumber(roman: string): number {
  const digits = [...roman.toLowerCase()].map((c) => ROMAN[c] ?? Number.NaN);
  return digits.reduce((sum, d, i) => sum + (d < (digits[i + 1] ?? 0) ? -d : d), 0);
}

function verseRange(book: string, chapter: number, from: number, to?: number): string {
  const start = `${book}.${chapter}.${from}`;
  return to === undefined || to === from ? start : `${start}-${book}.${chapter}.${to}`;
}

const NUM = String.raw`(\d+)(?:\s*[-–]\s*(\d+))?`;
const PATTERNS: {
  re: RegExp;
  resolve: (m: RegExpMatchArray, book: string, chapter: number) => string | null;
}[] = [
  {
    // "ch. 21:22", "ch. 3:5-8"
    re: new RegExp(String.raw`\bch(?:ap)?\.\s*(\d+):${NUM}`, "g"),
    resolve: (m, book) =>
      verseRange(book, Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined),
  },
  {
    // "ch. iii.", "ch. 3"
    re: /\bch(?:ap)?\.\s*([ivxlc]+|\d+)\b(?!:)/g,
    resolve: (m, book) => {
      const raw = m[1] ?? "";
      const n = /^\d+$/.test(raw) ? Number(raw) : romanToNumber(raw);
      return Number.isNaN(n) || n === 0 ? null : `${book}.${n}`;
    },
  },
  {
    // "ver. 16", "v. 5", "ver. 11-13", "ver. #(11-13)" (a conversion artifact in the source)
    re: new RegExp(String.raw`\b(?:ver|vs|v)\.\s*#?\(?${NUM}\)?`, "g"),
    // The book introduction (chapter 0) has no chapter to resolve a bare verse against.
    resolve: (m, book, chapter) =>
      chapter === 0
        ? null
        : verseRange(book, chapter, Number(m[1]), m[2] ? Number(m[2]) : undefined),
  },
  {
    // "Joh 1:14", "1Pe 1:23", "Ps. 23:1"
    re: new RegExp(String.raw`\b([1-3]?[A-Z][a-z]{0,4})\.?\s(\d+):${NUM}`, "g"),
    resolve: (m) => {
      const book = bookByAbbreviation(m[1] ?? "");
      if (!book) return null;
      return verseRange(book.osis, Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : undefined);
    },
  },
];

/** Finds plain-text references outside the given marked-up spans. */
export function parsePlainReferences(
  text: string,
  book: string,
  chapter: number,
  marked: RefSpan[] = [],
): ParsedReference[] {
  const taken = marked.map((r) => [r.start, r.end] as const);
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const found: ParsedReference[] = [];
  for (const { re, resolve } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const osis = resolve(m, book, chapter);
      if (!osis) continue;
      found.push({ start, end, osis });
      taken.push([start, end]);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** All references of a section in text order, deduplicated. */
export function collectReferences(
  text: string,
  book: string,
  chapter: number,
  marked: RefSpan[],
): Reference[] {
  const all = [
    ...marked.map((r) => ({ start: r.start, osis: r.osisRef })),
    ...parsePlainReferences(text, book, chapter, marked),
  ].sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const refs: Reference[] = [];
  for (const { osis } of all) {
    if (seen.has(osis)) continue;
    seen.add(osis);
    refs.push({ osis, inferred: false });
  }
  return refs;
}
