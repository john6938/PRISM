import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyse } from '../src/engine/analyse';
import { buildCsv, buildJson } from '../src/export/export';
import { DEFAULT_SETTINGS, type PatternElement } from '../src/model/types';
import { applyRarity } from '../src/rarity/methods';
import { parseReferenceWords, type RawReferenceWords } from '../src/rarity/reference';
import { patternRarity, wordRarity } from '../src/rarity/wordFrequency';
import { DEFAULT_FILTER, filterPatterns, sortPatterns } from '../src/results/view';
import { show, tagged } from './helpers';

const N = 1_000_000;
const ref = parseReferenceWords({
  meta: { id: 't', label: 'Reference corpus', name: 'test list', source: 'test', bandBasis: '', countBasis: '', families: 6, forms: 7, countTotal: N },
  bands: Array.from({ length: 25 }, (_, i) => `${i + 1}k`),
  forms: { the: [1, 60000], i: [1, 9000], not: [1, 4000], believe: [2, 300], firmly: [8, 20], strongly: [5, 90], reconsider: [12, 0] },
});
const lex = (...ws: string[]): PatternElement[] => ws.map((w) => ({ kind: 'lex', value: w }));

describe('word rarity', () => {
  it('looks up band and computes add-one smoothed per-million and Zipf', () => {
    const w = wordRarity(ref, 'Believe');
    expect(w.band).toBe(2);
    expect(w.perMillion).toBeCloseTo(301);
    expect(w.zipf).toBeCloseTo(Math.log10(301) + 3);
    expect(wordRarity(ref, 'reconsider').perMillion).toBeCloseTo(1); // zero count smoothed
  });

  it('maps clitics to full forms and leaves names and numbers unscored', () => {
    expect(wordRarity(ref, "n't")).toMatchObject({ status: 'clitic', lookup: 'not', band: 1 });
    expect(wordRarity(ref, 'n’t')).toMatchObject({ status: 'clitic', band: 1 });
    expect(wordRarity(ref, 'Birmingham')).toMatchObject({ status: 'off-list', band: null });
    expect(wordRarity(ref, '2024')).toMatchObject({ status: 'number', band: null });
  });

  it('scores a pattern by its rarest word, ignoring POS and unlisted words', () => {
    const r = patternRarity(ref, [...lex('i', 'firmly'), { kind: 'pos', value: 'VERB' }, ...lex('the', 'birmingham')]);
    expect(r.band).toBe(8);
    expect(r.scored).toBe(3);
    expect(r.notInList).toBe(1);
    expect(r.words.map((w) => w.value)).toEqual(['i', 'firmly', 'the', 'birmingham']);
    expect(patternRarity(ref, [{ kind: 'pos', value: 'NOUN' }]).band).toBeNull();
  });

  it('breaks ties within a band by the lower Zipf value', () => {
    const big = parseReferenceWords({ ...{ meta: ref.meta, bands: ref.bands }, forms: { a: [3, 500], b: [3, 5] } } as RawReferenceWords);
    expect(patternRarity(big, lex('a', 'b')).minZipf).toBeCloseTo(wordRarity(big, 'b').zipf!);
  });
});

describe('rarity in results, sorting, filtering and export', () => {
  const q = tagged('Q', ['I/PRON strongly/ADV believe/VERB that/SCONJ we/PRON should/AUX reconsider/VERB ./PUNCT | the/DET dog/NOUN ran/VERB home/ADV ./PUNCT']);
  const k = tagged('K1', ['I/PRON firmly/ADV believe/VERB that/SCONJ they/PRON should/AUX investigate/VERB ./PUNCT | the/DET dog/NOUN ran/VERB home/ADV ./PUNCT']);
  const result = analyse([q, k], { ...DEFAULT_SETTINGS, mode: 'hybrid', minLength: 2 });
  result.rarity = applyRarity(result.patterns, ref);

  it('records the method and reference with the result', () => {
    expect(result.rarity!.label).toBe('Reference corpus');
    expect(result.rarity!.formula).toContain('add-one');
    expect(result.patterns.every((p) => p.rarity)).toBe(true);
  });

  it('sorts rarest first, with unscored patterns last in both directions', () => {
    const all = filterPatterns(result.patterns, { ...DEFAULT_FILTER, showAll: true });
    const desc = sortPatterns(all, 'rarity', 'desc');
    const asc = sortPatterns(all, 'rarity', 'asc');
    const bands = (ps: typeof all) => ps.map((p) => p.rarity!.band);
    expect(desc[0].rarity!.band).toBe(Math.max(...bands(all).map((b) => b ?? 0)));
    for (const list of [desc, asc]) {
      const firstNull = bands(list).indexOf(null);
      if (firstNull >= 0) expect(bands(list).slice(firstNull).every((b) => b === null)).toBe(true);
    }
  });

  it('filters by minimum rarest band', () => {
    const rare = filterPatterns(result.patterns, { ...DEFAULT_FILTER, showAll: true, minBand: 2 });
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((p) => p.rarity!.band! >= 2)).toBe(true);
    expect(rare.length).toBeLessThan(result.patterns.length);
  });

  it('exports rarity columns and the method description', () => {
    const patterns = sortPatterns(filterPatterns(result.patterns, DEFAULT_FILTER), 'rarity');
    const ctx = { result, datasets: [q, k], patterns, sort: 'rarity' as const, sortDir: 'desc' as const, filter: DEFAULT_FILTER, corpusLabel: 'test' };
    const csv = buildCsv(ctx);
    expect(csv).toContain('# Rarity: Reference corpus');
    expect(csv.split('\n').find((l) => l.startsWith('pattern,'))).toContain('rarest_band,rarest_zipf,mean_zipf,words_not_in_list,word_bands');
    const j = buildJson(ctx);
    expect(j.rarity?.method).toBe('word-frequency');
    const p = j.patterns.find((x) => x.representation === 'I ADV believe that PRON should VERB')!;
    expect(p.rarity?.rarestBand).toBe(2);
    expect(show(result.patterns.find((x) => x.rarity!.band === 2)!)).toBeTruthy();
  });
});

describe('shipped reference list', () => {
  const raw = JSON.parse(readFileSync(new URL('../public/reference/bnc-coca-words.json', import.meta.url), 'utf-8')) as RawReferenceWords;
  const real = parseReferenceWords(raw);

  it('has 25 bands and plausible bands for known words', () => {
    expect(raw.bands).toHaveLength(25);
    expect(real.meta.families).toBeGreaterThan(24_900);
    expect(wordRarity(real, 'the').band).toBe(1);
    expect(wordRarity(real, 'walked').band).toBe(1);
    expect(wordRarity(real, "n't").band).toBe(1);
    expect(wordRarity(real, 'zowie').band).toBe(25);
  });
});
