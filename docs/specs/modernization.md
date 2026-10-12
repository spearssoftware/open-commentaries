# Modernized Classic Commentaries

Status: Reviewed
Date: 2026-10-12
Summary: Produce a faithful modern-English version of Matthew Henry's Concise Commentary on John,
verified by an AI loop and human reviewers, and publish it with the original as an open dataset.

## Problem and goals

Public-domain Bible commentaries are free, but their 18th- and 19th-century English is a barrier
for modern readers. Copyrighted modern editions exist (Zondervan's *New Matthew Henry
Commentary*) but cannot be redistributed. No open, modernized dataset exists
(`docs/prior-art.md`).

Goals:

1. Modernize Matthew Henry's Concise Commentary on the Gospel of John (21 chapters) into plain
   contemporary English that reads like a modern study Bible's notes, while preserving:
   - every claim and its strength
   - the author's theology and wording choices
   - his Scripture references
   - his voice
2. Prove the fidelity safeguards work before scaling:
   - independent claim extraction by two model families
   - rule-based checks
   - a measured verifier
   - human review with the final say
3. Publish the original, the modern text, the verification evidence, and parallel Berean Standard
   Bible (BSB) verse text as an open dataset that BibleMarker and any other Bible app can use with
   no AI at runtime.
4. Measure usage on John and project it to all of Henry Concise so Kevin can decide whether to
   scale.

Guiding rule: when readability and fidelity conflict, fidelity wins. No model can override a
human reviewer.

## Non-goals

Out of scope permanently:

- BibleMarker app code. The sidebar card is built in `spearssoftware/BibleMarker`.
- Writing original commentary or editorial notes.
- Correcting, softening, or removing the author's views, including dated or harsh views.
- Gender-inclusive or otherwise updated wording that changes the author's word choice (see
  Fidelity rules).
- Condensing or summarizing. Modernize only.
- Any AI call at runtime in a consuming app.
- Using any copyrighted modernized edition as input or reference.

Deferred to later phases:

- Books other than John, and the rest of Henry Concise (after the go/no-go in this spec).
- Other commentaries (Henry Complete, Barnes, JFB, Clarke, Gill).
- Writing content for the `editorial_note` field.
- A SWORD module build.
- Submitting the dataset to HelloAO.
- Integrating the release into Gnosis (`spearssoftware/gnosis`) as an upstream source, with an
  API endpoint on `api.gnosistools.com` and commentary in the gnosistools.com Explorer.

## Users and flows

### Actors

- **Kevin (maintainer and adjudicator)**
  - Runs the pipeline.
  - Reviews every Stage 1 iteration.
  - Resolves `needs_human` sections.
  - Confirms or rejects every human `meaning` flag.
  - Decides go/no-go.
- **Bible study leader** and **pastor (reviewers)**: do the final review of assigned chunks through
  private links. Not assumed to use GitHub.
- **Claude**, via `claude -p` on Kevin's Max plan: extracts claims, modernizes, and revises.
- **GPT**, via `codex exec` on Kevin's Pro plan: extracts claims independently and verifies. A
  different model family from the modernizer.
- **Consumers**: BibleMarker and third-party developers who download release files.

### Fidelity rules

These apply to every modernization and are enforced by the rule checks and the verifier.

- **Wording.** Keep Henry's word choices wherever a modern reader understands them. Change a word
  only if it is archaic in form or its meaning has shifted.
  - Generic "man", "men", and "mankind" stay as written.
  - Group nouns stay as written, for example "the Jews" never becomes "the Jewish leaders".
  - Titles stay as written: "Christ" stays "Christ" and "Lord" stays "Lord".
- **Referents.** A pronoun is never replaced with a name or title. For example "he" never becomes
  "Jesus" or "Peter". A proper noun the original section does not contain is never added.
- **Capitalization** of pronouns referring to God follows the source.
- **Strength.** Hedging and intensity are kept, using the equivalences in
  `glossary/strength.json`. "Shall" is rendered by sense, either future ("will") or obligation
  ("must"), and the sense chosen is recorded.
- **Form.** Questions stay questions, conditionals stay conditional, and negation scope is
  preserved ("not all" never becomes "all ... not").
- **Structure.** Sentence order is preserved. Each original sentence maps to one modern sentence
  or to a recorded split into several. Sentences are never merged.
- **Scripture.** Henry's quotations are kept verbatim as he wrote them. Scripture references are
  kept.
- **Dated views.** These are kept as written and tagged `dated_view`. They are never edited.

### Stages

1. **Stage 0: preparation.**
   - Acquire sources and record them in `SOURCES.md`.
   - Ingest John.
   - Build the glossaries.
   - Kevin approves the glossaries.
   - Deploy the review site.
2. **Stage 1: smoke test, John 1–3.**
   1. Run the loop on John 1–3.
   2. Kevin reviews every section.
   3. Kevin revises prompts and reruns as often as he chooses. Kevin alone reviews intermediate
      iterations.
   4. When Kevin declares the iteration final, the pastor and the study leader review every John
      1–3 section.
   5. Run the mutation test.
   6. Evaluate the go bar. Stage 2 does not start until Stage 1 meets it.
3. **Stage 2: John 4–21.**
   1. Run the loop.
   2. Reviewers review every `needs_human` section and every section with a `contested_withdrawn`
      tag.
   3. Reviewers also review a 20% random sample of the remaining `machine_verified` sections.
      The sample is drawn with a recorded seed, and the size is rounded up.
   4. Evaluate the go bar.
   5. If the go bar fails:
      - revise the prompts
      - rerun the affected sections
      - draw a fresh sample with a new recorded seed
      - review again
   6. Write the usage report.
   7. Kevin decides go/no-go for the full commentary.

### Per-section loop

A **round** is one verifier call. Round 0 is the first verification. At most 3
revise-and-recheck rounds follow, so the verifier is called at most 4 times per section per run.

1. **Ingest (code, no AI).**
   - Split `original_text` into `original_sentences` with a deterministic splitter that handles
     "ver.", "i.e.", "&c.", and similar abbreviations. The splitter is unit-tested.
   - Parse Scripture references to OSIS, resolving "ver. 16", "v. 5", and "ch. iii." against the
     section's book and chapter.
   - Detect KJV quotation spans by matching runs of 6 or more consecutive normalized words
     against KJV verse text.
2. **Extract claims (independent).** Claude and GPT each extract a claim list from
   `original_text`. Neither sees the other's list. Each claim has:
   - text
   - `modality`: `assertion`, `exhortation`, `warning`, `promise`, `question`, `prayer`, or
     `conditional`
   - `strength`: the original's hedging or intensity words, or `none`
   - the indices of the original sentences it comes from

   Each model also marks quotation spans.
3. **Reconcile the claim ledger.**
   - A GPT call matches the two lists. The ledger is the union, so a claim found by either model
     is kept.
   - A claim whose modality or strength the two extractions disagree on is marked `disputed`.
   - Quotation spans are the union of both models' marks and the code-detected spans.
4. **Modernize.** Claude writes `modern_sentences` from the ledger and the original, following
   the fidelity rules.
5. **Rule checks (code).** See Data and interfaces.
6. **Justify or revise.** For any rule failure or warning, Claude either revises or writes a
   justification for each warning. A blocking failure can only be revised, not justified. Rule
   checks run again after any revision.
7. **Verify.** GPT receives:
   - the original sentences
   - the modern sentences
   - the reconciled ledger
   - the rule-check results
   - Claude's justifications

   GPT does not receive the modernization prompt. It:
   - compares sentence by sentence and claim by claim
   - accepts or rejects each justification
   - returns `pass`, or flags

   Each flag cites a claim number or a sentence index.
8. **Revise and recheck.** If there are blocking flags, Claude revises with the flags attached,
   then steps 5–7 repeat.
   - Claude may contest a flag with a written justification.
   - If the verifier withdraws a blocking flag after a contest, the section is tagged
     `contested_withdrawn`.
9. **Settle.** The section becomes `machine_verified` only if, after the final round:
   - the verifier passed
   - no blocking rule check fails
   - no claim is `disputed`
   - there is no `contested_withdrawn` tag

   Otherwise, after the round limit or on any of those conditions, it becomes `needs_human`, with
   the outstanding issues and both models' last positions attached.

### Human review flow

1. Kevin runs `just review-assign`, which creates review links for a reviewer and a chapter range.
   - Each link carries a secret token tied to one reviewer role.
   - Each link shows only its assigned sections.
2. The reviewer opens the link. For each section they first see:
   - the original
   - the modern text
   - Henry's quotations, with KJV and BSB verse text
3. **Blind decision.** The reviewer chooses "Approve" or "Flag" before seeing any AI output.
   - A flag requires a type and a comment. The type is `meaning` (a claim was changed, added,
     dropped, or weakened) or `wording` (awkward, or Henry's voice is lost).
   - The reviewer may also tick "Dated view".
4. **Reveal.** The verifier verdicts and loop history are then shown. The reviewer may amend their
   decision. The blind and amended decisions are both recorded.
5. Kevin runs `just import-reviews`. Decisions are written into section state. Comments are
   written to `reviews/private/`, which is git-ignored (see Open questions).
6. **Kevin adjudicates.** Kevin marks every `meaning` flag `confirmed` or `rejected`, with a
   reason. A rejected flag is closed.
7. **Human flags re-enter the loop.**
   - A confirmed `meaning` flag, or a `wording` flag, re-enters the loop as a `human` flag.
   - Models may revise the text, but no model can withdraw or close a human flag.
   - The flag closes only when the flagging reviewer or Kevin approves the revised text.
8. **Kevin resolves `needs_human` sections** with one of these:
   - **Human edit.** Kevin edits `modern_text`; `human_edited` is set and rule checks rerun.
   - **Override.** Kevin accepts the text with a written override for each named failing rule
     check.
   - **Withhold.** `modern_text` becomes null and the status becomes `withheld`.
   - **Rerun.** Kevin sends the section back into the loop with his notes attached.
9. **Sign-off.** A section becomes `human_reviewed` when all of these hold:
   - At least one "Approve" was recorded against its current `text_hash`.
   - No human flag is open.
   - Every blocking rule check passes or has a recorded override.

   Reviews recorded against an older `text_hash` do not count toward sign-off.

### Consumer flow

- A consumer downloads a tagged GitHub release.
- They read `commentaries.sqlite` or the JSON tree, and look up sections by OSIS reference.
- When `modern_text` is null, they show `original_text`.
- When `ai_modernized` is true, they display an "AI-modernized" label.
- BibleMarker downloads the release asset at app build time and shows a card with a "Show
  original" toggle.

## Data and interfaces

### Repository layout (new)

| Path | Contents |
|---|---|
| `sources/` | Raw downloaded source files, committed (public domain) |
| `SOURCES.md` | Every input: URL, edition or revision, license text or file, retrieval date |
| `ERRATA.md` | Source typos or scan errors found. `original_text` is never silently corrected. |
| `glossary/locked.json` | Terms that must appear in modern text with the same count as in the original, matched by lemma. Includes theological terms and the protected words from Fidelity rules ("man", "men", "mankind", "the Jews", "Christ", "Lord"). |
| `glossary/drift.json` | Archaic words whose meaning has shifted, each with its sense and approved replacements, for example "conversation" → "conduct" and "prevent" → "go before" |
| `glossary/strength.json` | Approved equivalences for hedging and intensity words, for example "surely" → "surely" or "certainly" |
| `prompts/` | Versioned prompts: extract, reconcile, modernize, justify/revise, verify, mutate |
| `data/<commentary_id>/<book>/` | Committed per-section state files. These are the pipeline's source of truth. |
| `reviews/private/` | Git-ignored reviewer comments |
| `review-site/` | Cloudflare Worker, static assets, and D1 schema for the review site |
| `dist/` | Build output, not committed; attached to releases |
| `docs/pilot-report.md` | Usage and outcome report |
| `docs/dated-views.md` | Sections tagged `dated_view` |
| `LICENSE` | MIT (code) |
| `LICENSE-DATA` | CC0 1.0 (modernized text and verification data) |
| `README.md` | Explains that the text is AI-modernized, which models and prompts were used, how it was verified and reviewed, the human-review coverage percentage for the release, and where the originals are |

### Section state file

One JSON file per section, with these fields:

- `id`: `<commentary_id>:<osis_start>-<osis_end>`
- `commentary_id`
- `kind`: `intro` or `comment`
- `seq`: source order within the book
- `osis_start` and `osis_end`
  - Verse sections: for example `John.3.16`.
  - Chapter intros: `John.3` for both.
  - The book intro: `John` for both.
- `chapter`: the chapter of `osis_start`. It decides the JSON file for sections that cross
  chapters.
- `heading`: the source heading if there is one, original form
- `original_text`: the source text after the documented ingest normalization (see Constraints)
- `original_sentences`: an array of strings
- `references`: an array of `{ osis, inferred }`
- `quotes`: an array of `{ span, osis, source: claude | gpt | code, kjv_match, kjv_text, bsb_text, bsb_note }`
  - `span` is Henry's exact words.
  - `kjv_match` is `exact`, `loose`, or `none`.
  - `kjv_text` and `bsb_text` are the full text of the referenced verse or verses.
- `claims`: an array of `{ n, text, modality, strength, sentences, found_by: [claude, gpt], disputed }`
- `modern_heading`: the modernized heading
- `modern_sentences`: an array of `{ text, source: [original sentence index], shall_sense? }`
- `modern_text`: the joined modern sentences, or null
- `text_hash`: SHA-256 of `modern_text`
- `rule_checks`: an array of `{ check, result: pass | fail | warn, detail, justification?, verifier_accepted?, override? }`
- `rounds`: an array of `{ round, modern_text, verifier_model, verdict, flags, contest, notes }`
  - Each flag is `{ type, claim?, sentence?, detail, origin: verifier | human, status: open | withdrawn | closed }`.
  - `notes` records modernizer corrections of obvious source typos.
- `review_status`: `unreviewed` | `machine_verified` | `needs_human` | `human_reviewed` | `withheld`
- `ai_modernized`: true when `modern_text` is non-null
- `human_edited`: true when Kevin edited `modern_text`
- `tags`: an array that may include `dated_view`, `contested_withdrawn`, `pipeline_error`
- `editorial_note`: always null in this phase
- `provenance`: `{ prompt_versions, modernizer_model, verifier_model, source_edition, generated_at }`
- `reviews`: an array of `{ reviewer, phase: blind | amended, decision: approve | flag, type?, dated_view, text_hash, status_at_review, round, date, adjudication?: { result: confirmed | rejected, reason } }`
  - `reviewer` is a role label: `maintainer`, `study-leader`, or `pastor`.
  - Comment text is not stored here.

### Verifier flag types

All flags block `machine_verified` except `dated_view`.

| Flag | Meaning |
|---|---|
| `dropped` | A ledger claim is missing from the modern text |
| `added` | The modern text asserts something the original does not |
| `changed` | A claim's meaning differs |
| `strength` | Hedging or intensity changed beyond `glossary/strength.json` |
| `modality` | A claim's form changed, for example a question became a statement, a conditional was removed, or an exhortation became an assertion |
| `referent` | Who or what is referred to changed: a pronoun replaced with a name, a group noun changed, or negation or quantifier scope changed |
| `reference` | A Scripture reference or quotation was altered, dropped, or added |
| `wording` | A protected word from Fidelity rules was changed |
| `voice` | Meaning is intact but Henry's voice or aphorism was flattened |
| `justification_rejected` | The verifier rejected Claude's justification for a rule warning |
| `dated_view` | The section contains dated or harsh views. Informational only; never blocks and never triggers an edit. |

### Rule checks

**Blocking.** A failure prevents `machine_verified` and can only be cleared by revision or by
Kevin's override.

- The OSIS reference set in the modern text equals the set in the original. Inferred references
  are exempt.
- Every quotation span appears verbatim in the modern text.
- The lemma count of every `glossary/locked.json` term outside quotation spans matches the
  original.
- No proper noun or title appears in the modern text that the original section lacks.
- Sentence alignment: every original sentence index is covered exactly once, in order.

**Warnings.** Claude must revise or justify each one, and the verifier must accept the
justification.

- A proper noun or number in the original is missing from the modern text.
- Negation word counts differ.
- The ratio of modern to original character length is outside 0.8–1.3.
- A `glossary/drift.json` word appears in the modern text outside quotation spans.
- A quotation span has `kjv_match` of `loose` or `none`.

### Review site

- Hosted as a Cloudflare Worker with static assets and a D1 database, in `review-site/`.
- Access is by per-link secret token only. A token is bound to one reviewer role and one chapter
  range.
- Tokens are created by `just review-assign` and can be revoked.
- Section data is uploaded by `just review-deploy`.
- Decisions are exported by `just import-reviews` through an export endpoint authenticated with a
  maintainer token read from an environment variable. The token is never committed.

### Release artifacts

`just build` writes the following.

**`dist/commentaries.sqlite`.** `PRAGMA user_version` holds the schema major version. Tables:

- `meta`: `schema_version` (semver), `build_date`, `git_sha`, `human_review_coverage`
- `commentaries`:
  - `id`, `title`, `author`, `abridgment_note`, `original_date`
  - `source_url`, `source_edition`
  - `license_original` = "Public Domain"
  - `license_modern` = "CC0-1.0"
- `sections`:
  - Plain columns: `id`, `commentary_id`, `kind`, `seq`, `osis_start`, `osis_end`, `chapter`,
    `heading`, `modern_heading`, `original_text`, `modern_text`, `text_hash`, `review_status`,
    `ai_modernized`, `human_edited`, `editorial_note`
  - JSON text columns: `original_sentences`, `modern_sentences`, `claims`, `references`,
    `rule_checks`, `tags`, `provenance`
- `quotes`: `section_id`, `span`, `osis`, `kjv_match`, `kjv_text`, `bsb_text`, `bsb_note`
- `rounds`: `section_id`, `round`, `modern_text`, `verifier_model`, `verdict`, `flags` (JSON),
  `contest`, `notes`
- `reviews`: `section_id`, `reviewer`, `phase`, `decision`, `type`, `dated_view`, `text_hash`,
  `status_at_review`, `round`, `date`, `adjudication` (JSON). No comment text.
- `overrides`: `section_id`, `check`, `reason`, `date`

Indexes on `(osis_start, osis_end)` and `commentary_id`.

**Which sections ship.** Every ingested section ships. `modern_text` is non-null only when the
status is `machine_verified` or `human_reviewed`. Sections that are `unreviewed`, `needs_human`,
or `withheld` ship with the original only.

**JSON.**

- `dist/json/<commentary_id>/<book>/<chapter>.json`: the same section data grouped by `chapter`,
  in HelloAO style.
- `dist/json/<commentary_id>/index.json`: commentary metadata, coverage, and the list of books and
  chapters.

**Identifiers and versions.**

- The default `commentary_id` is `matthew-henry-concise`.
- A minor version adds optional fields.
- A major version removes or renames fields, or changes their meaning.
- Releases are tagged `vX.Y.Z` with `just release`.

### Commands (`justfile`)

| Recipe | Purpose |
|---|---|
| `just setup` | Install dependencies |
| `just check` | CI gate: lint, type-check, unit tests, end-to-end test with stub models, release schema test |
| `just test` / `just lint` / `just fmt` | Standard verbs |
| `just ingest <book>` | Parse sources into section state files |
| `just run <book> <chapters> [--reopen <id>] [--concurrency <n>]` | Run the loop, for example `just run John 1-3`. Resumable. Concurrency defaults to 1. |
| `just mutation-test <book> <chapters>` | Score the verifier on planted errors. Not in CI. |
| `just sample <book> <chapters> <percent> <seed>` | Select the random review sample |
| `just review-deploy <book> <chapters>` | Upload section data to the review site |
| `just review-assign <reviewer> <book> <chapters>` | Create a review link |
| `just import-reviews` | Pull decisions into section state, and comments into `reviews/private/` |
| `just resolve <id> edit\|override\|withhold\|rerun` | Kevin's resolution of a `needs_human` section, or adjudication of a flag |
| `just report` | Write `docs/pilot-report.md` and `docs/dated-views.md` |
| `just build` | Write `dist/` |
| `just release <version>` | Build, tag, and create the GitHub release |

The pipeline never commits. Kevin commits state changes.

## Edge cases and failure modes

- **Usage limit or CLI failure mid-run.**
  - State is written after every completed model call.
  - The run stops and prints: "Stopped: <cli> returned <error summary>. Progress saved:
    <done>/<total> sections. Re-run `just run <book> <chapters>` to resume."
  - On rerun, completed calls are never repeated.
  - Each stop is logged for the usage report.
- **Malformed model output** (invalid JSON or a missing field).
  - The same call is retried up to 2 times.
  - If it still fails, the section is tagged `pipeline_error` and set to `needs_human`, and the
    run continues.
  - A rerun retries `pipeline_error` sections first.
- **Prompt versions change.**
  - `just run` regenerates sections in the selected range whose prompt versions differ.
  - `human_reviewed` sections are skipped unless `--reopen <id>` is given.
  - Regenerated text gets a new `text_hash`, so earlier reviews stop counting toward sign-off.
- **A reviewer flags a `human_reviewed` section later.** The section leaves `human_reviewed`, and
  the flag follows the human review flow.
- **Source typo or scan error.**
  - `original_text` is unchanged.
  - The error is logged in `ERRATA.md`.
  - The modernizer may render the obvious intended word and must record it in the round's
    `notes`.
- **Henry quotes without giving a reference.** The extraction infers the OSIS reference and sets
  `inferred: true`.
- **Henry quotes loosely or from a different KJV printing.** The span is still kept exactly as
  Henry wrote it. `kjv_match` is `loose` or `none`, which raises a warning.
- **Text-critical passages** (for example John 5:4 and John 7:53–8:11). Where the BSB omits or
  brackets a verse, `bsb_text` is null and `bsb_note` explains why.
- **A section spans chapters.** It is filed under the chapter of `osis_start`.
- **Ingest loses or duplicates text.** The ingest round-trip test fails if the concatenated
  normalized source text of the book differs from the concatenated `heading` and `original_text`
  of its sections.
- **Dated or harsh views.**
  - The text stays faithful, and the protected-word rules apply.
  - The verifier or a reviewer tags the section `dated_view`.
  - The section is listed in `docs/dated-views.md`.
- **Kevin is both prompt tuner and reviewer.** The pilot report states this.

## Constraints

- **Runtime.**
  - TypeScript (strict, no `any`, named exports) on Bun.
  - Bun's built-in SQLite.
  - An XML/HTML parser dependency only if Bun lacks an adequate built-in.
- **Task runner.** `just`, following the shared verbs.
- **AI access.**
  - Only through `claude -p` and `codex exec` on Kevin's subscriptions. No API keys in the repo
    or in CI. No AI calls in CI.
  - The modernizer and verifier are different model families.
  - Model IDs are recorded for every call.
- **Model call isolation.** Every model call:
  - runs in a fresh, empty temporary directory outside the repo
  - receives its input only through stdin
  - has user and project settings, instruction files (`CLAUDE.md`, `AGENTS.md`), memory, hooks,
    MCP servers, and tools disabled
  - runs in a read-only sandbox where a CLI cannot disable tools

  The verifier never has access to the modernization prompt or to `prompts/`.
- **Budget.** No hard spending cap; overage billing is enabled. Nothing beyond John runs without
  Kevin's go after he reads the usage report.
- **Sources.** Public domain originals only.
  - **Henry Concise.** Candidates are CCEL, the SWORD `MHCC` module, and HelloAO's Matthew Henry
    text. `SOURCES.md` records which one is chosen, its terms, and the abridgment history.
    `author` names Henry, and `abridgment_note` states the abridgment.
  - **KJV.** The 1769 Oxford text, used to detect and compare quotations. Record the source.
  - **BSB.** From https://berean.bible, with its revision recorded. Never use the name "Berean"
    for anything modified.
- **Ingest normalization.**
  - Markup is converted to plain text.
  - Italics and emphasis are dropped.
  - Verse-range labels set `osis_start` and `osis_end` and are removed from the text.
  - Headings go to `heading`.
  - The rules live in code and are covered by the round-trip test.
- **Licensing.**
  - Code is MIT.
  - Modernized text and verification data are CC0 1.0.
  - Originals, KJV, and BSB text are public domain.
  - Reviewer comments are excluded from the repo and the release unless their authors consent.
- **Testing.**
  - Unit tests:
    - the sentence splitter
    - reference parsing, with a fixture set of Henry's reference styles
    - the KJV span detector
    - each rule check
    - lemma counting
  - The ingest round-trip test.
  - An end-to-end test with stub `claude` and `codex` executables covering:
    - pass on the first round
    - pass after revision
    - `needs_human` after the round limit
    - a disputed claim
    - `contested_withdrawn`
    - a human flag that a model cannot close
    - resume after an interruption with no duplicate calls
    - malformed output

    The stubs also assert that their working directory is empty and that they received no
    `prompts/` path.
  - A schema test that validates `dist/`.
- **CI.** GitHub Actions runs `just check`.

## Acceptance criteria

1. `docs/prior-art.md` records the search, findings, and the go verdict.
2. `SOURCES.md` lists the Henry Concise, KJV, and BSB sources with URL, edition or revision,
   license text or file, retrieval date, and the Concise abridgment history.
3. Given `just ingest John`, then `data/matthew-henry-concise/John/` holds one state file per
   section.
   - Each file has `kind`, `osis_start`, `osis_end`, `chapter`, `original_text`, and
     `original_sentences`.
   - The ingest round-trip test passes.
4. The glossaries exist and have Kevin's approval date recorded in them before Stage 1 runs.
   - `glossary/locked.json` contains every protected word from Fidelity rules.
   - Every theological term that either model lists from John's original is locked or explicitly
     allowed to change.
5. Given `just run John 1-3`, then every section ends `machine_verified` or `needs_human`.
   - Every section without a `pipeline_error` tag has non-empty `claims`, `modern_sentences`,
     `rule_checks`, `rounds`, and `provenance`.
   - When the stage's final run ends, no section has the `pipeline_error` tag.
6. A `bun test` assertion over all state files confirms that no section is `machine_verified`
   while any of the following is true:
   - a blocking rule check fails without an override
   - a blocking flag in the final round is open
   - a claim is disputed
   - the section is tagged `contested_withdrawn`
7. The end-to-end test with stub CLIs passes every case listed in Constraints, including call-count
   assertions for resume and working-directory isolation.
8. Given `just mutation-test John 1-3`, run after Stage 1's final review:
   - Each verifier call receives one mutation applied to one human-approved section. Mutation
     types: flipped claim, strength change, dropped warning, added claim, referent change,
     softened group noun, removed conditional, scope change, question turned into statement.
   - Mutations are produced by an isolated Claude call that records the type and location.
   - A catch requires a flag of the matching type at the mutated claim or sentence.
   - Thresholds:
     - overall catch rate ≥ 90%
     - catch rate for every type ≥ 80%
     - unmutated human-approved sections flagged ≤ 10%
   - Results are written to `docs/pilot-report.md`.
9. Given `just build`:
   - `dist/commentaries.sqlite` and `dist/json/matthew-henry-concise/John/*.json` exist and pass
     the schema test.
   - `PRAGMA user_version` returns the schema major version.
   - `modern_text` is null for every section not `machine_verified` or `human_reviewed`.
   - No reviewer comment text appears in `dist/`.
10. Given a link from `just review-assign`:
    - The reviewer sees only the assigned sections.
    - The reviewer must record "Approve" or "Flag" before verdicts are shown.
    - "Flag" requires a type and a comment.
    - `just import-reviews` writes the blind and amended decisions, with `text_hash`, into section
      state.
    - A request without a valid token gets HTTP 403.
11. **Human flags.** A model cannot withdraw or close a human flag. Checked by the end-to-end test.
12. **Stage 1.**
    - The pastor and the study leader have reviewed every John 1–3 section at its final
      `text_hash`.
    - The mutation test meets criterion 8.
    - The stage meets the go bar before Stage 2 runs.
13. **Stage 2.** Every `needs_human` and `contested_withdrawn` section in John 4–21 has been
    reviewed, plus the 20% sample of the remaining `machine_verified` sections. The seed is
    recorded in `docs/pilot-report.md`.
14. **Go bar.** Evaluated per stage, on reviews against the final `text_hash`.
    - 0 Kevin-confirmed `meaning` flags on sections whose `status_at_review` was
      `machine_verified`. Such a flag would be an error the verifier missed.
    - ≤ 10% of reviewed sections received a `wording` flag.
    - ≤ 25% of sections ended the AI loop as `needs_human`.
    - 0 sections tagged `pipeline_error`.
15. `docs/pilot-report.md` covers, per stage:
    - section counts, calls, tokens (where the CLIs report them), wall-clock time, and
      usage-limit stops
    - the distribution of round counts
    - the `needs_human`, `disputed`, and `contested_withdrawn` rates
    - mutation-test results
    - go-bar results
    - the upper 95% bound on the verifier miss rate, computed from the reviewed sample
    - the reviewer-independence note
    - a usage projection to all of Henry Concise, scaled by original word count
16. `docs/dated-views.md` lists every section in John tagged `dated_view`.
17. README includes:
    - the AI-modernized notice
    - the models used and a link to `prompts/`
    - the verification and review process
    - human-review coverage
    - links to the original sources
18. `just check` exits 0 locally and in GitHub Actions.

## Decisions

| Decision | Choice | Why | Decided by |
|---|---|---|---|
| Pilot scope | Gospel of John, all 21 chapters | Kevin's favorite book; harder and more representative than Philippians | Kevin |
| Staging | John 1–3 smoke test, then John 4–21 | Catches prompt problems early | Kevin |
| Stage 1 iteration reviews | Kevin alone; pastor and study leader review only the final iteration | Protects volunteer time | Kevin |
| Source commentary | Matthew Henry Concise | Short enough for a sidebar card | Handoff |
| Modernize vs. condense | Modernize only | Condensing sharply raises fidelity risk | Handoff, Kevin |
| Target register | Short sentences, modern study-Bible tone, Henry's voice, no archaic forms | Approachable without losing the author | Kevin |
| Word choice | Keep Henry's wording, including generic "man"; protected group nouns and titles; no pronoun-to-name substitution | Fidelity wins; these are the common silent drifts | Kevin |
| Scripture quotes | Henry's wording kept verbatim, plus parallel KJV and BSB verse text | His comments can hinge on KJV wording; BSB is public domain and modern | Kevin |
| ESV/NASB | Not included | Copyrighted and incompatible with CC0. Apps may show them at runtime under their own licenses. | Agent, Kevin agreed |
| Dated views | Faithful, never edited; tagged `dated_view`; `editorial_note` null | Kevin does not want to correct the author | Kevin |
| Modernizer and verifier | Claude via `claude -p`; GPT via `codex exec` | Different model families on Kevin's plans | Kevin |
| Claim extraction | Both models independently; union ledger; disagreements marked `disputed` | Stops the modernizer from writing its own answer key | Agent (adversarial review) |
| Model call isolation | Empty temp dir, stdin only, settings, memory, and tools disabled | Kevin's personal instructions must not leak in; the verifier must not see the prompts | Agent (adversarial review) |
| Billing | Subscriptions with overage; no API keys; no hard cap | Kevin's choice | Kevin |
| Loop cap | Round 0 plus at most 3 revise-and-recheck rounds | Prevents endless loops | Kevin |
| Contested flags | A withdrawn flag after a contest sends the section to humans | Verifiers concede too easily to confident arguments | Agent (adversarial review) |
| Human authority | Models cannot close human flags; Kevin adjudicates meaning flags and resolves `needs_human` sections | Fidelity wins; humans have the final say | Kevin |
| Sign-off | ≥ 1 approve on the current `text_hash`, no open human flags, blocking checks pass or are overridden | Reviews must refer to the text that ships | Kevin, with the hash rule from the review |
| Blind review | Decision before AI verdicts are revealed | Avoids anchoring on "verifier passed" | Agent (adversarial review) |
| Stage 2 sample | All `needs_human` and `contested_withdrawn`, plus 20% of the remaining `machine_verified`, rounded up | Review load on volunteers | Kevin |
| Go bar | 0 confirmed missed meaning errors; ≤ 10% wording flags; ≤ 25% `needs_human`; 0 `pipeline_error` | Meaning errors are unacceptable; the other limits keep the bar from being gamed | Kevin |
| Go-bar failure | Revise prompts, rerun affected sections, fresh sample, review again | Kevin's choice | Kevin |
| Mutation test | ≥ 90% overall, ≥ 80% per type, ≤ 10% false positives; one mutation per call; type and location must match | Proves the verifier is neither rubber-stamping nor flagging everything | Kevin |
| Length ratio | 0.8–1.3, warning | Catches gross additions or drops | Kevin |
| KJV span detection | ≥ 6 consecutive normalized words | Catches unmarked quotations without matching common phrases | Agent default, tunable |
| Malformed output retries | 2 | Transient CLI failures | Agent default |
| `voice` | Blocks in the AI loop; humans report it as `wording`, tolerated up to 10% | The machine gate is stricter than the human tolerance on purpose | Agent default |
| Unresolved sections in release | Ship with original only; `modern_text` null | Consumers never get unverified modern text | Kevin |
| `ai_modernized` flag and coverage | In the data and the README | The label must be in the data, not just requested | Kevin |
| Review site | Cloudflare Worker with D1, per-reviewer token links per chapter range | Hand out links, no accounts; GitHub Pages cannot store decisions | Kevin |
| Reviewer comments | Kept out of the repo and the release until consent | Comments by volunteers; Kevin to discuss with them | Kevin |
| Reviewer identity in data | Role labels, not names | Reviewer privacy | Agent default |
| Original text corrections | Never silent; logged in `ERRATA.md` | Fidelity and auditability | Kevin |
| Release format | SQLite and HelloAO-style JSON, semver schema | Easy for BibleMarker and other apps | Kevin |
| Stack | TypeScript on Bun, `just` | Built-in SQLite; Kevin's TypeScript preference | Kevin |
| Concurrency | Default 1, configurable | Subscription rate limits | Agent default |
| Commits | The pipeline never commits | Kevin controls history | Agent default |
| Repository | Standalone repo; Gnosis consumes its releases in a later phase | Gnosis data is CC-BY-SA; this data is CC0. The AI pipeline and review tooling do not belong in Gnosis. | Agent recommendation |
| Commentary ID | `matthew-henry-concise` | Readable, HelloAO-style | Agent default |
| Code and data licenses | MIT and CC0 1.0 | AI-generated text has weak copyright claims; maximally reusable | Handoff |

## Open questions

1. **Reviewer comment consent.** Owner: Kevin. Ask the pastor and the study leader whether their
   comments may be published under CC0. Until they agree, comments stay in `reviews/private/`.
2. **Henry Concise source.** Owner: agent, at Stage 0. Choose CCEL, SWORD `MHCC`, or HelloAO by
   verse-range markup quality and clear terms. Confirm the abridgment history.
3. **Reviewer availability for the Stage 1 final review.** Owner: Kevin.
4. **How BibleMarker consumes commentaries.** Owner: Kevin. It can download this release directly
   or receive commentaries through Gnosis, which it already uses. This affects only BibleMarker
   and the Gnosis phase, not this spec's schema.
5. **Review site address.** Owner: Kevin. Either a subdomain such as `review.gnosistools.com` or
   a `workers.dev` address.
