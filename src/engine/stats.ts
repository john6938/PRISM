/**
 * Descriptive statistics for a pattern from its independently counted
 * occurrences. Rarity, dispersion and keyness measures are intentionally not
 * implemented yet; add them here as separate functions with an explicit
 * reference distribution when they are specified.
 */
import type { PatternElement, PatternResult } from '../model/types';
import { type MatchStream, decodePos, isPosCode } from './stream';

export function decodeElements(s: MatchStream, codes: number[], firstStart = -1): PatternElement[] {
  return codes.map((c, i) => isPosCode(c)
    ? { kind: 'pos', value: s.posTags[decodePos(c)] }
    : { kind: 'lex', value: s.vocab[c], form: firstStart >= 0 ? s.form[firstStart + i] : s.vocab[c] });
}

export function describePattern(
  s: MatchStream, id: number, key: string, codes: number[], occurrences: number[],
): PatternResult {
  const counts = new Array<number>(s.datasetCount).fill(0);
  const docs = new Set<number>();
  let firstInQ = 0;
  for (const p of occurrences) {
    const d = s.ds[p];
    counts[d]++;
    docs.add(d * 1_000_000 + s.doc[p]);
    if (d === 0 && (firstInQ === 0 || s.wordInDs[p] < firstInQ)) firstInQ = s.wordInDs[p];
  }
  const nPos = codes.filter(isPosCode).length;
  const length = codes.length;
  return {
    id, key,
    elements: decodeElements(s, codes, occurrences[0] ?? -1),
    length,
    nLex: length - nPos,
    nPos,
    specificity: (length - nPos) / length,
    counts,
    total: occurrences.length,
    coverage: counts.filter((c) => c > 0).length,
    docFrequency: docs.size,
    firstInQ,
    maximal: true,
    occurrences,
  };
}
