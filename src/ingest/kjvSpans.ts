// Detects KJV quotations in Henry's text.
//
// Each KJV chapter is indexed as one continuous stream of normalized words, keyed by 6-word
// shingles, so a quotation that crosses a verse boundary is still found. Runs of matching words
// are extended to their maximum; runs separated by a small gap in both texts are merged into one
// "loose" span (Henry's wording differs slightly). Ambiguous runs resolve to the location nearest
// the section's own references; a tie that remains is recorded without an OSIS reference.
import { BOOKS } from "../bible/books.ts";
import { loadBsb, loadBsbNotes, loadKjv, type VerseText } from "../sources/usfm.ts";
import type { KjvMatch, Quote } from "../types.ts";
import { splitSentences } from "./sentences.ts";

export const SHINGLE = 6;
const MAX_GAP = 3;

interface Word {
  norm: string;
  start: number;
  end: number;
  /** Index of the sentence in Henry's text; quotation runs never cross sentences. */
  sentence: number;
}

/** Start offset of each sentence, as the sentence splitter divides the text. */
function sentenceStarts(text: string): number[] {
  const starts: number[] = [];
  let from = 0;
  for (const sentence of splitSentences(text)) {
    const at = text.indexOf(sentence, from);
    starts.push(at);
    from = at + sentence.length;
  }
  return starts;
}

export function words(text: string): Word[] {
  const starts = sentenceStarts(text);
  let sentence = 0;
  return [...text.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g)].map((m) => {
    while ((starts[sentence + 1] ?? Number.POSITIVE_INFINITY) <= m.index) sentence++;
    return {
      norm: m[0].toLowerCase().replace(/['’]/g, ""),
      start: m.index,
      end: m.index + m[0].length,
      sentence,
    };
  });
}

/**
 * Words that cannot begin or end a quotation span. Trimming them keeps common connective phrases
 * ("to do the work of the") from passing as quotations; "all", "not", and the like stay because
 * they carry a claim's strength.
 */
const FUNCTION_WORDS = new Set(
  "the a an and or but of to in on at by for with from that this these those it is are was were be been he she they we you i his her its their our my me him them us as so which who whom what may shall will do did have hath has had there then unto into upon".split(
    " ",
  ),
);

/** After trimming, a kept span needs this many words, of which MIN_CONTENT_WORDS are not function words. */
const MIN_TRIMMED_WORDS = 5;
const MIN_CONTENT_WORDS = 3;

interface Chapter {
  book: string;
  chapter: number;
  words: string[];
  /** Verse number of each word. */
  verses: number[];
}

export interface KjvIndex {
  chapters: Chapter[];
  shingles: Map<string, { chapter: number; pos: number }[]>;
}

export function buildKjvIndex(kjv: Map<string, VerseText>): KjvIndex {
  const chapters: Chapter[] = [];
  const byKey = new Map<string, Chapter>();
  for (const [osis, { text }] of kjv) {
    const [book = "", ch = "", verse = ""] = osis.split(".");
    const key = `${book}.${ch}`;
    let chapter = byKey.get(key);
    if (!chapter) {
      chapter = { book, chapter: Number(ch), words: [], verses: [] };
      byKey.set(key, chapter);
      chapters.push(chapter);
    }
    for (const w of words(text)) {
      chapter.words.push(w.norm);
      chapter.verses.push(Number(verse));
    }
  }
  const shingles = new Map<string, { chapter: number; pos: number }[]>();
  chapters.forEach((c, ci) => {
    for (let pos = 0; pos + SHINGLE <= c.words.length; pos++) {
      const key = c.words.slice(pos, pos + SHINGLE).join(" ");
      const list = shingles.get(key);
      if (list) list.push({ chapter: ci, pos });
      else shingles.set(key, [{ chapter: ci, pos }]);
    }
  });
  return { chapters, shingles };
}

interface Run {
  /** Henry word indices, end exclusive. */
  from: number;
  to: number;
  chapter: number;
  /** KJV word positions, end exclusive. */
  kFrom: number;
  kTo: number;
  loose: boolean;
  ambiguous: boolean;
}

const bookOrder = new Map(BOOKS.map((b, i) => [b.osis, i]));

/** Distance from a KJV location to the nearest of the section's references (smaller is nearer). */
function distance(index: KjvIndex, run: Run, near: { book: string; chapter: number }[]): number {
  const c = index.chapters[run.chapter] as Chapter;
  let best = Number.POSITIVE_INFINITY;
  for (const n of near) {
    if (n.book === c.book) best = Math.min(best, Math.abs(n.chapter - c.chapter));
    else
      best = Math.min(
        best,
        1000 + Math.abs((bookOrder.get(n.book) ?? 0) - (bookOrder.get(c.book) ?? 0)),
      );
  }
  return best;
}

function findRuns(
  index: KjvIndex,
  henry: Word[],
  near: { book: string; chapter: number }[],
): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i + SHINGLE <= henry.length) {
    const sentence = henry[i]?.sentence;
    const shingle = henry.slice(i, i + SHINGLE);
    const hits = shingle.every((w) => w.sentence === sentence)
      ? index.shingles.get(shingle.map((w) => w.norm).join(" "))
      : undefined;
    if (!hits) {
      i++;
      continue;
    }
    const floor = runs.at(-1)?.to ?? 0;
    let candidates: Run[] = hits.map(({ chapter, pos }) => {
      const words = (index.chapters[chapter] as Chapter).words;
      let len = SHINGLE;
      while (henry[i + len]?.sentence === sentence && words[pos + len] === henry[i + len]?.norm)
        len++;
      let back = 0;
      while (
        i - back > floor &&
        pos - back > 0 &&
        henry[i - back - 1]?.sentence === sentence &&
        words[pos - back - 1] === henry[i - back - 1]?.norm
      )
        back++;
      return {
        from: i - back,
        to: i + len,
        chapter,
        kFrom: pos - back,
        kTo: pos + len,
        loose: false,
        ambiguous: false,
      };
    });
    const longest = Math.max(...candidates.map((c) => c.to - c.from));
    candidates = candidates.filter((c) => c.to - c.from === longest);
    const distances = candidates.map((c) => distance(index, c, near));
    const nearest = Math.min(...distances);
    candidates = candidates.filter((_, n) => distances[n] === nearest);
    const run = candidates[0] as Run;
    run.ambiguous = candidates.length > 1;
    runs.push(run);
    i = run.to;
  }
  // Merge runs that continue the same KJV passage after a short gap.
  const merged: Run[] = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    if (
      prev &&
      !prev.ambiguous &&
      !run.ambiguous &&
      prev.chapter === run.chapter &&
      henry[prev.from]?.sentence === henry[run.from]?.sentence &&
      run.from - prev.to <= MAX_GAP &&
      run.kFrom >= prev.kTo &&
      run.kFrom - prev.kTo <= MAX_GAP
    ) {
      prev.to = run.to;
      prev.kTo = run.kTo;
      prev.loose = true;
      continue;
    }
    merged.push(run);
  }
  return merged.flatMap((run) => trimRun(run, henry));
}

/** Drops function words from both ends; returns nothing if too little of substance remains. */
function trimRun(run: Run, henry: Word[]): Run[] {
  const isFunction = (i: number) => FUNCTION_WORDS.has(henry[i]?.norm ?? "");
  while (run.from < run.to && isFunction(run.from)) {
    run.from++;
    run.kFrom++;
  }
  while (run.to > run.from && isFunction(run.to - 1)) {
    run.to--;
    run.kTo--;
  }
  let content = 0;
  for (let i = run.from; i < run.to; i++) if (!isFunction(i)) content++;
  return run.to - run.from >= MIN_TRIMMED_WORDS && content >= MIN_CONTENT_WORDS ? [run] : [];
}

function osisFor(c: Chapter, kFrom: number, kTo: number): { osis: string; verses: string[] } {
  const first = c.verses[kFrom] as number;
  const last = c.verses[kTo - 1] as number;
  const verses: string[] = [];
  for (let v = first; v <= last; v++) verses.push(`${c.book}.${c.chapter}.${v}`);
  const start = verses[0] as string;
  return { osis: first === last ? start : `${start}-${verses.at(-1)}`, verses };
}

export interface QuoteSources {
  index: KjvIndex;
  kjv: Map<string, VerseText>;
  bsb: Map<string, VerseText>;
  /** Text-critical BSB notes by verse (omitted verses and footnoted passages). */
  bsbNotes: Map<string, string>;
}

let sources: QuoteSources | undefined;

/** KJV and BSB text plus the shingle index, built once per process. */
export function loadQuoteSources(): QuoteSources {
  if (!sources) {
    const kjv = loadKjv();
    sources = { index: buildKjvIndex(kjv), kjv, bsb: loadBsb(), bsbNotes: loadBsbNotes() };
  }
  return sources;
}

/** BSB text of the verses present (null when none are), and any text-critical note. */
function bsbFor(
  verses: string[],
  { bsb, bsbNotes }: QuoteSources,
): { text: string | null; note: string | null } {
  const texts = verses.flatMap((v) => bsb.get(v)?.text ?? []);
  const notes = new Set(verses.flatMap((v) => bsbNotes.get(v) ?? []));
  return {
    text: texts.length ? texts.join(" ") : null,
    note: notes.size ? [...notes].join(" ") : null,
  };
}

/**
 * Quotations in `text`: KJV runs of at least six words, plus double-quoted passages of three or
 * more words that match nothing (kjv_match "none").
 */
export function detectQuotes(
  text: string,
  sources: QuoteSources,
  near: { book: string; chapter: number }[],
): Quote[] {
  const { index, kjv } = sources;
  const henry = words(text);
  const found: { start: number; end: number; quote: Quote }[] = [];
  for (const run of findRuns(index, henry, near)) {
    const start = (henry[run.from] as Word).start;
    const end = (henry[run.to - 1] as Word).end;
    const c = index.chapters[run.chapter] as Chapter;
    const { osis, verses } = osisFor(c, run.kFrom, run.kTo);
    const match: KjvMatch = run.loose || run.ambiguous ? "loose" : "exact";
    // An ambiguous run matches several places equally well, so it gets no reference or verse text.
    const located = run.ambiguous
      ? { osis: null, kjv_text: null, bsb_text: null, bsb_note: null }
      : (() => {
          const b = bsbFor(verses, sources);
          return {
            osis,
            kjv_text: verses.map((v) => kjv.get(v)?.text ?? "").join(" "),
            bsb_text: b.text,
            bsb_note: b.note,
          };
        })();
    found.push({
      start,
      end,
      quote: {
        span: text.slice(start, end),
        osis: located.osis,
        source: "code",
        kjv_match: match,
        kjv_text: located.kjv_text,
        bsb_text: located.bsb_text,
        bsb_note: located.bsb_note,
      },
    });
  }
  for (const m of text.matchAll(/["“]([^"“”]+)["”]/g)) {
    const start = m.index + 1;
    const end = start + (m[1] ?? "").length;
    if (words(m[1] ?? "").length < 3) continue;
    if (found.some((f) => f.start < end && f.end > start)) continue;
    found.push({
      start,
      end,
      quote: {
        span: text.slice(start, end),
        osis: null,
        source: "code",
        kjv_match: "none",
        kjv_text: null,
        bsb_text: null,
        bsb_note: null,
      },
    });
  }
  return found.sort((a, b) => a.start - b.start).map((f) => f.quote);
}
