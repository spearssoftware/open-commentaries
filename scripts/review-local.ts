import { bookByOsis } from "../src/bible/books.ts";
import { startServer } from "../src/local-review/server.ts";

const book = process.argv[2] ?? "John";
bookByOsis(book);
const port = Number(process.env.PORT ?? 4173);
const server = startServer(book, port);
console.log(
  `Review ${book} at ${server.url} (Ctrl-C to stop). Notes save to .local-review/notes.json.`,
);
