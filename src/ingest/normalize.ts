/** Lowercase words with punctuation removed and whitespace collapsed, for text comparison. */
export function normalizeWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
