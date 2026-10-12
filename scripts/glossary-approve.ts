// Stamps today's date into each glossary's "approved" field after Kevin's review.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDIDATES_PATH, type CandidatesFile } from "../src/glossary/candidates.ts";
import { checkGlossaries, readGlossaries } from "../src/glossary/check.ts";

const problems = checkGlossaries(
  readGlossaries(),
  JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as CandidatesFile,
);
if (problems.length) {
  console.error(`Not approving; fix these first:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
for (const name of ["locked", "drift", "strength"]) {
  const path = join(import.meta.dir, `../glossary/${name}.json`);
  const file = JSON.parse(readFileSync(path, "utf8")) as { approved: string | null };
  file.approved = today;
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}
console.log(`Glossaries approved ${today}.`);
