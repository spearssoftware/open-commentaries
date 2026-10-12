import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../ingest/ingest.ts";
import type { Review, SectionState } from "../types.ts";
import type { ExportedDecision } from "./client.ts";

/** Server-side text_hash for sections that had no modern text when reviewed. */
const UNMODERNIZED = "unmodernized";

export interface PrivateComment {
  id: string;
  section_id: string;
  reviewer: string;
  phase: string;
  type: string | null;
  comment: string;
  created_at: string;
}

export interface MergeResult {
  sections: SectionState[];
  comments: PrivateComment[];
  added: number;
  alreadyImported: number;
  unknownSections: number;
}

export function toReview(d: ExportedDecision): Review {
  return {
    reviewer: d.reviewer,
    phase: d.phase,
    decision: d.decision,
    ...(d.decision === "flag" && d.type ? { type: d.type } : {}),
    dated_view: d.dated_view === 1,
    text_hash: d.text_hash === UNMODERNIZED ? null : d.text_hash,
    status_at_review: d.status_at_review,
    round: d.round,
    date: d.created_at,
  };
}

const reviewKey = (r: Review) =>
  JSON.stringify([r.reviewer, r.phase, r.decision, r.type ?? null, r.text_hash, r.date]);

/**
 * Appends exported decisions to the matching sections' `reviews`, skipping ones already present.
 * Only `reviews` changes; unchanged sections are returned as the same objects. Comments are
 * returned separately and never enter section state.
 */
export function mergeReviews(sections: SectionState[], decisions: ExportedDecision[]): MergeResult {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const keys = new Map(sections.map((s) => [s.id, new Set(s.reviews.map(reviewKey))]));
  const added = new Map<string, Review[]>();
  const comments: PrivateComment[] = [];
  let alreadyImported = 0;
  let unknownSections = 0;

  for (const d of decisions) {
    const seen = keys.get(d.section_id);
    if (!byId.has(d.section_id) || !seen) {
      unknownSections++;
      continue;
    }
    if (d.comment) {
      comments.push({
        id: d.id,
        section_id: d.section_id,
        reviewer: d.reviewer,
        phase: d.phase,
        type: d.type,
        comment: d.comment,
        created_at: d.created_at,
      });
    }
    const review = toReview(d);
    const key = reviewKey(review);
    if (seen.has(key)) {
      alreadyImported++;
      continue;
    }
    seen.add(key);
    added.set(d.section_id, [...(added.get(d.section_id) ?? []), review]);
  }

  const merged = sections.map((s) => {
    const extra = added.get(s.id);
    return extra ? { ...s, reviews: [...s.reviews, ...extra] } : s;
  });
  const count = [...added.values()].reduce((n, r) => n + r.length, 0);
  return { sections: merged, comments, added: count, alreadyImported, unknownSections };
}

export interface ImportSummary {
  added: number;
  alreadyImported: number;
  commentsWritten: number;
  unknownSections: number;
}

interface LoadedFile {
  path: string;
  section: SectionState;
}

function loadAll(dataDir: string): LoadedFile[] {
  if (!existsSync(dataDir)) return [];
  const files: LoadedFile[] = [];
  for (const book of readdirSync(dataDir, { withFileTypes: true })) {
    if (!book.isDirectory()) continue;
    const dir = join(dataDir, book.name);
    for (const f of readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()) {
      const path = join(dir, f);
      files.push({ path, section: JSON.parse(readFileSync(path, "utf8")) });
    }
  }
  return files;
}

/** Merges decisions into the state files under `dataDir` and writes comments to `privateDir`. */
export function importDecisions(
  decisions: ExportedDecision[],
  dataDir = DATA_DIR,
  privateDir = join(import.meta.dir, "../../reviews/private"),
): ImportSummary {
  const files = loadAll(dataDir);
  const result = mergeReviews(
    files.map((f) => f.section),
    decisions,
  );
  files.forEach((f, i) => {
    const updated = result.sections[i];
    if (updated && updated !== f.section) {
      writeFileSync(f.path, `${JSON.stringify(updated, null, 2)}\n`);
    }
  });
  if (result.comments.length) mkdirSync(privateDir, { recursive: true });
  for (const c of result.comments) {
    writeFileSync(join(privateDir, `${c.id}.json`), `${JSON.stringify(c, null, 2)}\n`);
  }
  return {
    added: result.added,
    alreadyImported: result.alreadyImported,
    commentsWritten: result.comments.length,
    unknownSections: result.unknownSections,
  };
}
