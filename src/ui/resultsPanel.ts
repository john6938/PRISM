import * as A from '../app/store';
import { state } from '../app/store';
import { buildCsv, buildJson, download, type ExportContext } from '../export/export';
import type { PatternResult } from '../model/types';
import { bandLabel } from '../rarity/methods';
import { activeFilterCount, filterPatterns, type SortDir, type SortKey, sortPatterns } from '../results/view';
import { chips, legend } from './chips';
import { fmt, h, icon, replace } from './dom';

export const PAGE_SIZE = 20;
const MODE_LABEL: Record<string, string> = { lexical: 'Word tokens', pos: 'POS sequences', hybrid: 'Greedy hybrid', exploratory: 'Exploratory hybrid' };
const SORTS: { id: SortKey; label: string; hint: string }[] = [
  { id: 'frequency', label: 'Most Frequent', hint: 'Most occurrences first' },
  { id: 'length', label: 'Longest', hint: 'Longest patterns first' },
  { id: 'orderInQ', label: 'Sequential', hint: 'In the order the patterns first occur in Q' },
];

/** Memoised view: recomputed only when result, sort or filter change. */
let memo: { r: unknown; sort: SortKey; dir: SortDir; filter: unknown; out: PatternResult[] } | null = null;
export function currentView(): PatternResult[] {
  if (!state.result) return [];
  if (!memo || memo.r !== state.result || memo.sort !== state.sort || memo.dir !== state.sortDir || memo.filter !== state.filter) {
    memo = { r: state.result, sort: state.sort, dir: state.sortDir, filter: state.filter, out: sortPatterns(filterPatterns(state.result.patterns, state.filter), state.sort, state.sortDir) };
  }
  return memo.out;
}

function exportCtx(): ExportContext | null {
  if (!state.result) return null;
  return { result: state.result, datasets: state.resultDatasets, patterns: currentView(), sort: state.sort, sortDir: state.sortDir, filter: state.filter, corpusLabel: state.resultLabel };
}
function doExport(kind: 'csv' | 'json') {
  const ctx = exportCtx();
  if (!ctx) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (kind === 'csv') download(`prism-${stamp}.csv`, buildCsv(ctx), 'text/csv;charset=utf-8');
  else download(`prism-${stamp}.json`, JSON.stringify(buildJson(ctx), null, 1), 'application/json');
}

function filtersPopover(): HTMLElement {
  const f = state.filter;
  const num = (label: string, value: number, onSet: (v: number) => void, placeholder = '') =>
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, label),
      h('input', { type: 'number', min: '0', value: value > 0 && Number.isFinite(value) ? String(value) : '', placeholder,
        onchange: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); onSet(Number.isFinite(v) ? v : 0); } }));
  return h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Result filters' },
    h('div', { class: 'adv-grid' },
      num('Min. frequency', f.minFrequency, (v) => A.setFilter({ minFrequency: v }), 'any'),
      num('Min. coverage', f.minCoverage, (v) => A.setFilter({ minCoverage: v }), 'any'),
      num('Min. length', f.minLength, (v) => A.setFilter({ minLength: v }), 'any'),
      num('Max. length', f.maxLength, (v) => A.setFilter({ maxLength: v > 0 ? v : Infinity }), 'any'),
      state.result?.rarity ? num('Rarest word from band (k)', f.minBand, (v) => A.setFilter({ minBand: Math.min(25, Math.max(0, Math.round(v))) }), 'any') : null),
    h('div', { class: 'popover-actions' },
      h('button', { class: 'link-btn', onclick: () => A.setFilter({ minFrequency: 0, minCoverage: 0, minLength: 0, maxLength: Infinity, minBand: 0 }) }, 'Reset'),
      h('button', { class: 'secondary', onclick: () => { state.filtersOpen = false; A.render('results'); } }, 'Done')));
}

function rarityCell(p: PatternResult): HTMLElement {
  const r = p.rarity!;
  const rarest = r.words.find((w) => w.band === r.band && w.zipf === r.minZipf);
  const title = r.band === null
    ? (r.notInList ? 'No word in this pattern is in the reference list' : 'No words to score (POS elements only)')
    : `Rarest word: “${rarest?.value}”, ${bandLabel(r.band)} band in the reference corpus${r.notInList ? ` · ${r.notInList} word(s) not in list` : ''}`;
  return h('span', { class: `pcell num rarity-cell band-${r.band === null ? 'none' : r.band <= 2 ? 'common' : r.band <= 9 ? 'mid' : 'rare'}`, 'data-label': 'Rarity', title }, bandLabel(r.band));
}

function patternRow(p: PatternResult, n: number): HTMLElement {
  const sel = state.selectedKey === p.key;
  const meta = `${fmt(p.counts[0])} in Q · first at word ${fmt(p.firstInQ)} · ${p.maximal ? '' : 'constituent · '}shared across ${p.coverage} datasets`;
  return h('li', null, h('button', { class: `prow${sel ? ' selected' : ''}`, 'aria-pressed': String(sel), onclick: () => A.selectPattern(sel ? null : p.key) },
    h('span', { class: 'pcell-pattern' }, chips(p.elements), h('span', { class: 'pmeta' }, meta)),
    h('span', { class: 'pcell num', 'data-label': 'Length' }, p.length),
    h('span', { class: 'pcell num', 'data-label': 'Freq.' }, fmt(p.total)),
    h('span', { class: 'pcell num', 'data-label': 'Coverage' }, `${p.coverage} / ${n}`),
    p.rarity ? rarityCell(p) : null));
}

export function mountResultsPanel(root: HTMLElement) {
  const subtitle = h('p', { class: 'panel-sub' });
  const csvBtn = h('button', { class: 'seg-btn', onclick: () => doExport('csv') }, 'CSV');
  const jsonBtn = h('button', { class: 'seg-btn', onclick: () => doExport('json') }, 'JSON');
  const sortBar = h('div', { class: 'sortbar', role: 'tablist', 'aria-label': 'Sort patterns' });
  const search = h('input', { type: 'search', placeholder: 'Filter by word or POS tag…', 'aria-label': 'Filter by word or POS tag',
    oninput: () => A.setFilter({ text: search.value }) });
  const filterBtn = h('button', { class: 'filter-btn', 'aria-haspopup': 'dialog', onclick: () => { state.filtersOpen = !state.filtersOpen; A.render('results'); } });
  const popHost = h('div', { class: 'popover-host' });
  const toggle = h('input', { type: 'checkbox', role: 'switch', onchange: () => A.setFilter({ showAll: toggle.checked }) });
  const status = h('div', { class: 'status-host' });
  const thead = h('div', { class: 'thead', role: 'row' });
  const list = h('ul', { class: 'plist' });
  const footer = h('div', { class: 'pfooter' });

  replace(root,
    h('div', { class: 'sec-bar' }, h('h2', null, 'Shared patterns')),
    h('div', { class: 'panel-head' },
      subtitle,
      h('div', { class: 'export' }, h('span', { class: 'label-caps' }, 'Export'), h('div', { class: 'seg' }, csvBtn, jsonBtn))),
    sortBar,
    h('div', { class: 'search-row' },
      h('label', { class: 'search' }, icon('search', 18), search),
      h('div', { class: 'filter-wrap' }, filterBtn, popHost)),
    h('div', { class: 'toggle-row' },
      h('label', { class: 'switch' }, toggle, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), 'Show constituent subpatterns'),
      legend()),
    status,
    thead,
    list, footer);

  A.onRender('results', () => {
    const r = state.result;
    if (!r?.rarity && state.sort === 'rarity') { state.sort = 'frequency'; state.sortDir = 'desc'; }
    const view = currentView();
    const n = state.resultDatasets.length;
    const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
    state.pageNo = Math.min(state.pageNo, pages - 1);

    subtitle.textContent = r
      ? `${fmt(view.length)} ${state.filter.showAll ? 'patterns (incl. constituents)' : 'maximal patterns'} · ${MODE_LABEL[r.settings.mode]} · ${state.resultLabel}`
      : 'Choose datasets and press Find Patterns.';
    csvBtn.disabled = jsonBtn.disabled = !r || view.length === 0;

    replace(sortBar, SORTS.map((s) => h('button', { class: state.sort === s.id ? 'on' : '', role: 'tab', 'aria-selected': String(state.sort === s.id), title: s.hint, onclick: () => A.setSort(s.id) }, s.label)));
    const nf = activeFilterCount(state.filter);
    replace(filterBtn, icon('filter', 16), 'Filters', nf ? h('span', { class: 'badge' }, nf) : null);
    filterBtn.setAttribute('aria-expanded', String(state.filtersOpen));
    replace(popHost, state.filtersOpen ? filtersPopover() : null);
    toggle.checked = state.filter.showAll;

    // Sortable column headings: click to sort, click again to reverse.
    const col = (key: SortKey, label: string, name: string) => {
      const on = state.sort === key;
      const dirWord = state.sortDir === 'asc' ? 'ascending' : 'descending';
      return h('span', { role: 'columnheader', 'aria-sort': on ? dirWord : 'none' },
        h('button', { class: `th-btn${on ? ' on' : ''}`, onclick: () => A.toggleSort(key),
          title: on ? `Sorted ${dirWord}; click to reverse` : `Sort by ${name}` },
          label, on ? icon(state.sortDir === 'asc' ? 'arrowUp' : 'arrowDown', 12) : null));
    };
    const hasRarity = !!r?.rarity;
    root.classList.toggle('with-rarity', hasRarity);
    replace(thead, h('span', { role: 'columnheader' }, 'Pattern'), col('length', 'Length', 'length'), col('frequency', 'Freq.', 'frequency'), col('coverage', 'Coverage', 'coverage'),
      hasRarity ? col('rarity', 'Rarity', 'rarity (rarest word band in the reference corpus)') : null);

    // Status: progress, errors, stale results, empty states.
    const msgs: HTMLElement[] = [];
    if (state.running) {
      msgs.push(h('div', { class: 'progress', role: 'status' },
        h('div', { class: 'progress-label' }, `${state.running.label}…`, h('button', { class: 'link-btn', onclick: () => A.cancelAnalysis() }, 'Cancel')),
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${Math.round(state.running.fraction * 100)}%` }))));
    }
    if (state.error) msgs.push(h('div', { class: 'alert', role: 'alert' }, state.error));
    if (r?.rarityError && !state.running) msgs.push(h('div', { class: 'alert', role: 'alert' }, r.rarityError));
    if (r && state.resultStale && !state.running) msgs.push(h('div', { class: 'info' }, 'Selection or settings changed since these results were computed. Press Find Patterns to update.'));
    if (r && !state.running) {
      msgs.push(h('div', { class: 'stats-line' },
        `${fmt(r.patterns.length)} patterns computed (${fmt(r.patterns.filter((p) => p.maximal).length)} maximal) from ${fmt(r.stats.words)} words in ${fmt(r.stats.elapsedMs)} ms`,
        r.stats.anchorPairs !== undefined ? ` · ${fmt(r.stats.anchorPairs)} anchor pairs examined` : ''));
    }
    replace(status, msgs);

    if (!r) {
      replace(list, h('li', { class: 'empty' }, state.running ? '' : 'No results yet.'));
    } else if (view.length === 0) {
      replace(list, h('li', { class: 'empty' }, r.patterns.length === 0
        ? 'No shared patterns were found with these settings. Try a shorter minimum length, a shorter anchor, or a different pattern type.'
        : 'No patterns match the current filters.'));
    } else {
      replace(list, view.slice(state.pageNo * PAGE_SIZE, (state.pageNo + 1) * PAGE_SIZE).map((p) => patternRow(p, n)));
    }

    const from = view.length ? state.pageNo * PAGE_SIZE + 1 : 0;
    const to = Math.min(view.length, (state.pageNo + 1) * PAGE_SIZE);
    const pageButtons: HTMLElement[] = [];
    const win = 2;
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - state.pageNo) <= win) {
        pageButtons.push(h('button', { class: `page${i === state.pageNo ? ' on' : ''}`, 'aria-current': i === state.pageNo ? 'page' : false, onclick: () => A.setPageNo(i) }, i + 1));
      } else if (Math.abs(i - state.pageNo) === win + 1) pageButtons.push(h('span', { class: 'muted' }, '…'));
    }
    replace(footer,
      h('span', { class: 'muted small' }, view.length ? `Showing ${fmt(from)}–${fmt(to)} of ${fmt(view.length)}` : ''),
      pages > 1 ? h('nav', { class: 'pager', 'aria-label': 'Result pages' },
        h('button', { class: 'page', 'aria-label': 'Previous page', disabled: state.pageNo === 0, onclick: () => A.setPageNo(state.pageNo - 1) }, icon('chevLeft', 16)),
        pageButtons,
        h('button', { class: 'page', 'aria-label': 'Next page', disabled: state.pageNo >= pages - 1, onclick: () => A.setPageNo(state.pageNo + 1) }, icon('chevRight', 16))) : null);
  });
}
