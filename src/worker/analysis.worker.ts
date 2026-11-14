/// <reference lib="webworker" />
/**
 * Background worker: tagging of uploads and pattern analysis run here so the
 * interface stays responsive. Cancelling = terminating this worker.
 */
import { analyse, AnalysisError } from '../engine/analyse';
import type { Tagger } from '../preprocess/tagger';
import { applyRarity } from '../rarity/methods';
import { loadReferenceWords } from '../rarity/reference';
import { TaggingError } from '../preprocess/tagger';
import type { WorkerRequest, WorkerResponse } from './protocol';

let tagger: Tagger | null = null;
const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'tag') {
      if (!tagger) {
        const { createWinkTagger } = await import('../preprocess/winkTagger');
        tagger = createWinkTagger();
      }
      post({ id: req.id, type: 'tagged', tokens: tagger.tag(req.text), tagger: tagger.info });
    } else {
      let last = 0;
      const result = analyse(req.datasets, req.settings, (fraction, label) => {
        const now = Date.now();
        if (now - last > 80 || fraction >= 1) { last = now; post({ id: req.id, type: 'progress', fraction, label }); }
      });
      if (req.settings.rarity === 'word-frequency') {
        post({ id: req.id, type: 'progress', fraction: 1, label: 'Scoring word rarity' });
        try {
          result.rarity = applyRarity(result.patterns, await loadReferenceWords(req.assetBase));
        } catch (e) {
          result.rarityError = `Rarity could not be calculated: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      post({ id: req.id, type: 'analysed', result });
    }
  } catch (e) {
    const kind = e instanceof AnalysisError ? 'analysis' : e instanceof TaggingError || req.type === 'tag' ? 'tagging' : 'internal';
    post({ id: req.id, type: 'error', kind, message: e instanceof Error ? e.message : String(e) });
  }
};
