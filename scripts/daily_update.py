#!/usr/bin/env python3
"""Daily data refresh.

Runs the update scripts that are safe to execute unattended and reports what
each one did. Designed to be triggered once a day — locally by cron, or in the
deployed container by the Cloudflare Worker's scheduled handler hitting
POST /admin/refresh.

Deliberately excluded: the used-car marketplace scrapers
(scrape_carbase / scrape_caricarz / scrape_carro / scrape_mudah). Those hit
commercial sites at volume, which is a terms-of-service question rather than a
technical one, and they are slow enough to outlast a request timeout. Run those
by hand when you want fresh used-market data.

Failure policy: each source is independent, so one dead upstream must not throw
away the others. A single failure is reported and the run continues; the exit
code is non-zero only when EVERY source failed, which is the signal that
something systemic is wrong rather than one site being down.

Usage:
    python3 scripts/daily_update.py
    python3 scripts/daily_update.py --only fuel
"""

from __future__ import annotations

import argparse
import io
import json
import contextlib
import importlib.util
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# name -> (module path, callable returning an int exit code)
SOURCES: list[tuple[str, Path]] = [
    ("fuel", ROOT / "scripts" / "update_fuel_prices.py"),
    ("registrations", ROOT / "scripts" / "update_vehicle_registrations.py"),
    ("ev_stations", ROOT / "scraper" / "ev_stations.py"),
]


def _run_module(path: Path) -> tuple[int, str]:
    """Import the script and call its main(), capturing stdout."""
    spec = importlib.util.spec_from_file_location(f"_daily_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        spec.loader.exec_module(mod)
        main = getattr(mod, "main", None)
        if main is None:
            raise AttributeError(f"{path.name} has no main()")
        code = int(main() or 0)
    return code, buf.getvalue()


def run(only: str | None = None) -> dict:
    started = datetime.now(timezone.utc)
    results: list[dict] = []

    for name, path in SOURCES:
        if only and name != only:
            continue
        t0 = time.perf_counter()
        entry: dict = {"source": name, "script": str(path.relative_to(ROOT))}
        try:
            code, out = _run_module(path)
            entry["ok"] = code == 0
            entry["exit_code"] = code
            entry["output"] = out.strip().splitlines()[-3:]
        except Exception as exc:
            entry["ok"] = False
            entry["error"] = f"{type(exc).__name__}: {exc}"
            entry["traceback"] = traceback.format_exc().strip().splitlines()[-3:]
        entry["seconds"] = round(time.perf_counter() - t0, 2)
        results.append(entry)

    # Validate whatever the refresh left behind. Sources can succeed and still
    # write something the engine cannot use, so this runs regardless.
    validation: dict = {}
    try:
        spec = importlib.util.spec_from_file_location(
            "validate_data", ROOT / "scripts" / "validate_data.py")
        vmod = importlib.util.module_from_spec(spec)          # type: ignore[arg-type]
        spec.loader.exec_module(vmod)                          # type: ignore[union-attr]
        findings = vmod.validate()
        validation = {
            "errors": [f for f in findings if f["level"] == "error"],
            "warnings": len([f for f in findings if f["level"] == "warn"]),
        }
    except Exception as exc:
        validation = {"errors": [{"check": "validator", "detail": str(exc)}], "warnings": 0}

    ok = [r for r in results if r["ok"]]
    return {
        "validation": validation,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "succeeded": [r["source"] for r in ok],
        "failed": [r["source"] for r in results if not r["ok"]],
        "results": results,
        # Red when nothing refreshed, or when the data left behind is unusable.
        # One dead upstream among several is still green.
        "status": "ok" if (ok and not validation.get("errors")) else "failed",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", choices=[n for n, _ in SOURCES], help="run a single source")
    ap.add_argument("--json", action="store_true", help="emit the report as JSON only")
    args = ap.parse_args()

    report = run(args.only)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for r in report["results"]:
            mark = "ok  " if r["ok"] else "FAIL"
            print(f"[{mark}] {r['source']:<14} {r['seconds']:>6.2f}s")
            for line in r.get("output", []) or []:
                print(f"         {line}")
            if not r["ok"]:
                print(f"         {r.get('error', '')}")
        v = report.get("validation", {})
        print(
            f"\n{len(report['succeeded'])}/{len(report['results'])} sources refreshed"
            f"{'  failed: ' + ', '.join(report['failed']) if report['failed'] else ''}"
        )
        print(f"validation: {len(v.get('errors', []))} error(s), {v.get('warnings', 0)} warning(s)")
        for e in v.get("errors", []):
            print(f"  ERROR {e.get('check')}: {e.get('detail')}")

    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
