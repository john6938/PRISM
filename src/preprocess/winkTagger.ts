/**
 * In-browser English tokenisation, sentence splitting and UPOS tagging with
 * wink-nlp (MIT licence). Used for uploaded TXT files.
 */
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import type { Token } from '../model/types';
import { type Tagger, TaggingError } from './tagger';

const UPOS = new Set(['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'PUNCT', 'SCONJ', 'SYM', 'VERB', 'X']);

export const WINK_VERSIONS = { nlp: '2.4.0', model: '1.8.1' };

export function createWinkTagger(): Tagger {
  const nlp = winkNLP(model, ['sbd', 'pos']);
  const its = nlp.its;
  return {
    info: {
      name: 'wink-nlp', version: WINK_VERSIONS.nlp,
      model: `wink-eng-lite-web-model ${WINK_VERSIONS.model}`, tagset: 'UPOS', mode: 'in-browser',
    },
    tag(text: string): Token[] {
      const tokens: Token[] = [];
      let cursor = 0;
      let unaligned = 0;
      const doc = nlp.readDoc(text);
      doc.sentences().each((sentence: any) => {
        let first = true;
        sentence.tokens().each((t: any) => {
          const value = t.out() as string;
          const pos = t.out(its.pos) as string;
          if (pos === 'SPACE' || /^\s*$/.test(value)) return;
          // Token values are substrings of the input; locate them in order.
          let start = text.indexOf(value, cursor);
          if (start < 0 || start - cursor > 200) { unaligned++; start = cursor; }
          const end = start + value.length;
          cursor = end;
          const tag = UPOS.has(pos) ? pos : 'X';
          const isWord = tag !== 'PUNCT' && t.out(its.type) !== 'punctuation';
          tokens.push({ form: text.slice(start, end), norm: value.toLowerCase(), pos: tag, start, end, sentStart: first, isWord });
          first = false;
        });
      });
      if (unaligned > tokens.length * 0.01) {
        throw new TaggingError(`Tokeniser output could not be aligned with the original text (${unaligned} tokens).`);
      }
      return tokens;
    },
  };
}
