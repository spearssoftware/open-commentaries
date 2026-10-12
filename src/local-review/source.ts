// The source text behind each section, taken straight from the module entry with markup stripped
// and nothing else removed. Deliberately independent of the OSIS parser, so a diff against the
// ingested text shows what ingest actually changed.

import { openMhccNt } from "../sources/mhcc.ts";
import { decodeEntities } from "../sources/osis.ts";
import type { SectionState } from "../types.ts";

const PREVERSE_END = /<div[^>]*subType="x-preverse"[^>]*eID="[^"]*"[^>]*\/>/;
const CHAPTER_TITLE = /<title type="x-s2">/;

// Inline tags vanish; block-level tags become spaces.
const plain = (markup: string) =>
  decodeEntities(markup.replace(/<\/?(?:reference|hi)\b[^>]*>/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** Source text keyed by section id. */
export function sourceTexts(book: string, sections: SectionState[]): Record<string, string> {
  const out: Record<string, string> = {};
  const byStart = new Map(sections.map((s) => [s.osis_start, s]));
  for (const [index, entry] of openMhccNt().sections(book).entries()) {
    const [preverse = "", ...rest] = entry.raw.split(PREVERSE_END);
    const comment = byStart.get(entry.osisStart);
    if (comment) out[comment.id] = plain(rest.length ? rest.join(" ") : entry.raw);
    if (!rest.length) continue;
    const at = preverse.search(CHAPTER_TITLE);
    const bookPart = at < 0 ? preverse : preverse.slice(0, at);
    const chapterPart = at < 0 ? "" : preverse.slice(at);
    const bookIntro = byStart.get(book);
    if (bookIntro && index === 0 && plain(bookPart)) out[bookIntro.id] = plain(bookPart);
    const chapterIntro = byStart.get(`${book}.${entry.osisStart.split(".")[1]}`);
    if (chapterIntro && plain(chapterPart)) out[chapterIntro.id] = plain(chapterPart);
  }
  return out;
}
