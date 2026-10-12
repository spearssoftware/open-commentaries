// Builds tests/fixtures/ccel-john.json from a local copy of CCEL's mhcc.txt
// (https://ccel.org/ccel/h/henry/mhcc/cache/mhcc.txt). Only verse ranges and hashes of
// normalized section text are written; CCEL's text itself is never committed.
// Usage: bun scripts/ccel-fixture.ts <path-to-mhcc.txt>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeWords } from "../src/ingest/normalize.ts";
import { sha256 } from "../src/sources/manifest.ts";

const path = process.argv[2];
if (!path) throw new Error("Usage: bun scripts/ccel-fixture.ts <path-to-mhcc.txt>");
const lines = readFileSync(path, "utf8").split("\n");
const start = lines.findIndex((l) => l.trim() === "John" && /^\s{20,}John$/.test(l));
const end = lines.findIndex((l, i) => i > start && /^\s{20,}Acts$/.test(l));
if (start < 0 || end < 0) throw new Error("Could not find the John and Acts headings");

const sections: { osis_start: string; osis_end: string; hash: string }[] = [];
let chapter = 0;
let current: { osis_start: string; osis_end: string; text: string[] } | undefined;
const flush = () => {
  if (!current) return;
  const { osis_start, osis_end, text } = current;
  sections.push({ osis_start, osis_end, hash: sha256(normalizeWords(text.join(" "))) });
  current = undefined;
};
for (const line of lines.slice(start + 1, end)) {
  const ch = line.match(/^Chapter (\d+)$/);
  if (ch) {
    flush();
    chapter = Number(ch[1]);
    continue;
  }
  const label = line.match(/^Verses? (\d+)(?:(?:-|, )(\d+))?$/);
  if (label) {
    flush();
    const from = label[1] as string;
    current = {
      osis_start: `John.${chapter}.${from}`,
      osis_end: `John.${chapter}.${label[2] ?? from}`,
      text: [],
    };
    continue;
  }
  if (/^\s*_{10,}\s*$/.test(line)) continue;
  current?.text.push(line);
}
flush();
const out = join(import.meta.dir, "../tests/fixtures/ccel-john.json");
writeFileSync(
  out,
  `${JSON.stringify({ source: "https://ccel.org/ccel/h/henry/mhcc/cache/mhcc.txt", retrieved: "2026-10-12", sections }, null, 2)}\n`,
);
console.log(`${sections.length} sections written to ${out}`);
