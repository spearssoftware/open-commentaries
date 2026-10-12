import type { ReviewerRole, SectionState } from "../types.ts";

export type UploadSection = SectionState & { book: string };

export interface ExportedDecision {
  id: string;
  token_id: number;
  section_id: string;
  reviewer: ReviewerRole;
  phase: "blind" | "amended";
  decision: "approve" | "flag";
  type: "meaning" | "wording" | null;
  dated_view: 0 | 1;
  comment: string | null;
  text_hash: string;
  status_at_review: SectionState["review_status"];
  round: number | null;
  created_at: string;
}

export function reviewUrl(): string {
  return (process.env.REVIEW_URL ?? "https://review.gnosistools.com").replace(/\/+$/, "");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env.MAINTAINER_TOKEN;
  if (!token) throw new Error("Set MAINTAINER_TOKEN to the maintainer token (never commit it)");
  const res = await fetch(`${reviewUrl()}${path}`, {
    method,
    headers: {
      "X-Maintainer-Token": token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export function uploadSections(sections: UploadSection[]): Promise<{ upserted: number }> {
  return request("PUT", "/admin/sections", { sections });
}

export function createToken(
  reviewer: ReviewerRole,
  book: string,
  chapterFrom: number,
  chapterTo: number,
): Promise<{ id: number; token: string }> {
  return request("POST", "/admin/tokens", {
    reviewer,
    book,
    chapter_from: chapterFrom,
    chapter_to: chapterTo,
  });
}

export function revokeToken(id: number): Promise<{ revoked: boolean }> {
  return request("POST", `/admin/tokens/${id}/revoke`);
}

export async function exportDecisions(): Promise<ExportedDecision[]> {
  return (await request<{ decisions: ExportedDecision[] }>("GET", "/admin/export")).decisions;
}

export function deleteDecisions(sectionId: string): Promise<{ deleted: number }> {
  return request("DELETE", `/admin/decisions?section=${encodeURIComponent(sectionId)}`);
}
