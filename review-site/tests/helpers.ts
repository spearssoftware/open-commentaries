import { env } from "cloudflare:test";
import worker from "../src/index";
import type { UploadedSection } from "../src/payload";

// Mirrors migrations/0001_review_schema.sql (inline so tests need no text imports).
const schemaSql = `
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY, book TEXT NOT NULL, chapter INTEGER NOT NULL, seq INTEGER NOT NULL,
  text_hash TEXT NOT NULL, review_status TEXT NOT NULL, round INTEGER,
  public_payload TEXT NOT NULL, reveal_payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, reviewer TEXT NOT NULL, book TEXT NOT NULL,
  chapter_from INTEGER NOT NULL, chapter_to INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES tokens(id), section_id TEXT NOT NULL,
  reviewer TEXT NOT NULL, phase TEXT NOT NULL CHECK (phase IN ('blind', 'amended')),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'flag')),
  type TEXT CHECK (type IN ('meaning', 'wording')), dated_view INTEGER NOT NULL DEFAULT 0,
  comment TEXT, text_hash TEXT NOT NULL, status_at_review TEXT NOT NULL, round INTEGER,
  created_at TEXT NOT NULL, UNIQUE (token_id, section_id, text_hash, phase)
)`;

export const MAINTAINER = "test-maintainer";

export async function seedSchema(): Promise<void> {
  for (const stmt of schemaSql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await env.DB.prepare(stmt).run();
  }
}

export function call(
  path: string,
  init: Omit<RequestInit, "body"> & { token?: string; maintainer?: string; body?: unknown } = {},
): Promise<Response> {
  const { token, maintainer, body, headers, ...rest } = init;
  const h = new Headers(headers);
  if (token) h.set("X-Review-Token", token);
  if (maintainer) h.set("X-Maintainer-Token", maintainer);
  if (body !== undefined) h.set("Content-Type", "application/json");
  const request = new Request(`https://review.gnosistools.com${path}`, {
    ...rest,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return Promise.resolve(worker.fetch(request, env));
}

export function section(chapter: number, seq: number, overrides: Partial<UploadedSection> = {}): UploadedSection {
  const id = `matthew-henry-concise:John.${chapter}.${seq}-John.${chapter}.${seq + 1}`;
  return {
    id,
    book: "John",
    chapter,
    seq,
    kind: "comment",
    osis_start: `John.${chapter}.${seq}`,
    osis_end: `John.${chapter}.${seq + 1}`,
    heading: null,
    original_text: `Original text ${chapter}:${seq}.`,
    modern_heading: null,
    modern_text: `Modern text ${chapter}:${seq}.`,
    text_hash: `hash-${chapter}-${seq}`,
    quotes: [
      {
        span: "The wind bloweth",
        osis: "John.3.8",
        source: "code",
        kjv_match: "exact",
        kjv_text: "The wind bloweth where it listeth",
        bsb_text: "The wind blows where it wishes",
        bsb_note: null,
      },
    ],
    review_status: "machine_verified",
    rounds: [{ round: 0, verdict: "pass", flags: [] }],
    rule_checks: [{ check: "length_ratio", result: "pass", detail: "" }],
    claims: [{ n: 1, text: "claim", disputed: false }],
    tags: ["dated_view"],
    modern_sentences: [],
    ...overrides,
  };
}

/** Uploads sections and returns a reviewer token for the given chapter range. */
export async function setup(
  sections: UploadedSection[],
  range: { reviewer?: string; from: number; to: number } = { from: 1, to: 3 },
): Promise<string> {
  await seedSchema();
  const up = await call("/admin/sections", { method: "PUT", maintainer: MAINTAINER, body: { sections } });
  if (up.status !== 200) throw new Error(`upload failed: ${up.status}`);
  const res = await call("/admin/tokens", {
    method: "POST",
    maintainer: MAINTAINER,
    body: { reviewer: range.reviewer ?? "pastor", book: "John", chapter_from: range.from, chapter_to: range.to },
  });
  return ((await res.json()) as { token: string }).token;
}
