"""The two postcode maps in this repo must not drift apart.

The frontend owns a 2,925-entry exact postcode table (frontend/lib/postcode-lookup.ts)
and now shows the town back to the user as they type. The backend resolves state
from numeric ranges to pick a charging-infrastructure centroid. If those two
disagree, the form tells a user "Bandar Baharu, Kedah" while the engine scores
them against Perak's network — a mismatch nobody would notice by hand.

Three cross-border postcodes were found that way and are covered by
_POSTCODE_OVERRIDES; this test keeps it that way.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.engines.engines import state_for_postcode

LOOKUP_TS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "postcode-lookup.ts"

# The frontend table spells a few states differently; neither spelling is wrong.
ALIASES = {"Pulau Pinang": "Penang", "Wp Kuala Lumpur": "Kuala Lumpur",
           "Wp Putrajaya": "Putrajaya", "Wp Labuan": "Labuan"}

# 55555 is placeholder data in the frontend table, not a real Subang Jaya code.
IGNORED = {"55555"}


def _frontend_map() -> dict[str, str]:
    if not LOOKUP_TS.exists():
        pytest.skip(f"frontend lookup not present at {LOOKUP_TS}")
    src = LOOKUP_TS.read_text(encoding="utf-8")
    out = {}
    for pc, entry in re.findall(r'"(\d{5})":"([^"]*)"', src):
        state = entry.split(", ")[-1]
        out[pc] = ALIASES.get(state, state)
    return out


def test_frontend_and_backend_agree_on_state():
    fe = _frontend_map()
    assert len(fe) > 2000, f"frontend table looks truncated: {len(fe)} entries"

    mismatches = []
    for pc, fe_state in fe.items():
        if pc in IGNORED:
            continue
        resolved = state_for_postcode(pc)
        if resolved is None:
            continue  # outside every range; home_coordinates falls back to KL
        if resolved[0] != fe_state:
            mismatches.append(f"{pc}: frontend={fe_state} backend={resolved[0]}")

    assert not mismatches, "postcode maps disagree:\n  " + "\n  ".join(mismatches[:20])


@pytest.mark.parametrize(
    "postcode,state",
    [("31400", "Perak"), ("50400", "Kuala Lumpur"), ("88000", "Sabah"),
     ("93350", "Sarawak"), ("10450", "Penang"), ("79100", "Johor"),
     ("34950", "Kedah"), ("14290", "Kedah"), ("14390", "Kedah")],
)
def test_known_postcodes(postcode, state):
    resolved = state_for_postcode(postcode)
    assert resolved is not None, f"{postcode} resolved to nothing"
    assert resolved[0] == state
