import { loadCandidates } from "../src/glossary/candidates.ts";
import { checkGlossaries, readGlossaries, unapproved } from "../src/glossary/check.ts";

const glossaries = readGlossaries();
const problems = [
  ...checkGlossaries(glossaries, loadCandidates()),
  ...unapproved(glossaries).map(
    (f) => `${f} has no approval date; run \`just glossary-approve\` after review`,
  ),
];
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log("Glossaries are complete and approved.");
