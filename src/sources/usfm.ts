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

  const append = (text: string): void => {
    if (current) current.raw += text;
  };
  const close = (): void => {
    if (current) raws.set(current.verse, current.raw);
    current = undefined;
  };

  for (const line of source.split(/\r?\n/)) {
    const marker = /^\\(\+?[a-z]+\d*)(?:\s+|$)(.*)$/.exec(line);
    if (!marker) {
      append(` ${line}`);
      continue;
    }
    const [, name = "", rest = ""] = marker;
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
        if (m[0].startsWith("\\f")) current?.verse.notes.push(footnoteText(m[0]));
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
  return { usfm, verses };
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

let kjvBooks: Map<string, UsfmBook> | undefined;
const kjv = (): Map<string, UsfmBook> => {
  kjvBooks ??= loadCanonicalBooks("kjv");
  return kjvBooks;
};

/** Keyed by OSIS verse id, e.g. "John.3.16". Canonical 66 books only. */
export function loadKjv(): Map<string, VerseText> {
  return toVerseMap(kjv());
}

export function loadBsb(): Map<string, VerseText> {
  return toVerseMap(loadCanonicalBooks("bsb"));
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
