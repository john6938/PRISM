/**
 * The match stream: every *word* token of the selected datasets laid out in a
 * single global array (punctuation removed), with integer codes for lexical
 * forms and POS tags. Matching never crosses a segment boundary; a segment is
 * one sentence of one document, so document boundaries are always respected.
 *
 * Datasets are passed in role order: index 0 is Q, 1..3 are K1..K3.
 */
import type { Dataset, StreamMap } from '../model/types';

export interface MatchStream {
  n: number;
  lex: Int32Array;      // vocabulary id of the normalised form
  pos: Int32Array;      // POS tag id
  seg: Int32Array;      // segment id (sentence within document)
  ds: Uint8Array;       // dataset role
  doc: Int32Array;      // document index within its dataset
  tok: Int32Array;      // token index within its document
  wordInDoc: Int32Array;
  wordInDs: Int32Array;
  form: string[];      // original surface form per position (display only)
  vocab: string[];
  posTags: string[];
  datasetCount: number;
  /** Posting lists: global positions for each vocabulary id. */
  lexPostings: Int32Array[];
}

/**
 * Pattern elements are encoded as integers so that patterns can be keyed and
 * compared cheaply: lexical element = vocab id (>= 0), POS element = -(id + 1).
 */
export const encodePos = (posId: number): number => -(posId + 1);
export const decodePos = (code: number): number => -code - 1;
export const isPosCode = (code: number): boolean => code < 0;

export function patternKey(codes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < codes.length; i++) s += (i ? ',' : '') + codes[i];
  return s;
}

export function buildStream(datasets: Dataset[]): MatchStream {
  let total = 0;
  for (const d of datasets) for (const doc of d.documents) for (const t of doc.tokens) if (t.isWord) total++;

  const lex = new Int32Array(total);
  const pos = new Int32Array(total);
  const seg = new Int32Array(total);
  const ds = new Uint8Array(total);
  const docArr = new Int32Array(total);
  const tok = new Int32Array(total);
  const wordInDoc = new Int32Array(total);
  const wordInDs = new Int32Array(total);
  const form: string[] = new Array(total);
  const vocab: string[] = [];
  const vocabIds = new Map<string, number>();
  const posTags: string[] = [];
  const posIds = new Map<string, number>();

  let i = 0;
  let segId = -1;
  datasets.forEach((d, di) => {
    let wDs = 0;
    d.documents.forEach((doc, docIdx) => {
      let wDoc = 0;
      let newSegment = true; // document boundary always starts a segment
      doc.tokens.forEach((t, ti) => {
        if (t.sentStart) newSegment = true;
        if (!t.isWord) return;
        if (newSegment) { segId++; newSegment = false; }
        let lid = vocabIds.get(t.norm);
        if (lid === undefined) { lid = vocab.length; vocab.push(t.norm); vocabIds.set(t.norm, lid); }
        let pid = posIds.get(t.pos);
        if (pid === undefined) { pid = posTags.length; posTags.push(t.pos); posIds.set(t.pos, pid); }
        lex[i] = lid; pos[i] = pid; form[i] = t.form; seg[i] = segId; ds[i] = di;
        docArr[i] = docIdx; tok[i] = ti;
        wordInDoc[i] = ++wDoc; wordInDs[i] = ++wDs;
        i++;
      });
    });
  });

  // Posting lists for lexical lookup during occurrence counting.
  const sizes = new Int32Array(vocab.length);
  for (let p = 0; p < total; p++) sizes[lex[p]]++;
  const lexPostings = Array.from(sizes, (s) => new Int32Array(s));
  const fill = new Int32Array(vocab.length);
  for (let p = 0; p < total; p++) lexPostings[lex[p]][fill[lex[p]]++] = p;

  return {
    n: total, lex, pos, seg, ds, doc: docArr, tok, wordInDoc, wordInDs,
    form, vocab, posTags, datasetCount: datasets.length, lexPostings,
  };
}

/** Element code at a position for a given matching layer. */
export function codeAt(s: MatchStream, p: number, layer: 'lex' | 'pos'): number {
  return layer === 'lex' ? s.lex[p] : encodePos(s.pos[p]);
}

/**
 * Index all n-grams of one layer that lie within a single segment.
 * Returns key -> sorted start positions.
 */
export function ngramIndex(s: MatchStream, n: number, layer: 'lex' | 'pos'): Map<string, number[]> {
  const index = new Map<string, number[]>();
  const codes = new Array<number>(n);
  for (let p = 0; p + n <= s.n; p++) {
    if (s.seg[p] !== s.seg[p + n - 1]) continue;
    for (let k = 0; k < n; k++) codes[k] = codeAt(s, p + k, layer);
    const key = patternKey(codes);
    const list = index.get(key);
    if (list) list.push(p); else index.set(key, [p]);
  }
  return index;
}

export function streamMap(s: MatchStream): StreamMap {
  return {
    ds: Array.from(s.ds), doc: Array.from(s.doc), tok: Array.from(s.tok),
    wordInDoc: Array.from(s.wordInDoc), wordInDs: Array.from(s.wordInDs),
  };
}
