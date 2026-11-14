/**
 * Word-frequency reference list (built by scripts/build_reference_words.py
 * from the BNC/COCA word-family lists). Pure data access: no DOM, no fetch
 * except in `loadReferenceWords`.
 */

export interface ReferenceMeta {
  id: string;
  label: string;        // shown in the UI: "Reference corpus"
  name: string;
  source: string;
  bandBasis: string;
  countBasis: string;
  families: number;
  forms: number;
  countTotal: number;   // sum of per-form counts: the denominator for rates
}

export interface RawReferenceWords {
  meta: ReferenceMeta;
  bands: string[];
  forms: Record<string, [number, number]>;
}

export interface ReferenceWords {
  meta: ReferenceMeta;
  bands: string[];
  /** Lower-cased form -> [band 1..25, count]. */
  get(form: string): [number, number] | undefined;
}

export function parseReferenceWords(raw: RawReferenceWords): ReferenceWords {
  const map = new Map(Object.entries(raw.forms));
  return { meta: raw.meta, bands: raw.bands, get: (f) => map.get(f) };
}

let cached: Promise<ReferenceWords> | null = null;

/** Fetch once per worker/page; `base` is Vite's BASE_URL. */
export function loadReferenceWords(base: string): Promise<ReferenceWords> {
  if (!cached) {
    cached = fetch(`${base}reference/bnc-coca-words.json`)
      .then((r) => {
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(`could not load the reference word list (${r.status}).`);
        return r.json();
      })
      .then(parseReferenceWords);
    cached.catch(() => { cached = null; });
  }
  return cached;
}
