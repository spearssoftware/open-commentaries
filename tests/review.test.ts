import { describe, expect, test } from "bun:test";
import { chapterInRange, parseChapterRange } from "../src/review/chapters.ts";
import type { ExportedDecision } from "../src/review/client.ts";
import { mergeReviews } from "../src/review/import.ts";
import type { SectionState } from "../src/types.ts";

describe("parseChapterRange", () => {
  test("parses a single chapter and a range", () => {
    expect(parseChapterRange("5")).toEqual({ from: 5, to: 5 });
    expect(parseChapterRange("1-3")).toEqual({ from: 1, to: 3 });
  });

  test("rejects malformed, descending, and zero ranges", () => {
    for (const bad of ["", "a", "3-1", "0", "0-2", "1-", "1,2", "-3"]) {
      expect(() => parseChapterRange(bad)).toThrow(/Invalid chapters/);
    }
  });

  test("book intro (chapter 0) belongs only to ranges starting at 1", () => {
    expect(chapterInRange(0, { from: 1, to: 3 })).toBe(true);
    expect(chapterInRange(0, { from: 2, to: 3 })).toBe(false);
    expect(chapterInRange(4, { from: 1, to: 3 })).toBe(false);
    expect(chapterInRange(2, { from: 2, to: 2 })).toBe(true);
  });
});

const section = (id: string): SectionState =>
  ({ id, reviews: [], review_status: "unreviewed" }) as unknown as SectionState;

const decision = (over: Partial<ExportedDecision> = {}): ExportedDecision => ({
  id: "d1",
  token_id: 1,
  section_id: "s1",
  reviewer: "pastor",
  phase: "blind",
  decision: "flag",
  type: "meaning",
  dated_view: 1,
  comment: "A claim was dropped.",
  text_hash: "abc",
  status_at_review: "machine_verified",
  round: 2,
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("mergeReviews", () => {
  test("appends a review and keeps the comment out of state", () => {
    const r = mergeReviews([section("s1")], [decision()]);
    expect(r.added).toBe(1);
    expect(r.sections[0]?.reviews).toEqual([
      {
        reviewer: "pastor",
        phase: "blind",
        decision: "flag",
        type: "meaning",
        dated_view: true,
        text_hash: "abc",
        status_at_review: "machine_verified",
        round: 2,
        date: "2026-10-01T00:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(r.sections)).not.toContain("A claim was dropped.");
    expect(r.comments).toEqual([
      {
        id: "d1",
        section_id: "s1",
        reviewer: "pastor",
        phase: "blind",
        type: "meaning",
        comment: "A claim was dropped.",
        created_at: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  test("approvals omit type, and a null hash stays null", () => {
    const r = mergeReviews(
      [section("s1")],
      [decision({ decision: "approve", type: null, comment: null, text_hash: null })],
    );
    const review = r.sections[0]?.reviews[0];
    expect(review).toBeDefined();
    expect(review && "type" in review).toBe(false);
    expect(review?.text_hash).toBeNull();
    expect(r.comments).toEqual([]);
  });

  test("importing twice changes nothing", () => {
    const first = mergeReviews([section("s1")], [decision()]);
    const second = mergeReviews(first.sections, [decision()]);
    expect(second.added).toBe(0);
    expect(second.alreadyImported).toBe(1);
    expect(second.sections[0]).toBe(first.sections[0]);
  });

  test("counts decisions for unknown sections and never touches other fields", () => {
    const s = section("s1");
    const r = mergeReviews([s], [decision({ section_id: "nope" })]);
    expect(r.unknownSections).toBe(1);
    expect(r.sections[0]).toBe(s);
  });

  test("blind and amended decisions on one section are both kept", () => {
    const r = mergeReviews(
      [section("s1")],
      [
        decision(),
        decision({ id: "d2", phase: "amended", created_at: "2026-10-02T00:00:00.000Z" }),
      ],
    );
    expect(r.sections[0]?.reviews.map((x) => x.phase)).toEqual(["blind", "amended"]);
  });
});
