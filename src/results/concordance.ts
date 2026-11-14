/**
 * KWIC concordance lines reconstructed from the ORIGINAL document text using
 * token character offsets. Matched words are labelled with how they matched
 * (lexical or POS) according to the pattern element at that position;
 * punctuation and whitespace inside the span are kept verbatim, unlabelled.
 */
import type { Dataset, PatternResult, StreamMap } from '../model/types';

export interface KwicPiece {
  text: string;
  kind: 'lex' | 'pos' | 'plain';
  pos?: string; // POS tag of the original token (matched words only)
}

export interface KwicLine {
  dataset: number;        // role index
  docIndex: number;
  docTitle: string;
  wordInDoc: number;      // 1-based word position of the match start
  start: number;          // match-stream position (for ids/navigation)
  left: string;
  match: KwicPiece[];
  right: string;
}

const CONTEXT_CHARS = 80;

function trimLeft(s: string): string {
  if (s.length <= CONTEXT_CHARS) return s;
  const cut = s.slice(-CONTEXT_CHARS);
  const sp = cut.indexOf(' ');
  return '…' + (sp >= 0 ? cut.slice(sp + 1) : cut);
}
function trimRight(s: string): string {
  if (s.length <= CONTEXT_CHARS) return s;
  const cut = s.slice(0, CONTEXT_CHARS);
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : cut) + '…';
}

export function kwicLine(datasets: Dataset[], map: StreamMap, pattern: PatternResult, start: number): KwicLine {
  const L = pattern.length;
  const dsIdx = map.ds[start];
  const docIndex = map.doc[start];
  const doc = datasets[dsIdx].documents[docIndex];
  const firstTok = map.tok[start];
  const lastTok = map.tok[start + L - 1];

  // Which document tokens are matched words, and by which element.
  const elementAt = new Map<number, number>();
  for (let i = 0; i < L; i++) elementAt.set(map.tok[start + i], i);

  const match: KwicPiece[] = [];
  for (let t = firstTok; t <= lastTok; t++) {
    const tok = doc.tokens[t];
    const e = elementAt.get(t);
    const text = doc.text.slice(tok.start, tok.end);
    if (e === undefined) match.push({ text, kind: 'plain' });
    else match.push({ text, kind: pattern.elements[e].kind, pos: tok.pos });
    if (t < lastTok) {
      const gap = doc.text.slice(tok.end, doc.tokens[t + 1].start);
      if (gap) match.push({ text: gap, kind: 'plain' });
    }
  }
  const before = doc.text.slice(0, doc.tokens[firstTok].start).replace(/\s+/g, ' ');
  const after = doc.text.slice(doc.tokens[lastTok].end).replace(/\s+/g, ' ');
  return {
    dataset: dsIdx, docIndex, docTitle: doc.title, wordInDoc: map.wordInDoc[start], start,
    left: trimLeft(before), match, right: trimRight(after),
  };
}
