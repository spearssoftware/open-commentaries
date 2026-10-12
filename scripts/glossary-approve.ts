// Stamps today's date into each glossary's "approved" field after Kevin's review.
import { loadCandidates } from "../src/glossary/candidates.ts";
import { approveGlossaries, readGlossaries } from "../src/glossary/check.ts";

const problems = approveGlossaries(readGlossaries(), loadCandidates());
if (problems.length) {
  console.error(`Not approving; fix these first:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Glossaries approved.");
