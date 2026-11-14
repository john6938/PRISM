/**
 * Registry of rarity methods. Each method declares its reference data and
 * formula so the UI and exports can state them explicitly (remit §8).
 * New methods (bigram/trigram z-score, keyness) are added here and in
 * `applyRarity`; the rest of the app reads only this registry.
 */
import type { PatternResult, RarityInfo, RarityMethodId } from '../model/types';
import type { ReferenceWords } from './reference';
import { patternRarity } from './wordFrequency';

export interface RarityMethod {
  id: RarityMethodId;
  label: string;
  available: boolean;
}

export const RARITY_METHODS: RarityMethod[] = [
  { id: 'word-frequency', label: 'Word rarity (reference corpus)', available: true },
  { id: 'none', label: 'Descriptive only', available: true },
  { id: 'bigram-z', label: 'Bigram z-score (planned)', available: false },
  { id: 'trigram-z', label: 'Trigram z-score (planned)', available: false },
  { id: 'keyness', label: 'Keyness (planned)', available: false },
];

export const RARITY_CAVEAT = 'Rarity describes how common words are in general English. It is not a measure of forensic evidential strength.';

export function wordFrequencyInfo(ref: ReferenceWords): RarityInfo {
  const m = ref.meta;
  return {
    method: 'word-frequency',
    label: m.label,
    reference: m.name,
    source: m.source,
    size: `${m.families.toLocaleString('en-GB')} word families in ${ref.bands.length} bands of 1,000; ${m.forms.toLocaleString('en-GB')} word forms; ${m.countTotal.toLocaleString('en-GB')} tokens counted`,
    formula: 'Each word in the pattern is looked up in the reference list. Band = frequency band of its word family (1k = most common 1,000 families, 25k = least common). Frequency per million = (count + 1) / N × 1,000,000 (add-one smoothing; N = total of listed counts); Zipf = log10(per million) + 3. Pattern rarity = band of its rarest word, ties broken by lowest Zipf. POS elements, numbers and words not in the list are not scored.',
    caveat: RARITY_CAVEAT,
  };
}

/** Attach rarity to each pattern in place and return the method description. */
export function applyRarity(patterns: PatternResult[], ref: ReferenceWords): RarityInfo {
  for (const p of patterns) p.rarity = patternRarity(ref, p.elements);
  return wordFrequencyInfo(ref);
}

export const bandLabel = (band: number | null) => (band === null ? '—' : `${band}k`);
