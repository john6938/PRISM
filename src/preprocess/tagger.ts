/**
 * Tokeniser/POS-tagger interface. All datasets in one comparison must be
 * annotated by the same tagger (enforced in engine/analyse.ts).
 *
 * v0.1: built-in corpora are pre-tagged at build time with spaCy
 *       (scripts/tag_corpora.py); uploaded files are tagged in the browser
 *       with wink-nlp (winkTagger.ts). Built-in and uploaded datasets are
 *       never mixed in one comparison.
 *
 * TODO(v2.0): real-time tagging of uploads with the same tagger as the
 * built-in corpora (e.g. a UD-trained BERT UPOS model via transformers.js,
 * ~110 MB, cached), so that uploaded and built-in data can be compared.
 */
import type { TaggerInfo, Token } from '../model/types';

export interface Tagger {
  info: TaggerInfo;
  tag(text: string): Token[];
}

export class TaggingError extends Error {}
