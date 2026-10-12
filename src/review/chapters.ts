export interface ChapterRange {
  from: number;
  to: number;
}

/** Parses `5` or `1-3` into an inclusive chapter range. */
export function parseChapterRange(input: string): ChapterRange {
  const m = /^(\d+)(?:-(\d+))?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid chapters "${input}"; use a number like 5 or a range like 1-3`);
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : Number(m[2]);
  if (from < 1 || to < from) {
    throw new Error(`Invalid chapters "${input}"; chapters start at 1 and the range must ascend`);
  }
  return { from, to };
}

/** The book intro has chapter 0 and belongs to ranges that start at chapter 1. */
export function chapterInRange(chapter: number, { from, to }: ChapterRange): boolean {
  if (chapter === 0) return from === 1;
  return chapter >= from && chapter <= to;
}
