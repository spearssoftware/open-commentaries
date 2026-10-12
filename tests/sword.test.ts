import { expect, test } from "bun:test";
import { openMhccNt, readMhccConf } from "../src/sources/mhcc.ts";
import { parseEntry, parseLabel } from "../src/sources/osis.ts";
import ccel from "./fixtures/ccel-john.json";

const sections = openMhccNt().sections("John");

test("conf declares the zCom driver the reader implements", () => {
  const conf = readMhccConf();
  expect(conf.ModDrv).toBe("zCom");
  expect(conf.CompressType).toBe("ZIP");
  expect(conf.Versification).toBe("KJV");
});

test("John 1:1 entry is the Verses 1-5 comment", () => {
  const first = sections[0];
  expect(first?.osisStart).toBe("John.1.1");
  expect(first?.osisEnd).toBe("John.1.5");
  const parsed = parseEntry(first?.raw ?? "", "John.1.1");
  expect(
    parsed.body.text.startsWith("The plainest reason why the Son of God is called the Word"),
  ).toBe(true);
  expect(parsed.label).toBe("1-5");
  expect(parsed.bookIntro?.heading).toBe("John");
  expect(parsed.chapterIntro?.heading).toBe("Chapter Outline");
  expect(parsed.chapterTitle).toBe(1);
});

test("John yields 116 sections whose linked ranges match CCEL", () => {
  expect(sections.map((s) => [s.osisStart, s.osisEnd])).toEqual(
    ccel.sections.map((s) => [s.osis_start, s.osis_end]),
  );
});

test("every Verses label agrees with its linked range", () => {
  for (const s of sections) {
    const { label } = parseEntry(s.raw, s.osisStart);
    const { start, end } = parseLabel(label ?? "");
    expect(`John.${s.osisStart.split(".")[1]}.${start}-${end}`).toBe(
      `${s.osisStart}-${s.osisEnd.split(".")[2]}`,
    );
  }
});

test("headings slots hold no text; intros live in the preverse part", () => {
  const nt = openMhccNt();
  for (let c = 0; c <= 21; c++) {
    expect(
      nt
        .heading("John", c)
        .replace(/<[^>]+>/g, "")
        .trim(),
    ).toBe("");
  }
});

test("parseEntry decodes entities, drops emphasis, keeps reference spans", () => {
  const p = parseEntry(
    '<hi type="bold">Verses 2, 3</hi> <div sID="a" type="x-p"/>Rich &amp;c. <hi type="italic">so</hi> see <reference osisRef="Exod.7.20">Ex 7:20</reference>. <div eID="a" type="x-p"/>',
    "test",
  );
  expect(p.label).toBe("2, 3");
  expect(parseLabel("2, 3")).toEqual({ start: 2, end: 3 });
  expect(p.body.text).toBe("Rich &c. so see Ex 7:20.");
  expect(p.body.refs).toEqual([{ start: 16, end: 23, osisRef: "Exod.7.20" }]);
});

test("parseEntry rejects unknown tags with the location", () => {
  expect(() => parseEntry("<note>x</note>", "John.9.9")).toThrow("John.9.9: unknown tag <note>");
  expect(() => parseEntry("a &bogus; b", "x")).toThrow("Unknown XML entity &bogus;");
});
