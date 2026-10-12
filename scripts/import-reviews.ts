import { exportDecisions } from "../src/review/client.ts";
import { importDecisions } from "../src/review/import.ts";

const summary = importDecisions(await exportDecisions());
console.log(
  `${summary.added} new or updated reviews, ${summary.alreadyImported} already imported, ` +
    `${summary.commentsWritten} comments written, ${summary.unknownSections} unknown sections`,
);
