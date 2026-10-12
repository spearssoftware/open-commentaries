import { readFileSync } from "node:fs";
import { CANDIDATES_PATH, type CandidatesFile } from "../src/glossary/candidates.ts";
import { checkGlossaries, readGlossaries, unapproved } from "../src/glossary/check.ts";

const glossaries = readGlossaries();
const problems = [
  ...checkGlossaries(
    glossaries,
    JSON.parse(readFileSync(CANDIDATES_PATH, "utf8")) as CandidatesFile,
  ),
  ...unapproved(glossaries).map(
    (f) => `${f} has no approval date; run \`just glossary-approve\` after review`,
  ),
];
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log("Glossaries are complete and approved.");
