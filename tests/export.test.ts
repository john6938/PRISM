import { describe, expect, it } from 'vitest';
import { analyse } from '../src/engine/analyse';
import { buildCsv, buildJson } from '../src/export/export';
import { DEFAULT_SETTINGS } from '../src/model/types';
import { DEFAULT_FILTER, filterPatterns, sortPatterns } from '../src/results/view';
import { tagged } from './helpers';

describe('export', () => {
  const q = tagged('Q', ['I/PRON strongly/ADV believe/VERB that/SCONJ we/PRON should/AUX reconsider/VERB ./PUNCT']);
  const k = tagged('K1', ['I/PRON firmly/ADV believe/VERB that/SCONJ they/PRON should/AUX investigate/VERB ./PUNCT']);
  const result = analyse([q, k], DEFAULT_SETTINGS);
  const patterns = sortPatterns(filterPatterns(result.patterns, DEFAULT_FILTER), 'frequency');
  const ctx = { result, datasets: [q, k], patterns, sort: 'frequency' as const, sortDir: 'desc' as const, filter: DEFAULT_FILTER, corpusLabel: 'test' };

  it('JSON reflects computed results, settings and preprocessing metadata', () => {
    const j = buildJson(ctx);
    expect(j.settings).toEqual(DEFAULT_SETTINGS);
    expect(j.preprocessing.tagger.name).toBe('test');
    const p = j.patterns.find((x) => x.representation === 'I ADV believe that PRON should VERB')!;
    expect(p.counts).toEqual({ Q: 1, K1: 1 });
    expect(p.occurrences.map((o) => o.text)).toEqual(['I strongly believe that we should reconsider', 'I firmly believe that they should investigate']);
    expect(j.view.filter.maxLength).toBeNull(); // Infinity is not valid JSON
  });

  it('CSV has metadata comments, a header and one row per exported pattern', () => {
    const csv = buildCsv(ctx);
    const lines = csv.trim().split('\n');
    const body = lines.filter((l) => !l.startsWith('#'));
    expect(lines.some((l) => l.startsWith('# Settings:'))).toBe(true);
    expect(body[0].startsWith('pattern,element_kinds,length')).toBe(true);
    expect(body).toHaveLength(patterns.length + 1);
    expect(csv).toContain('I ADV believe that PRON should VERB,WPWWPWP,7');
  });
});
