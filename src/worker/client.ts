import type { AnalysisResult, AnalysisSettings, Dataset, TaggerInfo, Token } from '../model/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export class CancelledError extends Error { constructor() { super('Cancelled'); } }
export class WorkerTaskError extends Error {
  constructor(message: string, public kind: 'analysis' | 'tagging' | 'internal') { super(message); }
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (f: number, l: string) => void };

/** Promise-based wrapper around the analysis worker. */
export class AnalysisClient {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() { this.spawn(); }

  private spawn() {
    this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.onProgress?.(m.fraction, m.label); return; }
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new WorkerTaskError(m.message, m.kind));
      else if (m.type === 'analysed') p.resolve(m.result);
      else p.resolve({ tokens: m.tokens, tagger: m.tagger });
    };
    this.worker.onerror = (ev) => {
      ev.preventDefault();
      for (const p of this.pending.values()) p.reject(new WorkerTaskError(ev.message || 'Background worker failed.', 'internal'));
      this.pending.clear();
    };
  }

  private send<T>(req: DistributiveOmit<WorkerRequest, 'id'>, onProgress?: Pending['onProgress']): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  analyse(datasets: Dataset[], settings: AnalysisSettings, onProgress?: Pending['onProgress']): Promise<AnalysisResult> {
    // Absolute URL of the site root: relative URLs inside a worker resolve against the worker script.
    const assetBase = new URL(import.meta.env.BASE_URL, document.baseURI).href;
    return this.send({ type: 'analyse', datasets, settings, assetBase }, onProgress);
  }

  tag(text: string): Promise<{ tokens: Token[]; tagger: TaggerInfo }> {
    return this.send({ type: 'tag', text });
  }

  /** Abort all running work by terminating the worker and starting a new one. */
  cancel() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new CancelledError());
    this.pending.clear();
    this.spawn();
  }
}
