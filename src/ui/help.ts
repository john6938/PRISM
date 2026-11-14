/**
 * "How it works" dialog, opened from the ? button in the header. Replaces the
 * former Corpus guide page: corpus details now appear on hover over each
 * genre (see leftPanel.ts), and method notes live here.
 */
import { METHOD_NOTES } from '../export/export';
import { chips } from './chips';
import { h } from './dom';

let dialog: HTMLDialogElement | null = null;

function build(): HTMLDialogElement {
  const close = () => d.close();
  const d = h('dialog', { class: 'help-dialog', 'aria-labelledby': 'help-title',
    onclick: (e: MouseEvent) => { if (e.target === d) close(); } },  // click on the backdrop closes
    h('div', { class: 'help-body' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title', id: 'help-title' }, 'How it works'),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('h3', { class: 'sub-title' }, 'Pattern types'),
      h('p', null, h('strong', null, 'Word tokens. '), 'Contiguous sequences of identical words shared by Q and at least one comparison dataset.'),
      h('p', null, h('strong', null, 'POS sequences. '), 'Contiguous sequences of identical part-of-speech tags, whatever the words.'),
      h('p', null, h('strong', null, 'Greedy hybrid. '), 'Starts from shared word sequences of at least the lexical anchor length, then extends left and right one position at a time. Words are compared first; if they differ, POS tags are compared. Extension stops when neither matches, at a sentence or document boundary, or at the maximum length. For example:'),
      h('div', { class: 'guide-example' },
        h('p', null, 'I strongly believe that we should reconsider'),
        h('p', null, 'I firmly believe that they should investigate'),
        chips([{ kind: 'lex', value: 'i', form: 'I' }, { kind: 'pos', value: 'ADV' }, { kind: 'lex', value: 'believe' }, { kind: 'lex', value: 'that' }, { kind: 'pos', value: 'PRON' }, { kind: 'lex', value: 'should' }, { kind: 'pos', value: 'VERB' }])),
      h('ul', { class: 'small' }, Object.values(METHOD_NOTES).map((t) => h('li', null, t))),
      h('h3', { class: 'sub-title' }, 'Word rarity'),
      h('p', null, 'Each word in a pattern is looked up in the reference corpus word list. Words belong to word families (for example, ', h('em', null, 'accept, accepted, acceptable'), '), and families are ranked by frequency in bands of 1,000: 1k holds the 1,000 most common families, 25k the least common of the 25,000 listed.'),
      h('ul', { class: 'small' },
        h('li', null, "A pattern's rarity is the band of its rarest word. Within a band, the word with the lower frequency per million counts as rarer."),
        h('li', null, 'Frequency per million uses add-one smoothing, so listed words with a count of zero still get a value.'),
        h('li', null, "POS elements, numbers and words not in the list (most names, new words, many hyphenated compounds) are not scored. Contractions such as n't are scored as their full forms."),
        h('li', null, 'Rarity describes general English. It is not a measure of forensic evidential strength.')),
      h('h3', { class: 'sub-title' }, 'Corpora'),
      h('p', { class: 'small' }, 'Hover over a genre to see its source, size and datasets. Built-in corpora are tagged at build time with spaCy. Uploaded files are tagged in your browser with wink-nlp and compared only with each other, because the two taggers differ.'),
      h('h3', { class: 'sub-title' }, 'Planned'),
      h('ul', { class: 'small' },
        h('li', null, 'Further rarity measures: bigram and trigram z-scores, and keyness.'),
        h('li', null, 'Exploratory hybrid matching (bounded branching or beam search).'),
        h('li', null, 'v2.0: real-time tagging with the same tagger for uploads and built-in corpora.'))));
  document.body.appendChild(d);
  return d;
}

export function openHelp() {
  dialog ??= build();
  dialog.showModal();
}
