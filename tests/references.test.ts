import { expect, test } from "bun:test";
import {
  collectReferences,
  parsePlainReferences,
  romanToNumber,
} from "../src/ingest/references.ts";

const CASES: [string, string[]][] = [
  ["as in ver. 16, he", ["John.3.16"]],
  ["see v. 5 here", ["John.3.5"]],
  ["Christ's discourse, ver. #(11-13), shows", ["John.3.11-John.3.13"]],
  ["ver. 11-13 and", ["John.3.11-John.3.13"]],
  ["foretold, ch. 21:22. History", ["John.21.22"]],
  ["from heaven, ch. 1:13, and", ["John.1.13"]],
  ["see ch. 3:5-8 above", ["John.3.5-John.3.8"]],
  ["as in ch. iii. The", ["John.3"]],
  ["compare ch. xii. also", ["John.12"]],
  ["as Joh 1:14 says", ["John.1.14"]],
  ["by the word, 1Pe 1:23, and", ["1Pet.1.23"]],
  ["sung in Ps. 23:1 of old", ["Ps.23.1"]],
  ["Nu 21:6-9 tells", ["Num.21.6-Num.21.9"]],
  ["In 3:5 nothing", []],
];

test("plain-text reference styles resolve against the section's book and chapter", () => {
  for (const [text, expected] of CASES) {
    expect([text, parsePlainReferences(text, "John", 3).map((r) => r.osis)]).toEqual([
      text,
      expected,
    ]);
  }
});

test("roman numerals", () => {
  expect([
    romanToNumber("iii"),
    romanToNumber("iv"),
    romanToNumber("xix"),
    romanToNumber("xxi"),
  ]).toEqual([3, 4, 19, 21]);
});

test("marked-up references win and plain ones inside them are ignored", () => {
  const text = "the brazen serpent, Nu 21:6-9. Then ver. 14.";
  const refs = collectReferences(text, "John", 3, [
    { start: 20, end: 29, osisRef: "Num.21.6-Num.21.9" },
  ]);
  expect(refs).toEqual([
    { osis: "Num.21.6-Num.21.9", inferred: false },
    { osis: "John.3.14", inferred: false },
  ]);
});
