# PRISM: project write-up

*Living document. Add to it as the project progresses.*
*Last updated: 2026-11-14 · Version: 0.2 (local prototype)*

PRISM (Pattern Recognition and Investigation of Shared Matches; formerly
Pattern Explorer) is a static web application for discovering, comparing and
inspecting shared linguistic patterns (word sequences, part-of-speech
sequences, and hybrid word/POS patterns) across two to four text datasets.
It supports forensic authorship analysis (patterns shared between a
questioned dataset Q and comparison datasets K1–K3) and second-language
teaching (recurrent constructions).

---

## TODO

1. **Add better datasets.** Replace the small synthetic test corpora
   (≈250–320 words per dataset) with authentic, appropriately licensed corpora
   of ≈10,000 words per dataset for each genre (literary, academic, email,
   learner writing). Record sources and licences in each genre's hover card.
   Literary is done: four complete Shakespeare tragedies (2026-11-14).
   Academic, email and learner writing remain synthetic.
2. **Further rarity measures.** Single-word rarity is done (section 2.5).
   Still to add, as selectable alternatives in the same dropdown:
   - **Bigram and trigram z-scores.** Reference n-gram tables are too large to
     load whole, so split them at build time into many small hashed files,
     and fetch only those containing n-grams in the current results. Prune
     low counts if needed (state this). Score each pattern by the z-scores of
     the bigrams/trigrams within its runs of exact words.
   - **Keyness** (log-likelihood plus log ratio) of a pattern in the selected
     datasets against the reference corpus. Single words can use the existing
     reference list, but this needs the true size of the reference corpus,
     not just the total of listed counts.
   - POS and hybrid elements need a POS-tagged reference corpus tagged with
     the app's tagger; until then only word elements are scored.
   - **Licence check:** confirm the terms of the BNC/COCA lists (Nation, via
     EAP Foundation) before publishing the derived file on a public site.
3. **Publish.** Create the GitHub repository and deploy to GitHub Pages
   (workflow in `README.md`). Once the site is finalised, serve it from
   jb11.org and add it to the jb11.org tools page.

Done on 2026-11-14: logo and favicon; colours matched to jb11.org (section 2.1);
single-word rarity (section 2.5).

Carried over from v0.1:

- v2.0: real-time tagging, so uploads use the same tagger as the built-in
  corpora and the two can be compared (`src/preprocess/tagger.ts`).
- Exploratory hybrid algorithm (bounded branching / beam search). The
  interface is ready in `src/engine/discovery.ts`.

---

## 1. Software engineering principles

**Requirements first, then stages.** Development followed the remit's six
stages (interface and data model → linguistic processing → pattern detection
→ consolidation and statistics → results exploration → testing and
deployment). Ambiguities were raised as questions with proposed defaults
before coding, and the answers were recorded as design decisions.

**Separation of concerns.** The code is split along the boundaries the remit
names:

| Concern | Module |
|---|---|
| Corpus management | `src/corpus/` |
| Linguistic preprocessing | `src/preprocess/` |
| Pattern discovery | `src/engine/discovery.ts` |
| Consolidation and counting | `src/engine/consolidate.ts`, `count.ts` |
| Statistics | `src/engine/stats.ts` |
| Result views (sort, filter, KWIC) | `src/results/` |
| Visualisation | `src/ui/` |
| Background processing | `src/worker/` |

**A pure, deterministic core.** The analysis engine has no DOM or network
dependencies. The same input always gives the same output: no randomness,
deterministic tie-breaking, and patterns ordered by canonical key. This makes
it testable in Node and reproducible for research.

**Discovery separate from counting.** Discovery only proposes pattern
representations. Every pattern is then counted independently across all
selected datasets, so frequencies are real occurrences rather than the number
of times pairwise matching happened to find the pattern (remit §7).

**Testing against known answers.** Small hand-tagged corpora with known
expected results test each behaviour: bidirectional extension, preferring
words over POS tags, repeated switching between the two, boundaries, maximum
length, deduplication, counting across datasets, overlaps, sorting,
concordance alignment and export. One test checks that indexed counting
matches a brute-force scan for every pattern.

**Transparency over appearance.** Nothing is fabricated: synthetic data is
labelled as synthetic everywhere (header pill, footer, genre hover card, exports).
No frequency is presented as evidential strength. Q is described as an
analytical role, not an authorship conclusion.

**Privacy by design.** Everything runs in the browser. Uploaded text is read
with the File API and tagged locally, and nothing is sent to a server. The
app also loads no external fonts or scripts.

**Extensibility through interfaces.** `DiscoveryStrategy` (for the future
exploratory algorithm) and `Tagger` (for real-time tagging in v2.0) let new
components be added without touching the rest of the pipeline. Rarity methods
sit in a registry (`src/rarity/methods.ts`): each declares its reference data,
formula and caveat, so further measures can be added without changing the
interface or exports.

**Responsiveness and performance.** Efficient indexing (integer-coded word
stream, n-gram hash index, word posting lists) and a Web Worker keep analysis
under a second for about 40,000 words. Sorting, filtering, paging and
selection never re-run discovery.

**Accessibility.** The word/POS distinction never relies on colour alone:
POS elements are upper-case tags with dashed or dotted styling, and every
element has an accessible label. Controls have ARIA roles and visible focus,
and the startup animation respects reduced-motion settings.

**Honest reporting.** Known limitations are documented in the README. The
issues met during development are recorded below.

---

## 2. Design

### 2.1 Visual design

The supplied PNG was the reference. It shows a dark, three-panel desktop
layout (corpus and analysis controls · shared patterns · pattern details)
and a stacked mobile layout. Colours are defined as tokens in `:root`.

**Colour scheme (2026-11-14), matched to jb11.org:** dark grey page
(`#3b3b3b`, as on the site), black header and footer, darker grey panels,
and the site's orange (`#ff8c00`) for buttons, the selected state and
active tabs, with pale yellow (`#ffe680`) for focus and highlights. The
favicon (`Pattern explorer/favicon.ico`) is used as the browser-tab icon and
as the logo in the header and startup screen.

- **Pale orange, solid outline:** exact word match.
- **Pale yellow, dashed or dotted outline, upper-case bold tag:** POS match.
- The same conventions are used in pattern chips, the legend and the KWIC
  concordance. In the concordance the original words are kept and coloured
  by how they matched, and hovering a POS-matched word shows its tag.

Layout (revised 2026-11-14): the two control panels, 01 Corpus selection and
02 Analysis configuration, sit side by side under the header, each split
into two inner columns (genres | datasets; pattern type | settings), so
Find Patterns is visible without scrolling on a laptop (bottom edge at 552 px
on 1366 × 768). Shared patterns and pattern details sit side by side below.
From 1240 px down, the panels stack in one column (inner columns kept);
below 820 px everything is one column and the result headings become a
compact sort bar.

### 2.2 Data model

- **Token:** original form, lower-cased form, UPOS tag, character offsets,
  sentence-start flag, word or punctuation.
- **Dataset → documents → tokens:** the original text and document
  boundaries are kept.
- **PatternResult:** elements (word or POS), length, word and POS element
  counts, lexical specificity, counts per dataset role, total, coverage,
  document frequency, first position in Q, maximal flag, and the start
  position of every occurrence.

### 2.3 Algorithms

1. **Match stream.** All word tokens are laid out in one integer-coded array
   (Q first), with punctuation removed. Each sentence of each document is a
   segment, and no match crosses a segment boundary.
2. **Lexical / POS discovery.** Every n-gram between the minimum and maximum
   length that occurs in Q and at least one K.
3. **Greedy hybrid discovery.** Pairs of Q and K positions that share a
   word sequence of at least the anchor length are the anchors. Each anchor
   grows to its full exact-word run, then extends outwards, alternating left
   and right. At each position words are compared first, then POS tags. A
   side stops on a mismatch, at a boundary, or at the maximum length. Only
   left-maximal pairs are processed, so each region is examined once.
4. **Consolidation.** Duplicates are removed. For hybrid patterns, the
   sub-windows that still mix words and POS tags are generated so shorter
   constituents can be explored.
5. **Independent counting.** Each pattern is searched for in all selected
   datasets, using the rarest word's posting list plus verification, or the
   full n-gram index. Every distinct start position counts once, so
   overlapping occurrences are all counted.
6. **Filtering and maximality.** Only patterns found in Q and at least one K
   are kept. A pattern is maximal if no other kept pattern contains it.
7. **Statistics.** Descriptive frequencies, plus word rarity (section 2.5).

### 2.4 Interaction design

- Sort by three tabs (Most Frequent, Longest, Order in Q) or by clicking the
  Length, Freq., Coverage and Rarity headings. Clicking the active heading again
  reverses the order. Ties are always broken the same way.
- A toggle switches between maximal patterns and all patterns, including
  constituents. Counts are the same in both views.
- Text filter by word or POS tag, a Filters panel (frequency, length,
  coverage) and pagination.
- Genre details on hover or keyboard focus (inline on touch screens); a "How it works" dialog from the ? button.
- Pattern details: statistic tiles, a distribution chart (raw counts and rate
  per 10,000 words), and a KWIC concordance that can be filtered by dataset
  and expanded to all matches.
- CSV and JSON export of the current view, with the analysis settings, tagger
  details, method notes and occurrence positions.

### 2.5 Word rarity (default rarity measure)

In the interface the reference is called simply **Reference corpus**. In
full, it is:

- **Source:** Paul Nation's BNC/COCA word-family lists, as distributed by
  EAP Foundation (`BNC_COCA_lists_from_EAP_foundation.xlsx`): 25 bands of
  1,000 word families (25,001 families, 76,112 word forms).
- **Band (primary measure):** the frequency rank of the word's family in the
  BNC/COCA lists, which select and combine evidence from the British National
  Corpus and the Corpus of Contemporary American English. 1k = the 1,000 most
  common families, 25k = the least common listed.
- **Per-form count (secondary measure):** each form's count in the BNC. These
  sum to 92,704,671 tokens (N). Frequency per million = (count + 1) / N ×
  1,000,000, with add-one smoothing so forms with a count of zero still get a
  value; Zipf = log10(per million) + 3. The counts are British only (e.g.
  "email" = 50), so they are used only to separate words within a band.

**How a pattern is scored.** Each word element is looked up by its
lower-cased form. Contractions split off by the tokeniser are scored as their
full forms (n't → not, 's → is, 're → are, ca → can, wo → will …). POS
elements, numbers and words not in the list (names, new words, most
hyphenated compounds) are not scored, so they neither raise nor lower rarity;
the number not in the list is reported. The pattern's rarity is the band of
its rarest word, with ties broken by the lowest Zipf value; the mean Zipf is
also exported.

**Implementation.** `scripts/build_reference_words.py` (`npm run reference`)
converts the spreadsheet once into `public/reference/bnc-coca-words.json`
(1.4 MB, ≈370 KB gzipped). The Web Worker loads it the first time an
analysis runs with rarity on, then attaches a rarity record to every
pattern. The page passes the worker an absolute URL, because relative URLs
in a worker resolve against the worker script's folder. If loading fails,
results are shown without rarity and with a notice.

**Interface.** A "Rarity measure" dropdown (word rarity by default;
descriptive only; bigram/trigram z-score and keyness shown as planned), a
sortable Rarity column (rarest first; patterns with no scored words always
last), a "rarest word from band" filter, a Rarity tile and a per-word table
(band, per million, rarest word highlighted) in the pattern details, and a
"How this is calculated" note. Exports include the reference, its size, the
formula, the caveat and the per-word values. Rarity is described as general
English usage and never as forensic evidential strength (remit §8).

---

## 3. Development

| Date | Step |
|---|---|
| 2026-11-12 | Remit and PNG reviewed; clarifying questions asked. Agreed: TypeScript + Vite, develop and run locally (GitHub later), simple LLM-generated test data for now, rarity deferred, Corpus guide to describe embedded corpora later |
| 2026-11-12 | Feasibility check of spaCy in the browser (Pyodide): not possible (see issues). Agreed: spaCy pre-tags built-in corpora at build time; wink-nlp tags uploads in the browser; real-time tagging deferred to v2.0 |
| 2026-11-12 | Data model, match stream, discovery strategies, counting, consolidation, statistics; 20 known-answer tests |
| 2026-11-12 | Synthetic corpora written (4 genres × 4 datasets × 2 documents) and tagged with spaCy 3.8.18 / `en_core_web_sm` 3.8.0 |
| 2026-11-12 | wink-nlp upload tagging, Web Worker with progress and cancellation, CSV/JSON export |
| 2026-11-13 | Interface built to the PNG: header, three panels, startup screen, Corpus guide, responsive layout |
| 2026-11-13 | Benchmark: 40,531 words (four public-domain novels, spaCy-tagged, used locally only): words ≈160 ms, POS ≈230 ms, greedy hybrid ≈210 ms (44,723 anchor pairs) |
| 2026-11-13 | Headless-browser checks on desktop and mobile, plus an upload test (wink tagged two files in about 1 s; a non-UTF-8 file was rejected with a clear message) |
| 2026-11-13 | v0.1 complete locally; README with architecture, decisions, limitations and Pages workflow |
| 2026-11-13 | Feature: Length / Freq. / Coverage headings sort the results; a second click reverses; coverage added as a sort key; sort direction recorded in exports; 24 tests |
| 2026-11-14 | Rarity agreed: single-word rarity against the BNC/COCA lists as the default, with bigram/trigram z-scores and keyness as later options |
| 2026-11-14 | Favicon and logo added; colour scheme matched to jb11.org (dark grey page, black header/footer, orange accents, pale-orange word chips, pale-yellow POS chips) |
| 2026-11-14 | Pressing Find Patterns smoothly scrolls Shared patterns to the top of the viewport (instant if reduced motion is set), so the progress bar and results are in view. The results area has a minimum height of one screen so the scroll can always reach it |
| 2026-11-14 | Selection colours follow the section: each panel re-defines the accent tokens (`--primary`, `--primary-soft`, `--primary-line`, `--accent-text`), so active tabs, selected genre, Q dataset, checkboxes, the selected pattern, sort heading, rarest-word row and distribution bars are yellow, orange, green or blue by section. The help dialog keeps the site orange |
| 2026-11-14 | Each section title is a full-width bar in the section colour with black text (`.sec-bar`); the details bar holds the close button and stays visible while the details panel scrolls |
| 2026-11-14 | Section numbers 01/02 removed. Each panel has a 2 px coloured border so it can be named easily: Corpus selection yellow (`#f5c800`), Analysis configuration orange (`#ff8c00`), Shared patterns green (`#3fb950`), Pattern details blue (`#4a8fe7`). Colours are tokens (`--sec-*`) in `src/styles.css` |
| 2026-11-14 | Layout changed: controls 01 and 02 side by side at the top (each with two inner columns, settings always visible), shared patterns and pattern details below. The original three-column layout put Find Patterns below the fold on a laptop |
| 2026-11-14 | Renamed PRISM (Pattern Recognition and Investigation of Shared Matches) in the header, page title, startup screen, footer and exports (export files now `prism-<date>.csv/json`). Header shows the full name on wider screens. Removed the "Discover what your texts share" heading and the genre / size / synthetic-data chips; the subtitle is larger (20 px; 17 px on phones). Synthetic status is still shown in the genre hover card, the results subtitle, the footer and exports |
| 2026-11-14 | Literary genre replaced with four complete Shakespeare tragedies (Hamlet 29,926 words; Othello 26,122; King Lear 25,704; Macbeth 16,669; total 98,421), from Project Gutenberg eBook #100 (public domain). `scripts/build_shakespeare.py` keeps spoken text only; each play is a dataset and each act a document. Greedy hybrid on all four takes ≈0.6 s in Node, ≈1 s including rendering in the browser |
| 2026-11-14 | Corpus guide page removed. Genre details (source, size, datasets, tagger, synthetic flag) now appear when hovering over or focusing a genre, or inline for the selected genre on touch screens; method and rarity notes moved to a "How it works" dialog opened from the ? button. The synthetic label now follows each genre's own flag |
| 2026-11-14 | Word rarity built: reference list conversion, rarity module and method registry, worker scoring, Rarity column/sort/filter, details table, exports, Corpus guide section; 33 tests; checked in a headless browser on desktop and mobile |

---

## 4. Issues and how they were resolved

| Issue | Resolution |
|---|---|
| **spaCy cannot run in the browser.** No Pyodide release ships spaCy or its compiled dependencies (thinc, blis, cymem, preshed, murmurhash, srsly), and PyPI has no WebAssembly wheels. | Built-in corpora are pre-tagged at build time with spaCy (`scripts/tag_corpora.py`); uploads are tagged in the browser with wink-nlp. Real-time tagging is planned for v2.0. |
| **Two taggers give results that can't be compared.** spaCy and wink-nlp tokenise and tag differently (e.g. wink splits "can't" into "ca" + "n't"). | Built-in and uploaded datasets are never mixed in a comparison. The engine refuses datasets tagged by different taggers, and the tagger is recorded in exports. |
| **Patterns showed lower-case "i".** Words are matched on lower-cased forms, so "I" was displayed as "i". | The lower-cased form stays the canonical key; patterns now show the original form from the first occurrence, and concordances always show the original text. |
| **Reconstructing the original text from wink tokens.** wink-nlp gives token values, not character offsets. | Each token is located in order in the original text. Tokens that can't be aligned are counted, and tagging fails with a clear error if more than 1% are affected. |
| **Word and POS matches looked alike in the concordance.** Blue and purple text on a highlighted line was hard to tell apart. | Each matched word now has a tinted background plus a solid (word) or dotted (POS) underline, so colour isn't the only cue. |
| **Synthetic corpora smaller than planned** (≈250–320 words per dataset instead of ~600). | Enough for functional testing. Performance was checked separately on a 40k-word benchmark, and better datasets are TODO 1. |
| **The dev server didn't notice file changes.** File watching doesn't work for a project on a Windows drive under WSL. | Polling is turned on in `vite.config.ts`. |
| **The headless browser for UI checks wouldn't start** (missing system libraries, no admin rights). | The required libraries were downloaded and loaded locally, without installing them system-wide. |
| **Only one renderer allowed per UI region.** The page-switching code needed two listeners for the same region. | The store now supports several listeners per region. |
| **Type errors in the worker messaging code.** | Fixed with a helper type that applies `Omit` to each message variant separately. |
| **The rarity list loaded as the web page instead of JSON.** With a relative base URL, the worker resolved `reference/…` against its own folder (`assets/`), and the server returned `index.html`. | The page now passes the worker an absolute site URL. The loader also checks the response type, and a failed load shows results without rarity plus a notice. |
| **The spreadsheet's counts are not COCA counts.** The per-form counts sum to about 92.7 million and "email" has only 50, which matches the BNC. | The BNC/COCA band is the primary measure; BNC counts only separate words within a band. Documented in section 2.5. |
| **Names, contractions and new words are missing from the list.** | Contractions are mapped to full forms; other unlisted words are not scored and are counted separately, so names do not appear "rare". |
| **The supplied favicon was 268 KB** (one uncompressed 256 px image). | Converted to a 3 KB multi-size icon (16–64 px) plus a 128 px PNG for the logo; the original is kept in `Pattern explorer/`. |
| **Orange and yellow chips are similar in hue.** | Colour is not the only cue: POS tags are upper-case and bold with a dashed outline (dotted underline in the concordance); words have a solid outline. |
| **Speeches resume after stage directions without a speaker label** in the Gutenberg text (e.g. Claudius's "O, my offence is rank" follows an exit), so keeping only labelled blocks lost about 8% of the words. | A block without a label continues the current speech unless it is a direction or a heading. Directions are recognised by whole block (starting with "[", "_" or Enter/Exit/Exeunt/Flourish…), never by line, because verse lines can start with "Dies" or "Enter". |
| **Joint speaker labels** ("ROSENCRANTZ and GUILDENSTERN.") were not recognised. | The label pattern now allows "and" between names, and "All." |
| **Patterns could cross from one speaker to the next**, because spaCy does not always end a sentence at a blank line. | A pipeline step before the parser starts a sentence after every blank line. All 4,179 speech starts were checked to be sentence-initial. |
| **Elisions lose their apostrophe** ("’gainst" → "gainst", "’tis" → "’t" + "is"), and the modern-English tagger mis-tags some Early Modern forms. | Documented as a limitation. Archaic words score as rare against the modern reference list, which is accurate for today's English. |
| **The sticky details title bar sat 22 px below the panel top** when the panel scrolled: sticky offsets inside a scrolling panel are measured from inside its padding. | The bar uses `top: -22px` (the panel's top padding). |
| **POS mode's maximal view hides short frequent sequences** (e.g. `DET ADJ NOUN`), because longer shared sequences contain them. | This is correct by definition; documented. "Show constituent subpatterns" reveals them. |
| **Greedy hybrid patterns can grow long**, because POS tags match frequently. | Behaviour follows the remit. A limit on consecutive POS elements is a possible future setting if real corpora show it is noisy. |

---

## Changelog

- **0.1 (2026-11-13):** first working prototype, run locally.
- **0.1 + sortable headings (2026-11-13):** column-heading sorting with direction toggle; coverage sort.
- **0.2 (2026-11-14):** word rarity against the reference corpus (BNC/COCA lists): Rarity column, sort, filter, details, exports. Favicon and logo; colours matched to jb11.org. Corpus guide page replaced by genre hover cards and a help dialog. Literary genre: four complete Shakespeare tragedies.
