#!/usr/bin/env python3
"""Build ev_station_density.json from ev-stations.csv.

Maps each Malaysian 5-digit postcode to a 0-100 charging-density score so the
infrastructure engine can use real station density.

Rules (rewritten 2026-11-14 after the 56100 audit):
  * Only public stations count: `is_public` (set by scraper/ev_stations.py) excludes
    residents-only condos, private/showroom bays and offline stations.
  * A postcode's score is spatial, not a prefix share: the number of public stations
    within LOCAL_RADIUS_KM of the postcode's centre (median of the stations tagged with
    it), on a log scale. Both hub and PLANMalaysia (MEVnet) stations count, so a
    postcode is no longer scored only from the rows whose address text carries it.
  * The 2-digit prefix score (public stations per prefix, same log scale) is the
    fallback for postcodes with no station of their own.
  * Postcodes come from the CSV `postcode` column (lot numbers already skipped).

Run after scraper/ev_stations.py; scripts/daily_update.py does both.
"""

import csv
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from statistics import median

BASE = Path(__file__).resolve().parent.parent.parent / "data"
CSV_PATH = BASE / "ev-stations.csv"
OUT_PATH = BASE / "ev_station_density.json"

LOG_SCALE = 14.0          # 14*log2(1+n): ~4 stations -> 32, ~16 -> 58, ~64 -> 88
LOCAL_RADIUS_KM = 3.0     # a short drive / long walk from the postcode centre
PREFIX_INFER_KM = 3.0     # MEVnet rows borrow the postcode of the nearest tagged station
CELL = 0.05               # grid cell in degrees (~5.5 km) for the radius search
MY_BBOX = (0.8, 7.5, 99.4, 119.5)


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p = math.pi / 180
    h = (
        math.sin((b[0] - a[0]) * p / 2) ** 2
        + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(h))


def _score(n: int) -> float:
    return round(min(100.0, LOG_SCALE * math.log2(1 + n)), 1)


class Grid:
    def __init__(self, points: list[tuple[float, float]]):
        self.cells: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
        for p in points:
            self.cells[self._key(p)].append(p)

    @staticmethod
    def _key(p: tuple[float, float]) -> tuple[int, int]:
        return (math.floor(p[0] / CELL), math.floor(p[1] / CELL))

    def within(self, p: tuple[float, float], km: float) -> list[tuple[float, float]]:
        k0, k1 = self._key(p)
        return [
            q
            for dx in (-1, 0, 1)
            for dy in (-1, 0, 1)
            for q in self.cells.get((k0 + dx, k1 + dy), ())
            if _km(p, q) <= km
        ]


def main() -> int:
    with open(CSV_PATH, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    stations = []
    skipped_coords = 0
    for r in rows:
        try:
            ll = (float(r["lat"]), float(r["lng"]))
        except (TypeError, ValueError):
            skipped_coords += 1
            continue
        if not (MY_BBOX[0] <= ll[0] <= MY_BBOX[1] and MY_BBOX[2] <= ll[1] <= MY_BBOX[3]):
            skipped_coords += 1
            continue
        stations.append(
            {"ll": ll, "pc": (r.get("postcode") or "").strip() or None,
             "public": r.get("is_public") == "True"}
        )
    if not stations:
        raise ValueError(f"no usable rows in {CSV_PATH}")

    public_grid = Grid([s["ll"] for s in stations if s["public"]])
    tagged = [s for s in stations if s["pc"]]
    tagged_grid: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for s in tagged:
        tagged_grid[Grid._key(s["ll"])].append(s)

    # Prefix counts: public stations, MEVnet ones inheriting the nearest tagged postcode.
    prefix_counts: Counter[str] = Counter()
    for s in stations:
        if not s["public"]:
            continue
        pc = s["pc"]
        if pc is None:
            k0, k1 = Grid._key(s["ll"])
            near = [
                (d, t["pc"])
                for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for t in tagged_grid.get((k0 + dx, k1 + dy), ())
                if (d := _km(s["ll"], t["ll"])) <= PREFIX_INFER_KM
            ]
            pc = min(near)[1] if near else None
        if pc:
            prefix_counts[pc[:2]] += 1
    prefix_scores = {p: _score(n) for p, n in prefix_counts.items()}

    # Exact postcodes: centre = median of every station tagged with it (any visibility).
    by_pc: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for s in tagged:
        by_pc[s["pc"]].append(s["ll"])
    exact: dict[str, float] = {}
    no_public_nearby = []
    for pc, lls in sorted(by_pc.items()):
        centre = (median(x[0] for x in lls), median(x[1] for x in lls))
        n = len(public_grid.within(centre, LOCAL_RADIUS_KM))
        if n:
            exact[pc] = _score(n)
        else:
            no_public_nearby.append(pc)  # falls back to its prefix score at lookup

    out = {
        "_meta": {
            "source": f"ev-stations.csv ({len(rows)} rows, {sum(s['public'] for s in stations)} public)",
            "built_at": date.today().isoformat(),
            "scale": f"{LOG_SCALE}*log2(1+n); exact = public stations within {LOCAL_RADIUS_KM:g} km "
                     "of the postcode centre; prefix = public stations per 2-digit prefix; cap 100",
            "prefix_count": len(prefix_scores),
            "postcode_count": len(exact),
            "excluded": {
                "not_public": sum(1 for s in stations if not s["public"]),
                "bad_coordinates": skipped_coords,
                "postcodes_without_public_station_within_radius": len(no_public_nearby),
            },
            "top_prefixes": prefix_counts.most_common(10),
        },
        "prefix_scores": prefix_scores,
        "exact_postcode_scores": exact,
    }
    OUT_PATH.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT_PATH}: {len(prefix_scores)} prefixes, {len(exact)} postcodes "
          f"({len(no_public_nearby)} fall back to prefix)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
