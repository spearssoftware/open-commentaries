import { describe, expect, test } from "bun:test";
import { BOOKS, NT_START } from "../src/bible/books";
import { kjvVersification, loadBsb, loadBsbNotes, loadKjv, parseUsfm } from "../src/sources/usfm";

const kjv = loadKjv();
const bsb = loadBsb();

describe("parseUsfm", () => {
  const source = String.raw`\id JHN test
\h John
\c 1
\s1 Heading
\p
\v 1 \w In|strong="G1722"\w* the \+w be\+w*ginning\x - \xo 1:1 \xt Gen 1:1\x* was\f + \fr 1:1 \ft Or \fqa x\fv 2\fv*y\f* \wj Word\wj*.
\q1 \v 2 He was
\q2 with God.
\c 2
\p \v 1 Next.`;

  test("strips markers, notes, and cross-references", () => {
    const { usfm, verses } = parseUsfm(source);
    expect(usfm).toBe("JHN");
    expect(verses).toEqual([
      { chapter: 1, verse: 1, text: "In the beginning was Word.", notes: ["Or x2 y"] },
      { chapter: 1, verse: 2, text: "He was with God.", notes: [] },
      { chapter: 2, verse: 1, text: "Next.", notes: [] },
    ]);
  });

  test("throws on unknown paragraph markers", () => {
    expect(() => parseUsfm("\\id JHN\n\\c 3\n\\zz \\v 1 Hi")).toThrow(/\\zz.*JHN chapter 3/);
  });
});

describe("KJV", () => {
  test("verse text", () => {
    expect(kjv.get("John.1.1")?.text).toBe(
      "In the beginning was the Word, and the Word was with God, and the Word was God.",
    );
    const v6 = kjv.get("John.1.6")?.text ?? "";
    expect(v6).not.toContain("¶");
    expect(v6).toContain("whose name was John");
  });

  test("counts", () => {
    expect([...kjv.keys()].filter((k) => k.startsWith("John.")).length).toBe(879);
    const nt = BOOKS.slice(NT_START).map((b) => b.osis);
    expect([...kjv.keys()].filter((k) => nt.includes(k.split(".")[0] ?? "")).length).toBe(7957);
  });

  test("versification", () => {
    const v = kjvVersification();
    expect(v).toHaveLength(66);
    const john = v.find((b) => b.osis === "John");
    expect(john?.verses).toHaveLength(21);
    expect(kjv.has("John.3.16")).toBe(true);
    expect(john?.verses[2]).toBeGreaterThanOrEqual(16);
  });
});

describe("BSB", () => {
  test("omits John 5:4 and captures notes", () => {
    expect(bsb.has("John.5.4")).toBe(false);
    expect(bsb.get("John.5.3")?.notes.join(" ")).toContain("awaiting the moving of the waters");
    expect(bsb.get("John.7.52")?.notes.join(" ")).toContain("do not include");
    expect(bsb.get("John.7.53")?.text).toBe("Then each went to his own home.");
  });

  test("footnotes are removed from text", () => {
    const v5 = bsb.get("John.1.5");
    expect(v5?.text).toBe(
      "The Light shines in the darkness, and the darkness has not overcome it.",
    );
    expect(v5?.notes.join(" ")).toContain("comprehended");
  });
});

describe.each([
  ["KJV", kjv],
  ["BSB", bsb],
])("%s output hygiene", (_name, map) => {
  test("no markers or attributes remain", () => {
    for (const [id, v] of map) {
      for (const s of [v.text, ...v.notes]) {
        expect(s.includes("\\") || s.includes("|"), `${id}: ${s}`).toBe(false);
      }
    }
  });
});

test("BSB notes cover every omitted verse through its \\fv footnote, plus John 7:53-8:11", () => {
  const notes = loadBsbNotes();
  for (const v of ["John.5.4", "Matt.17.21", "Mark.9.44", "Acts.8.37", "Rom.16.24"]) {
    expect([v, loadBsb().has(v), notes.has(v)]).toEqual([v, false, true]);
  }
  expect(notes.get("John.5.4")).toContain("awaiting the moving of the waters");
  expect(notes.get("John.8.7")).toContain("do not include");
});
