# PRISM (prototype v0.2)

**P**attern **R**ecognition and **I**nvestigation of **S**hared **M**atches
(formerly Pattern Explorer).

A static web application for discovering, comparing and inspecting shared
lexical, POS and greedy-hybrid patterns across two to four text datasets.
Built to a written remit, with a mock-up image as the visual reference
(neither is included in this repository).

> **Built-in corpora.** *Literary*: four complete Shakespeare tragedies
> (Hamlet, Othello, King Lear, Macbeth; 98,421 words, public domain).
> *Academic*: 100 research abstracts from each of four domains (69,602
> words). *Newspaper*: four Telegraph Travel texts by one journalist, three
> known and one questioned (4,808 words). *Learner writing* is still
> synthetic test data (short LLM-generated texts), not genuine corpus data,
> and patterns found in it are not findings.

## Run locally

Requires Node 20+ (tested with Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

### Rebuild the Shakespeare corpus (literary genre)

```bash
curl -L https://www.gutenberg.org/cache/epub/100/pg100.txt -o /tmp/pg100.txt
python3 scripts/build_shakespeare.py /tmp/pg100.txt   # writes corpora-src/literary.txt
npm run corpora -- literary                          # tags it (≈15 s)
```

The cleaner keeps spoken text only: speaker labels, entrances/exits,
bracketed directions and headings are removed, and a speech that resumes
after a direction is kept. Each play is a dataset and each act a document.
A blank line between speeches forces a sentence boundary when tagging, so
no pattern crosses from one speaker to the next.

### Rebuild the built-in corpora (spaCy, build time)

Corpus sources are plain text in `corpora-src/<genre>.txt` (format documented
in `scripts/tag_corpora.py`). Tagging needs Python with spaCy:

```bash
python3 -m venv ~/.venvs/pattern-explorer-spacy
~/.venvs/pattern-explorer-spacy/bin/pip install spacy
~/.venvs/pattern-explorer-spacy/bin/python -m spacy download en_core_web_sm
npm run corpora    # writes public/corpora/*.json
```

Tested with spaCy 3.8.18 and `en_core_web_sm` 3.8.0.

### Rebuild the rarity reference list (build time)

```bash
~/.venvs/pattern-explorer-spacy/bin/pip install openpyxl
npm run reference  # reads ../BNC_COCA_lists_from_EAP_foundation.xlsx, writes public/reference/bnc-coca-words.json
```

The output (1.4 MB, ≈370 KB gzipped) maps each word form to its BNC/COCA
family band (1k–25k) and its BNC count. It is loaded by the worker the first
time an analysis runs with word rarity on.

### Performance benchmark

```bash
BENCH_FILE=/path/to/genre.json npx vitest run tests/benchmark.test.ts --silent=false
```

`BENCH_FILE` is any file in the pre-tagged genre format. On 40,531 words (four
public-domain novels, 10k words each, spaCy-tagged; not shipped), analysis took
~160 ms for words, ~230 ms for POS and ~210 ms for greedy hybrid (44,723 anchor
pairs) in Node. All analysis runs in a Web Worker, so the interface stays
responsive.

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| Language / build | TypeScript + Vite | Static output for GitHub Pages; no framework needed |
| UI | Plain DOM (`src/ui/dom.ts` helper) | Small, dependency-free; panels re-render independently |
| Background work | Web Worker (`src/worker`) | Responsive UI; cancel = terminate the worker |
| Built-in POS tagging | spaCy `en_core_web_sm`, **offline at build time** | spaCy cannot run in the browser (below) |
| Upload POS tagging | wink-nlp + `wink-eng-lite-web-model` (MIT), in browser | Uploaded text never leaves the machine |
| Tagset | Universal Dependencies UPOS | Required by the remit |
| Tests | Vitest | Fast, TypeScript-native |

**Why spaCy is not used in the browser.** No Pyodide release ships spaCy or
its compiled dependencies (thinc, blis, cymem, preshed, murmurhash, srsly), and
PyPI has no WebAssembly wheels for them (checked 2026-11-12). Decision: spaCy
pre-tags the built-in corpora at build time, and uploads are tagged in the
browser with wink-nlp. The two taggers tokenise and tag differently, so
**built-in and uploaded datasets are never compared with each other**. The
engine refuses mixed-tagger comparisons.

**TODO (v2.0): real-time tagging.** Tag uploads with the same model as the
built-in corpora, for example a UD-trained BERT UPOS model via
transformers.js (~110 MB, cached after first load). Uploaded and built-in data
could then be compared. See `src/preprocess/tagger.ts`.

## Architecture

```
src/
  model/types.ts          data model: Token, Dataset, AnalysisSettings, PatternResult …
  corpus/                 corpus management
    builtin.ts            load pre-tagged built-in genres (public/corpora/*.json)
    upload.ts             TXT validation (UTF-8, size, word limit)
  preprocess/             linguistic preprocessing
    tagger.ts             Tagger interface (+ v2.0 TODO)
    winkTagger.ts         in-browser tokeniser/sentence splitter/UPOS tagger
  engine/                 pattern discovery + statistics (pure, DOM-free, tested)
    stream.ts             global word stream, integer codes, n-gram index, postings
    discovery.ts          strategies: lexical, POS, greedy hybrid (+ slot for exploratory)
    consolidate.ts        sub-pattern generation, maximality
    count.ts              independent occurrence counting
    stats.ts              descriptive statistics
    analyse.ts            pipeline + validation
  results/                view logic (pure)
    view.ts               filtering, deterministic sorting
    concordance.ts        KWIC reconstruction from original text + offsets
  rarity/                 rarity methods (pure, tested)
    reference.ts          load/parse the reference word list
    wordFrequency.ts      default method: per-word band + smoothed frequency
    methods.ts            method registry (dropdown), formula/caveat text
  export/export.ts        CSV / JSON export with settings + metadata
  worker/                 background worker, protocol, promise client
  app/store.ts            state + actions
  ui/                     visualisation: panels, chips, genre hover cards, help dialog
scripts/tag_corpora.py    build-time spaCy tagging
scripts/build_reference_words.py  build-time conversion of the BNC/COCA lists
corpora-src/              synthetic corpus sources
tests/                    synthetic corpora with known expected results
```

### Pipeline

1. **Match stream.** Every word token of the selected datasets, in role order
   (Q, K1–K3), goes into one array of integer codes (lower-cased form id, UPOS
   id). Punctuation is left out, but its offsets are kept for concordances.
   Each sentence of each document is a *segment*, and no match crosses a
   segment.
2. **Discovery** produces candidate representations shared by Q and at least
   one K:
   - *Lexical / POS*: every n-gram (min ≤ n ≤ max) that occurs in Q and in some
     K, found with an index over all positions.
   - *Greedy hybrid*: index all lexical n-grams of anchor length. For each
     (Q, K) position pair sharing one, grow the exact-word run, then extend
     outwards one position at a time, alternating left and right. At each
     position words are compared first, then POS tags. A side stops on a
     mismatch, at a segment boundary, or at max length. Only left-maximal pairs
     are processed, so each anchor region is examined once. A hybrid must
     contain ≥ 1 word and ≥ 1 POS element.
3. **Consolidation.** Candidates are deduplicated by canonical key. For hybrid
   patterns, every contiguous sub-window that still mixes words and POS tags
   is added, so constituents can be explored.
4. **Independent counting.** Each representation is searched for in *all*
   selected datasets (rarest-word posting list + verification, or the full
   n-gram index), so counts are real occurrences, not discovery events.
5. **Filtering.** Only patterns found in Q and at least one K, with
   total ≥ min frequency, are kept.
6. **Maximality.** A pattern is maximal if no other kept pattern contains it
   as a contiguous sub-sequence. Shorter patterns are kept and shown with
   *Show constituent subpatterns*.
7. **Statistics.** Length, total, per-dataset counts, coverage, document
   frequency, first position in Q, word/POS element counts, and lexical
   specificity S = N_lex / N_total.

Sorting, filtering, paging and pattern selection only use the computed result
and never re-run discovery.

## Decisions where the remit was open

| Topic | Decision |
|---|---|
| Case | Matching uses lower-cased forms; patterns show the surface form of the first occurrence; concordances show original text |
| Punctuation | Excluded from matching; kept in concordance text. Sentence boundaries (from the tagger) end patterns |
| Overlaps | Each distinct start position is one occurrence; overlapping occurrences all count. Identical occurrences cannot double-count |
| Hybrid validity | ≥ 1 word element and ≥ 1 POS element (pure word runs belong to lexical mode) |
| Extension order | Alternating left/right one step at a time, so the max-length cap is shared fairly between sides |
| "Min. freq." setting | Minimum *total* occurrences across selected datasets (≥ 2) |
| Upload documents | One TXT file = one dataset = one document |
| Upload limit | ≤ 12,000 words and ≤ 2 MB per file; up to four files |
| Rarity measure | Default: word rarity against the BNC/COCA lists, shown in the UI as "Reference corpus". Pattern score = band of its rarest word; ties by lowest Zipf. Bigram/trigram z-score and keyness listed as planned |
| Distribution chart | Raw counts, plus rate per 10k words because dataset sizes differ |
| Export scope | The current view (filters + sort, all pages), with the filter recorded in the file |

## Known limitations

- The learner corpus is still small synthetic text (≈ 170–220 words per
  dataset).
- The newspaper corpus is small (≈ 900–1,400 words per text).
- Shakespeare is tagged with a model trained on modern English, so some Early
  Modern forms are mis-tagged, and elisions lose their apostrophe as a
  separate token ("’gainst" → "’" + "gainst", "’tis" → "’t" + "is").
  Archaic words score as rare against the modern reference list (thou 4k,
  doth 10k, prithee 22k), which is accurate for today's English.
- English only.
- Uploads are tagged with wink-nlp, which is less accurate than spaCy and
  tokenises differently (e.g. "can't" → "ca" + "n't"). Uploads cannot be
  compared with built-in corpora.
- The greedy hybrid is intentionally greedy: it does not find alternative
  word/POS representations of the same region.
- The left-maximal skip means that if the anchor run starting one position
  earlier was cut at max length, the shorter remainder is not re-extended
  separately. This is an edge case at the length cap.
- POS mode's maximal view hides short frequent sequences (e.g. `DET ADJ NOUN`)
  whenever a longer shared sequence contains them. Use *Show constituent
  subpatterns* to see them.
- Rarity covers single words only. Names, numbers, new words (e.g. "covid")
  and most hyphenated compounds are not in the list and are not scored.
  The per-form counts are BNC (1990s British English) counts, so they only
  separate words within a band; the band itself comes from BNC and COCA.
- No keyness or dispersion measures, and **neither frequency nor rarity is
  evidential strength**.

## Introducing the exploratory hybrid algorithm

`engine/discovery.ts` defines a `DiscoveryStrategy` interface. An exploratory
strategy would:

1. use the same anchors (lexical n-gram index, left-maximal pairs);
2. at each extension step, branch where words differ but POS tags match, and
   also where words match (keep the word *or* generalise it to its POS tag);
3. keep a bounded beam (e.g. top-k partial patterns per anchor pair, scored by
   lexical specificity and later by rarity), and stop branches at boundaries
   or max length;
4. emit every surviving representation as a candidate.

Consolidation, independent counting, statistics, export and the UI work
unchanged. Register the strategy in `STRATEGIES` and enable the radio option
in `ui/leftPanel.ts`.

## Deployment (GitHub Pages)

Live site: https://john6938.github.io/PRISM/

`.github/workflows/pages.yml` runs on every push to `main`: it installs
dependencies, runs the tests, builds with `BASE_PATH=/<repository name>/`
and deploys `dist/` to GitHub Pages. If the tests fail, nothing is deployed.

One-time setup: in the repository's *Settings → Pages*, set *Source* to
*GitHub Actions*. To deploy again without a code change, use *Actions →
Deploy to GitHub Pages → Run workflow*.

To build for another static host, run `npm run build` (base `./`) or set
`BASE_PATH` to the folder the site is served from.

Built-in corpora are committed as pre-tagged JSON (`public/corpora`), so CI
does not need Python or spaCy. Uploaded text is processed entirely in the
browser, and no server or third-party service receives it.
