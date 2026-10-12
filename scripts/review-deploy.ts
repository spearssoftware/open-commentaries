import { readSections } from "../src/ingest/ingest.ts";
import { chapterInRange, parseChapterRange } from "../src/review/chapters.ts";
import { uploadSections } from "../src/review/client.ts";

const [book, chapters] = process.argv.slice(2);
if (!book || !chapters) {
  throw new Error(
    "Usage: just review-deploy <OSIS book> <chapters>, e.g. just review-deploy John 1-3",
  );
}
const range = parseChapterRange(chapters);
const sections = readSections(book)
  .filter((s) => chapterInRange(s.chapter, range))
  .map((s) => ({ ...s, book }));
if (!sections.length)
  throw new Error(`No ${book} sections in chapters ${chapters}; run just ingest ${book} first`);

let upserted = 0;
for (let i = 0; i < sections.length; i += 50) {
  upserted += (await uploadSections(sections.slice(i, i + 50))).upserted;
}
console.log(`${book} ${chapters}: uploaded ${upserted} sections`);
