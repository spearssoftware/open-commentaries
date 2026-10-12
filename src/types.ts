// Section state schema, as defined in docs/specs/modernization.md ("Section state file").

export type SectionKind = "intro" | "comment";

export type ReviewStatus =
  | "unreviewed"
  | "machine_verified"
  | "needs_human"
  | "human_reviewed"
  | "withheld";

export type SectionTag = "dated_view" | "contested_withdrawn" | "pipeline_error";

export type ModelFamily = "claude" | "gpt";

export interface Reference {
  osis: string;
  inferred: boolean;
}

export type KjvMatch = "exact" | "loose" | "none";

export interface Quote {
  span: string;
  osis: string | null;
  source: ModelFamily | "code";
  kjv_match: KjvMatch;
  kjv_text: string | null;
  bsb_text: string | null;
  bsb_note: string | null;
}

export type Modality =
  | "assertion"
  | "exhortation"
  | "warning"
  | "promise"
  | "question"
  | "prayer"
  | "conditional";

export interface Claim {
  n: number;
  text: string;
  modality: Modality;
  strength: string;
  sentences: number[];
  found_by: ModelFamily[];
  disputed: boolean;
}

export type ShallSense = "future" | "obligation";

export interface ModernSentence {
  text: string;
  source: number[];
  shall_sense?: ShallSense;
}

export interface RuleCheck {
  check: string;
  result: "pass" | "fail" | "warn";
  detail: string;
  justification?: string;
  verifier_accepted?: boolean;
  override?: string;
}

export type FlagType =
  | "dropped"
  | "added"
  | "changed"
  | "strength"
  | "modality"
  | "referent"
  | "reference"
  | "wording"
  | "voice"
  | "justification_rejected"
  | "dated_view"
  | "meaning";

export interface Flag {
  type: FlagType;
  claim?: number;
  sentence?: number;
  detail: string;
  origin: "verifier" | "human";
  status: "open" | "withdrawn" | "closed";
}

export interface Round {
  round: number;
  modern_text: string;
  verifier_model: string;
  verdict: "pass" | "flags";
  flags: Flag[];
  contest: string | null;
  notes: string | null;
}

export interface Provenance {
  prompt_versions: Record<string, string>;
  modernizer_model: string | null;
  verifier_model: string | null;
  source_edition: string;
  generated_at: string | null;
}

export type ReviewerRole = "maintainer" | "study-leader" | "pastor";

export interface Review {
  reviewer: ReviewerRole;
  phase: "blind" | "amended";
  decision: "approve" | "flag";
  type?: "meaning" | "wording";
  dated_view: boolean;
  text_hash: string | null;
  status_at_review: ReviewStatus;
  round: number | null;
  date: string;
  adjudication?: { result: "confirmed" | "rejected"; reason: string };
}

export interface SectionState {
  id: string;
  commentary_id: string;
  kind: SectionKind;
  seq: number;
  osis_start: string;
  osis_end: string;
  chapter: number;
  heading: string | null;
  original_text: string;
  original_sentences: string[];
  references: Reference[];
  quotes: Quote[];
  claims: Claim[];
  modern_heading: string | null;
  modern_sentences: ModernSentence[];
  modern_text: string | null;
  text_hash: string | null;
  rule_checks: RuleCheck[];
  rounds: Round[];
  review_status: ReviewStatus;
  ai_modernized: boolean;
  human_edited: boolean;
  tags: SectionTag[];
  editorial_note: null;
  provenance: Provenance;
  reviews: Review[];
}
