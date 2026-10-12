// Runtime validation of section state files against src/types.ts. Returns a list of problems
// (empty when valid) so a test can report every issue at once.

import {
  FLAG_TYPES,
  KJV_MATCHES,
  MODALITIES,
  MODEL_FAMILIES,
  REVIEW_STATUSES,
  REVIEWER_ROLES,
  SECTION_KINDS,
  SECTION_TAGS,
  SHALL_SENSES,
} from "./types.ts";

type Check = (value: unknown, path: string, problems: string[]) => void;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str: Check = (v, p, out) => {
  if (typeof v !== "string") out.push(`${p}: expected string`);
};
const num: Check = (v, p, out) => {
  if (typeof v !== "number" || !Number.isInteger(v)) out.push(`${p}: expected integer`);
};
const bool: Check = (v, p, out) => {
  if (typeof v !== "boolean") out.push(`${p}: expected boolean`);
};
const nul: Check = (v, p, out) => {
  if (v !== null) out.push(`${p}: expected null`);
};
const oneOf =
  (...values: readonly string[]): Check =>
  (v, p, out) => {
    if (typeof v !== "string" || !values.includes(v))
      out.push(`${p}: expected one of ${values.join("|")}`);
  };
const nullable =
  (check: Check): Check =>
  (v, p, out) => {
    if (v !== null) check(v, p, out);
  };
const optional =
  (check: Check): Check =>
  (v, p, out) => {
    if (v !== undefined) check(v, p, out);
  };
const array =
  (check: Check): Check =>
  (v, p, out) => {
    if (!Array.isArray(v)) out.push(`${p}: expected array`);
    else
      v.forEach((item, i) => {
        check(item, `${p}[${i}]`, out);
      });
  };
const record =
  (check: Check): Check =>
  (v, p, out) => {
    if (!isObject(v)) out.push(`${p}: expected object`);
    else for (const [k, item] of Object.entries(v)) check(item, `${p}.${k}`, out);
  };
const shape =
  (fields: Record<string, Check>): Check =>
  (v, p, out) => {
    if (!isObject(v)) {
      out.push(`${p}: expected object`);
      return;
    }
    for (const [key, check] of Object.entries(fields)) check(v[key], `${p}.${key}`, out);
    for (const key of Object.keys(v))
      if (!(key in fields)) out.push(`${p}.${key}: unexpected field`);
  };

const modelFamily = oneOf(...MODEL_FAMILIES);
const reviewStatus = oneOf(...REVIEW_STATUSES);

const flag = shape({
  type: oneOf(...FLAG_TYPES),
  claim: optional(num),
  sentence: optional(num),
  detail: str,
  origin: oneOf("verifier", "human"),
  status: oneOf("open", "withdrawn", "closed"),
});

const section = shape({
  id: str,
  commentary_id: str,
  kind: oneOf(...SECTION_KINDS),
  seq: num,
  osis_start: str,
  osis_end: str,
  chapter: num,
  heading: nullable(str),
  original_text: str,
  original_sentences: array(str),
  references: array(shape({ osis: str, inferred: bool })),
  quotes: array(
    shape({
      span: str,
      osis: nullable(str),
      source: oneOf(...MODEL_FAMILIES, "code"),
      kjv_match: oneOf(...KJV_MATCHES),
      kjv_text: nullable(str),
      bsb_text: nullable(str),
      bsb_note: nullable(str),
    }),
  ),
  claims: array(
    shape({
      n: num,
      text: str,
      modality: oneOf(...MODALITIES),
      strength: str,
      sentences: array(num),
      found_by: array(modelFamily),
      disputed: bool,
    }),
  ),
  modern_heading: nullable(str),
  modern_sentences: array(
    shape({ text: str, source: array(num), shall_sense: optional(oneOf(...SHALL_SENSES)) }),
  ),
  modern_text: nullable(str),
  text_hash: nullable(str),
  rule_checks: array(
    shape({
      check: str,
      result: oneOf("pass", "fail", "warn"),
      detail: str,
      justification: optional(str),
      verifier_accepted: optional(bool),
      override: optional(str),
    }),
  ),
  rounds: array(
    shape({
      round: num,
      modern_text: str,
      verifier_model: str,
      verdict: oneOf("pass", "flags"),
      flags: array(flag),
      contest: nullable(str),
      notes: nullable(str),
    }),
  ),
  review_status: reviewStatus,
  ai_modernized: bool,
  human_edited: bool,
  tags: array(oneOf(...SECTION_TAGS)),
  editorial_note: nul,
  provenance: shape({
    prompt_versions: record(str),
    glossary_hash: nullable(str),
    modernizer_model: nullable(str),
    verifier_model: nullable(str),
    source_edition: str,
    generated_at: nullable(str),
  }),
  reviews: array(
    shape({
      reviewer: oneOf(...REVIEWER_ROLES),
      phase: oneOf("blind", "amended"),
      decision: oneOf("approve", "flag"),
      type: optional(oneOf("meaning", "wording")),
      dated_view: bool,
      text_hash: nullable(str),
      status_at_review: reviewStatus,
      round: nullable(num),
      date: str,
      adjudication: optional(shape({ result: oneOf("confirmed", "rejected"), reason: str })),
    }),
  ),
});

export function validateSection(value: unknown, path = "section"): string[] {
  const problems: string[] = [];
  section(value, path, problems);
  if (problems.length === 0 && isObject(value)) {
    if (value.ai_modernized !== (value.modern_text !== null)) {
      problems.push(`${path}: ai_modernized must be true exactly when modern_text is non-null`);
    }
  }
  return problems;
}
