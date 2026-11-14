/**
 * Analysis pipeline: stream -> discovery -> consolidation -> independent
 * counting -> filtering (shared Q+K, min frequency) -> maximality -> stats.
 * Pure function of its inputs: the same datasets and settings always produce
 * the same result (no randomness, deterministic ordering).
 */
import type { AnalysisResult, AnalysisSettings, Dataset, PatternResult } from '../model/types';
import { countOccurrences } from './count';
import { hybridSubwindows, nonMaximalKeys } from './consolidate';
import { type Progress, STRATEGIES } from './discovery';
import { describePattern } from './stats';
import { buildStream, streamMap } from './stream';

export class AnalysisError extends Error {}

export function validate(datasets: Dataset[], settings: AnalysisSettings): void {
  if (datasets.length < 2 || datasets.length > 4) throw new AnalysisError('Select between two and four datasets.');
  const t0 = datasets[0].tagger;
  for (const d of datasets) {
    if (d.tagger.name !== t0.name || d.tagger.version !== t0.version || d.tagger.model !== t0.model) {
      throw new AnalysisError(`Datasets were tagged by different taggers (${t0.name} vs ${d.tagger.name}); results would not be comparable.`);
    }
    if (d.wordCount === 0) throw new AnalysisError(`Dataset "${d.name}" contains no words.`);
  }
  const { minLength, maxLength, anchorLength, minFrequency } = settings;
  if (!STRATEGIES[settings.mode]) throw new AnalysisError(`Pattern type "${settings.mode}" is not available in this version.`);
  if (!(minLength >= 2 && maxLength >= minLength && maxLength <= 30)) throw new AnalysisError('Pattern lengths must satisfy 2 ≤ min ≤ max ≤ 30.');
  if (settings.mode === 'hybrid' && !(anchorLength >= 1 && anchorLength <= maxLength)) throw new AnalysisError('Lexical anchor length must be between 1 and the maximum pattern length.');
  if (!(minFrequency >= 2)) throw new AnalysisError('Minimum frequency must be at least 2 (one occurrence in Q and one in a comparison dataset).');
}

export function analyse(
  datasets: Dataset[], settings: AnalysisSettings, progress: Progress = () => {},
): AnalysisResult {
  const t0 = Date.now();
  validate(datasets, settings);
  progress(0, 'Building match index');
  const stream = buildStream(datasets);
  const strategy = STRATEGIES[settings.mode]!;

  const sub = (from: number, to: number): Progress => (f, label) => progress(from + f * (to - from), label);
  const out = strategy.discover(stream, settings, sub(0.02, 0.5));
  const candidates = out.candidates;

  if (settings.mode === 'hybrid') {
    progress(0.5, 'Generating constituent sub-patterns');
    for (const codes of [...candidates.values()]) hybridSubwindows(codes, settings.minLength, candidates);
  }

  // Independent counting over all selected datasets.
  const kept = new Map<string, { codes: number[]; occ: number[] }>();
  let i = 0;
  for (const [key, codes] of candidates) {
    if (++i % 500 === 0) progress(0.55 + 0.35 * (i / candidates.size), 'Counting occurrences in all datasets');
    const occ = out.indexedOccurrences?.get(key) ?? countOccurrences(stream, codes);
    let inQ = false, inK = false;
    for (const p of occ) { if (stream.ds[p] === 0) inQ = true; else inK = true; }
    if (!inQ || !inK || occ.length < settings.minFrequency) continue;
    kept.set(key, { codes, occ });
  }

  progress(0.92, 'Identifying maximal patterns');
  const codesByKey = new Map<string, number[]>();
  for (const [k, v] of kept) codesByKey.set(k, v.codes);
  const nonMax = nonMaximalKeys(codesByKey, settings.minLength);

  // Deterministic id order: by key.
  const keys = [...kept.keys()].sort();
  const patterns: PatternResult[] = keys.map((key, id) => {
    const { codes, occ } = kept.get(key)!;
    const r = describePattern(stream, id, key, codes, occ);
    r.maximal = !nonMax.has(key);
    return r;
  });

  progress(1, 'Done');
  return {
    settings: { ...settings },
    patterns,
    stream: streamMap(stream),
    stats: { words: stream.n, candidates: candidates.size, anchorPairs: out.anchorPairs, elapsedMs: Date.now() - t0 },
  };
}
