/**
 * Application state and actions. UI modules read state and call actions;
 * actions mutate state and notify the affected panels. Sorting, filtering,
 * paging and selection only touch view state: they never re-run analysis.
 */
import { type CorpusIndex, loadCorpusIndex, loadGenre } from '../corpus/builtin';
import { MAX_UPLOADS, readTxt, UploadError } from '../corpus/upload';
import { type AnalysisResult, type AnalysisSettings, type Dataset, DEFAULT_SETTINGS } from '../model/types';
import { DEFAULT_DIR, DEFAULT_FILTER, type SortDir, type SortKey, type ViewFilter } from '../results/view';
import { AnalysisClient, CancelledError } from '../worker/client';

export type Panel = 'left' | 'results' | 'details' | 'header';

export interface UploadItem {
  uid: number;
  fileName: string;
  status: 'reading' | 'tagging' | 'ready' | 'error';
  dataset?: Dataset;
  error?: string;
}

export interface State {
  corpusTab: 'builtin' | 'upload';
  index: CorpusIndex | null;
  genreId: string;
  genreDatasets: Dataset[];
  genreLoading: boolean;
  selected: string[];      // selected built-in dataset ids, in list order
  qId: string | null;      // dataset designated Q (built-in)
  uploads: UploadItem[];
  uploadQ: number | null;  // uid designated Q (uploads)
  uploadMessage: string | null;
  settings: AnalysisSettings;
  running: { fraction: number; label: string } | null;
  result: AnalysisResult | null;
  resultDatasets: Dataset[];
  resultLabel: string;
  resultStale: boolean;
  error: string | null;
  sort: SortKey;
  sortDir: SortDir;
  filter: ViewFilter;
  filtersOpen: boolean;
  pageNo: number;
  selectedKey: string | null;
  kwic: { dataset: number | 'all'; showAll: boolean; page: number };
}

export const state: State = {
  corpusTab: 'builtin', index: null,
  genreId: 'academic', genreDatasets: [], genreLoading: false, selected: [], qId: null,
  uploads: [], uploadQ: null, uploadMessage: null,
  settings: { ...DEFAULT_SETTINGS },
  running: null, result: null, resultDatasets: [], resultLabel: '', resultStale: false, error: null,
  sort: 'frequency', sortDir: 'desc', filter: { ...DEFAULT_FILTER }, filtersOpen: false, pageNo: 0,
  selectedKey: null, kwic: { dataset: 'all', showAll: false, page: 0 },
};

const listeners = new Map<Panel, (() => void)[]>();
export const onRender = (panel: Panel, fn: () => void) => listeners.set(panel, [...(listeners.get(panel) ?? []), fn]);
export function render(...panels: Panel[]) {
  for (const p of panels.length ? panels : [...listeners.keys()]) for (const fn of listeners.get(p) ?? []) fn();
}

let client: AnalysisClient | null = null;
const worker = () => (client ??= new AnalysisClient());

// ---------- corpus selection ----------

export async function init() {
  state.index = await loadCorpusIndex();
  if (!state.index.genres.some((g) => g.id === state.genreId)) state.genreId = state.index.genres[0]?.id ?? '';
  await selectGenre(state.genreId);
}

export async function selectGenre(id: string) {
  const g = state.index?.genres.find((x) => x.id === id);
  if (!g) return;
  state.genreId = id; state.genreLoading = true; state.error = null;
  render('left', 'header');
  try {
    state.genreDatasets = await loadGenre(g);
    state.selected = state.genreDatasets.map((d) => d.id);
    state.qId = state.selected[0] ?? null;
  } catch (e) {
    state.genreDatasets = []; state.selected = [];
    state.error = (e as Error).message;
  }
  state.genreLoading = false;
  markStale();
  render('left', 'header', 'results');
}

export function toggleDataset(id: string) {
  if (state.selected.includes(id)) {
    state.selected = state.selected.filter((x) => x !== id);
    if (state.qId === id) state.qId = state.selected[0] ?? null;
  } else {
    state.selected = state.genreDatasets.map((d) => d.id).filter((x) => x === id || state.selected.includes(x));
    state.qId ??= id;
  }
  markStale(); render('left', 'header', 'results');
}

export function setBuiltinQ(id: string) { state.qId = id; markStale(); render('left', 'header', 'results'); }

export function setCorpusTab(tab: State['corpusTab']) { state.corpusTab = tab; markStale(); render('left', 'header', 'results'); }

/** The datasets that would be analysed, in role order (Q first). */
export function roleOrderedSelection(): Dataset[] {
  if (state.corpusTab === 'builtin') {
    const sel = state.genreDatasets.filter((d) => state.selected.includes(d.id));
    const q = sel.find((d) => d.id === state.qId) ?? sel[0];
    return q ? [q, ...sel.filter((d) => d !== q)] : [];
  }
  const ready = state.uploads.filter((u) => u.status === 'ready' && u.dataset);
  const q = ready.find((u) => u.uid === state.uploadQ) ?? ready[0];
  return q ? [q, ...ready.filter((u) => u !== q)].map((u) => u.dataset!) : [];
}

// ---------- uploads ----------

let uid = 1;
export async function addUploads(files: FileList | File[], replaceUid?: number) {
  state.uploadMessage = null;
  const list = [...files];
  const room = MAX_UPLOADS - state.uploads.length + (replaceUid ? 1 : 0);
  if (list.length > room) state.uploadMessage = `Only ${MAX_UPLOADS} datasets can be uploaded; ${list.length - room} file(s) ignored.`;
  for (const file of list.slice(0, Math.max(0, room))) {
    const item: UploadItem = { uid: uid++, fileName: file.name, status: 'reading' };
    const at = replaceUid ? state.uploads.findIndex((u) => u.uid === replaceUid) : -1;
    if (at >= 0) {
      if (state.uploadQ === replaceUid) state.uploadQ = item.uid;
      state.uploads[at] = item;
      replaceUid = undefined;
    } else state.uploads.push(item);
    state.uploadQ ??= item.uid;
    markStale(); render('left', 'header', 'results');
    processUpload(item, file);
  }
  render('left');
}

async function processUpload(item: UploadItem, file: File) {
  try {
    const { text } = await readTxt(file);
    item.status = 'tagging'; render('left');
    const { tokens, tagger } = await worker().tag(text);
    const words = tokens.filter((t) => t.isWord).length;
    if (words === 0) throw new UploadError(`${file.name}: no words found after tokenisation.`);
    item.dataset = {
      id: `upload/${item.uid}`, name: file.name.replace(/\.txt$/i, ''), source: 'upload', synthetic: false,
      wordCount: words, tagger, metadata: { fileName: file.name },
      documents: [{ id: 'doc-1', title: file.name, text, tokens }],
    };
    item.status = 'ready';
  } catch (e) {
    item.status = 'error';
    item.error = e instanceof CancelledError ? 'Tagging was cancelled.' : e instanceof UploadError ? e.message : `POS tagging failed: ${(e as Error).message}`;
  }
  markStale(); render('left', 'header', 'results');
}

export function removeUpload(id: number) {
  state.uploads = state.uploads.filter((u) => u.uid !== id);
  if (state.uploadQ === id) state.uploadQ = state.uploads[0]?.uid ?? null;
  markStale(); render('left', 'header', 'results');
}
export function moveUpload(id: number, dir: -1 | 1) {
  const i = state.uploads.findIndex((u) => u.uid === id), j = i + dir;
  if (i < 0 || j < 0 || j >= state.uploads.length) return;
  [state.uploads[i], state.uploads[j]] = [state.uploads[j], state.uploads[i]];
  markStale(); render('left', 'header', 'results');
}
export function setUploadQ(id: number) { state.uploadQ = id; markStale(); render('left', 'header', 'results'); }

// ---------- analysis ----------

export function setSettings(patch: Partial<AnalysisSettings>) {
  state.settings = { ...state.settings, ...patch };
  markStale(); render('left', 'results');
}

function markStale() { if (state.result) state.resultStale = true; }

export function canRun(): string | null {
  if (state.running) return 'Analysis in progress';
  if (state.corpusTab === 'upload' && state.uploads.some((u) => u.status === 'reading' || u.status === 'tagging')) return 'Waiting for tagging to finish';
  const n = roleOrderedSelection().length;
  if (n < 2) return 'Select at least two datasets';
  if (n > 4) return 'Select at most four datasets';
  return null;
}

export async function findPatterns() {
  if (canRun()) return;
  const datasets = roleOrderedSelection();
  state.running = { fraction: 0, label: 'Starting' };
  state.error = null;
  render('left', 'results');
  try {
    const result = await worker().analyse(datasets, state.settings, (fraction, label) => {
      state.running = { fraction, label }; render('left', 'results');
    });
    state.result = result;
    state.resultDatasets = datasets;
    state.resultLabel = state.corpusTab === 'builtin'
      ? `${currentGenre()?.label ?? ''} (built-in${currentGenre()?.synthetic ? ', synthetic' : ''})`
      : 'Uploaded files';
    state.resultStale = false;
    state.pageNo = 0;
    state.selectedKey = null;
    state.kwic = { dataset: 'all', showAll: false, page: 0 };
  } catch (e) {
    if (!(e instanceof CancelledError)) state.error = (e as Error).message;
  }
  state.running = null;
  render('left', 'results', 'details', 'header');
}

export function cancelAnalysis() {
  client?.cancel();
  // Uploads being tagged are also cancelled; mark them so the user can retry.
  for (const u of state.uploads) if (u.status === 'tagging') { u.status = 'error'; u.error = 'Tagging was cancelled. Remove and upload again.'; }
}

// ---------- results view ----------

/** Choose a sort key with its default direction (sort tabs). */
export function setSort(s: SortKey) { state.sort = s; state.sortDir = DEFAULT_DIR[s]; state.pageNo = 0; render('results'); }
/** Column heading click: first click sorts by the column, the next click reverses it. */
export function toggleSort(s: SortKey) {
  if (state.sort === s) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sort = s; state.sortDir = DEFAULT_DIR[s]; }
  state.pageNo = 0; render('results');
}
export function setFilter(patch: Partial<ViewFilter>) { state.filter = { ...state.filter, ...patch }; state.pageNo = 0; render('results'); }
export function setPageNo(n: number) { state.pageNo = n; render('results'); }
export function selectPattern(key: string | null) {
  state.selectedKey = key;
  state.kwic = { dataset: 'all', showAll: false, page: 0 };
  render('results', 'details');
}
export function setKwic(patch: Partial<State['kwic']>) { state.kwic = { ...state.kwic, ...patch }; render('details'); }
export const currentGenre = () => state.index?.genres.find((g) => g.id === state.genreId);
