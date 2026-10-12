import { expect, test } from "bun:test";
import { splitSentences } from "../src/ingest/sentences.ts";

test("references at the end of a sentence still end it", () => {
  expect(splitSentences("This is shown, ch. iii. The next point follows.")).toEqual([
    "This is shown, ch. iii.",
    "The next point follows.",
  ]);
  expect(splitSentences("As he said, ver. 16. Then he went.")).toEqual([
    "As he said, ver. 16.",
    "Then he went.",
  ]);
  expect(splitSentences("Christ's prediction, ch. 21:22. History relates it.")).toEqual([
    "Christ's prediction, ch. 21:22.",
    "History relates it.",
  ]);
});

test("protected abbreviations do not end sentences", () => {
  expect(splitSentences("See ver. 16, and ch. 3 also. Done.")).toEqual([
    "See ver. 16, and ch. 3 also.",
    "Done.",
  ]);
  expect(
    splitSentences("Riches, honours, &c. are vain; i.e. they pass. St. Paul knew it."),
  ).toEqual(["Riches, honours, &c. are vain; i.e. they pass.", "St. Paul knew it."]);
  expect(splitSentences("He wrote about A. D. 97, and died soon after.")).toEqual([
    "He wrote about A. D. 97, and died soon after.",
  ]);
  expect(splitSentences("Gold, silver, &c. Then came the end.")).toEqual([
    "Gold, silver, &c.",
    "Then came the end.",
  ]);
});

test("? and ! inside a sentence do not split it", () => {
  expect(
    splitSentences(
      "What does it signify, if we are not born again? if we die in our sins? Nothing.",
    ),
  ).toEqual(["What does it signify, if we are not born again? if we die in our sins?", "Nothing."]);
  expect(splitSentences('He cried, "Lord, save me!" and was saved.')).toEqual([
    'He cried, "Lord, save me!" and was saved.',
  ]);
});

test("closing quotes and brackets stay with their sentence", () => {
  expect(splitSentences('He said, "Look and live." Then they looked. (So it was.) Amen.')).toEqual([
    'He said, "Look and live."',
    "Then they looked.",
    "(So it was.)",
    "Amen.",
  ]);
});

test("outline rows keep their verse range; paragraphs always split", () => {
  expect(
    splitSentences("The Divinity of Christ. (1-5)\n\nHis Divine and human nature. (6-14)"),
  ).toEqual(["The Divinity of Christ. (1-5)", "His Divine and human nature. (6-14)"]);
});

test("real Henry sentences", () => {
  expect(
    splitSentences(
      "Nicodemus was afraid, or ashamed to be seen with Christ, therefore came in the night. When religion is out of fashion, there are many Nicodemites.",
    ),
  ).toEqual([
    "Nicodemus was afraid, or ashamed to be seen with Christ, therefore came in the night.",
    "When religion is out of fashion, there are many Nicodemites.",
  ]);
});
