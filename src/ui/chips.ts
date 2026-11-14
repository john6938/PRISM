/**
 * Shared visual conventions for lexical (pale green, solid) and POS (pale yellow,
 * dashed, upper-case tag) elements, used in every view. The distinction never
 * relies on colour alone: POS elements are upper-case tags with a dashed
 * outline, and every element has an accessible label.
 */
import type { PatternElement } from '../model/types';
import { h } from './dom';

export const UPOS_NAMES: Record<string, string> = {
  ADJ: 'adjective', ADP: 'adposition', ADV: 'adverb', AUX: 'auxiliary', CCONJ: 'coordinating conjunction',
  DET: 'determiner', INTJ: 'interjection', NOUN: 'noun', NUM: 'numeral', PART: 'particle', PRON: 'pronoun',
  PROPN: 'proper noun', PUNCT: 'punctuation', SCONJ: 'subordinating conjunction', SYM: 'symbol', VERB: 'verb', X: 'other',
};

export const posLabel = (tag: string) => `${tag} (${UPOS_NAMES[tag] ?? tag})`;

export function chip(e: PatternElement, small = false): HTMLElement {
  const isPos = e.kind === 'pos';
  const label = isPos ? `POS match: ${posLabel(e.value)}` : `Word match: “${e.form ?? e.value}”`;
  return h('span', { class: `chip ${isPos ? 'chip-pos' : 'chip-lex'}${small ? ' chip-sm' : ''}`, title: label, 'aria-label': label },
    isPos ? e.value : e.form ?? e.value);
}

export function chips(elements: PatternElement[], small = false): HTMLElement {
  return h('span', { class: 'chips' }, elements.map((e) => chip(e, small)));
}

export function legend(): HTMLElement {
  return h('span', { class: 'legend' },
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch swatch-lex' }), 'Word'),
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch swatch-pos' }), 'POS tag'));
}
