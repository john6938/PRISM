/**
 * Performance benchmark on a ~40,000-word corpus in the pre-tagged genre JSON
 * format. Skipped unless BENCH_FILE points to such a file, e.g.
 *   BENCH_FILE=/path/to/bench.json npx vitest run tests/benchmark.test.ts
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTokens } from '../src/corpus/builtin';
import { analyse } from '../src/engine/analyse';
import { DEFAULT_SETTINGS, type Dataset } from '../src/model/types';

const file = process.env.BENCH_FILE;

describe.skipIf(!file)('benchmark (~40k words)', () => {
  const load = (): Dataset[] => {
    const raw = JSON.parse(readFileSync(file!, 'utf-8'));
    return raw.datasets.map((d: any) => ({
      id: d.id, name: d.name, source: 'builtin', synthetic: false, wordCount: d.wordCount, tagger: raw.tagger,
      documents: d.documents.map((doc: any) => ({ id: doc.id, title: doc.title, text: doc.text, tokens: decodeTokens(doc.text, doc.tokens, raw.upos) })),
    }));
  };

  for (const mode of ['lexical', 'pos', 'hybrid'] as const) {
    it(`${mode} completes`, () => {
      const ds = load();
      const r = analyse(ds, { ...DEFAULT_SETTINGS, mode });
      const max = r.patterns.filter((p) => p.maximal);
      const lens = r.patterns.map((p) => p.length);
      const top = [...max].sort((a, b) => b.total - a.total).slice(0, 8)
        .map((p) => `${p.elements.map((e) => (e.kind === 'pos' ? e.value : e.form)).join(' ')} [${p.total}]`);
      console.log(`${mode}: ${r.stats.words} words, ${r.stats.candidates} candidates, ${r.patterns.length} patterns (${max.length} maximal), ` +
        `anchorPairs=${r.stats.anchorPairs ?? '-'}, maxLen=${Math.max(...lens)}, ${r.stats.elapsedMs} ms\n  ` + top.join('\n  '));
      expect(r.patterns.length).toBeGreaterThan(0);
    }, 120_000);
  }
});
