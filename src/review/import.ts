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
  /** New reviews plus amendments that replaced an earlier version. */
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

/**
 * One review per reviewer, phase, and text version. The server lets a reviewer replace an
 * amended decision, so a re-import replaces the earlier amended review instead of appending.
 */
const sameSlot = (a: Review, b: Review) =>
  a.reviewer === b.reviewer && a.phase === b.phase && a.text_hash === b.text_hash;

/**
 * Merges exported decisions into the matching sections' `reviews`: new ones are appended, changed
 * amendments replace their earlier version, and identical ones are skipped.
 * Only `reviews` changes; unchanged sections are returned as the same objects. Comments are
 * returned separately and never enter section state.
 */
export function mergeReviews(sections: SectionState[], decisions: ExportedDecision[]): MergeResult {
  const reviews = new Map(sections.map((s) => [s.id, s.reviews]));
  const changed = new Set<string>();
  const comments: PrivateComment[] = [];
  let added = 0;
  let alreadyImported = 0;
  let unknownSections = 0;

  for (const d of decisions) {
    const current = reviews.get(d.section_id);
    if (!current) {
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
    const at = current.findIndex((r) => sameSlot(r, review));
    if (at >= 0 && JSON.stringify(current[at]) === JSON.stringify(review)) {
      alreadyImported++;
      continue;
    }
    reviews.set(d.section_id, at >= 0 ? current.with(at, review) : [...current, review]);
    changed.add(d.section_id);
    added++;
  }

  const merged = sections.map((s) =>
    changed.has(s.id) ? { ...s, reviews: reviews.get(s.id) as Review[] } : s,
  );
  return { sections: merged, comments, added, alreadyImported, unknownSections };
}

interface ImportSummary {
  /** New reviews plus amendments that replaced an earlier version. */
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
