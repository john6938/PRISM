import { describe, expect, it } from 'vitest';
import { analyse, AnalysisError } from '../src/engine/analyse';
import { countByScan, countOccurrences } from '../src/engine/count';
import { buildStream } from '../src/engine/stream';
import { DEFAULT_SETTINGS, type AnalysisSettings, type PatternResult } from '../src/model/types';
import { kwicLine } from '../src/results/concordance';
import { filterPatterns, sortPatterns, DEFAULT_FILTER } from '../src/results/view';
import { show, tagged } from './helpers';

const S = (o: Partial<AnalysisSettings>): AnalysisSettings => ({ ...DEFAULT_SETTINGS, ...o });
const find = (ps: PatternResult[], text: string) => ps.find((p) => show(p) === text);

// The remit's worked example (§6.3).
const Q_REMIT = 'I/PRON strongly/ADV believe/VERB that/SCONJ we/PRON should/AUX reconsider/VERB this/DET ./PUNCT';
const K_REMIT = 'I/PRON firmly/ADV believe/VERB that/SCONJ they/PRON should/AUX investigate/VERB ./PUNCT';

describe('greedy hybrid matching', () => {
  it('reproduces the remit example: I ADV believe that PRON should VERB', () => {
    const r = analyse([tagged('Q', [Q_REMIT]), tagged('K1', [K_REMIT])], S({ mode: 'hybrid' }));
    const p = find(r.patterns, 'I ADV believe that PRON should VERB');
    expect(p).toBeDefined();
    expect(p!.elements.map((e) => e.kind)).toEqual(['lex', 'pos', 'lex', 'lex', 'pos', 'lex', 'pos']);
    expect(p!.maximal).toBe(true);
    expect(p!.counts).toEqual([1, 1]);
    expect(p!.specificity).toBeCloseTo(4 / 7);
  });

  it('extends in both directions from an anchor in the middle', () => {
    const q = 'the/DET big/ADJ dog/NOUN ran/VERB home/ADV quickly/ADV ./PUNCT';
    const k = 'a/DET small/ADJ dog/NOUN ran/VERB away/ADV slowly/ADV ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2 }));
    expect(find(r.patterns, 'DET ADJ dog ran ADV ADV')?.maximal).toBe(true);
  });

  it('prefers lexical matches over POS matches', () => {
    // "the" matches lexically and also by POS: it must appear as a word.
    const q = 'in/ADP the/DET red/ADJ house/NOUN ./PUNCT';
    const k = 'in/ADP the/DET blue/ADJ house/NOUN ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2, minLength: 3 }));
    const p = find(r.patterns, 'in the ADJ house');
    expect(p).toBeDefined();
    expect(p!.elements.map((e) => e.kind)).toEqual(['lex', 'lex', 'pos', 'lex']);
  });

  it('switches repeatedly between lexical and POS matching', () => {
    const q = 'he/PRON said/VERB that/SCONJ the/DET cat/NOUN was/AUX very/ADV happy/ADJ today/NOUN ./PUNCT';
    const k = 'she/PRON said/VERB that/SCONJ the/DET dog/NOUN was/AUX very/ADV sad/ADJ today/NOUN ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2 }));
    expect(find(r.patterns, 'PRON said that the NOUN was very ADJ today')).toBeDefined();
  });

  it('stops at sentence and document boundaries', () => {
    // Same words continue after a sentence break: extension must stop there.
    const q = 'we/PRON really/ADV like/VERB green/ADJ tea/NOUN | many/ADJ people/NOUN agree/VERB ./PUNCT';
    const k = 'we/PRON truly/ADV like/VERB green/ADJ tea/NOUN | many/ADJ people/NOUN agree/VERB ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2 }));
    const p = find(r.patterns, 'we ADV like green tea');
    expect(p).toBeDefined();
    expect(r.patterns.every((x) => !(show(x).includes('tea') && show(x).includes('many')))).toBe(true);

    const docs = analyse(
      [tagged('Q', ['we/PRON truly/ADV like/VERB green/ADJ', 'tea/NOUN today/NOUN']),
       tagged('K1', ['we/PRON really/ADV like/VERB green/ADJ', 'tea/NOUN today/NOUN'])],
      S({ anchorLength: 2 }));
    expect(find(docs.patterns, 'we ADV like green')).toBeDefined();
    expect(docs.patterns.some((x) => show(x).includes('green tea'))).toBe(false);
  });

  it('stops when neither words nor POS tags match', () => {
    const q = 'yesterday/NOUN we/PRON quickly/ADV ate/VERB the/DET cake/NOUN ./PUNCT';
    const k = 'run/VERB we/PRON slowly/ADV ate/VERB the/DET pie/NOUN ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2 }));
    expect(find(r.patterns, 'we ADV ate the NOUN')?.maximal).toBe(true);
  });

  it('respects the maximum pattern length', () => {
    const q = 'a/DET b/NOUN c/VERB d/ADV e/ADJ f/NOUN g/VERB h/ADV ./PUNCT';
    const k = 'a/DET b/NOUN c/VERB x/ADV y/ADJ z/NOUN w/VERB v/ADV ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 3, maxLength: 5 }));
    expect(Math.max(...r.patterns.map((p) => p.length))).toBe(5);
    expect(find(r.patterns, 'a b c ADV ADJ')).toBeDefined();
  });

  it('examines all anchors, not only the longest', () => {
    const q = 'on/ADP the/DET whole/NOUN it/PRON works/VERB | by/ADP and/CCONJ large/ADJ we/PRON agree/VERB ./PUNCT';
    const k = 'on/ADP the/DET whole/NOUN they/PRON work/VERB | by/ADP and/CCONJ large/ADJ you/PRON agree/VERB ./PUNCT';
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ anchorLength: 2 }));
    expect(find(r.patterns, 'on the whole PRON VERB')).toBeDefined();
    expect(find(r.patterns, 'by and large PRON agree')).toBeDefined();
  });
});

describe('lexical and POS patterns', () => {
  const q = 'in/ADP the/DET context/NOUN of/ADP the/DET study/NOUN we/PRON found/VERB effects/NOUN ./PUNCT';
  const k = 'results/NOUN in/ADP the/DET context/NOUN of/ADP the/DET study/NOUN were/AUX clear/ADJ ./PUNCT';

  it('finds the maximal shared lexical sequence and keeps sub-patterns', () => {
    const r = analyse([tagged('Q', [q]), tagged('K1', [k])], S({ mode: 'lexical', minLength: 3 }));
    const max = r.patterns.filter((p) => p.maximal);
    expect(max.map(show)).toEqual(['in the context of the study']);
    // Constituents are retained, not discarded.
    expect(find(r.patterns, 'the context of')?.maximal).toBe(false);
    expect(find(r.patterns, 'in the context of the study')!.firstInQ).toBe(1);
  });

  it('finds POS sequences independently of the words', () => {
    const a = 'the/DET old/ADJ man/NOUN saw/VERB a/DET dog/NOUN ./PUNCT';
    const b = 'a/DET young/ADJ girl/NOUN heard/VERB the/DET bird/NOUN ./PUNCT';
    const r = analyse([tagged('Q', [a]), tagged('K1', [b])], S({ mode: 'pos', minLength: 3 }));
    expect(r.patterns.filter((p) => p.maximal).map(show)).toEqual(['DET ADJ NOUN VERB DET NOUN']);
    expect(r.patterns.every((p) => p.elements.every((e) => e.kind === 'pos'))).toBe(true);
  });

  it('excludes patterns shared only among comparison datasets', () => {
    const r = analyse([
      tagged('Q', ['nothing/PRON here/ADV matters/VERB ./PUNCT']),
      tagged('K1', ['as/ADP a/DET result/NOUN of/ADP this/DET']),
      tagged('K2', ['as/ADP a/DET result/NOUN of/ADP that/DET']),
    ], S({ mode: 'lexical' }));
    expect(r.patterns).toHaveLength(0);
  });
});

describe('independent occurrence counting', () => {
  it('counts a pattern in every dataset, not only where it was discovered', () => {
    const r = analyse([
      tagged('Q', ['I/PRON strongly/ADV believe/VERB that/SCONJ we/PRON should/AUX go/VERB ./PUNCT | I/PRON really/ADV believe/VERB that/SCONJ you/PRON should/AUX stay/VERB ./PUNCT']),
      tagged('K1', ['I/PRON firmly/ADV believe/VERB that/SCONJ they/PRON should/AUX leave/VERB ./PUNCT']),
      // K2 never paired with Q in a different way, but contains the pattern twice.
      tagged('K2', ['I/PRON also/ADV believe/VERB that/SCONJ he/PRON should/AUX win/VERB ./PUNCT', 'I/PRON truly/ADV believe/VERB that/SCONJ she/PRON should/AUX rest/VERB ./PUNCT']),
    ], S({ anchorLength: 2 }));
    const p = find(r.patterns, 'I ADV believe that PRON should VERB')!;
    expect(p.counts).toEqual([2, 1, 2]);
    expect(p.total).toBe(5);
    expect(p.coverage).toBe(3);
    expect(p.docFrequency).toBe(4);
  });

  it('counts overlapping occurrences once per start position', () => {
    const r = analyse([
      tagged('Q', ['big/ADJ red/ADJ old/ADJ car/NOUN ./PUNCT']),
      tagged('K1', ['nice/ADJ new/ADJ blue/ADJ hat/NOUN ./PUNCT']),
    ], S({ mode: 'pos', minLength: 2 }));
    expect(find(r.patterns, 'ADJ ADJ')!.counts).toEqual([2, 2]);
  });

  it('indexed counts equal a brute-force scan for every pattern', () => {
    const q = tagged('Q', [Q_REMIT + ' | ' + K_REMIT, 'in/ADP the/DET end/NOUN we/PRON should/AUX go/VERB ./PUNCT']);
    const k = tagged('K1', [K_REMIT, 'in/ADP the/DET end/NOUN they/PRON should/AUX stay/VERB ./PUNCT']);
    for (const mode of ['lexical', 'pos', 'hybrid'] as const) {
      const r = analyse([q, k], S({ mode, minLength: 2 }));
      const s = buildStream([q, k]);
      for (const p of r.patterns) {
        const codes = p.key.split(',').map(Number);
        expect(p.occurrences).toEqual(countByScan(s, codes));
        expect(countOccurrences(s, codes)).toEqual(countByScan(s, codes));
      }
    }
  });

  it('switching maximal/all views does not change counts', () => {
    const r = analyse([tagged('Q', [Q_REMIT]), tagged('K1', [K_REMIT])], S({ minLength: 3 }));
    const all = filterPatterns(r.patterns, { ...DEFAULT_FILTER, showAll: true });
    const max = filterPatterns(r.patterns, DEFAULT_FILTER);
    expect(all.length).toBeGreaterThan(max.length);
    for (const p of max) expect(all.find((a) => a.key === p.key)!.counts).toEqual(p.counts);
  });

  it('is deterministic', () => {
    const run = () => analyse([tagged('Q', [Q_REMIT]), tagged('K1', [K_REMIT])], S({}));
    expect(JSON.stringify(run().patterns)).toEqual(JSON.stringify(run().patterns));
  });
});

describe('sorting and filtering', () => {
  const mk = (key: string, total: number, length: number, firstInQ: number) =>
    ({ key, total, length, firstInQ, elements: [], maximal: true, coverage: 2 }) as unknown as PatternResult;
  const ps = [mk('b', 5, 3, 10), mk('a', 5, 3, 10), mk('c', 9, 2, 1), mk('d', 1, 7, 4)];

  it('sorts by frequency, length and order in Q with deterministic ties', () => {
    expect(sortPatterns(ps, 'frequency').map((p) => p.key)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortPatterns(ps, 'length').map((p) => p.key)).toEqual(['d', 'a', 'b', 'c']);
    expect(sortPatterns(ps, 'orderInQ').map((p) => p.key)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('reverses the primary key on request while keeping deterministic ties', () => {
    expect(sortPatterns(ps, 'frequency', 'asc').map((p) => p.key)).toEqual(['d', 'a', 'b', 'c']);
    expect(sortPatterns(ps, 'length', 'asc').map((p) => p.key)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('sorts by coverage, then by the fixed tie-breakers', () => {
    const cov = [mk('x', 3, 4, 5), mk('y', 8, 3, 9), mk('z', 2, 6, 1)];
    (cov[0] as any).coverage = 4; (cov[1] as any).coverage = 2; (cov[2] as any).coverage = 4;
    expect(sortPatterns(cov, 'coverage').map((p) => p.key)).toEqual(['x', 'z', 'y']);
    expect(sortPatterns(cov, 'coverage', 'asc').map((p) => p.key)).toEqual(['y', 'x', 'z']);
  });
});

describe('concordance alignment', () => {
  it('reproduces the original text and colours words by match type', () => {
    const q = tagged('Q', ['so/ADV ,/PUNCT I/PRON strongly/ADV believe/VERB ,/PUNCT that/SCONJ we/PRON should/AUX reconsider/VERB it/PRON ./PUNCT']);
    const k = tagged('K1', ['I/PRON firmly/ADV believe/VERB ,/PUNCT that/SCONJ they/PRON should/AUX investigate/VERB ./PUNCT']);
    const r = analyse([q, k], S({}));
    const p = find(r.patterns, 'I ADV believe that PRON should VERB')!;
    const line = kwicLine([q, k], r.stream, p, p.occurrences[0]);
    const doc = q.documents[0].text;
    expect(line.left + line.match.map((m) => m.text).join('') + line.right).toBe(doc);
    expect(line.match.filter((m) => m.kind === 'lex').map((m) => m.text)).toEqual(['I', 'believe', 'that', 'should']);
    expect(line.match.filter((m) => m.kind === 'pos').map((m) => `${m.text}/${m.pos}`)).toEqual(['strongly/ADV', 'we/PRON', 'reconsider/VERB']);
    expect(line.match.find((m) => m.text === ',')!.kind).toBe('plain');
    const kl = kwicLine([q, k], r.stream, p, p.occurrences[1]);
    expect(kl.dataset).toBe(1);
    expect(kl.match.filter((m) => m.kind === 'pos').map((m) => m.text)).toEqual(['firmly', 'they', 'investigate']);
  });
});

describe('validation', () => {
  it('rejects datasets tagged by different taggers', () => {
    expect(() => analyse([tagged('Q', [Q_REMIT], 'spaCy'), tagged('K1', [K_REMIT], 'wink')], S({})))
      .toThrow(AnalysisError);
  });
  it('rejects the exploratory mode until implemented', () => {
    expect(() => analyse([tagged('Q', [Q_REMIT]), tagged('K1', [K_REMIT])], S({ mode: 'exploratory' })))
      .toThrow(/not available/);
  });
});
