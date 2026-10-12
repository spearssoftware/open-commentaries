import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectCandidates } from "../src/glossary/candidates.ts";
import { readSections } from "../src/ingest/ingest.ts";
import { CliError } from "../src/models/runner.ts";

const book = process.argv[2];
if (!book)
  throw new Error("Usage: just glossary-candidates <book>, e.g. just glossary-candidates John");
const sections = readSections(book);
if (!sections.length)
  throw new Error(`No state files for ${book}; run \`just ingest ${book}\` first`);
const prompt = readFileSync(join(import.meta.dir, "../prompts/glossary-candidates.v1.md"), "utf8");
try {
  const file = await collectCandidates(book, sections, prompt);
  console.log(`Done: ${file.candidates.length} candidates from ${file.calls.length} calls.`);
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(
    `Stopped: ${error.message}. Progress saved; re-run \`just glossary-candidates ${book}\` to resume.`,
  );
  process.exit(1);
}
