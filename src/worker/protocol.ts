import type { AnalysisResult, AnalysisSettings, Dataset, TaggerInfo, Token } from '../model/types';

export type WorkerRequest =
  | { id: number; type: 'analyse'; datasets: Dataset[]; settings: AnalysisSettings; assetBase: string }
  | { id: number; type: 'tag'; text: string };

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'analysed'; result: AnalysisResult }
  | { id: number; type: 'tagged'; tokens: Token[]; tagger: TaggerInfo }
  | { id: number; type: 'error'; message: string; kind: 'analysis' | 'tagging' | 'internal' };
