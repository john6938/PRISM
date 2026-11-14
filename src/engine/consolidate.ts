/**
 * Consolidation: deduplicate candidate representations, generate constituent
 * sub-patterns, and mark which patterns are maximal.
 *
 * - Deduplication is by canonical key (identical element sequences).
 * - Constituent sub-patterns are contiguous sub-windows of a pattern. For the
 *   contiguous strategies every shared sub-window is already a candidate. For
 *   hybrid patterns, sub-windows that still mix lexical and POS elements are
 *   generated here so they can be counted independently and explored.
 * - A pattern is maximal if no other result pattern contains it as a
 *   contiguous sub-window. Non-maximal patterns are kept, never discarded.
 */
import { isPosCode, patternKey } from './stream';

export function hybridSubwindows(codes: number[], minLength: number, out: Map<string, number[]>): void {
  const L = codes.length;
  for (let len = minLength; len < L; len++) {
    for (let a = 0; a + len <= L; a++) {
      let hasLex = false, hasPos = false;
      for (let i = a; i < a + len; i++) { if (isPosCode(codes[i])) hasPos = true; else hasLex = true; }
      if (!hasLex || !hasPos) continue;
      const sub = codes.slice(a, a + len);
      const key = patternKey(sub);
      if (!out.has(key)) out.set(key, sub);
    }
  }
}

/** Returns the set of keys that are contained in another key of the set. */
export function nonMaximalKeys(patterns: Map<string, number[]>, minLength: number): Set<string> {
  const contained = new Set<string>();
  for (const codes of patterns.values()) {
    const L = codes.length;
    for (let len = minLength; len < L; len++) {
      for (let a = 0; a + len <= L; a++) {
        const key = patternKey(codes.slice(a, a + len));
        if (patterns.has(key)) contained.add(key);
      }
    }
  }
  return contained;
}
