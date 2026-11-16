"""Build corpora-src/newspaper.txt from `Pattern explorer/Telegraph_corpus/`:
four Telegraph Travel texts by one journalist (Adrian Bridge), three marked
"known" and one "unknown" (the questioned text).

    python3 scripts/build_newspaper.py
    npm run corpora -- newspaper

The texts were copied from the web pages and include site furniture that is
not the author's writing. It would show up as patterns shared by every text,
so it is removed:
  - the promotion block "Win one of 40 holidays ... Follow Telegraph Travel
    on FourSquare" (plus a cruise-show advert and an "This article was first
    published ..." note that follow it in some texts);
  - lists of related-article headlines placed before that block.
Texts 2 and 4 each hold two separate articles with a promotion block between
them; each article becomes its own document. Each source text is one
dataset. The unknown text is listed first, so it is Q by default.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'Telegraph_corpus'
OUT = ROOT / 'corpora-src' / 'newspaper.txt'

TEXTS = [  # (file, dataset id, name, description, document titles)
    ('unknown [AdrianBridge - Text 4].txt', 'text4', 'Text 4 (unknown)',
     'Questioned text. Two articles: reviews of a fictional hotel; Germans and naturism.',
     ['The Grand Budapest Hotel reviews', 'Germans and nude sunbathing']),
    ('known [AdrianBridge - Text 1].txt', 'text1', 'Text 1 (known)',
     'Known text. Guide to the Munich Oktoberfest.', ['Munich Oktoberfest']),
    ('known [AdrianBridge - Text 2].txt', 'text2', 'Text 2 (known)',
     'Known text. Two articles: a night in Sheffield; myths of the northern lights.',
     ['A night at the Ibis Sheffield', 'Myths of the northern lights']),
    ('known [AdrianBridge - Text 3].txt', 'text3', 'Text 3 (known)',
     "Known text. London's outdoor swimming venues.", ["London's outdoor swimming"]),
]
PROMO = re.compile(r'(?:--\s*)?Win one of 40 holidays.*?Follow Telegraph Travel on FourSquare?'
                   r'(?:\s*Visit the Telegraph cruise shows.*?telegraph\.co\.uk/cruiseshow)?'
                   r'(?:\s*This article was first published.*?recommendations\.)?', re.S)
RELATED = ['The northern lights: Trip of a Lifetime', 'Books about Germany: holiday reading guide']

HEADER = """#genre newspaper | Newspaper writing | Telegraph Travel articles by one journalist (Adrian Bridge): three known texts and one unknown (questioned) text, for authorship comparison. Text 4 is Q by default. Website promotions and related-article links removed.
#source The Daily Telegraph (Telegraph Travel), 2012-2014. Copyright Telegraph Media Group; used for research and teaching.
#synthetic no
"""


def main() -> None:
    out = [HEADER]
    for fname, did, name, desc, titles in TEXTS:
        text = (SRC / fname).read_text(encoding='utf-8')
        for r in RELATED:
            text = re.sub(re.escape(r) + r'.*?(?=Win one of 40 holidays)', '', text, flags=re.S)
        articles = [a.strip() for a in PROMO.split(text)]
        articles = [a for a in articles if a]
        assert len(articles) == len(titles), (fname, len(articles))
        assert not any('Telegraph Travel' in a for a in articles), fname
        out.append(f'### {did} | {name} | {desc}\n')
        for title, a in zip(titles, articles):
            out.append(f'## {title}\n\n{a}\n')
            print(f'{did}: {title}: {len(a.split())} words; ends "...{a[-60:]}"')
    OUT.write_text('\n'.join(out), encoding='utf-8')


if __name__ == '__main__':
    main()
