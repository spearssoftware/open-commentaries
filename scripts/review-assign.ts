import { bookByOsis } from "../src/bible/books.ts";
import { parseChapterRange } from "../src/review/chapters.ts";
import { createToken, reviewUrl } from "../src/review/client.ts";
import type { ReviewerRole } from "../src/types.ts";

const ROLES: ReviewerRole[] = ["maintainer", "study-leader", "pastor"];

const [role, book, chapters] = process.argv.slice(2);
if (!role || !book || !chapters) {
  throw new Error(
    "Usage: just review-assign <maintainer|study-leader|pastor> <OSIS book> <chapters>",
  );
}
bookByOsis(book);
const reviewer = ROLES.find((r) => r === role);
if (!reviewer) throw new Error(`Reviewer must be one of ${ROLES.join(", ")}; got "${role}"`);
const { from, to } = parseChapterRange(chapters);
const { id, token } = await createToken(reviewer, book, from, to);
console.log(`Link: ${reviewUrl()}/#t=${token}`);
console.log(`Token id: ${id} (revoke with: just review-revoke ${id})`);
