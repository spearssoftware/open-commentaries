import { buildSections, writeSections } from "../src/ingest/ingest.ts";

const book = process.argv[2];
if (!book) throw new Error("Usage: just ingest <OSIS book>, e.g. just ingest John");
const sections = buildSections(book);
const { written, unchanged } = writeSections(book, sections);
const comments = sections.filter((s) => s.kind === "comment").length;
console.log(
  `${book}: ${comments} comment sections, ${sections.length - comments} intros (${written} written, ${unchanged} unchanged)`,
);
