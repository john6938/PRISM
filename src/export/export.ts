/**
 * CSV and JSON export of computed results. Everything exported is taken from
 * the actual analysis result; nothing is recomputed or estimated here.
 */
import type { AnalysisResult, Dataset, PatternResult } from '../model/types';
import type { SortDir, SortKey, ViewFilter } from '../results/view';

export const APP_VERSION = '0.2.0';
export const roleName = (i: number) => (i === 0 ? 'Q' : `K${i}`);

export const METHOD_NOTES = {
  matching: 'Lexical elements match the lower-cased word form; POS elements match any word with that UPOS tag. Punctuation is excluded from matching. Patterns never cross sentence or document boundaries.',
  overlap: 'Every distinct start position counts as one occurrence; overlapping occurrences are all counted.',
  shared: 'Only patterns occurring in Q and at least one comparison dataset are reported.',
  counting: 'Occurrences are counted by independently searching all selected datasets for each pattern representation after discovery.',
  maximal: 'A pattern is maximal if no other reported pattern contains it as a contiguous sub-sequence.',
  statistics: 'Frequencies are descriptive. Optional word rarity compares words with a general-English reference corpus. No keyness or evidential-strength measure is computed.',
};

export interface ExportContext {
  result: AnalysisResult;
  datasets: Dataset[];         // role order
  patterns: PatternResult[];   // the exported view (filtered + sorted)
  sort: SortKey;
  sortDir: SortDir;
  filter: ViewFilter;
  corpusLabel: string;
}

export const representation = (p: PatternResult) => p.elements.map((e) => (e.kind === 'pos' ? e.value : e.form ?? e.value)).join(' ');

function occurrenceRecords(ctx: ExportContext, p: PatternResult) {
  const m = ctx.result.stream;
  return p.occurrences.map((start) => {
    const d = m.ds[start];
    const doc = ctx.datasets[d].documents[m.doc[start]];
    const first = doc.tokens[m.tok[start]];
    const last = doc.tokens[m.tok[start + p.length - 1]];
    return { dataset: roleName(d), document: doc.id, wordInDocument: m.wordInDoc[start], wordInDataset: m.wordInDs[start], charStart: first.start, charEnd: last.end, text: doc.text.slice(first.start, last.end) };
  });
}

export function buildJson(ctx: ExportContext) {
  const { result, datasets } = ctx;
  return {
    tool: { name: 'PRISM (Pattern Recognition and Investigation of Shared Matches)', version: APP_VERSION },
    exportedAt: new Date().toISOString(),
    corpus: ctx.corpusLabel,
    settings: result.settings,
    preprocessing: { tagger: datasets[0].tagger, tokenNormalisation: 'lower-case', punctuation: 'excluded from matching, preserved in text' },
    method: METHOD_NOTES,
    rarity: result.rarity ?? null,
    view: { sort: ctx.sort, sortDirection: ctx.sortDir, filter: { ...ctx.filter, maxLength: Number.isFinite(ctx.filter.maxLength) ? ctx.filter.maxLength : null }, patternsExported: ctx.patterns.length, patternsComputed: result.patterns.length },
    datasets: datasets.map((d, i) => ({ role: roleName(i), id: d.id, name: d.name, source: d.source, synthetic: d.synthetic, words: d.wordCount, documents: d.documents.map((doc) => ({ id: doc.id, title: doc.title })) })),
    patterns: ctx.patterns.map((p) => ({
      representation: representation(p),
      elements: p.elements.map((e) => ({ kind: e.kind, value: e.value, ...(e.form ? { form: e.form } : {}) })),
      length: p.length, lexicalElements: p.nLex, posElements: p.nPos, lexicalSpecificity: +p.specificity.toFixed(4),
      total: p.total,
      counts: Object.fromEntries(p.counts.map((c, i) => [roleName(i), c])),
      coverage: p.coverage, documentFrequency: p.docFrequency, firstPositionInQ: p.firstInQ, maximal: p.maximal,
      ...(p.rarity ? { rarity: {
        rarestBand: p.rarity.band, rarestZipf: round(p.rarity.minZipf), meanZipf: round(p.rarity.meanZipf), wordsNotInList: p.rarity.notInList,
        words: p.rarity.words.map((w) => ({ word: w.value, lookup: w.lookup, status: w.status, band: w.band, referenceCount: w.count, perMillion: round(w.perMillion), zipf: round(w.zipf) })),
      } } : {}),
      occurrences: occurrenceRecords(ctx, p),
    })),
  };
}

const round = (v: number | null, d = 4) => (v === null ? null : +v.toFixed(d));

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n#]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(ctx: ExportContext): string {
  const { result, datasets } = ctx;
  const roles = datasets.map((_, i) => roleName(i));
  const meta = [
    `# PRISM (Pattern Recognition and Investigation of Shared Matches) ${APP_VERSION} export, ${new Date().toISOString()}`,
    `# Corpus: ${ctx.corpusLabel}`,
    ...datasets.map((d, i) => `# ${roleName(i)}: ${d.name} (${d.wordCount} words, ${d.source}${d.synthetic ? ', SYNTHETIC test data' : ''})`),
    `# Settings: ${JSON.stringify(result.settings)}`,
    `# Tagger: ${datasets[0].tagger.name} ${datasets[0].tagger.version}${datasets[0].tagger.model ? ' / ' + datasets[0].tagger.model : ''} (${datasets[0].tagger.tagset}, ${datasets[0].tagger.mode})`,
    `# View: sort=${ctx.sort} ${ctx.sortDir}; ${ctx.filter.showAll ? 'all patterns' : 'maximal patterns'}; ${ctx.patterns.length} of ${result.patterns.length} computed patterns`,
    `# ${METHOD_NOTES.overlap} ${METHOD_NOTES.statistics}`,
    ...(result.rarity ? [`# Rarity: ${result.rarity.label} = ${result.rarity.reference} (${result.rarity.size}). ${result.rarity.formula} ${result.rarity.caveat}`] : []),
  ];
  const rar = !!result.rarity;
  const header = ['pattern', 'element_kinds', 'length', 'lexical_elements', 'pos_elements', 'lexical_specificity', 'total', ...roles.map((r) => `freq_${r}`), 'coverage', 'document_frequency', 'first_position_in_Q', 'maximal', ...(rar ? ['rarest_band', 'rarest_zipf', 'mean_zipf', 'words_not_in_list', 'word_bands'] : []), 'occurrences'];
  const rows = ctx.patterns.map((p) => [
    representation(p), p.elements.map((e) => (e.kind === 'lex' ? 'W' : 'P')).join(''), p.length, p.nLex, p.nPos, p.specificity.toFixed(4), p.total,
    ...p.counts, p.coverage, p.docFrequency, p.firstInQ, p.maximal,
    ...(rar ? [p.rarity?.band ?? '', round(p.rarity?.minZipf ?? null, 3) ?? '', round(p.rarity?.meanZipf ?? null, 3) ?? '', p.rarity?.notInList ?? '',
      (p.rarity?.words ?? []).map((w) => `${w.value}:${w.band === null ? w.status : w.band + 'k'}`).join(' ')] : []),
    occurrenceRecords(ctx, p).map((o) => `${o.dataset}:${o.document}:w${o.wordInDocument}:c${o.charStart}-${o.charEnd}`).join('; '),
  ].map(csvCell).join(','));
  return [...meta, header.join(','), ...rows].join('\n') + '\n';
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
