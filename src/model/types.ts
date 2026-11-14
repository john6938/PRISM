/**
 * Core data model shared by corpus management, preprocessing, the pattern
 * engine, and the UI. Nothing in this file depends on the DOM or a tagger.
 */

/** Universal Dependencies UPOS tag set (v2). */
export const UPOS_TAGS = [
  'ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM',
  'PART', 'PRON', 'PROPN', 'PUNCT', 'SCONJ', 'SYM', 'VERB', 'X',
] as const;
export type Upos = (typeof UPOS_TAGS)[number];

/** Describes the tokeniser/tagger that produced a dataset's annotation. */
export interface TaggerInfo {
  name: string;      // e.g. "spaCy" or "wink-nlp"
  version: string;
  model?: string;    // e.g. "en_core_web_sm 3.8.0"
  tagset: 'UPOS';
  /** Where tagging ran: offline at build time, or in the browser. */
  mode: 'build-time' | 'in-browser';
}

/** One token of the original text. Punctuation is kept for reconstruction. */
export interface Token {
  form: string;       // original surface form, exactly as in the text
  norm: string;       // normalised form used for lexical matching (lower-cased)
  pos: string;        // UPOS tag
  start: number;      // character offset in DocumentText.text (inclusive)
  end: number;        // character offset (exclusive)
  sentStart: boolean; // first token of a sentence
  isWord: boolean;    // false for punctuation; non-words are skipped by matching
}

export interface DocumentText {
  id: string;
  title: string;
  text: string;
  tokens: Token[];
  metadata?: Record<string, string>;
}

export interface Dataset {
  id: string;
  name: string;
  source: 'builtin' | 'upload';
  /** True when the text is synthetic (e.g. LLM-generated test data). */
  synthetic: boolean;
  description?: string;
  documents: DocumentText[];
  wordCount: number;
  tagger: TaggerInfo;
  metadata?: Record<string, string>;
}

/** Pattern-matching strategies. 'exploratory' is reserved for a later phase. */
export type PatternMode = 'lexical' | 'pos' | 'hybrid' | 'exploratory';

/** Rarity methods; only 'word-frequency' and 'none' are implemented so far. */
export type RarityMethodId = 'word-frequency' | 'none' | 'bigram-z' | 'trigram-z' | 'keyness';

export interface AnalysisSettings {
  mode: PatternMode;
  rarity: RarityMethodId;
  minLength: number;      // minimum elements in a pattern
  maxLength: number;      // maximum elements in a pattern
  anchorLength: number;   // hybrid: minimum shared lexical run used as an anchor
  minFrequency: number;   // minimum total occurrences across selected datasets
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  mode: 'hybrid',
  rarity: 'word-frequency',
  minLength: 3,
  maxLength: 12,
  anchorLength: 2,
  minFrequency: 2,
};

/** A pattern element: an exact word (lexical) or a POS tag. */
export interface PatternElement {
  kind: 'lex' | 'pos';
  /** Canonical value: normalised (lower-cased) word, or UPOS tag. */
  value: string;
  /** Lexical elements: surface form at the first occurrence (for display). */
  form?: string;
}

/**
 * A consolidated pattern with independently counted occurrences.
 * Dataset arrays are indexed by role: 0 = Q, 1 = K1, 2 = K2, 3 = K3.
 */
export interface PatternResult {
  id: number;
  key: string;               // canonical representation, unique per pattern
  elements: PatternElement[];
  length: number;
  nLex: number;
  nPos: number;
  specificity: number;       // nLex / length
  counts: number[];          // occurrences per dataset role
  total: number;
  coverage: number;          // number of datasets containing the pattern
  docFrequency: number;      // number of distinct documents containing it
  firstInQ: number;          // 1-based word position of first occurrence in Q
  maximal: boolean;          // not contained in a longer result pattern
  /** Start positions in the match stream (global word indices), sorted. */
  occurrences: number[];
  /** Present when a rarity method was applied. */
  rarity?: PatternRarity;
}

/** Rarity of one lexical element against the reference word list. */
export interface WordRarity {
  value: string;            // the pattern element's word
  lookup: string;           // form looked up (clitics mapped to full forms)
  status: 'listed' | 'clitic' | 'number' | 'off-list';
  band: number | null;      // 1..25 (1k..25k); null if not scored
  count: number;            // reference count (0 if not in list)
  perMillion: number | null;
  zipf: number | null;
}

export interface PatternRarity {
  band: number | null;      // band of the rarest scored word (higher = rarer)
  minZipf: number | null;   // Zipf of that word (tie-breaker, lower = rarer)
  meanZipf: number | null;
  scored: number;           // lexical elements with a band
  notInList: number;        // lexical elements not in the reference list
  words: WordRarity[];
}

/** Describes the rarity method and reference data used for a result. */
export interface RarityInfo {
  method: RarityMethodId;
  label: string;
  reference: string;
  source: string;
  size: string;
  formula: string;
  caveat: string;
}

/**
 * Minimal mapping from match-stream positions back to the original text,
 * sent with results so the UI can build concordances.
 */
export interface StreamMap {
  ds: number[];        // dataset role per word position
  doc: number[];       // document index within its dataset
  tok: number[];       // token index within its document
  wordInDoc: number[]; // 1-based word index within its document
  wordInDs: number[];  // 1-based word index within its dataset
}

export interface AnalysisResult {
  settings: AnalysisSettings;
  patterns: PatternResult[];
  stream: StreamMap;
  rarity?: RarityInfo;
  rarityError?: string;
  stats: {
    words: number;
    candidates: number;      // distinct candidate patterns before counting
    anchorPairs?: number;    // hybrid only: anchor occurrence pairs examined
    elapsedMs: number;
  };
}
