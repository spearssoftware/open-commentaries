import { applyD1Migrations, env } from "cloudflare:test";
import worker from "../src/index";
import type { UploadedSection } from "../src/payload";

export const MAINTAINER = "test-maintainer";

export async function seedSchema(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
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
