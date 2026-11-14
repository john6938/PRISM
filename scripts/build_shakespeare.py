"""Build corpora-src/literary.txt from the Project Gutenberg Complete Works
of Shakespeare (eBook #100, plain-text UTF-8).

    curl -L https://www.gutenberg.org/cache/epub/100/pg100.txt -o /tmp/pg100.txt
    python3 scripts/build_shakespeare.py /tmp/pg100.txt
    npm run corpora -- literary

Only the spoken text is kept:
  - the text is split into blocks at blank lines. A block starting with a
    speaker label ("HAMLET.", "FIRST WITCH.", "ROSENCRANTZ and GUILDENSTERN.")
    starts a speech; the label is dropped. A block with no label continues
    the current speech (speeches often resume after an entrance or aside),
    unless it is a stage direction (starts with "[", "_" or a direction word
    such as Enter, Exit, Exeunt, Flourish) or an act/scene heading, which
    also ends the current speech. Only whole blocks are classed as
    directions: verse lines can begin with "Dies", "Enter" etc.;
  - bracketed directions inside speeches ("[_Aside._]", "[_Exit._]") are
    removed, including ones that run over two lines;
  - italic markers (_..._) are removed, keeping the words.
Each play is one dataset and each act one document. Speeches are separated
by a blank line, which the tagger treats as a sentence boundary, so no
pattern crosses from one speaker to the next.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'corpora-src' / 'literary.txt'

PLAYS = [  # (title line in pg100, dataset id, short name, description)
    ('THE TRAGEDY OF HAMLET, PRINCE OF DENMARK', 'hamlet', 'Hamlet', 'Tragedy, c. 1600. Full play.'),
    ('THE TRAGEDY OF OTHELLO, THE MOOR OF VENICE', 'othello', 'Othello', 'Tragedy, c. 1603. Full play.'),
    ('THE TRAGEDY OF KING LEAR', 'lear', 'King Lear', 'Tragedy, c. 1605. Full play.'),
    ('THE TRAGEDY OF MACBETH', 'macbeth', 'Macbeth', 'Tragedy, c. 1606. Full play (Folio text, with some passages attributed to Middleton).'),
]
SPEAKER = re.compile(r"^(?:[A-Z][A-Z’' .,&-]*[A-Z]|All)(?: and [A-Z][A-Z’' .,&-]*[A-Z])*\.$")
HEADING = re.compile(r'^(ACT [IVX]+|SCENE [IVX]+\..*)$')
DIRECTION_WORDS = {'Enter', 'Re-enter', 'Exit', 'Exeunt', 'Flourish', 'Alarum', 'Alarums', 'Thunder', 'Storm',
                   'Trumpets', 'Tucket', 'Sennet', 'Hautboys', 'March', 'Music', 'Knocking', 'Drum', 'Retreat'}
ACT = re.compile(r'^ACT ([IVX]+)$')
ROMAN = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5}


def play_lines(lines: list[str], title: str, all_titles: list[str]) -> list[str]:
    starts = [i for i, l in enumerate(lines) if l.strip() in all_titles and i > 100]
    s = next(i for i in starts if lines[i].strip() == title)
    later = [i for i in starts if i > s]
    end = later[0] if later else next(i for i, l in enumerate(lines) if '*** END OF THE PROJECT GUTENBERG' in l)
    body = lines[s:end]
    # The first "ACT I" is in the play's contents list; the text starts at the second.
    acts = [i for i, l in enumerate(body) if l.strip() == 'ACT I']
    return body[acts[1]:]


def clean_speech(text: str) -> str:
    text = re.sub(r'\[_?[^\]]*?_?\]', ' ', text, flags=re.S)   # bracketed directions
    text = text.replace('_', '')                               # italics markers
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in text.split('\n')]
    return '\n'.join(l for l in lines if l)


def is_direction(first: str) -> bool:
    word = first.lstrip('[_').split()[0].rstrip('.,') if first.lstrip('[_').split() else ''
    return first.startswith(('[', '_')) or word in DIRECTION_WORDS


def acts_of(play: list[str]) -> list[tuple[int, list[str]]]:
    acts: list[tuple[int, list[str]]] = []
    in_speech = False

    def add(block: list[str]) -> None:
        nonlocal in_speech
        first = block[0].strip()
        if HEADING.match(first):
            in_speech = False
            m = ACT.match(first)
            if m:
                acts.append((ROMAN[m.group(1)], []))
            return
        if SPEAKER.match(first):
            in_speech = True
            body = block[1:]
        elif is_direction(first) or not in_speech:
            # A bracketed direction can be followed by more speech in the same block.
            rest = clean_speech('\n'.join(block)) if first.startswith('[') else ''
            if rest and in_speech:
                acts[-1][1].append(rest)
            return
        else:
            body = block
        speech = clean_speech('\n'.join(body))
        if speech:
            acts[-1][1].append(speech)

    block: list[str] = []
    for raw in play + ['']:
        if raw.strip():
            block.append(raw.rstrip())
        elif block:
            add(block)
            block = []
    return acts


def main() -> int:
    src = Path(sys.argv[1])
    text = src.read_text(encoding='utf-8').replace('\r', '')
    lines = text.split('\n')
    contents = text.split('Contents', 1)[1].split('\n\n\n', 1)[0]
    all_titles = [l.strip() for l in contents.strip().split('\n')]
    out = ['#genre literary | Literary writing | Four Shakespeare tragedies, complete: Hamlet, Othello, King Lear and Macbeth. Spoken text only; speaker names and stage directions removed. Each act is a document.',
           '#source Public domain. Project Gutenberg eBook #100, The Complete Works of William Shakespeare (modernised spelling).',
           '#synthetic no', '']
    for title, did, name, desc in PLAYS:
        acts = acts_of(play_lines(lines, title, all_titles))
        assert [a for a, _ in acts] == [1, 2, 3, 4, 5], (name, [a for a, _ in acts])
        out += [f'### {did} | {name} | {desc}', '']
        words = 0
        for n, speeches in acts:
            out += [f'## {name}, Act {n}', '', '\n\n'.join(speeches), '']
            words += sum(len(re.findall(r"[A-Za-z’']+", s)) for s in speeches)
        print(f'{name}: {sum(len(s) for _, s in acts)} speeches, ~{words} words')
    OUT.write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f'-> {OUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
