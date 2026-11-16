"""Build corpora-src/academic.txt from the research-abstract collections in
`Pattern explorer/Research abstracts/` (one file per domain, 100 abstracts).

    python3 scripts/build_abstracts.py
    npm run corpora -- academic

The source files are Shift-JIS (cp932) encoded and are re-encoded as UTF-8.
Each file holds 100 abstracts run together with no separator: one abstract
ends with a full stop (or ? or !) followed directly by the capital letter
that starts the next, with no space ("...cost.In this paper..."). Inside an
abstract a space always follows the full stop, so the files are split at
"[.?!]" + capital with no space, and at line breaks. This gives exactly 100
abstracts per file. A few symbols (e.g. <=, ...) were already lost as "?" in
the source files and are kept as they are.
Each domain is one dataset; each abstract is one document, separated by a
blank line, so no pattern crosses from one abstract to the next.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'Research abstracts'
OUT = ROOT / 'corpora-src' / 'academic.txt'

DOMAINS = [  # (file, dataset id, name, description)
    ('Evolutionary Computation 100SRA.txt', 'evocomp', 'Evolutionary Computation',
     '100 research abstracts on evolutionary computation.'),
    ('Image Processing 100SRA.txt', 'imageproc', 'Image Processing',
     '100 research abstracts on image processing.'),
    ('Info Theory Abstracts 100SRA.txt', 'infotheory', 'Information Theory',
     '100 research abstracts on information theory.'),
    ('Know & Data Eng 100SRA.txt', 'kde', 'Knowledge & Data Engineering',
     '100 research abstracts on knowledge and data engineering.'),
]
SPLIT = re.compile(r'(?<=[.?!])(?=[A-Z])|\n+')

HEADER = """#genre academic | Academic writing | Research abstracts from four domains: evolutionary computation, image processing, information theory, and knowledge and data engineering. 100 abstracts per domain; each abstract is a document.
#source Published research abstracts, supplied by the project team. Copyright remains with the original publishers.
#synthetic no
"""


def main() -> None:
    out = [HEADER]
    for fname, did, name, desc in DOMAINS:
        text = (SRC / fname).read_bytes().decode('cp932').replace('\r\n', '\n')
        abstracts = [re.sub(r'\s+', ' ', p).strip() for p in SPLIT.split(text)]
        abstracts = [a for a in abstracts if a]
        assert len(abstracts) == 100, (fname, len(abstracts))
        out.append(f'### {did} | {name} | {desc}\n')
        for i, a in enumerate(abstracts, 1):
            out.append(f'## {name}, abstract {i}\n\n{a}\n')
        print(f'{did}: {len(abstracts)} abstracts, {sum(len(a.split()) for a in abstracts)} words')
    OUT.write_text('\n'.join(out), encoding='utf-8')


if __name__ == '__main__':
    main()
