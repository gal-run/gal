"""Enrich audit events with semantic text embeddings for governance signal.

Uses all-MiniLM-L6-v2 (80MB, ~2ms per encoding) to embed PR titles
as 384-dim dense vectors. These augment the 8 structured governance
features with semantic understanding of what the change actually does.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import write_jsonl

EMBEDDING_DIM = 384
MODEL_NAME = "all-MiniLM-L6-v2"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--text-field", default="title", help="Field to embed in each event")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def load_model():
    """Lazy-load the sentence transformer to avoid import cost at CLI parse time."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def enrich_events(
    events: list[dict[str, Any]],
    *,
    text_field: str,
    model: Any | None = None,
) -> list[dict[str, Any]]:
    if model is None:
        model = load_model()

    texts: list[str] = []
    indices: list[int] = []
    for idx, event in enumerate(events):
        text = event.get(text_field)
        if text and isinstance(text, str) and text.strip():
            texts.append(text.strip())
            indices.append(idx)

    if not texts:
        return events

    embeddings = model.encode(texts, show_progress_bar=False, batch_size=32)
    for i, idx in enumerate(indices):
        emb = embeddings[i].tolist()
        events[idx][f"{text_field}_embedding"] = emb
        events[idx][f"{text_field}_embedding_dim"] = EMBEDDING_DIM
        events[idx][f"{text_field}_embedding_model"] = MODEL_NAME

    return events


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    events = [
        json.loads(line)
        for line in args.events.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not events:
        print("No events found.", file=sys.stderr)
        return 1

    model = load_model()
    enriched = enrich_events(events, text_field=args.text_field, model=model)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, enriched)
    embedded_count = sum(1 for e in enriched if e.get(f"{args.text_field}_embedding"))
    print(
        json.dumps(
            {
                "model": MODEL_NAME,
                "text_field": args.text_field,
                "embedding_dim": EMBEDDING_DIM,
                "events": len(enriched),
                "embedded": embedded_count,
                "output": args.output.as_posix(),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
