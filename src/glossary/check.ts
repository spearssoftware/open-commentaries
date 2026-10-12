// Structure and coverage checks for the three glossaries.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CandidatesFile } from "./candidates.ts";
import { coverKey, termKey } from "./keys.ts";

/** Protected words from the spec's fidelity rules. */
export const PROTECTED = ["man", "men", "mankind", "the Jews", "Christ", "Lord"];

export interface LockedEntry {
  term: string;
  kind: "protected" | "theological";
  forms: string[];
  note?: string;
}

export interface Locked {
  approved: string | null;
  entries: LockedEntry[];
  allowed_to_change: { term: string; reason: string }[];
}

export interface DriftEntry {
  word: string;
  forms: string[];
  sense: string;
  replacements: string[];
}

export interface Drift {
  approved: string | null;
  entries: DriftEntry[];
}

export interface StrengthEntry {
  word: string;
  equivalents?: string[];
  senses?: Record<string, string[]>;
  note?: string;
}

export interface Strength {
  approved: string | null;
  entries: StrengthEntry[];
}

export interface Glossaries {
  locked: Locked;
  drift: Drift;
  strength: Strength;
}

export const GLOSSARY_DIR = join(import.meta.dir, "../../glossary");
export const GLOSSARY_FILES = ["locked", "drift", "strength"] as const;

export function readGlossaries(dir = GLOSSARY_DIR): Glossaries {
  const read = <T>(name: string) =>
    JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as T;
  return {
    locked: read<Locked>("locked"),
    drift: read<Drift>("drift"),
    strength: read<Strength>("strength"),
  };
}

const isDate = (v: unknown) =>
  v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim() !== "");

function checkShapes({ locked, drift, strength }: Glossaries): string[] {
  const problems: string[] = [];
  for (const [name, file] of Object.entries({ locked, drift, strength })) {
    if (!isDate(file.approved)) problems.push(`${name}.json: approved must be null or YYYY-MM-DD`);
    if (!Array.isArray(file.entries) || file.entries.length === 0)
      problems.push(`${name}.json: entries must be a non-empty array`);
  }
  for (const e of locked.entries ?? []) {
    if (!e.term || !["protected", "theological"].includes(e.kind) || !strings(e.forms)) {
      problems.push(`locked.json: bad entry ${JSON.stringify(e)}`);
    }
  }
  for (const e of locked.allowed_to_change ?? []) {
    if (!e.term || !e.reason)
      problems.push(
        `locked.json: allowed_to_change entry needs term and reason: ${JSON.stringify(e)}`,
      );
  }
  for (const e of drift.entries ?? []) {
    if (!e.word || !e.sense || !strings(e.forms) || !strings(e.replacements)) {
      problems.push(`drift.json: bad entry ${JSON.stringify(e)}`);
    }
  }
  for (const e of strength.entries ?? []) {
    const ok =
      e.word && (strings(e.equivalents) || (e.senses && Object.values(e.senses).every(strings)));
    if (!ok) problems.push(`strength.json: bad entry ${JSON.stringify(e)}`);
  }
  const shall = strength.entries?.find((e) => e.word === "shall");
  if (!shall?.senses?.future || !shall.senses.obligation) {
    problems.push('strength.json: "shall" needs senses.future and senses.obligation');
  }
  return problems;
}

function lockedKeys(locked: Locked): Set<string> {
  return new Set(locked.entries.flatMap((e) => [e.term, ...e.forms].map(coverKey)));
}

/** Every problem with the glossaries; empty when they are well-formed and cover the candidates. */
export function checkGlossaries(g: Glossaries, candidates?: CandidatesFile): string[] {
  const problems = checkShapes(g);
  if (problems.length) return problems;
  const locked = lockedKeys(g.locked);
  for (const word of PROTECTED) {
    const entry = g.locked.entries.find((e) => termKey(e.term) === termKey(word));
    if (entry?.kind !== "protected")
      problems.push(`locked.json: protected word "${word}" is missing`);
  }
  const allowed = new Set(g.locked.allowed_to_change.map((e) => coverKey(e.term)));
  for (const c of candidates?.candidates ?? []) {
    if (c.category !== "theological_terms") continue;
    const key = coverKey(c.term);
    if (!locked.has(key) && !allowed.has(key)) {
      problems.push(`theological term "${c.term}" is neither locked nor allowed to change`);
    }
  }
  return problems;
}

export function unapproved(g: Glossaries): string[] {
  return Object.entries(g)
    .filter(([, file]) => (file as { approved: string | null }).approved === null)
    .map(([name]) => `${name}.json`);
}

export type CandidateStatus = "locked" | "allowed" | "drift" | "strength" | "open";

/** Where each candidate is covered, keyed by category and coverKey. */
export function candidateStatuses(g: Glossaries, candidates: CandidatesFile): CandidateStatus[] {
  const locked = lockedKeys(g.locked);
  const allowed = new Set(g.locked.allowed_to_change.map((e) => coverKey(e.term)));
  const drift = new Set(g.drift.entries.flatMap((e) => [e.word, ...e.forms].map(coverKey)));
  const strength = new Set(g.strength.entries.map((e) => coverKey(e.word)));
  return candidates.candidates.map((c) => {
    const key = coverKey(c.term);
    if (locked.has(key)) return "locked";
    if (c.category === "theological_terms" && allowed.has(key)) return "allowed";
    if (drift.has(key)) return "drift";
    if (strength.has(key)) return "strength";
    return "open";
  });
}

export function writeGlossary(
  name: (typeof GLOSSARY_FILES)[number],
  file: { approved: string | null },
  dir = GLOSSARY_DIR,
): void {
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(file, null, 2)}\n`);
}

/** Stamps today's date into every glossary, unless the checks report problems (returned instead). */
export function approveGlossaries(g: Glossaries, candidates: CandidatesFile): string[] {
  const problems = checkGlossaries(g, candidates);
  if (problems.length) return problems;
  const today = new Date().toISOString().slice(0, 10);
  for (const name of GLOSSARY_FILES) writeGlossary(name, { ...g[name], approved: today });
  return [];
}
