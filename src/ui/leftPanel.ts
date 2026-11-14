import * as A from '../app/store';
import { state } from '../app/store';
import { MAX_UPLOADS, MAX_WORDS } from '../corpus/upload';
import type { GenreSummary } from '../corpus/builtin';
import type { PatternMode, RarityMethodId } from '../model/types';
import { RARITY_METHODS } from '../rarity/methods';
import { roleName } from '../export/export';
import { fmt, h, icon, replace } from './dom';

const MODES: { id: PatternMode; label: string; hint: string; disabled?: boolean }[] = [
  { id: 'lexical', label: 'Word tokens', hint: 'Identical word sequences shared by Q and a comparison dataset.' },
  { id: 'pos', label: 'POS sequences', hint: 'Identical part-of-speech sequences, whatever the words.' },
  { id: 'hybrid', label: 'Greedy hybrid', hint: 'Combines words with grammatical structure: extends shared word anchors, preferring words over POS tags.' },
  { id: 'exploratory', label: 'Exploratory hybrid', hint: 'Planned for a later version.', disabled: true },
];

const roleBadge = (label: string, isQ = false) => h('span', { class: `role${isQ ? ' role-q' : ''}` }, label);

function corpusCard(): HTMLElement {
  const tabs = h('div', { class: 'segmented', role: 'tablist' },
    h('button', { class: state.corpusTab === 'builtin' ? 'on' : '', role: 'tab', 'aria-selected': String(state.corpusTab === 'builtin'), onclick: () => A.setCorpusTab('builtin') }, 'Built-in Corpora'),
    h('button', { class: state.corpusTab === 'upload' ? 'on' : '', role: 'tab', 'aria-selected': String(state.corpusTab === 'upload'), onclick: () => A.setCorpusTab('upload') }, 'Upload TXT Files'));
  return h('section', { class: 'step' },
    h('div', { class: 'sec-bar' }, h('h2', null, 'Corpus selection')),
    tabs,
    state.corpusTab === 'builtin' ? builtinBody() : uploadBody());
}

const shortGenre = (label: string) => label.replace(' writing', '').replace('Second-language learner', 'Learner Writing').replace('Email correspondence', 'Email');

/** Corpus details for a genre: shown on hover/focus (desktop) or inline (touch). */
function genreCard(g: GenreSummary, id: string | null): HTMLElement {
  const tagger = state.index?.tagger;
  return h('div', { class: 'genre-card', ...(id ? { id, role: 'tooltip' } : {}) },
    h('div', { class: 'genre-card-head' }, h('strong', null, g.label), h('span', { class: 'muted' }, `${fmt(g.wordCount)} words`)),
    g.synthetic ? h('p', { class: 'warn' }, 'Synthetic test data generated with an LLM. Not genuine corpus data; patterns are not findings.') : null,
    h('p', null, g.description),
    g.source ? h('p', { class: 'muted' }, g.source) : null,
    h('ul', null, g.datasets.map((d) => h('li', null, h('span', null, d.name), h('span', { class: 'muted' }, `${fmt(d.wordCount)} words`)))),
    tagger ? h('p', { class: 'muted' }, `Tagged with ${tagger.name} ${tagger.version} (${tagger.model}), UPOS tags.`) : null);
}

function builtinBody(): HTMLElement {
  const genres = state.index?.genres ?? [];
  const sel = A.roleOrderedSelection();
  const roleOf = (id: string) => sel.findIndex((d) => d.id === id);
  return h('div', null, h('div', { class: 'split' }, h('div', null,
    h('div', { class: 'label-caps' }, 'Genre'),
    h('div', { class: 'genre-grid' }, genres.map((g, i) =>
      h('div', { class: `genre-wrap${i % 2 ? ' right' : ''}` },
        h('button', { class: `genre${g.id === state.genreId ? ' on' : ''}`, 'aria-pressed': String(g.id === state.genreId), 'aria-describedby': `genre-card-${g.id}`, onclick: () => A.selectGenre(g.id) },
          shortGenre(g.label)),
        genreCard(g, `genre-card-${g.id}`)))),
    // Touch screens cannot hover: show the selected genre's details instead.
    A.currentGenre() ? h('div', { class: 'genre-about' }, genreCard(A.currentGenre()!, null)) : null),
    h('div', null,
    h('div', { class: 'row-head' }, h('span', { class: 'sub-title' }, 'Datasets'), h('span', { class: 'muted small' }, 'Select 2–4')),
    state.genreLoading ? h('p', { class: 'muted small' }, 'Loading…') :
      h('ul', { class: 'ds-list' }, state.genreDatasets.map((d) => {
        const on = state.selected.includes(d.id);
        const r = roleOf(d.id);
        return h('li', { class: `ds${on ? ' on' : ''}${r === 0 ? ' is-q' : ''}` },
          h('label', { class: 'ds-main' },
            h('input', { type: 'checkbox', checked: on, onchange: () => A.toggleDataset(d.id), 'aria-label': `Include ${d.name}` }),
            roleBadge(r >= 0 ? roleName(r) : '–', r === 0),
            h('span', { class: 'ds-text' }, h('span', { class: 'ds-name' }, d.name), h('span', { class: 'ds-sub' }, `${fmt(d.wordCount)} words`))),
          on && r > 0 ? h('button', { class: 'link-btn', onclick: () => A.setBuiltinQ(d.id) }, 'Set Q') : null);
      })))),
    h('p', { class: 'note' }, 'Q is the questioned dataset. Set Q to reassign. Q is an analytical role only and does not imply any authorship conclusion.'));
}

function uploadBody(): HTMLElement {
  const input = h('input', { type: 'file', accept: '.txt,text/plain', multiple: true, class: 'visually-hidden', id: 'file-input',
    onchange: (e: Event) => { const t = e.target as HTMLInputElement; if (t.files) A.addUploads(t.files); t.value = ''; } });
  const full = state.uploads.length >= MAX_UPLOADS;
  const drop = h('label', { class: `dropzone${full ? ' disabled' : ''}`, for: 'file-input',
    ondragover: (e: DragEvent) => { e.preventDefault(); },
    ondrop: (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer?.files.length) A.addUploads(e.dataTransfer.files); } },
    icon('upload', 20),
    h('span', null, h('span', { class: 'dz-title' }, 'Browse TXT files'), h('span', { class: 'dz-sub' }, `UTF-8 text · one dataset per file · ≤ ${fmt(MAX_WORDS)} words`)));
  const ready = state.uploads.filter((u) => u.status === 'ready');
  const sel = A.roleOrderedSelection();
  const words = ready.reduce((n, u) => n + (u.dataset?.wordCount ?? 0), 0);

  return h('div', null, h('div', { class: 'split' }, h('div', null,
    h('p', { class: 'muted small' }, `Up to ${MAX_UPLOADS} TXT files · 2–4 datasets required`),
    full ? null : [input, drop],
    state.uploadMessage ? h('p', { class: 'warn small' }, state.uploadMessage) : null,
    h('p', { class: 'note' }, 'Files are read and tagged in your browser (wink-nlp); nothing is sent to a server. Uploaded files are compared with each other, not with the built-in corpora.')),
    h('div', null,
    h('ul', { class: 'ds-list' }, state.uploads.map((u, i) => {
      const r = u.dataset ? sel.indexOf(u.dataset) : -1;
      const replaceInput = h('input', { type: 'file', accept: '.txt,text/plain', class: 'visually-hidden', id: `replace-${u.uid}`,
        onchange: (e: Event) => { const t = e.target as HTMLInputElement; if (t.files?.length) A.addUploads(t.files, u.uid); } });
      const status = u.status === 'ready' ? `${fmt(u.dataset!.wordCount)} words`
        : u.status === 'error' ? u.error : u.status === 'tagging' ? 'Tagging in your browser…' : 'Reading…';
      return h('li', { class: `ds on${r === 0 ? ' is-q' : ''}${u.status === 'error' ? ' has-error' : ''}` },
        h('div', { class: 'ds-main' },
          roleBadge(r >= 0 ? roleName(r) : '–', r === 0),
          h('span', { class: 'ds-text' }, h('span', { class: 'ds-name' }, u.fileName), h('span', { class: `ds-sub${u.status === 'error' ? ' error-text' : ''}` }, status))),
        h('div', { class: 'ds-actions' },
          u.status === 'ready' && r > 0 ? h('button', { class: 'link-btn', onclick: () => A.setUploadQ(u.uid) }, 'Set Q') : null,
          h('button', { class: 'icon-btn', title: 'Move up', 'aria-label': `Move ${u.fileName} up`, disabled: i === 0, onclick: () => A.moveUpload(u.uid, -1) }, icon('arrowUp', 14)),
          h('button', { class: 'icon-btn', title: 'Move down', 'aria-label': `Move ${u.fileName} down`, disabled: i === state.uploads.length - 1, onclick: () => A.moveUpload(u.uid, 1) }, icon('arrowDown', 14)),
          replaceInput,
          h('label', { class: 'icon-btn', for: `replace-${u.uid}`, title: 'Replace file', 'aria-label': `Replace ${u.fileName}` }, icon('swap', 14)),
          h('button', { class: 'icon-btn', title: 'Remove', 'aria-label': `Remove ${u.fileName}`, onclick: () => A.removeUpload(u.uid) }, icon('trash', 14))));
    })),
    h('p', { class: 'note' }, `${ready.length} file${ready.length === 1 ? '' : 's'} ready · ${fmt(words)} words`))));
}

function numberField(label: string, value: number, min: number, max: number, onSet: (v: number) => void, disabled = false) {
  return h('label', { class: `field${disabled ? ' disabled' : ''}` },
    h('span', { class: 'field-label' }, label),
    h('input', { type: 'number', value: String(value), min: String(min), max: String(max), disabled,
      onchange: (e: Event) => {
        const v = Math.round(Number((e.target as HTMLInputElement).value));
        if (Number.isFinite(v)) onSet(Math.min(max, Math.max(min, v))); else A.render('left');
      } }));
}

/** Start the analysis and bring Shared patterns (with its progress bar) to the top of the viewport. */
function runAndScroll() {
  A.findPatterns();
  const target = document.querySelector('.panel-centre');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function analysisCard(): HTMLElement {
  const s = state.settings;
  const mode = MODES.find((m) => m.id === s.mode)!;
  const blocked = A.canRun();
  return h('section', { class: 'step' },
    h('div', { class: 'sec-bar' }, h('h2', null, 'Analysis configuration')),
    h('div', { class: 'split' }, h('div', null,
    h('div', { class: 'label-caps' }, 'Pattern type'),
    h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Pattern type' }, MODES.map((m) =>
      h('label', { class: `radio${s.mode === m.id ? ' on' : ''}${m.disabled ? ' disabled' : ''}` },
        h('input', { type: 'radio', name: 'mode', checked: s.mode === m.id, disabled: m.disabled, onchange: () => A.setSettings({ mode: m.id }) }),
        h('span', null, m.label),
        m.disabled ? h('span', { class: 'tag-unavailable' }, 'Unavailable') : null))),
    h('p', { class: 'note' }, mode.hint)),
    h('div', null,
      h('div', { class: 'label-caps' }, 'Settings'),
      h('div', { class: 'adv-grid' },
        numberField('Min. pattern length', s.minLength, 2, 30, (v) => A.setSettings({ minLength: v, maxLength: Math.max(v, s.maxLength) })),
        numberField('Max. pattern length', s.maxLength, 2, 30, (v) => A.setSettings({ maxLength: v, minLength: Math.min(v, s.minLength) })),
        numberField('Lexical anchor length', s.anchorLength, 1, 30, (v) => A.setSettings({ anchorLength: v }), s.mode !== 'hybrid'),
        numberField('Min. total frequency', s.minFrequency, 2, 1000, (v) => A.setSettings({ minFrequency: v })),
        h('label', { class: 'field field-wide' },
          h('span', { class: 'field-label' }, 'Rarity measure'),
          h('select', { onchange: (e: Event) => A.setSettings({ rarity: (e.target as HTMLSelectElement).value as RarityMethodId }) },
            RARITY_METHODS.map((m) => h('option', { value: m.id, selected: s.rarity === m.id, disabled: !m.available }, m.label))))))),
    state.running
      ? h('div', { class: 'run-row' },
          h('button', { class: 'primary', disabled: true }, `Analysing… ${Math.round(state.running.fraction * 100)}%`),
          h('button', { class: 'secondary', onclick: () => A.cancelAnalysis() }, 'Cancel'))
      : h('button', { class: 'primary run-btn', disabled: !!blocked, title: blocked ?? '', onclick: runAndScroll }, 'Find Patterns'),
    blocked && !state.running ? h('p', { class: 'note center' }, blocked) : null);
}

/** The two control panels (01 corpus, 02 analysis) sit side by side above the results. */
export function mountControlPanels(corpusRoot: HTMLElement, analysisRoot: HTMLElement) {
  A.onRender('left', () => { replace(corpusRoot, corpusCard()); replace(analysisRoot, analysisCard()); });
}
