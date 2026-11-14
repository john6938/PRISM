import type { Dataset, DocumentText, Token } from '../src/model/types';

/**
 * Build a dataset from hand-tagged documents written as "word/POS" tokens,
 * e.g. "I/PRON strongly/ADV believe/VERB ./PUNCT". A token "|" starts a new
 * sentence. The original text is the space-joined forms (punctuation attached
 * to the preceding word), and character offsets are exact.
 */
export function tagged(name: string, docs: string[], tagger = 'test'): Dataset {
  const documents: DocumentText[] = docs.map((src, di) => {
    let text = '';
    const tokens: Token[] = [];
    let sentStart = true;
    for (const raw of src.trim().split(/\s+/)) {
      if (raw === '|') { sentStart = true; continue; }
      const slash = raw.lastIndexOf('/');
      const form = raw.slice(0, slash);
      const pos = raw.slice(slash + 1);
      const isWord = pos !== 'PUNCT';
      if (text && isWord) text += ' ';
      const start = text.length;
      text += form;
      tokens.push({ form, norm: form.toLowerCase(), pos, start, end: text.length, sentStart, isWord });
      sentStart = false;
    }
    return { id: `${name}-${di + 1}`, title: `${name} doc ${di + 1}`, text, tokens };
  });
  return {
    id: name, name, source: 'builtin', synthetic: true, documents,
    wordCount: documents.reduce((n, d) => n + d.tokens.filter((t) => t.isWord).length, 0),
    tagger: { name: tagger, version: '1', tagset: 'UPOS', mode: 'build-time' },
  };
}

/** Render a pattern as the UI shows it: words verbatim, POS tags uppercase. */
export const show = (p: { elements: { value: string; form?: string }[] }) => p.elements.map((e) => e.form ?? e.value).join(' ');
