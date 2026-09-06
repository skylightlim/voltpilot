#!/usr/bin/env python3
"""Build ev_station_density.json from ev-stations.csv.

Maps each Malaysian 5-digit postcode (parsed from station address/name) to a
0-100 charging-density score so the infrastructure engine can use real station
density instead of the static bootstrap table.

Score = base from 2-digit prefix station count (log scale) + bonus when the
user's exact 5-digit postcode has stations, capped at 100.
"""

import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CSV_PATH = BASE / "ev-stations.csv"
OUT_PATH = BASE / "ev_station_density.json"

POSTCODE_RE = re.compile(r"\b(\d{5})\b")
PREFIX_LOG_SCALE = 14.0   # 14*log2(1+n): ~4 stations -> 32, ~16 -> 58, ~64 -> 88
EXACT_POSTCODE_BONUS = 8.0
FALLBACK = 6.0            # unknown prefix baseline (keep bootstrap floor)


def main() -> None:
    with open(CSV_PATH, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    prefix_counts: Counter[str] = Counter()
    exact_counts: Counter[str] = Counter()
    for r in rows:
        text = f"{r.get('address') or ''} {r.get('name') or ''}"
        matches = POSTCODE_RE.findall(text)
        if not matches:
            continue
        postcode = matches[0]
        prefix_counts[postcode[:2]] += 1
        exact_counts[postcode] += 1

    prefix_scores = {
        prefix: round(min(100.0, PREFIX_LOG_SCALE * math.log2(1 + n)), 1)
        for prefix, n in prefix_counts.items()
    }

    density = {}
    for postcode, n in exact_counts.items():
        prefix_score = prefix_scores.get(postcode[:2], FALLBACK)
        density[postcode] = round(min(100.0, prefix_score + EXACT_POSTCODE_BONUS), 1)

    out = {
        "_meta": {
            "source": "ev-stations.csv (852 stations)",
            "built_at": "2026-08-14",
            "scale": f"{PREFIX_LOG_SCALE}*log2(1+n) per 2-digit prefix, +{EXACT_POSTCODE_BONUS} exact postcode bonus, cap 100",
            "prefix_count": len(prefix_counts),
            "postcode_count": len(density),
            "exact_postcode_hits": sum(exact_counts.values()),
            "top_prefixes": prefix_counts.most_common(10),
        },
        "prefix_scores": prefix_scores,
        "exact_postcode_scores": density,
    }
    OUT_PATH.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT_PATH}: {len(prefix_scores)} prefixes, {len(density)} postcodes")
    for p, n in prefix_counts.most_common(12):
        print(f"  {p}: {n} stations -> {prefix_scores[p]}")


if __name__ == "__main__":
    sys.exit(main())