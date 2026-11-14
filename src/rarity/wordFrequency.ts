/**
 * Default rarity method: single-word rarity against the reference word list.
 *
 * Each lexical element of a pattern is looked up by its lower-cased form:
 *  - band: the BNC/COCA frequency band of its word family (1k = most common
 *    1,000 families ... 25k = least common). This is the primary measure.
 *  - perMillion / zipf: the form's own BNC count with add-one smoothing,
 *    (count + 1) / N x 1,000,000, where N is the total of all listed counts;
 *    zipf = log10(perMillion) + 3. This separates words within a band.
 * POS elements carry no rarity. Words not in the list (names, numbers, new
 * words, most hyphenated compounds) are reported as "not in list" and are
 * not scored, so they neither raise nor lower a pattern's rarity.
 *
 * Pattern score: the band of its rarest scored word (higher = rarer); ties
 * are broken by the lowest Zipf value. Also reported: mean Zipf of scored
 * words and the number of words not in the list.
 */
import type { PatternElement, PatternRarity, WordRarity } from '../model/types';
import type { ReferenceWords } from './reference';

/**
 * Clitics produced by tokenisers (e.g. "do n't", "it 's", "ca n't") mapped to
 * the full form they stand for. 's is mapped to "is" whether it is a verb or a
 * possessive: both are 1k-band function words either way.
 */
export const CLITICS: Record<string, string> = {
  "n't": 'not', "'s": 'is', "'re": 'are', "'m": 'am', "'ve": 'have', "'ll": 'will', "'d": 'would',
  ca: 'can', wo: 'will', sha: 'shall', "'em": 'them',
};

const NUMERIC = /^[\d.,:/%-]+$/;

export function wordRarity(ref: ReferenceWords, value: string): WordRarity {
  const norm = value.toLowerCase().replace(/’/g, "'");
  let status: WordRarity['status'] = 'listed';
  let hit = ref.get(norm);
  let lookup = norm;
  if (!hit && CLITICS[norm]) { lookup = CLITICS[norm]; hit = ref.get(lookup); status = 'clitic'; }
  if (!hit) return { value, lookup: norm, status: NUMERIC.test(norm) ? 'number' : 'off-list', band: null, count: 0, perMillion: null, zipf: null };
  const [band, count] = hit;
  const perMillion = ((count + 1) / ref.meta.countTotal) * 1e6;
  return { value, lookup, status, band, count, perMillion, zipf: Math.log10(perMillion) + 3 };
}

export function patternRarity(ref: ReferenceWords, elements: PatternElement[]): PatternRarity {
  const words = elements.filter((e) => e.kind === 'lex').map((e) => wordRarity(ref, e.value));
  const scored = words.filter((w) => w.band !== null);
  let band: number | null = null, minZipf: number | null = null, sum = 0;
  for (const w of scored) {
    if (band === null || w.band! > band || (w.band === band && w.zipf! < minZipf!)) { band = w.band; minZipf = w.zipf; }
    sum += w.zipf!;
  }
  return {
    band,
    minZipf,
    meanZipf: scored.length ? sum / scored.length : null,
    scored: scored.length,
    notInList: words.filter((w) => w.status === 'off-list').length,
    words,
  };
}
