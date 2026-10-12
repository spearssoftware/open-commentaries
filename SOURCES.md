## Upstream Sources

Every input is committed under `sources/` exactly as extracted from the upstream zip.
`sources/manifest.json` records each zip's URL, retrieval date, version, and the SHA-256 of the zip
and of every extracted file. `just verify-sources` re-hashes the committed files offline (part of
`just check`); `just fetch-sources` reports upstream drift without replacing anything.

### Matthew Henry's Concise Commentary (SWORD module `MHCC`)
- URL: https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHCC.zip
- Retrieved: 2026-10-12
- Version: 2.0 (SwordVersionDate 2021-02-14)
- SHA-256 (zip): 8fa571b0c0556c09966fc8b64edb856f5c1714cc5ac36ae06907a318ec61074f
- License: `DistributionLicense=Public Domain`. The module's `About` text reads "Public
  Domain--Copy Freely. This text matches the printed edition as published by Moody Press, 28th
  printing, no Copyright displayed. ISBN: 0-8024-5190-X."
- Files used: `modules/comments/zcom/mhcc/nt.{bzs,bzv,bzz}`, `mods.d/mhcc.conf`
- Format: zCom (zlib-compressed, one block per book), OSIS markup, KJV versification
- History (from the `.conf`): version 1.1 "Swapped with complete edition"; version 2.0
  (2021-02-14) "New source from https://ccel.org. Solves MOD-381 and MOD-248"
  (`TextSource=https://ccel.org/ccel/h/henry/mhcc/cache/mhcc.txt`, CCEL's ThML edition of 2001)
- Abridgment: the *Concise Commentary* is not Henry's own text. It is an abridgment of his
  *Exposition of the Old and New Testaments* (1708–1710), first issued in the 19th century and
  later published by Moody Press (1963, ISBN 0-8024-5190-X). That edition credits Henry together
  with Thomas Scott and others, so the Concise is a composite. `abridgment_note` in the release
  states this; `author` names Henry.

### CCEL (structural cross-check only)
- URL: https://ccel.org/ccel/h/henry/mhcc/cache/mhcc.txt
- Use: section verse ranges and hashes of normalized section text, used as test fixtures
  (`tests/fixtures/ccel-john.json`). CCEL's site terms restrict republishing its files, so no
  CCEL text is committed.

### King James Version (eBible.org `eng-kjv`)
- URL: https://ebible.org/Scriptures/eng-kjv_usfm.zip
- Retrieved: 2026-10-12
- Version: source files dated 2026-09-26 (zip Last-Modified 2026-10-08)
- SHA-256 (zip): 80bb0add46d3a648e6f68239d2721c259df23e3f247065bb12f2819c8c23728d
- License: Public Domain (the 1769 standardized text). In the United Kingdom the KJV remains
  under Crown letters patent; see `sources/kjv/copr.htm`.
- Files used: the book `.usfm` files; Strong's attributes are stripped at parse time
- Use: detecting Henry's quotations and supplying `kjv_text`

### Berean Standard Bible (BSB)
- URL: https://bereanbible.com/bsb_usfm.zip (from https://berean.bible)
- Retrieved: 2026-10-12
- Version: zip Last-Modified 2026-10-02
- SHA-256 (zip): f0c56438eb89c98e8f62c5c00461e25cc35b098ad5b179bc350cede759ee5f87
- License: CC0 1.0 (public domain dedication). The Berean name is not used for anything modified;
  this dataset quotes BSB verse text unmodified in `bsb_text`.
- Files used: the book `.usfm` files; footnotes are kept for `bsb_note`
- Text-critical passages: John 5:4 is absent from the BSB, so `bsb_text` is null and `bsb_note`
  comes from the 5:3 footnote. John 7:53–8:11 is printed unbracketed, so its BSB text is kept and
  the 7:52 footnote is recorded as `bsb_note`.
