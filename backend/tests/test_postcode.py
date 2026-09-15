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

from app.engines import engines
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


class TestGridRegionFromPostcode:
    """The interview no longer asks which grid the buyer is on.

    It was a question about something already known: `home_postcode` is
    required and maps to exactly one state. Asking cost a step and invited a
    contradiction between two answers that cannot disagree in reality.
    """

    @pytest.mark.parametrize("postcode,expected", [
        ("88000", "east_malaysia"),   # Kota Kinabalu, Sabah
        ("91000", "east_malaysia"),   # Tawau, Sabah
        ("93000", "east_malaysia"),   # Kuching, Sarawak
        ("98000", "east_malaysia"),   # Miri, Sarawak
        ("87000", "east_malaysia"),   # Labuan, supplied from the Sabah grid
        ("50400", "peninsular"),      # Kuala Lumpur
        ("10000", "peninsular"),      # Penang
        ("79000", "peninsular"),      # Johor
        ("01000", "peninsular"),      # Perlis
    ])
    def test_the_grid_is_derived_from_the_postcode(self, postcode, expected):
        assert engines.grid_region_for_postcode(postcode) == expected

    @pytest.mark.parametrize("postcode", ["", "abcde", "99999", "00000"])
    def test_an_unusable_postcode_derives_nothing(self, postcode):
        """None, not a guess — so the stated value can take over."""
        assert engines.grid_region_for_postcode(postcode) is None

    def test_the_postcode_wins_over_a_contradictory_stated_region(self):
        """Two answers cannot disagree in reality, so trust the harder evidence."""
        profile = {"home_postcode": "50400", "grid_region": "east_malaysia"}
        assert engines.grid_region(profile) == "peninsular"

    def test_a_stated_region_still_applies_without_a_usable_postcode(self):
        """The voice path can extract "Sabah" from speech before a postcode."""
        profile = {"home_postcode": "", "grid_region": "east_malaysia"}
        assert engines.grid_region(profile) == "east_malaysia"

    def test_it_falls_back_to_peninsular_when_nothing_is_known(self):
        assert engines.grid_region({}) == "peninsular"

    def test_an_east_malaysian_postcode_lowers_the_emissions_figure(self):
        """The derivation has to reach the output, not just the feature dict.

        East Malaysia is pulled down by hydro-dominant Sarawak, so the same kWh
        carries roughly half the CO2.
        """
        from app.services import scoring

        base = {
            "language": "en", "daily_km": 40, "trips_per_week": 5,
            "long_trip_frequency": "monthly", "long_trip_km": 300,
            "destination_region": "north", "can_charge_home": True,
            "consider_solar": False, "budget_max_rm": 250_000,
            "monthly_electricity_bill_rm": 0,
        }
        sliders = {"save_money": 50, "environment": 50, "convenience": 50, "future_proofing": 50}

        def first_ev_co2(postcode):
            out = scoring.score_catalog({**base, "home_postcode": postcode}, sliders)
            return next(r for r in out["ranking"] if r["type"] == "ev")["co2_kg_yr"]

        assert first_ev_co2("88000") < first_ev_co2("50400") * 0.75


class TestInterviewScriptCopies:
    """The interview script exists in more than one place. They must not drift.

    `INTERVIEW_QUESTIONS` is the source of truth: the intake flow and the voice
    advisor both fetch it from /config/interview. `FALLBACK_SCRIPT` in the
    frontend covers a failed fetch only, but a fallback asking different
    questions is worse than none — it collects fields the engine never reads and
    skips ones it does. issue.md issue 23.
    """

    SCRIPT_TS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "interview-script.ts"

    def _fallback_keys(self) -> list[str]:
        src = self.SCRIPT_TS.read_text(encoding="utf-8")
        block = src[src.index("FALLBACK_SCRIPT"): src.index("];", src.index("FALLBACK_SCRIPT"))]
        return re.findall(r'key:\s*"([a-z_]+)"', block)

    def test_the_frontend_fallback_asks_the_same_questions_in_the_same_order(self):
        from app.schemas import INTERVIEW_QUESTIONS

        assert self._fallback_keys() == [q["key"] for q in INTERVIEW_QUESTIONS]

    def test_the_voice_advisor_does_not_keep_its_own_copy(self):
        """It held a third copy in both languages and went stale the day a
        question was removed, asking for the grid region for a full day after
        the postcode began deriving it."""
        voice = (self.SCRIPT_TS.parent.parent / "app" / "interview" / "voice" / "page.tsx").read_text(encoding="utf-8")
        numbered = re.findall(r'"\d+\.\s+[A-Z]', voice)
        assert not numbered, f"voice page hardcodes {len(numbered)} numbered questions again"
        assert "buildInterviewPrompt" in voice, "the prompt must be derived from the script"
