import { expect, test } from "bun:test";
import { verifySources } from "../src/sources/manifest.ts";

test("committed sources match sources/manifest.json", () => {
  expect(verifySources()).toEqual([]);
});
