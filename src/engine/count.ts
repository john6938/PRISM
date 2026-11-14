/**
 * Independent occurrence counting. Given a pattern representation, find every
 * position in every selected dataset where it matches. A lexical element
 * matches a word with the same normalised form; a POS element matches any
 * word with that POS tag. Matches never cross segment boundaries.
 *
 * Overlap policy: every distinct start position is one occurrence, so
 * overlapping occurrences are all counted (e.g. "NOUN NOUN" occurs twice in
 * "NOUN NOUN NOUN"). Identical occurrences cannot be counted twice because
 * occurrences are identified by their start position.
 */
import { type MatchStream, decodePos, isPosCode } from './stream';

export function matchesAt(s: MatchStream, codes: ArrayLike<number>, start: number): boolean {
  const L = codes.length;
  if (start < 0 || start + L > s.n) return false;
  const sg = s.seg[start];
  if (s.seg[start + L - 1] !== sg) return false; // segment ids are monotonic
  for (let i = 0; i < L; i++) {
    const c = codes[i];
    if (isPosCode(c)) { if (s.pos[start + i] !== decodePos(c)) return false; }
    else if (s.lex[start + i] !== c) return false;
  }
  return true;
}

/** Full scan; used for pure-POS patterns without an index and in tests. */
export function countByScan(s: MatchStream, codes: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let p = 0; p + codes.length <= s.n; p++) if (matchesAt(s, codes, p)) out.push(p);
  return out;
}

/**
 * Count using the posting list of the rarest lexical element, verifying each
 * candidate start. Falls back to a scan for patterns with no lexical element.
 */
export function countOccurrences(s: MatchStream, codes: ArrayLike<number>): number[] {
  let best = -1, bestSize = Infinity;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (!isPosCode(c) && s.lexPostings[c].length < bestSize) { best = i; bestSize = s.lexPostings[c].length; }
  }
  if (best < 0) return countByScan(s, codes);
  const out: number[] = [];
  for (const p of s.lexPostings[codes[best]]) {
    const start = p - best;
    if (matchesAt(s, codes, start)) out.push(start);
  }
  return out; // postings are sorted, so starts are sorted
}
