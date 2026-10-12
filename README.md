# open-commentaries

Open, faithful modern-English versions of public-domain Bible commentaries, published with the
originals as a CC0 dataset. The pilot modernizes Matthew Henry's Concise Commentary on the Gospel
of John.

## Status

Stage 0 (preparation): sources, ingest, model runner, glossaries, and the review site. No
modernized text exists yet. See [the spec](docs/specs/modernization.md) for the full plan.

## AI-modernized text

The modern text in this dataset will be produced by AI models (Claude modernizes, GPT verifies)
and checked by human reviewers, who have the final say. Every modernized section carries
`ai_modernized: true`. The original text always ships alongside it.

## Licenses

- Code: [MIT](LICENSE).
- Modernized text and verification data: [CC0 1.0](LICENSE-DATA).
- Original commentary, KJV, and BSB text: public domain. See [SOURCES.md](SOURCES.md).

## Development

Requires [Bun](https://bun.com) and [just](https://just.systems).

```sh
just setup   # install dependencies
just check   # lint, type-check, and test (the CI gate)
```
