/**
 * Pattern discovery. Each strategy proposes candidate pattern representations
 * that are shared between Q and at least one comparison dataset. Discovery
 * does NOT count frequencies: counting is done independently afterwards
 * (see count.ts), so a pattern found between Q and K1 is still counted in
 * every dataset where it occurs.
 *
 * To add the future exploratory hybrid algorithm, implement DiscoveryStrategy
 * and register it in STRATEGIES.
 */
import type { AnalysisSettings, PatternMode } from '../model/types';
import { type MatchStream, encodePos, ngramIndex, patternKey } from './stream';

/** Candidate key -> element codes. */
export type Candidates = Map<string, number[]>;

export interface DiscoveryOutput {
  candidates: Candidates;
  /**
   * Optional exact occurrence lists produced as a by-product of a full index
   * of all selected datasets (contiguous strategies). The counter verifies
   * nothing from discovery pairs; it only reuses complete index look-ups.
   */
  indexedOccurrences?: Map<string, number[]>;
  anchorPairs?: number;
}

export type Progress = (fraction: number, label: string) => void;

export interface DiscoveryStrategy {
  mode: PatternMode;
  discover(s: MatchStream, settings: AnalysisSettings, progress: Progress): DiscoveryOutput;
}

/** True when the positions include Q (role 0) and at least one K. */
function sharedQK(s: MatchStream, starts: number[]): boolean {
  let q = false, k = false;
  for (const p of starts) {
    if (s.ds[p] === 0) q = true; else k = true;
    if (q && k) return true;
  }
  return false;
}

/**
 * Contiguous identical sequences on one layer (words or POS tags).
 * Every shared n-gram with minLength <= n <= maxLength is a candidate; the
 * maximal ones are identified later during consolidation.
 */
function contiguousStrategy(mode: 'lexical' | 'pos'): DiscoveryStrategy {
  const layer = mode === 'lexical' ? 'lex' : 'pos';
  return {
    mode,
    discover(s, settings, progress) {
      const candidates: Candidates = new Map();
      const indexedOccurrences = new Map<string, number[]>();
      const span = settings.maxLength - settings.minLength + 1;
      for (let n = settings.minLength; n <= settings.maxLength; n++) {
        progress((n - settings.minLength) / span, `Indexing ${n}-element sequences`);
        let found = 0;
        for (const [key, starts] of ngramIndex(s, n, layer)) {
          if (!sharedQK(s, starts)) continue;
          candidates.set(key, key.split(',').map(Number));
          indexedOccurrences.set(key, starts);
          found++;
        }
        // Shared sequences are downward closed: none at n means none longer.
        if (found === 0) break;
      }
      return { candidates, indexedOccurrences };
    },
  };
}

/**
 * Greedy hybrid discovery (remit §6.3).
 *
 * For every pair of positions (q in Q, k in a K dataset) that share a lexical
 * anchor of at least `anchorLength` words, the anchor is first grown to its
 * full exact-word run, then extended outwards one position at a time,
 * alternating left and right. At each step words are compared first; if they
 * differ, POS tags are compared. A side stops when neither matches or a
 * segment (sentence/document) boundary is reached; extension stops at
 * maxLength.
 *
 * Only left-maximal anchor pairs are processed: if the words immediately to
 * the left of q and k are identical, the same region is covered by the pair
 * starting one position earlier, so the pair is skipped. Every qualifying
 * anchor is therefore examined exactly once.
 */
export const greedyHybrid: DiscoveryStrategy = {
  mode: 'hybrid',
  discover(s, settings, progress) {
    const { anchorLength, minLength, maxLength } = settings;
    const candidates: Candidates = new Map();
    const anchors = ngramIndex(s, anchorLength, 'lex');
    const { lex, pos, seg, ds } = s;
    let pairs = 0;
    let done = 0;
    const totalKeys = anchors.size;

    const left: number[] = [];
    const right: number[] = [];

    for (const starts of anchors.values()) {
      done++;
      if (done % 2000 === 0) progress(done / totalKeys, 'Extending lexical anchors');
      if (!sharedQK(s, starts)) continue;
      const qs = starts.filter((p) => ds[p] === 0);
      const ks = starts.filter((p) => ds[p] !== 0);
      for (const q of qs) {
        for (const k of ks) {
          // Skip pairs that are not left-maximal on the lexical layer.
          if (q > 0 && k > 0 && seg[q - 1] === seg[q] && seg[k - 1] === seg[k] && lex[q - 1] === lex[k - 1]) continue;
          pairs++;

          // 1. Grow the anchor to its full exact-word run.
          let r = anchorLength;
          while (r < maxLength && q + r < s.n && k + r < s.n &&
                 seg[q + r] === seg[q] && seg[k + r] === seg[k] && lex[q + r] === lex[k + r]) r++;

          // 2. Extend greedily, alternating left/right, lexical before POS.
          left.length = 0; right.length = 0;
          let qL = q - 1, kL = k - 1, qR = q + r, kR = k + r;
          let leftOn = true, rightOn = true, len = r, nPos = 0;
          while (len < maxLength && (leftOn || rightOn)) {
            if (leftOn) {
              if (qL >= 0 && kL >= 0 && seg[qL] === seg[q] && seg[kL] === seg[k]) {
                if (lex[qL] === lex[kL]) left.push(lex[qL]);
                else if (pos[qL] === pos[kL]) { left.push(encodePos(pos[qL])); nPos++; }
                else leftOn = false;
                if (leftOn) { qL--; kL--; len++; }
              } else leftOn = false;
            }
            if (rightOn && len < maxLength) {
              if (qR < s.n && kR < s.n && seg[qR] === seg[q] && seg[kR] === seg[k]) {
                if (lex[qR] === lex[kR]) right.push(lex[qR]);
                else if (pos[qR] === pos[kR]) { right.push(encodePos(pos[qR])); nPos++; }
                else rightOn = false;
                if (rightOn) { qR++; kR++; len++; }
              } else rightOn = false;
            }
          }

          // A hybrid pattern must mix both layers; pure word runs are lexical.
          if (nPos === 0 || len < minLength) continue;
          const codes: number[] = [];
          for (let i = left.length - 1; i >= 0; i--) codes.push(left[i]);
          for (let i = 0; i < r; i++) codes.push(lex[q + i]);
          for (const c of right) codes.push(c);
          const key = patternKey(codes);
          if (!candidates.has(key)) candidates.set(key, codes);
        }
      }
    }
    return { candidates, anchorPairs: pairs };
  },
};

export const STRATEGIES: Partial<Record<PatternMode, DiscoveryStrategy>> = {
  lexical: contiguousStrategy('lexical'),
  pos: contiguousStrategy('pos'),
  hybrid: greedyHybrid,
  // exploratory: reserved for bounded-branching / beam-search discovery.
};
