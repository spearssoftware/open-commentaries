import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKS, bookByUsfm } from "../bible/books";
import { SOURCES_DIR } from "./manifest";

export interface UsfmVerse {
  chapter: number;
  verse: number;
  text: string;
  notes: string[];
}

export interface UsfmBook {
  usfm: string;
  verses: UsfmVerse[];
  /** Footnotes that quote a verse (`\fv N\fv*`) the text itself omits, e.g. BSB John 5:4. */
  omissions: { chapter: number; verse: number; note: string }[];
}

export interface VerseText {
  text: string;
  notes: string[];
}

const HEADING = /^(id|ide|h\d?|toc\d|mt\d?|imt\d?|ms\d?|mr|s\d?|r|d|cl|usfm|rem|sp|is\d?|ip|qa)$/;
const PARAGRAPH = /^(p|m|mi|pi\d?|pc|pmo|pmc|pmr|nb|b|q\d?|qr|qc|qm\d?|li\d?|lim\d?)$/;
const CHARACTER = /^(w|add|wj|nd|qs|sc|it|bd|bdit|em|sup|tl|ref|k)$/;

const SEGMENT = /\\f\s.*?\\f\*|\\x\s.*?\\x\*|\\v\s+(\S+)/gs;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripMarkers(s: string): string {
  return collapse(
    s
      .replace(/\|[^\\]*/g, "")
      .replace(/\\\+?[a-z]+\d*\*/g, "")
      .replace(/\\\+?[a-z]+\d*\s?/g, "")
      .replace(/¶/g, ""),
  );
}

function footnoteText(footnote: string): string {
  const inner = footnote
    .slice(2, -3)
    .replace(/^\s*\S\s/, "")
    .replace(/\\fr\s+[^\\]*/g, "")
    .replace(/\\fv\s+(\S+?)\\fv\*/g, "$1 ");
  return stripMarkers(inner);
}

export function parseUsfm(source: string): UsfmBook {
  const usfm = /^\\id\s+(\S+)/m.exec(source)?.[1];
  if (!usfm) throw new Error("USFM source has no \\id line.");

  const verses: UsfmVerse[] = [];
  let chapter = 0;
  let current: { verse: UsfmVerse; raw: string } | undefined;
  const raws = new Map<UsfmVerse, string>();
  const quoted: UsfmBook["omissions"] = [];

  const append = (text: string): void => {
    if (current) current.raw += text;
  };
  const close = (): void => {
    if (current) raws.set(current.verse, current.raw);
    current = undefined;
  };

  // A line without a leading marker continues the previous one: verse text, or a heading being skipped.
  let inHeading = false;
  for (const line of source.split(/\r?\n/)) {
    const notesOpened = (line.match(/\\[fx]\s/g) ?? []).length;
    const notesClosed = (line.match(/\\[fx]\*/g) ?? []).length;
    if (notesOpened !== notesClosed) {
      throw new Error(
        `A footnote or cross-reference spans lines in ${usfm} chapter ${chapter}; the parser expects one line.`,
      );
    }
    const marker = /^\\(\+?[a-z]+\d*)(?:\s+|$)(.*)$/.exec(line);
    if (!marker) {
      if (!inHeading) append(` ${line}`);
      continue;
    }
    const [, name = "", rest = ""] = marker;
    inHeading = HEADING.test(name);
    let body = rest;
    if (name === "c") {
      close();
      chapter = Number(rest.trim());
      continue;
    }
    if (HEADING.test(name)) continue;
    if (name === "v" || CHARACTER.test(name)) body = line;
    else if (!PARAGRAPH.test(name)) {
      throw new Error(`Unknown USFM marker \\${name} in ${usfm} chapter ${chapter}.`);
    }

    append(" ");
    let last = 0;
    for (const m of body.matchAll(SEGMENT)) {
      append(body.slice(last, m.index));
      last = m.index + m[0].length;
      const num = m[1];
      if (num === undefined) {
        if (m[0].startsWith("\\f")) {
          const note = footnoteText(m[0]);
          current?.verse.notes.push(note);
          for (const fv of m[0].matchAll(/\\fv\s+(\d+)\\fv\*/g)) {
            quoted.push({ chapter, verse: Number(fv[1]), note });
          }
        }
        continue;
      }
      if (!/^\d+$/.test(num)) {
        throw new Error(`Unsupported verse number "${num}" in ${usfm} chapter ${chapter}.`);
      }
      close();
      const verse: UsfmVerse = { chapter, verse: Number(num), text: "", notes: [] };
      verses.push(verse);
      current = { verse, raw: "" };
    }
    append(body.slice(last));
  }
  close();

  for (const v of verses) v.text = stripMarkers(raws.get(v) ?? "");
  const present = new Set(verses.map((v) => `${v.chapter}:${v.verse}`));
  const omissions = quoted.filter((q) => !present.has(`${q.chapter}:${q.verse}`));
  return { usfm, verses, omissions };
}

function usfmFiles(dir: string): string[] {
  return readdirSync(join(SOURCES_DIR, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".usfm"))
    .sort()
    .map((f) => join(SOURCES_DIR, dir, f));
}

function loadCanonicalBooks(dir: string): Map<string, UsfmBook> {
  const books = new Map<string, UsfmBook>();
  for (const file of usfmFiles(dir)) {
    const source = readFileSync(file, "utf8");
    const id = /^\\id\s+(\S+)/m.exec(source)?.[1];
    if (id && bookByUsfm(id)) books.set(id, parseUsfm(source));
  }
  return books;
}

function toVerseMap(books: Map<string, UsfmBook>): Map<string, VerseText> {
  const map = new Map<string, VerseText>();
  for (const book of BOOKS) {
    for (const v of books.get(book.usfm)?.verses ?? []) {
      map.set(`${book.osis}.${v.chapter}.${v.verse}`, { text: v.text, notes: v.notes });
    }
  }
  return map;
}

const cache = new Map<string, Map<string, UsfmBook>>();
const books = (dir: "kjv" | "bsb"): Map<string, UsfmBook> => {
  let loaded = cache.get(dir);
  if (!loaded) {
    loaded = loadCanonicalBooks(dir);
    cache.set(dir, loaded);
  }
  return loaded;
};
const kjv = () => books("kjv");

let kjvMap: Map<string, VerseText> | undefined;
let bsbMap: Map<string, VerseText> | undefined;

/** Keyed by OSIS verse id, e.g. "John.3.16". Canonical 66 books only. Shared; do not mutate. */
export function loadKjv(): Map<string, VerseText> {
  kjvMap ??= toVerseMap(kjv());
  return kjvMap;
}

/** Keyed by OSIS verse id. Verses the BSB omits are absent. Shared; do not mutate. */
export function loadBsb(): Map<string, VerseText> {
  bsbMap ??= toVerseMap(books("bsb"));
  return bsbMap;
}

/**
 * Passages the BSB prints but footnotes as text-critical, with the verse whose footnote explains
 * them. Omitted verses need no entry: their footnote is found through `\fv`.
 */
const BSB_PASSAGE_NOTES: { verses: string[]; noteFrom: string; match: string }[] = [
  {
    verses: ["John.7.53", ...Array.from({ length: 11 }, (_, i) => `John.8.${i + 1}`)],
    noteFrom: "John.7.52",
    match: "do not include",
  },
];

/** Text-critical BSB notes keyed by OSIS verse id: omitted verses and footnoted passages. */
export function loadBsbNotes(): Map<string, string> {
  const notes = new Map<string, string>();
  for (const book of BOOKS) {
    for (const o of books("bsb").get(book.usfm)?.omissions ?? []) {
      notes.set(`${book.osis}.${o.chapter}.${o.verse}`, o.note);
    }
  }
  const bsb = loadBsb();
  for (const { verses, noteFrom, match } of BSB_PASSAGE_NOTES) {
    const note = bsb.get(noteFrom)?.notes.find((n) => n.includes(match));
    if (!note) throw new Error(`BSB ${noteFrom} has no footnote containing "${match}"`);
    for (const v of verses) notes.set(v, note);
  }
  return notes;
}

/** Verse count per chapter for each canonical book, derived from the KJV USFM, in BOOKS order. */
export function kjvVersification(): { osis: string; verses: number[] }[] {
  return BOOKS.map((book) => {
    const verses: number[] = [];
    for (const v of kjv().get(book.usfm)?.verses ?? []) {
      verses[v.chapter - 1] = Math.max(verses[v.chapter - 1] ?? 0, v.verse);
    }
    return { osis: book.osis, verses: Array.from(verses, (n) => n ?? 0) };
  });
}
