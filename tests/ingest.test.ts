import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSections,
  DATA_DIR,
  RANGE_CORRECTIONS,
  readSections,
  sectionFileName,
  writeSections,
} from "../src/ingest/ingest.ts";
import { normalizeWords } from "../src/ingest/normalize.ts";
import { sha256 } from "../src/sources/manifest.ts";
import { openMhccNt } from "../src/sources/mhcc.ts";
import { decodeEntities } from "../src/sources/osis.ts";
import { validateSection } from "../src/validate.ts";
import ccel from "./fixtures/ccel-john.json";

const onDisk = readSections("John");
const comments = onDisk.filter((s) => s.kind === "comment");

/** Sections whose normalized text differs from CCEL only in a reference abbreviation (ERRATA.md). */
const CCEL_ABBREVIATION_DIFFERENCES = ["John.9.24", "John.19.31", "John.19.38"];

describe("John state files", () => {
  test("every file validates against the schema", () => {
    expect(onDisk.flatMap((s) => validateSection(s, s.id))).toEqual([]);
  });

  test("116 comment sections and an intro for the book and each chapter", () => {
    expect(comments).toHaveLength(116);
    const intros = onDisk.filter((s) => s.kind === "intro").map((s) => s.osis_start);
    expect(intros).toEqual(["John", ...Array.from({ length: 21 }, (_, i) => `John.${i + 1}`)]);
  });

  test("every comment has its range, chapter, and sentences", () => {
    for (const s of comments) {
      expect(s.chapter).toBe(Number(s.osis_start.split(".")[1]));
      expect(s.original_text.length).toBeGreaterThan(0);
      expect(s.original_sentences.length).toBeGreaterThan(0);
    }
  });

  test("ranges match CCEL apart from logged corrections", () => {
    const expected = ccel.sections.map((c) => {
      const corrected = RANGE_CORRECTIONS[c.osis_start]?.osisEnd;
      return `${c.osis_start}-${corrected ?? c.osis_end}`;
    });
    expect(comments.map((s) => `${s.osis_start}-${s.osis_end}`)).toEqual(expected);
  });

  test("normalized text matches CCEL's hashes", () => {
    const mismatches = comments
      .filter((s, i) => sha256(normalizeWords(s.original_text)) !== ccel.sections[i]?.hash)
      .map((s) => s.osis_start);
    expect(mismatches).toEqual(CCEL_ABBREVIATION_DIFFERENCES);
  });

  test("files on disk equal a fresh ingest", () => {
    expect(buildSections("John")).toEqual(onDisk);
  });
});

test("round trip: no text is lost or duplicated", () => {
  // Independent of the OSIS parser: strip all markup from each unique module entry, dropping
  // only the structural labels ingest removes ("Chapter N" titles and "Verses N-M" labels).
  const source = openMhccNt()
    .sections("John")
    .map((e) =>
      decodeEntities(
        e.raw
          .replace(/<title type="x-s2">Chapter \d+<\/title>/g, " ")
          .replace(/<hi type="bold">Verses? [\d, -]+<\/hi>/g, " ")
          .replace(/<[^>]+>/g, " "),
      ),
    )
    .join(" ");
  const ingested = onDisk.map((s) => `${s.heading ?? ""} ${s.original_text}`).join(" ");
  expect(normalizeWords(ingested)).toBe(normalizeWords(source));
});

test("re-ingest refuses to overwrite a section past unreviewed", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-ingest-"));
  try {
    cpSync(join(DATA_DIR, "John"), dir, { recursive: true });
    const first = onDisk[5];
    if (!first) throw new Error("no sections");
    const path = join(dir, sectionFileName(first));
    writeFileSync(path, JSON.stringify({ ...first, review_status: "needs_human" }));
    expect(() => writeSections("John", onDisk, dir)).toThrow('past "unreviewed"');
    expect(JSON.parse(readFileSync(path, "utf8")).review_status).toBe("needs_human");
    writeFileSync(path, `${JSON.stringify(first, null, 2)}\n`);
    expect(writeSections("John", onDisk, dir)).toEqual({ written: 0, unchanged: onDisk.length });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
