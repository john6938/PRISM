import * as A from '../app/store';
import { state } from '../app/store';
import { roleName } from '../export/export';
import type { PatternResult } from '../model/types';
import { bandLabel } from '../rarity/methods';
import { type KwicLine, kwicLine } from '../results/concordance';
import { chips, posLabel } from './chips';
import { fmt, h, icon, replace } from './dom';

const KWIC_PAGE = 10;

function tile(label: string, value: string, sub: string) {
  return h('div', { class: 'tile' }, h('span', { class: 'tile-label' }, label), h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-sub' }, sub));
}

function distribution(p: PatternResult): HTMLElement {
  const ds = state.resultDatasets;
  const max = Math.max(...p.counts, 1);
  return h('section', { class: 'detail-section' },
    h('h3', { class: 'sub-title' }, 'Distribution by dataset'),
    h('p', { class: 'muted small' }, 'Raw frequency, with rate per 10,000 words for comparing datasets of different sizes.'),
    h('div', { class: 'dist', role: 'table', 'aria-label': 'Occurrences per dataset' }, p.counts.map((c, i) =>
      h('div', { class: 'dist-row', role: 'row', title: `${ds[i].name}: ${c} occurrences, ${(c / ds[i].wordCount * 10000).toFixed(1)} per 10k words` },
        h('span', { class: 'dist-role', role: 'rowheader' }, roleName(i)),
        h('span', { class: 'dist-track' }, h('span', { class: `dist-fill${i === 0 ? ' q' : ''}`, style: `width:${(c / max) * 100}%` })),
        h('span', { class: 'dist-num', role: 'cell' }, fmt(c)),
        h('span', { class: 'dist-rate', role: 'cell' }, `${(c / ds[i].wordCount * 10000).toFixed(1)}/10k`)))));
}

const STATUS_NOTE: Record<string, string> = { 'off-list': 'not in list', number: 'number, not scored', clitic: 'contraction' };

function raritySection(p: PatternResult): HTMLElement | null {
  const r = p.rarity, info = state.result?.rarity;
  if (!r || !info) return null;
  const pm = (v: number | null) => (v === null ? '—' : v >= 10 ? fmt(Math.round(v)) : v.toFixed(v >= 1 ? 1 : 2));
  return h('section', { class: 'detail-section' },
    h('h3', { class: 'sub-title' }, 'Word rarity'),
    h('p', { class: 'muted small' }, `${info.label}: frequency band of each word's family (1k = most common, 25k = least common) and how often the word occurs per million words.`),
    r.words.length === 0
      ? h('p', { class: 'muted small' }, 'This pattern has no word elements, so it has no rarity score.')
      : h('table', { class: 'rarity-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Word'), h('th', { scope: 'col' }, 'Band'), h('th', { scope: 'col' }, 'Per million'))),
          h('tbody', null, r.words.map((w) => h('tr', { class: w.band !== null && w.band === r.band && w.zipf === r.minZipf ? 'rarest' : '' },
            h('td', null, h('span', { class: 'chip chip-lex chip-sm' }, w.value), STATUS_NOTE[w.status] ? h('span', { class: 'muted small' }, ` ${STATUS_NOTE[w.status]}${w.status === 'clitic' ? ` (${w.lookup})` : ''}`) : null),
            h('td', { class: 'num' }, bandLabel(w.band)),
            h('td', { class: 'num' }, pm(w.perMillion)))))),
    h('details', { class: 'method-note small' }, h('summary', null, 'How this is calculated'),
      h('p', null, info.formula), h('p', null, `Reference: ${info.size}.`), h('p', { class: 'muted' }, info.caveat)));
}

function kwicView(line: KwicLine): HTMLElement {
  const ds = state.resultDatasets[line.dataset];
  return h('article', { class: 'kwic' },
    h('header', { class: 'kwic-head' },
      h('span', { class: `role${line.dataset === 0 ? ' role-q' : ''}` }, roleName(line.dataset)),
      h('span', { class: 'kwic-ds' }, ds.name),
      h('span', { class: 'kwic-loc' }, `${line.docTitle} · word ${fmt(line.wordInDoc)}`)),
    h('p', { class: 'kwic-ctx' }, line.left),
    h('p', { class: 'kwic-match' }, line.match.map((m) =>
      m.kind === 'plain' ? m.text
        : h('mark', { class: m.kind === 'lex' ? 'w-lex' : 'w-pos', title: m.kind === 'lex' ? `Word match (${m.pos})` : `POS match: ${posLabel(m.pos!)}`, tabindex: '0' }, m.text))),
    h('p', { class: 'kwic-ctx' }, line.right));
}

function concordance(p: PatternResult): HTMLElement {
  const n = state.resultDatasets.length;
  const k = state.kwic;
  const occ = k.dataset === 'all' ? p.occurrences : p.occurrences.filter((s) => state.result!.stream.ds[s] === k.dataset);
  let shown: number[];
  let caption: string;
  if (!k.showAll) {
    const seen = new Set<number>();
    shown = occ.filter((s) => { const d = state.result!.stream.ds[s]; if (seen.has(d)) return false; seen.add(d); return true; });
    caption = k.dataset === 'all' ? 'Showing 1 match per dataset' : `Showing 1 of ${fmt(occ.length)}`;
  } else {
    const pages = Math.max(1, Math.ceil(occ.length / KWIC_PAGE));
    const pg = Math.min(k.page, pages - 1);
    shown = occ.slice(pg * KWIC_PAGE, (pg + 1) * KWIC_PAGE);
    caption = `Matches ${fmt(pg * KWIC_PAGE + 1)}–${fmt(pg * KWIC_PAGE + shown.length)} of ${fmt(occ.length)}`;
  }
  const lines = shown.map((s) => kwicLine(state.resultDatasets, state.result!.stream, p, s));
  const pages = Math.ceil(occ.length / KWIC_PAGE);

  return h('section', { class: 'detail-section' },
    h('h3', { class: 'sub-title' }, 'KWIC concordance'),
    h('p', { class: 'muted small' }, 'Original text. ', h('mark', { class: 'w-lex' }, 'Orange, solid'), ' = word match; ', h('mark', { class: 'w-pos' }, 'yellow, dotted'), ' = POS match (hover for tag).'),
    h('div', { class: 'kwic-tabs', role: 'tablist', 'aria-label': 'Filter concordance by dataset' },
      [['all', 'All datasets'] as const, ...Array.from({ length: n }, (_, i) => [i, roleName(i)] as const)].map(([id, label]) =>
        h('button', { class: k.dataset === id ? 'on' : '', role: 'tab', 'aria-selected': String(k.dataset === id), onclick: () => A.setKwic({ dataset: id, page: 0 }) }, label))),
    h('div', { class: 'kwic-list' }, lines.length ? lines.map(kwicView) : h('p', { class: 'muted small' }, 'No occurrences in this dataset.')),
    h('div', { class: 'kwic-foot' },
      h('span', { class: 'muted small' }, caption),
      k.showAll && pages > 1 ? h('span', { class: 'kwic-nav' },
        h('button', { class: 'page', 'aria-label': 'Previous matches', disabled: k.page === 0, onclick: () => A.setKwic({ page: k.page - 1 }) }, icon('chevLeft', 14)),
        h('button', { class: 'page', 'aria-label': 'Next matches', disabled: k.page >= pages - 1, onclick: () => A.setKwic({ page: k.page + 1 }) }, icon('chevRight', 14))) : null,
      h('button', { class: 'link-btn', onclick: () => A.setKwic({ showAll: !k.showAll, page: 0 }) },
        k.showAll ? 'Show one per dataset' : `View all ${fmt(occ.length)} matches →`)));
}

export function mountDetailsPanel(root: HTMLElement) {
  A.onRender('details', () => {
    const p = state.result?.patterns.find((x) => x.key === state.selectedKey);
    if (!p) {
      replace(root,
        h('div', { class: 'sec-bar' }, h('h2', null, 'Pattern details')),
        h('p', { class: 'muted empty-detail' }, state.result ? 'Select a pattern to see its statistics, distribution and concordance.' : 'Results will appear here after you run an analysis.'));
      return;
    }
    const n = state.resultDatasets.length;
    replace(root,
      h('div', { class: 'sec-bar' },
        h('h2', null, 'Pattern details'),
        h('button', { class: 'sec-bar-btn', 'aria-label': 'Close pattern details', onclick: () => A.selectPattern(null) }, icon('close', 18))),
      chips(p.elements),
      h('div', { class: 'tiles' },
        tile('Frequency', fmt(p.total), 'total matches'),
        tile('Coverage', `${p.coverage} / ${n}`, 'datasets'),
        p.rarity ? tile('Rarity', bandLabel(p.rarity.band), p.rarity.band === null ? 'no scored words' : 'rarest word band') : tile('Length', String(p.length), 'elements')),
      h('dl', { class: 'facts' },
        p.rarity ? [h('dt', null, 'Length'), h('dd', null, `${p.length} elements`)] : null,
        h('dt', null, 'Documents'), h('dd', null, fmt(p.docFrequency)),
        h('dt', null, 'First in Q'), h('dd', null, `word ${fmt(p.firstInQ)}`),
        h('dt', null, 'Word / POS elements'), h('dd', null, `${p.nLex} / ${p.nPos}`),
        p.nPos > 0 && p.nLex > 0 ? [h('dt', { title: 'Number of lexical elements divided by pattern length' }, 'Lexical specificity'), h('dd', null, p.specificity.toFixed(2))] : null,
        h('dt', null, 'View'), h('dd', null, p.maximal ? 'Maximal pattern' : 'Constituent sub-pattern')),
      distribution(p),
      raritySection(p),
      concordance(p));
  });
}
