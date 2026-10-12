import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, readSections, sectionFileName } from "../ingest/ingest.ts";
import type { Review, SectionState } from "../types.ts";
import type { ExportedDecision } from "./client.ts";

interface PrivateComment {
  id: string;
  section_id: string;
  reviewer: string;
  phase: string;
  type: string | null;
  comment: string;
  created_at: string;
}

interface MergeResult {
  sections: SectionState[];
  comments: PrivateComment[];
  added: number;
  alreadyImported: number;
  unknownSections: number;
}

function toReview(d: ExportedDecision): Review {
  return {
    reviewer: d.reviewer,
    phase: d.phase,
    decision: d.decision,
    ...(d.decision === "flag" && d.type ? { type: d.type } : {}),
    dated_view: d.dated_view === 1,
    text_hash: d.text_hash,
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
  const keys = new Map(sections.map((s) => [s.id, new Set(s.reviews.map(reviewKey))]));
  const added = new Map<string, Review[]>();
  const comments: PrivateComment[] = [];
  let alreadyImported = 0;
  let unknownSections = 0;

  for (const d of decisions) {
    const seen = keys.get(d.section_id);
    if (!seen) {
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

interface ImportSummary {
  added: number;
  alreadyImported: number;
  commentsWritten: number;
  unknownSections: number;
}

function loadAll(dataDir: string): { path: string; section: SectionState }[] {
  if (!existsSync(dataDir)) return [];
  return readdirSync(dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const dir = join(dataDir, d.name);
      return readSections(d.name, dir).map((section) => ({
        path: join(dir, sectionFileName(section)),
        section,
      }));
    });
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
  const { added, alreadyImported, unknownSections } = result;
  return { added, alreadyImported, commentsWritten: result.comments.length, unknownSections };
}
