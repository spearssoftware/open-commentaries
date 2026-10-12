# Prior art

Searched 2026-10-12. Web search tooling indexes GitHub and Hugging Face poorly, so "not found"
means not found, not proven absent.

## Verdict

Go. No one has published an AI-modernized (or otherwise modernized) public-domain Bible
commentary as an openly licensed dataset.

## Findings

### Modernized editions

- **The New Matthew Henry Commentary** (Zondervan, ed. Martin H. Manser, 2008). Updates Henry's
  language and shortens his sentences. Copyrighted; cannot be used as a source or redistributed.
- **Tyndale Open Study Notes** (CC BY-SA 4.0). Modern English, openly licensed, but newly
  written commentary rather than a modernization. Complementary, not overlapping.

### Unmodernized open sources

- **HelloAO Free Use Bible API** (https://bible.helloao.org). API code MIT. Serves Adam Clarke,
  Jamieson-Fausset-Brown, Calvin, John Gill, Keil-Delitzsch, and Matthew Henry, all marked
  Public Domain Mark 1.0
  (https://bible.helloao.org/api/available_commentaries.json). Candidate schema reference and
  distribution partner.
- **CCEL** (https://ccel.org). Henry Complete and Concise in original wording.
- **CrossWire SWORD** modules `MHC` and `MHCC`. Original wording. Per-module license not yet
  verified.

### Adjacent work

- Kenneth Reitz, "Building a digital study Bible with AI" (2026-03-20,
  https://kennethreitz.org/essays/2026-03-20-building_a_digital_study_bible_with_ai). Generates
  new verse commentary; does not modernize existing commentary.
- "Can LLMs Write Faithfully? An Agent-Based Evaluation of LLM-generated Islamic Content"
  (https://arxiv.org/abs/2510.24438). Argues surface-overlap metrics (BLEU, ROUGE) miss
  theological faithfulness; supports claim-level verification over similarity scores.

### Parallel Bible text

- **Berean Standard Bible** is public domain as of 2023-04-30
  (https://berean.bible/terms.htm, https://ebible.org/engbsb/copyright.htm). Attribution is
  appreciated, not required. Modified versions must not use the Berean name.

## Inconclusive

Searches covering eBible.org commentaries, Bible Hub, STEP Bible, Open Bible Info, BibleGateway,
and YouVersion returned no relevant results. These sites were not inspected directly. The
license of each CrossWire SWORD module is unverified.
