/**
 * Built-in corpora: loaded from pre-tagged JSON produced at build time by
 * scripts/tag_corpora.py (spaCy). Comparisons never cross genres.
 */
import type { Dataset, TaggerInfo, Token } from '../model/types';

export interface GenreSummary {
  id: string;
  label: string;
  description: string;
  file: string;
  synthetic: boolean;
  /** Source and licence of authentic corpora. */
  source?: string;
  wordCount: number;
  datasets: { id: string; name: string; wordCount: number }[];
}

export interface CorpusIndex {
  tagger: TaggerInfo;
  genres: GenreSummary[];
}

interface RawGenre {
  tagger: TaggerInfo;
  upos: string[];
  summary: GenreSummary;
  datasets: {
    id: string; name: string; description: string; wordCount: number;
    documents: { id: string; title: string; text: string; tokens: number[] }[];
  }[];
}

const base = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<Dataset[]>>();

export async function loadCorpusIndex(): Promise<CorpusIndex> {
  const res = await fetch(`${base}corpora/index.json`);
  if (!res.ok) throw new Error(`Could not load corpus index (${res.status}).`);
  return res.json();
}

export function decodeTokens(text: string, flat: number[], upos: string[]): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < flat.length; i += 4) {
    const start = flat[i], end = flat[i + 1], flags = flat[i + 3];
    const form = text.slice(start, end);
    tokens.push({ form, norm: form.toLowerCase(), pos: upos[flat[i + 2]], start, end, sentStart: (flags & 1) === 1, isWord: (flags & 2) === 2 });
  }
  return tokens;
}

export function loadGenre(g: GenreSummary): Promise<Dataset[]> {
  let p = cache.get(g.id);
  if (!p) {
    p = fetch(`${base}corpora/${g.file}`)
      .then((r) => { if (!r.ok) throw new Error(`Could not load ${g.label} corpus (${r.status}).`); return r.json() as Promise<RawGenre>; })
      .then((raw) => raw.datasets.map((d) => ({
        id: `${g.id}/${d.id}`, name: d.name, description: d.description, source: 'builtin' as const,
        synthetic: raw.summary.synthetic, wordCount: d.wordCount, tagger: raw.tagger,
        metadata: { genre: g.label },
        documents: d.documents.map((doc) => ({ id: doc.id, title: doc.title, text: doc.text, tokens: decodeTokens(doc.text, doc.tokens, raw.upos) })),
      })));
    p.catch(() => cache.delete(g.id));
    cache.set(g.id, p);
  }
  return p;
}
