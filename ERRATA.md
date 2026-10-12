# Errata

Source errors found during ingest. `original_text` is never silently corrected: text errors are
recorded here and left as printed. The modernizer may render an obviously intended word, and must
record it in the round's `notes`.

## Matthew Henry's Concise Commentary (SWORD MHCC 2.0)

| Location | Source reads | Issue | Handling |
|---|---|---|---|
| John 3:1 | "Verses 1-8" | The comment runs through 3:21 (the new birth, the brazen serpent, "God so loved the world"); the chapter outline gives 1-21, and the module's 3:9–21 slots are empty. CCEL has the same label. | Range corrected to John.3.1–John.3.21 by `RANGE_CORRECTIONS` in `src/ingest/ingest.ts`. Text unchanged. |
| John 15 outline | "foretold. (18-25)" | The outline entry for 15:18-25 is truncated; the opening words are missing. CCEL has the same text. | Kept as printed in the chapter 15 intro. |
| John 3:1–21 | "ver. #(11-13)" | A "#(" conversion artifact around the verse range. CCEL has the same text. | Kept as printed; the reference parser reads it as John 3:11–13. |

## Differences from CCEL (structural cross-check)

Normalized text matches CCEL for every John section except these, where the only difference is a
reference abbreviation. No wording differs.

| Section | MHCC | CCEL |
|---|---|---|
| John 9:24–34 | Ep 5:8 | Eph 5:8 |
| John 19:31–37 | Psa 34:20 | Ps 34:20 |
| John 19:38–42 | Is 53:9 | Isa 53:9 |
