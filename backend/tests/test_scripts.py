"""Guardrails for the data pipeline.

Every failure encoded here is one that actually happened and shipped unnoticed,
so each test names the defect it exists to catch rather than describing an
abstract property.
"""

from __future__ import annotations

import contextlib
import importlib.util
import json
import io
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT_DIRS = (REPO / "scripts", REPO / "scraper")


def _scripts() -> list[Path]:
    out: list[Path] = []
    for d in SCRIPT_DIRS:
        out += [p for p in sorted(d.rglob("*.py")) if p.name != "__init__.py"]
    return out


def _import(path: Path):
    """Import a script by path with its stdout swallowed."""
    spec = importlib.util.spec_from_file_location(f"_t_{path.stem}", path)
    assert spec and spec.loader, f"cannot build a spec for {path}"
    mod = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(io.StringIO()):
        spec.loader.exec_module(mod)
    return mod


def test_there_are_scripts_to_check():
    """Guard the guard: a bad glob would make every test below vacuously pass."""
    assert len(_scripts()) >= 15


@pytest.mark.parametrize("path", _scripts(), ids=lambda p: p.name)
def test_script_imports(path: Path):
    """Every script must import on a machine that is not the author's.

    13 of 21 scripts once failed here: eight did
    sys.path.insert(0, "/home/skylight/...") — a username that exists on no
    current machine — and two read a JSON export from a Downloads folder at
    module level, which also took down the script that imported from them.
    """
    _import(path)


def test_no_absolute_home_paths():
    """Paths must derive from __file__, not from one developer's home directory."""
    offenders = []
    for p in _scripts():
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if "/home/" in line and "Path(__file__)" not in line and not line.lstrip().startswith("#"):
                offenders.append(f"{p.relative_to(REPO)}:{n}")
    assert not offenders, "hard-coded home paths: " + ", ".join(offenders)


def test_scraper_imports_are_declared():
    """A third-party import used by the scripts must be in requirements.txt.

    `requests` was imported by http_client.py and ev_stations.py while absent
    from requirements.txt; it only worked locally because the venv had it
    transitively, and the daily refresh would have failed inside the container.
    """
    reqs = (REPO / "backend" / "requirements.txt").read_text(encoding="utf-8").lower()
    third_party = {"requests", "httpx", "pandas", "numpy"}
    used = set()
    for p in _scripts():
        text = p.read_text(encoding="utf-8")
        for name in third_party:
            if f"import {name}" in text:
                used.add(name)
    missing = sorted(n for n in used if n not in reqs)
    assert not missing, f"imported by scripts but not declared: {missing}"


def test_catalog_passes_validation():
    """The catalog must carry no error-level defect.

    validate_data separates errors (the engine returns a wrong answer) from
    warnings (it falls back to a documented default). Warnings are allowed
    through; errors are not.
    """
    mod = _import(REPO / "scripts" / "validate_data.py")
    errors = [f for f in mod.validate() if f["level"] == "error"]
    assert not errors, "data errors:\n" + "\n".join(
        f"  {e['check']}: {e['detail']} {e['ids']}" for e in errors
    )


def test_insurance_scripts_do_not_clobber_each_other():
    """The two insurance computers must only touch their own powertrains.

    Both used to pop insurance_rm_yr for every out-of-scope vehicle, so running
    one after the other wiped the other's work and the catalog could never hold
    premiums for more than one powertrain at a time.
    """
    for name in ("compute_insurance.py", "compute_insurance_ev.py"):
        src = (REPO / "scripts" / "used_market" / name).read_text(encoding="utf-8")
        apply_block = src[src.index("by_id = {r[0]"):]
        assert "continue" in apply_block.split("ownership.pop")[0], (
            f"{name} reaches ownership.pop without first skipping rows it does not own"
        )


def test_every_critical_figure_is_attributed():
    """Price, road tax and insurance must each say how they are known.

    Road tax validates against the JPJ schedule exactly; maintenance is 22
    hand-entered numbers. Without provenance those look identical in the JSON,
    which undercuts the one claim the product makes about itself.
    """
    catalog = json.loads((REPO / "data" / "catalog_vehicles.json").read_text())
    allowed = {"measured", "computed", "estimated"}
    missing, bad_method = [], []
    for v in catalog["vehicles"]:
        prov = v.get("provenance") or {}
        for field in ("price_rm", "road_tax_rm", "insurance_rm_yr"):
            present = v.get(field) is not None or v.get("ownership", {}).get(field) is not None
            if present and field not in prov:
                missing.append(f"{v['id']}.{field}")
        for field, entry in prov.items():
            if entry.get("method") not in allowed:
                bad_method.append(f"{v['id']}.{field}={entry.get('method')}")
    assert not missing, f"unattributed: {missing[:8]}"
    assert not bad_method, f"unknown method: {bad_method[:8]}"
