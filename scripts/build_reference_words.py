"""Build the word-frequency reference list used for single-word rarity.

Input:  ../BNC_COCA_lists_from_EAP_foundation.xlsx
        Paul Nation's BNC/COCA word-family lists (25 bands of 1,000 families),
        as distributed by EAP Foundation. Columns: List (band, "1k".."25k"),
        Headword, Related forms ("form (count), form (count), ..."),
        Total frequency. Per-form counts are BNC counts.
Output: public/reference/bnc-coca-words.json

    {
      "meta":  { ...source, sizes, notes... },
      "bands": ["1k", ..., "25k"],
      "forms": { "<lower-cased form>": [band (1-25), BNC count], ... }
    }

A form listed under more than one family keeps its first (most frequent)
band. Run with the project venv:  npm run reference
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'BNC_COCA_lists_from_EAP_foundation.xlsx'
OUT = ROOT / 'public' / 'reference' / 'bnc-coca-words.json'
FORM_RE = re.compile(r'\s*([^,()]+?)\s*\((\d+)\)')


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    ws = openpyxl.load_workbook(src, read_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c or '').strip().lower() for c in rows[0]]
    assert header[:3] == ['list', 'headword', 'related forms'], header

    forms: dict[str, list[int]] = {}
    families = 0
    bands_seen: set[int] = set()
    duplicates = 0
    for band_label, headword, related, *_ in rows[1:]:
        if not band_label or not headword:
            continue
        band = int(str(band_label).strip().rstrip('k'))
        bands_seen.add(band)
        families += 1
        for m in FORM_RE.finditer(str(related or '')):
            form = m.group(1).strip().lower().replace('’', "'")
            if form in forms:
                duplicates += 1
                continue
            forms[form] = [band, int(m.group(2))]

    bands = sorted(bands_seen)
    assert bands == list(range(1, 26)), bands
    total = sum(c for _, c in forms.values())
    out = {
        'meta': {
            'id': 'bnc-coca-words',
            'label': 'Reference corpus',
            'name': 'BNC/COCA word-family lists (Nation), 25 x 1,000 families',
            'source': 'Paul Nation, BNC/COCA word-family lists, via EAP Foundation (BNC_COCA_lists_from_EAP_foundation.xlsx)',
            'bandBasis': 'Word-family frequency rank from the BNC/COCA lists (BNC and COCA combined)',
            'countBasis': 'Per-form counts in the British National Corpus',
            'families': families,
            'forms': len(forms),
            'countTotal': total,
            'duplicateFormsSkipped': duplicates,
        },
        'bands': [f'{b}k' for b in bands],
        'forms': forms,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{families} families, {len(forms)} forms, {total} tokens, {duplicates} duplicates skipped -> {OUT} ({OUT.stat().st_size // 1024} KB)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
