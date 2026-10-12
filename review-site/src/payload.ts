// Splits an uploaded section into what a reviewer may see before deciding (public) and what is
// revealed afterwards. Keys are allowlisted here so the uploader can never leak a verdict into
// the blind view.

export interface UploadedQuote {
  span: string;
  osis: string | null;
  kjv_text: string | null;
  bsb_text: string | null;
  bsb_note: string | null;
  [key: string]: unknown;
}

export interface UploadedSection {
  id: string;
  book: string;
  chapter: number;
  seq: number;
  kind: string;
  osis_start: string;
  osis_end: string;
  heading: string | null;
  original_text: string;
  modern_heading: string | null;
  modern_text: string | null;
  text_hash: string | null;
  quotes: UploadedQuote[];
  review_status: string;
  rounds: { round: number; [key: string]: unknown }[];
  rule_checks: unknown[];
  claims: unknown[];
  tags: string[];
  modern_sentences: unknown[];
}

/** Server-side hash for sections that have no modern text yet. */
export const UNMODERNIZED = "unmodernized";

const PUBLIC_KEYS = [
  "id",
  "kind",
  "chapter",
  "seq",
  "osis_start",
  "osis_end",
  "heading",
  "original_text",
  "modern_heading",
  "modern_text",
  "quotes",
] as const;

const QUOTE_KEYS = ["span", "osis", "kjv_text", "bsb_text", "bsb_note"] as const;

const REVEAL_KEYS = ["review_status", "tags", "rounds", "rule_checks", "claims", "modern_sentences"] as const;

export function publicPayload(s: UploadedSection): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_KEYS) out[key] = s[key];
  out.quotes = s.quotes.map((q) => Object.fromEntries(QUOTE_KEYS.map((k) => [k, q[k] ?? null])));
  out.text_hash = s.text_hash ?? UNMODERNIZED;
  return out;
}

export function revealPayload(s: UploadedSection): Record<string, unknown> {
  return Object.fromEntries(REVEAL_KEYS.map((k) => [k, s[k]]));
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown) => v === null || isString(v);

/** Returns a problem description, or null when the upload has the fields the split relies on. */
export function checkUpload(s: unknown): string | null {
  if (typeof s !== "object" || s === null) return "section must be an object";
  const v = s as Record<string, unknown>;
  for (const key of ["id", "book", "kind", "osis_start", "osis_end", "original_text", "review_status"]) {
    if (!isString(v[key])) return `${key} must be a string`;
  }
  for (const key of ["heading", "modern_heading", "modern_text", "text_hash"]) {
    if (!isNullableString(v[key])) return `${key} must be a string or null`;
  }
  for (const key of ["chapter", "seq"]) {
    if (!Number.isInteger(v[key])) return `${key} must be an integer`;
  }
  for (const key of ["quotes", "rounds", "rule_checks", "claims", "tags", "modern_sentences"]) {
    if (!Array.isArray(v[key])) return `${key} must be an array`;
  }
  return null;
}
