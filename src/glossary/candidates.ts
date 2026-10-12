// Collects glossary candidates from both model families, one isolated call per chapter. Results
// are merged into glossary/candidates.json after every call so an interrupted run resumes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runClaude } from "../models/claude.ts";
import { runCodex } from "../models/codex.ts";
import { MODELS } from "../models/models.ts";
import type { ModelCall, ModelResult } from "../models/runner.ts";
import type { JsonSchema } from "../models/schema.ts";
import type { ModelFamily, SectionState } from "../types.ts";
import { termKey } from "./keys.ts";

export const PROMPT_VERSION = "glossary-candidates.v1";
const ROOT = join(import.meta.dir, "../..");
export const CANDIDATES_PATH = join(ROOT, "glossary/candidates.json");

export type Category = "theological_terms" | "drift_words" | "strength_words";
export const CATEGORIES: Category[] = ["theological_terms", "drift_words", "strength_words"];

const item: JsonSchema = {
  type: "object",
  properties: { term: { type: "string" }, note: { type: "string" } },
  required: ["term", "note"],
  additionalProperties: false,
};

export const CANDIDATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: Object.fromEntries(CATEGORIES.map((c) => [c, { type: "array", items: item }])),
  required: CATEGORIES,
  additionalProperties: false,
};

export type CandidateReply = Record<Category, { term: string; note: string }[]>;

export interface Candidate {
  term: string;
  category: Category;
  found_by: Partial<Record<ModelFamily, number>>;
  chapters: number[];
  notes: string[];
}

export interface CandidatesFile {
  book: string;
  prompt_version: string;
  models: Partial<Record<ModelFamily, string>>;
  calls: {
    family: ModelFamily;
    chapter: number;
    model: string;
    cli_version: string;
    usage: unknown;
    duration_ms: number;
  }[];
  candidates: Candidate[];
}

/** The committed candidates file; throws with the command to run when it does not exist. */
export function loadCandidates(): CandidatesFile {
  if (!existsSync(CANDIDATES_PATH)) {
    throw new Error(`${CANDIDATES_PATH} is missing; run \`just glossary-candidates <book>\``);
  }
  return JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as CandidatesFile;
}

/** The candidates collected so far for this book and prompt version, or an empty file to start one. */
export function readCandidates(book: string): CandidatesFile {
  if (existsSync(CANDIDATES_PATH)) {
    const file = JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as CandidatesFile;
    if (file.book === book && file.prompt_version === PROMPT_VERSION) return file;
  }
  return { book, prompt_version: PROMPT_VERSION, models: {}, calls: [], candidates: [] };
}

export function mergeReply(
  file: CandidatesFile,
  family: ModelFamily,
  chapter: number,
  reply: CandidateReply,
): void {
  for (const category of CATEGORIES) {
    for (const { term, note } of reply[category]) {
      const key = termKey(term);
      if (!key) continue;
      let entry = file.candidates.find((c) => c.category === category && termKey(c.term) === key);
      if (!entry) {
        entry = { term: term.trim(), category, found_by: {}, chapters: [], notes: [] };
        file.candidates.push(entry);
      }
      entry.found_by[family] = (entry.found_by[family] ?? 0) + 1;
      if (!entry.chapters.includes(chapter)) entry.chapters.push(chapter);
      if (note.trim() && entry.notes.length < 6)
        entry.notes.push(`${family} ch${chapter}: ${note.trim()}`);
    }
  }
  file.candidates.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || termKey(a.term).localeCompare(termKey(b.term)),
  );
}

export function chapterText(sections: SectionState[], chapter: number): string {
  return sections
    .filter((s) => s.chapter === chapter)
    .map((s) => [s.heading, s.original_text].filter(Boolean).join("\n\n"))
    .join("\n\n");
}

const RUNNERS: Record<
  ModelFamily,
  { model: string; run: (call: ModelCall) => Promise<ModelResult> }
> = {
  claude: { model: MODELS.claude, run: runClaude },
  gpt: { model: MODELS.gpt, run: runCodex },
};

/** Runs every missing (family, chapter) call, saving after each. Chapter 0 is the book intro. */
export async function collectCandidates(
  book: string,
  sections: SectionState[],
  prompt: string,
): Promise<CandidatesFile> {
  const file = readCandidates(book);
  const chapters = [...new Set(sections.map((s) => s.chapter))].sort((a, b) => a - b);
  for (const chapter of chapters) {
    for (const family of ["claude", "gpt"] as const) {
      if (file.calls.some((c) => c.family === family && c.chapter === chapter)) continue;
      const { model, run } = RUNNERS[family];
      const result = await run({
        model,
        system:
          "You build glossaries for a faithful modernization of an 18th-century Bible commentary.",
        prompt: `${prompt}\n${chapterText(sections, chapter)}`,
        schema: CANDIDATE_SCHEMA,
      });
      mergeReply(file, family, chapter, result.output as CandidateReply);
      file.models[family] = result.model;
      file.calls.push({
        family,
        chapter,
        model: result.model,
        cli_version: result.cliVersion,
        usage: result.usage,
        duration_ms: result.durationMs,
      });
      writeFileSync(CANDIDATES_PATH, `${JSON.stringify(file, null, 2)}\n`);
      console.log(`${family} chapter ${chapter}: ${file.candidates.length} candidates so far`);
    }
  }
  return file;
}
