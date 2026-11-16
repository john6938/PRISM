"""Build corpora-src/learner.txt from PELIC, the University of Pittsburgh
English Language Institute Corpus (Juffs, Han & Naismith 2020; CC BY-NC-ND 4.0;
https://github.com/ELI-Data-Mining-Group/PELIC-dataset).

    # answer.csv is stored with git-lfs; download the raw files, e.g.
    #   https://media.githubusercontent.com/media/ELI-Data-Mining-Group/PELIC-dataset/master/corpus_files/answer.csv
    # (also course.csv, question.csv, student_information.csv) into one folder.
    python3 scripts/build_learner.py "../PELIC"
    npm run corpora -- learner

Selection (deterministic):
  - four first languages: Arabic, Chinese, Japanese, Spanish (one dataset each);
  - essays (question type 4) written in Writing classes at Level 4
    (Upper-Intermediate, about CEFR B1+/B2), so proficiency and task type are
    held constant; prompts differ between classes and cannot be matched;
  - drafts: a student's essays that share at least 10% of their word
    5-grams are treated as versions of one essay, and only the latest
    (highest version, then latest submission) is kept;
  - 250-900 words (PELIC text_len); essays containing a line that starts
    with "#" are skipped (it would clash with the source format, and the
    licence does not allow editing the text);
  - students are taken in anon_id order, one essay per student per round
    (their essays in submission order), until the dataset reaches 10,000
    words, so each dataset has as many different writers as possible.
Texts are used exactly as published in PELIC (NoDerivatives licence):
PELIC's own anonymisation placeholders (ANON_NAME_0 etc.) are kept.
"""
from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'corpora-src' / 'learner.txt'
L1S = ['Arabic', 'Chinese', 'Japanese', 'Spanish']
LEVEL, CLASS, ESSAY = '4', 'w', '4'
MIN_WORDS, MAX_WORDS, TARGET = 250, 900, 10_000
DRAFT_OVERLAP = 0.10

HEADER = """#genre learner | Second-language learner writing | Essays by learners of English at the University of Pittsburgh English Language Institute, grouped by first language: Arabic, Chinese, Japanese and Spanish. All are Level 4 (Upper-Intermediate, about CEFR B1+/B2) writing-class essays, one final version per essay, about 10,000 words per language. Each essay is a document. Texts are unedited; ANON_ tags are PELIC's anonymisation.
#source PELIC: Juffs, A., Han, N-R. & Naismith, B. (2020). The University of Pittsburgh English Language Institute Corpus (PELIC). doi:10.5281/zenodo.3991977. Licence: CC BY-NC-ND 4.0.
#synthetic no
"""


def read(folder: Path, name: str) -> list[dict]:
    with open(folder / f'{name}.csv', encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def grams(text: str) -> set:
    w = re.findall(r"[a-z']+", text.lower())
    return {tuple(w[i:i + 5]) for i in range(len(w) - 4)}


def final_versions(essays: list[dict]) -> list[dict]:
    """Group one student's essays into drafts of the same essay; keep the latest of each."""
    parent = list(range(len(essays)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    g = [grams(e['text']) for e in essays]
    for i in range(len(essays)):
        for j in range(i + 1, len(essays)):
            if g[i] and g[j] and len(g[i] & g[j]) / min(len(g[i]), len(g[j])) >= DRAFT_OVERLAP:
                parent[find(i)] = find(j)
    groups = defaultdict(list)
    for i, e in enumerate(essays):
        groups[find(i)].append(e)
    latest = lambda e: (int(e['version']), e['created_date'], int(e['answer_id']))
    return [max(grp, key=latest) for grp in groups.values()]


def main(folder: Path) -> None:
    csv.field_size_limit(10**9)
    l1 = {s['anon_id']: s['native_language'] for s in read(folder, 'student_information')}
    course = {c['course_id']: c for c in read(folder, 'course')}
    qtype = {q['question_id']: q['question_type_id'] for q in read(folder, 'question')}
    by_student = defaultdict(list)
    for a in read(folder, 'answer'):
        c = course.get(a['course_id'], {})
        if (l1.get(a['anon_id']) in L1S and qtype.get(a['question_id']) == ESSAY
                and c.get('class_id') == CLASS and c.get('level_id') == LEVEL):
            by_student[a['anon_id']].append(a)

    out = [HEADER]
    for lang in L1S:
        pools = []
        for sid in sorted(s for s in by_student if l1[s] == lang):
            keep = [e for e in final_versions(by_student[sid])
                    if MIN_WORDS <= int(e['text_len']) <= MAX_WORDS
                    and not any(line.startswith('#') for line in e['text'].split('\n'))]
            if keep:
                pools.append(sorted(keep, key=lambda e: (e['created_date'], int(e['answer_id']))))
        chosen, words, rnd = [], 0, 0
        while words < TARGET and any(len(p) > rnd for p in pools):
            for p in pools:
                if rnd < len(p) and words < TARGET:
                    chosen.append(p[rnd]); words += int(p[rnd]['text_len'])
            rnd += 1
        writers = len({e['anon_id'] for e in chosen})
        did = lang.lower()
        out.append(f'### {did} | {lang} L1 | {len(chosen)} essays by {writers} students whose first language is {lang}. PELIC Level 4 writing class.\n')
        for e in chosen:
            out.append(f"## Student {e['anon_id']}, PELIC answer {e['answer_id']}\n\n{e['text'].strip()}\n")
        print(f'{did}: {len(chosen)} essays, {writers} writers, {words} words (PELIC count), {len(pools)} writers available')
    OUT.write_text('\n'.join(out), encoding='utf-8')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
