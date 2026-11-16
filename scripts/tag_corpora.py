"""
Pre-tag the built-in corpora with spaCy (build time, offline).

Input:  corpora-src/<genre>.txt  (format below)
Output: public/corpora/<genre>.json and public/corpora/index.json

Source format:
    #genre <id> | <label> | <description>
    #source <source and licence>        (optional)
    #synthetic no                       (optional; default: synthetic)
    ### <dataset id> | <dataset name> | <description>
    ## <document title>
    <document text ...>

Token encoding (per document): flat list of 4-tuples
    [start, end, posIndex, flags]
flags bit 0 = sentence start, bit 1 = word (not punctuation).
A blank line in a document always starts a new sentence (paragraph or
speech boundary), so no pattern crosses it.
Whitespace tokens are dropped; the original text is kept verbatim, so the
text can be reconstructed exactly from character offsets.

Usage:
    python scripts/tag_corpora.py            # all genres
    python scripts/tag_corpora.py academic   # one genre
"""
import json
import sys
from pathlib import Path

import spacy
from spacy.language import Language

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "corpora-src"
OUT = ROOT / "public" / "corpora"
UPOS = ["ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM",
        "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "VERB", "X"]
MODEL = "en_core_web_sm"


@Language.component("blank_line_boundaries")
def blank_line_boundaries(doc):
    """Start a sentence after every blank line (runs before the parser)."""
    for i, t in enumerate(doc[:-1]):
        if t.is_space and t.text.count("\n") >= 2:
            doc[i + 1].is_sent_start = True
    return doc


def parse(path: Path) -> dict:
    genre = None
    datasets = []
    doc = None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#genre "):
            gid, label, desc = [x.strip() for x in line[7:].split("|", 2)]
            genre = {"id": gid, "label": label, "description": desc, "synthetic": True}
        elif line.startswith("#source "):
            genre["source"] = line[8:].strip()
        elif line.startswith("#synthetic "):
            genre["synthetic"] = line[11:].strip().lower() not in ("no", "false")
        elif line.startswith("### "):
            did, name, desc = [x.strip() for x in line[4:].split("|", 2)]
            datasets.append({"id": did, "name": name, "description": desc, "documents": []})
        elif line.startswith("## "):
            doc = {"title": line[3:].strip(), "lines": []}
            datasets[-1]["documents"].append(doc)
        elif doc is not None:
            doc["lines"].append(line)
    for ds in datasets:
        for d in ds["documents"]:
            d["text"] = "\n".join(d.pop("lines")).strip()
    return {"genre": genre, "datasets": datasets}


def tag_text(nlp, text: str) -> tuple[list[int], int]:
    doc = nlp(text)
    flat, words = [], 0
    for sent in doc.sents:
        first = True
        for t in sent:
            if t.is_space or t.pos_ == "SPACE":
                continue
            pos = t.pos_ if t.pos_ in UPOS else "X"
            is_word = not (t.is_punct or pos == "PUNCT")
            words += is_word
            flat += [t.idx, t.idx + len(t.text), UPOS.index(pos), (1 if first else 0) | (2 if is_word else 0)]
            first = False
    return flat, words


def main(only: list[str]) -> None:
    nlp = spacy.load(MODEL)
    nlp.max_length = 2_000_000
    nlp.add_pipe("blank_line_boundaries", before="parser")
    tagger = {
        "name": "spaCy", "version": spacy.__version__,
        "model": f"{MODEL} {nlp.meta['version']}", "tagset": "UPOS", "mode": "build-time",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for path in sorted(SRC.glob("*.txt")):
        corpus = parse(path)
        g = corpus["genre"]
        if only and g["id"] not in only:
            prev = OUT / f"{g['id']}.json"
            if prev.exists():
                index.append(json.loads(prev.read_text())["summary"])
            continue
        total = 0
        for ds in corpus["datasets"]:
            ds_words = 0
            for i, d in enumerate(ds["documents"]):
                d["id"] = f"{ds['id']}-{i + 1}"
                d["tokens"], w = tag_text(nlp, d["text"])
                ds_words += w
            ds["wordCount"] = ds_words
            total += ds_words
        summary = {**g, "file": f"{g['id']}.json", "wordCount": total,
                   "datasets": [{"id": d["id"], "name": d["name"], "wordCount": d["wordCount"]} for d in corpus["datasets"]]}
        out = {"summary": summary, "tagger": tagger, "upos": UPOS, "datasets": corpus["datasets"]}
        (OUT / f"{g['id']}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index.append(summary)
        print(f"{g['id']}: {total} words in {len(corpus['datasets'])} datasets")
    order = ["literary", "academic", "newspaper", "learner"]
    index.sort(key=lambda s: order.index(s["id"]) if s["id"] in order else 99)
    (OUT / "index.json").write_text(json.dumps({"tagger": tagger, "genres": index}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
