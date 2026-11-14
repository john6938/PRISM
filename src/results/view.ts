/**
 * Pure view-model functions over computed results: filtering and sorting.
 * Never triggers pattern discovery; occurrence counts are never modified.
 */
import type { PatternResult } from '../model/types';

export type SortKey = 'frequency' | 'length' | 'coverage' | 'orderInQ' | 'rarity';
export type SortDir = 'asc' | 'desc';

/** Direction used when a sort key is first chosen. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { frequency: 'desc', length: 'desc', coverage: 'desc', orderInQ: 'asc', rarity: 'desc' };

export interface ViewFilter {
  showAll: boolean;         // false = maximal patterns only
  text: string;             // matches any element value (word or POS tag)
  minFrequency: number;
  minLength: number;
  maxLength: number;
  minCoverage: number;
  minBand: number;          // rarity: rarest word at least this band (0 = off)
}

export const DEFAULT_FILTER: ViewFilter = {
  showAll: false, text: '', minFrequency: 0, minLength: 0, maxLength: Infinity, minCoverage: 0, minBand: 0,
};

/** Number of non-default numeric filters, for the "Filters" badge. */
export function activeFilterCount(f: ViewFilter): number {
  return [f.minFrequency > 0, f.minLength > 0, f.maxLength !== Infinity, f.minCoverage > 0, f.minBand > 0].filter(Boolean).length;
}

export function filterPatterns(patterns: PatternResult[], f: ViewFilter): PatternResult[] {
  const terms = f.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return patterns.filter((p) => {
    if (!f.showAll && !p.maximal) return false;
    if (p.total < f.minFrequency || p.length < f.minLength || p.length > f.maxLength || p.coverage < f.minCoverage) return false;
    if (f.minBand > 0 && (p.rarity?.band ?? 0) < f.minBand) return false;
    if (terms.length) {
      const values = p.elements.map((e) => e.value.toLowerCase());
      return terms.every((t) => values.includes(t));
    }
    return true;
  });
}

const byKey = (a: PatternResult, b: PatternResult) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Primary comparators, ascending. */
const PRIMARY: Record<SortKey, (a: PatternResult, b: PatternResult) => number> = {
  frequency: (a, b) => a.total - b.total,
  length: (a, b) => a.length - b.length,
  coverage: (a, b) => a.coverage - b.coverage,
  orderInQ: (a, b) => a.firstInQ - b.firstInQ,
  // Higher band = rarer; within a band, lower Zipf = rarer.
  rarity: (a, b) => a.rarity!.band! - b.rarity!.band! || b.rarity!.minZipf! - a.rarity!.minZipf!,
};

const scored = (p: PatternResult) => p.rarity?.band != null;

/** Fixed tie-breakers (independent of direction): frequency, length, position in Q, key. */
const TIES = (a: PatternResult, b: PatternResult) =>
  b.total - a.total || b.length - a.length || a.firstInQ - b.firstInQ || byKey(a, b);

/** Deterministic: the primary key follows `dir`; ties are always broken the same way. */
export function sortPatterns(patterns: PatternResult[], by: SortKey, dir: SortDir = DEFAULT_DIR[by]): PatternResult[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...patterns].sort((a, b) => {
    // Patterns without a rarity score (e.g. POS-only) always sort last.
    if (by === 'rarity' && scored(a) !== scored(b)) return scored(a) ? -1 : 1;
    if (by === 'rarity' && !scored(a)) return TIES(a, b);
    return sign * PRIMARY[by](a, b) || TIES(a, b);
  });
}
