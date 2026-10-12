// Builds section state files for one book of Henry's Concise Commentary.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MHCC_EDITION, openMhccNt } from "../sources/mhcc.ts";
import { type ParsedEntry, parseEntry, parseLabel, type TextBlock } from "../sources/osis.ts";
import { loadBsb, loadKjv } from "../sources/usfm.ts";
import type { SectionKind, SectionState } from "../types.ts";
import { buildKjvIndex, detectQuotes, type KjvIndex } from "./kjvSpans.ts";
import { collectReferences } from "./references.ts";
import { splitSentences } from "./sentences.ts";

export const COMMENTARY_ID = "matthew-henry-concise";
export const DATA_DIR = join(import.meta.dir, "../../data", COMMENTARY_ID);

/**
 * Source label errors corrected at ingest, keyed by the entry's first verse. Each correction is
 * logged in ERRATA.md; the entry's text is unchanged, only its verse range.
 */
export const RANGE_CORRECTIONS: Record<string, { label: string; osisEnd: string }> = {
  // Printed "Verses 1-8", but the comment runs through 3:21 (the chapter outline gives 1-21 and
  // the module's 3:9-21 slots are empty).
  "John.3.1": { label: "1-8", osisEnd: "John.3.21" },
};

interface Draft {
  kind: SectionKind;
  osisStart: string;
  osisEnd: string;
  chapter: number;
  block: TextBlock;
}

function chapterOf(osis: string): number {
  return Number(osis.split(".")[1] ?? 0);
}

function verseOf(osis: string): number {
  return Number(osis.split(".")[2] ?? 0);
}

/** Splits a book's module entries into intro and comment drafts in source order. */
export function draftSections(book: string): Draft[] {
  const drafts: Draft[] = [];
  const sections = openMhccNt().sections(book);
  sections.forEach((entry, i) => {
    const parsed: ParsedEntry = parseEntry(entry.raw, entry.osisStart);
    const chapter = chapterOf(entry.osisStart);
    if (parsed.bookIntro) {
      if (i !== 0) throw new Error(`${entry.osisStart}: book introduction in a later entry`);
      drafts.push({
        kind: "intro",
        osisStart: book,
        osisEnd: book,
        chapter: 0,
        block: parsed.bookIntro,
      });
    }
    if (parsed.chapterTitle !== null && parsed.chapterTitle !== chapter) {
      throw new Error(
        `${entry.osisStart}: "Chapter ${parsed.chapterTitle}" title in chapter ${chapter}`,
      );
    }
    if (parsed.chapterIntro) {
      const id = `${book}.${chapter}`;
      drafts.push({
        kind: "intro",
        osisStart: id,
        osisEnd: id,
        chapter,
        block: parsed.chapterIntro,
      });
    }
    if (parsed.label === null) throw new Error(`${entry.osisStart}: entry has no "Verses" label`);
    const { start, end } = parseLabel(parsed.label);
    const labelled = `${book}.${chapter}.${start}-${book}.${chapter}.${end}`;
    if (labelled !== `${entry.osisStart}-${entry.osisEnd}`) {
      throw new Error(
        `${entry.osisStart}: label "Verses ${parsed.label}" disagrees with linked range ${entry.osisStart}-${entry.osisEnd}`,
      );
    }
    let osisEnd = entry.osisEnd;
    const correction = RANGE_CORRECTIONS[entry.osisStart];
    if (correction) {
      if (correction.label !== parsed.label) {
        throw new Error(
          `${entry.osisStart}: correction expects label "${correction.label}"; source changed`,
        );
      }
      const next = sections[i + 1];
      if (
        next &&
        chapterOf(next.osisStart) === chapterOf(correction.osisEnd) &&
        verseOf(next.osisStart) <= verseOf(correction.osisEnd)
      ) {
        throw new Error(`${entry.osisStart}: corrected range overlaps ${next.osisStart}`);
      }
      osisEnd = correction.osisEnd;
    }
    drafts.push({
      kind: "comment",
      osisStart: entry.osisStart,
      osisEnd,
      chapter,
      block: parsed.body,
    });
  });
  return drafts;
}

let sources:
  | { index: KjvIndex; kjv: ReturnType<typeof loadKjv>; bsb: ReturnType<typeof loadBsb> }
  | undefined;

function loadSources() {
  if (!sources) {
    const kjv = loadKjv();
    sources = { kjv, bsb: loadBsb(), index: buildKjvIndex(kjv) };
  }
  return sources;
}

export function buildSections(book: string): SectionState[] {
  const { index, kjv, bsb } = loadSources();
  return draftSections(book).map((d, i): SectionState => {
    const references = collectReferences(d.block.text, book, d.chapter, d.block.refs);
    const near = [
      { book, chapter: d.chapter },
      ...references.map((r) => {
        const [b = "", c = "0"] = r.osis.split(".");
        return { book: b, chapter: Number(c) };
      }),
    ];
    return {
      id: `${COMMENTARY_ID}:${d.osisStart}-${d.osisEnd}`,
      commentary_id: COMMENTARY_ID,
      kind: d.kind,
      seq: i + 1,
      osis_start: d.osisStart,
      osis_end: d.osisEnd,
      chapter: d.chapter,
      heading: d.block.heading,
      original_text: d.block.text,
      original_sentences: splitSentences(d.block.text),
      references,
      quotes: detectQuotes(d.block.text, index, kjv, bsb, near),
      claims: [],
      modern_heading: null,
      modern_sentences: [],
      modern_text: null,
      text_hash: null,
      rule_checks: [],
      rounds: [],
      review_status: "unreviewed",
      ai_modernized: false,
      human_edited: false,
      tags: [],
      editorial_note: null,
      provenance: {
        prompt_versions: {},
        modernizer_model: null,
        verifier_model: null,
        source_edition: MHCC_EDITION,
        generated_at: null,
      },
      reviews: [],
    };
  });
}

export function sectionFileName(s: SectionState): string {
  const range = s.osis_start === s.osis_end ? s.osis_start : `${s.osis_start}-${s.osis_end}`;
  return `${String(s.seq).padStart(3, "0")}-${range}.json`;
}

export function readSections(book: string, dir = join(DATA_DIR, book)): SectionState[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as SectionState);
}

/**
 * Writes state files. Unchanged files are left alone; a file whose section has moved past
 * "unreviewed" or has recorded reviews is never overwritten.
 */
export function writeSections(
  book: string,
  sections: SectionState[],
  dir = join(DATA_DIR, book),
): { written: number; unchanged: number } {
  mkdirSync(dir, { recursive: true });
  const existing = new Map(readSections(book, dir).map((s) => [s.id, s]));
  const blocked = sections.filter((s) => {
    const prev = existing.get(s.id);
    return prev && (prev.review_status !== "unreviewed" || prev.reviews.length > 0);
  });
  if (blocked.length) {
    throw new Error(
      `Refusing to re-ingest ${blocked.length} section(s) past "unreviewed" or with reviews, e.g. ${blocked[0]?.id}`,
    );
  }
  const expected = new Set(sections.map(sectionFileName));
  const stray = readdirSync(dir).filter((f) => f.endsWith(".json") && !expected.has(f));
  if (stray.length) {
    throw new Error(
      `${dir} has files ingest would not produce: ${stray.join(", ")}; remove them first`,
    );
  }
  let written = 0;
  for (const s of sections) {
    const path = join(dir, sectionFileName(s));
    const json = `${JSON.stringify(s, null, 2)}\n`;
    if (existsSync(path) && readFileSync(path, "utf8") === json) continue;
    writeFileSync(path, json);
    written++;
  }
  return { written, unchanged: sections.length - written };
}
