"""Match marketplace listing titles/variants to catalog vehicle ids.

The catalog (data/catalog_vehicles.json) is a dict keyed by vehicle id
(e.g. "proton-emas-5") with brand/model and optionally variant.
Marketplace titles look like "2025 Proton e.MAS 7 Premium" or
"2015 Honda HR-V 1.8 V ENHANCED (A) Cashback".

Matching is brand+model token based (normalized), variant is a bonus
confirmation when the catalog declares one.
"""
import json
import os
import re

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "catalog_vehicles.json")

_BRAND_ALIASES = {
    "gwm": ["great wall", "greatwall", "haval", "ora", "tank", "wey"],
    "mercedes-benz": ["mercedes", "benz", "mercedesbenz"],
    "rolls-royce": ["rolls royce", "rollsroyce"],
    "proton": ["proton", "p1"],
    "perodua": ["perodua", "p2"],
    "bmw": ["bmw", "mini"],
    "mini": ["mini"],
    "mg": ["mg", "morris garages"],
    "lexus": ["lexus"],
    "toyota": ["toyota"],
    "honda": ["honda"],
    "nissan": ["nissan", "datsun"],
    "hyundai": ["hyundai"],
    "kia": ["kia"],
    "volvo": ["volvo", "polestar"],
    "byd": ["byd", "build your dreams"],
    "tesla": ["tesla"],
    "xpeng": ["xpeng"],
    "aion": ["aion"],
    "chery": ["chery", "omoda", "jaecoo"],
    "smart": ["smart"],
    "audi": ["audi"],
    "porsche": ["porsche"],
    "mazda": ["mazda"],
    "suzuki": ["suzuki"],
    "jac": ["jac", "t9"],
    "maxus": ["maxus", "ldv"],
    "volkswagen": ["volkswagen", "vw", "volks wagon"],
    "great-wall": ["gwm"],
    "leapmotor": ["leapmotor"],
    "neta": ["neta"],
    "dongfeng": ["dongfeng"],
    "zeekr": ["zeekr"],
    "denza": ["denza"],
    "lotus": ["lotus"],
    "renault": ["renault"],
    "foton": ["foton"],
    "gac": ["gac"],
    "jaecoo": ["jaecoo"],
    "omoda": ["omoda"],
    "seres": ["seres"],
    "wuling": ["wuling"],
    "icaur": ["icaur", "imcaur"],
    "honda-e:n1": ["e:n1"],
}


def load_catalog():
    with open(CATALOG_PATH) as f:
        data = json.load(f)
    if isinstance(data, dict) and "vehicles" in data:
        return list(data["vehicles"])
    if isinstance(data, dict):
        return list(data.values())
    return data


def normalize(s):
    s = (s or "").lower()
    s = s.replace("e.mas", "emas").replace("e mas", "emas")
    s = s.replace("e:hev", "ehev").replace("e-hev", "ehev")
    s = s.replace("e:n1", "en1")
    s = s.replace("#", " ")
    # "ev" as a standalone word is a synonym for "electric"
    s = re.sub(r"\bev\b", "electric", s)
    # keep decimal displacements as one token: "1.5" -> "15", "2.0" -> "20"
    s = re.sub(r"(?<=\d)\.(?=\d)", "", s)
    s = s.replace(".", " ").replace("/", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s):
    return normalize(s).split()


_YEAR_RE = re.compile(r"^(20\d{2})")


def extract_year(title):
    t = (title or "").strip()
    m = _YEAR_RE.match(t)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(20\d{2})\b", t)
    return int(m.group(1)) if m else None


def brand_tokens(brand):
    return set(normalize(brand).split()) - {"limited"}


def brand_aliases(brand):
    """All normalized strings that identify a brand, incl. alias lists."""
    nb = normalize(brand)
    out = {nb}
    if nb in _BRAND_ALIASES:
        out |= {normalize(a) for a in _BRAND_ALIASES[nb]}
    for key, aliases in _BRAND_ALIASES.items():
        if nb in {normalize(a) for a in aliases}:
            out |= {normalize(key)}
    return out


def _compact(s):
    return re.sub(r"\s+", "", s)


def match_brand(brand, catalog):
    """Return candidate vehicle list for a brand name (already normalized-ish)."""
    nb = normalize(brand)
    out = []
    for v in catalog:
        b = normalize(v["brand"])
        if nb in b or b in nb or nb == b:
            out.append(v)
    return out


def match_title(title, catalog=None, brand=None, model=None):
    """Match a listing title (plus optional brand/model context) to a vehicle.

    Returns dict {vehicle_id, brand, model, variant, year, variant_confirmed}
    or None when no confident match.
    """
    catalog = catalog or load_catalog()
    title = title or ""
    year = extract_year(title)
    tt = tokens(title)

    cands = []
    if brand:
        cands = match_brand(brand, catalog)
    if not cands:
        # any vehicle whose brand (or its aliases) appears in the title
        title_compact = _compact(normalize(title))
        for v in catalog:
            for a in brand_aliases(v["brand"]):
                ac = _compact(a)
                if ac and (ac in title_compact or ac in normalize(title)):
                    cands.append(v)
                    break

    if model:
        mt = set(normalize(model).split())
        cands = [v for v in cands if mt and mt <= set(normalize(v["model"]).split()) | set(normalize(model).split())]
    # filter by model tokens present in title; catalog models are all
    # current-generation products, so listings older than ~2021 can't match
    scored = []
    for v in cands:
        vt = set(normalize(v["model"]).split())
        tt_set = set(tt)
        # require FULL model-token coverage in the title (partial overlap
        # produces false positives like "Omoda C9" -> Omoda E5)
        if not vt or not vt <= tt_set:
            continue
        if year is not None and year < 2021:
            continue
        variant_confirmed = False
        if v.get("variant"):
            var_t = set(normalize(v["variant"]).split())
            if var_t and var_t <= tt_set:
                variant_confirmed = True
        # reject if the title carries a standalone 1-9 digit that is not part
        # of this model (e.g. "Seal 5" must not match model "Seal")
        extra_digit = any(
            re.fullmatch(r"[1-9]", t) and t not in vt for t in tt
        )
        if extra_digit and not variant_confirmed:
            continue
        scored.append((len(vt), 1 if variant_confirmed else 0, v))

    if not scored:
        return None
    # sort: most specific (longest model-token set) first, variant
    # confirmation as tie-break
    scored.sort(key=lambda x: (-x[0], -x[1]))
    n_tokens, vconf, v = scored[0]
    if n_tokens <= 0:
        return None
    return {
        "vehicle_id": v["id"],
        "brand": v["brand"],
        "model": v["model"],
        "variant": v.get("variant"),
        "year": year,
        "variant_confirmed": bool(vconf),
        "score": n_tokens,
    }


_ICE_MARKERS = {
    "turbo", "tfsi", "tsi", "gdi", "dci", "tdi", "tdci", "cdi", "ecoboost",
    "diesel", "d4d", "hdi", "bluehdi", "twinpower", "mhev",
}


def _has_ice_marker(text):
    return bool(_ICE_MARKERS & set(normalize(text).split()))


def match_brand_model(brand, model, variant=None, catalog=None):
    """Match marketplace brand+model fields (e.g. carro children, carsome modelName).

    Requires FULL containment of the marketplace model tokens inside the
    catalog model tokens (partial overlap produces false positives like
    BR-V -> HR-V). ICE powertrain markers reject a match because the catalog
    is entirely EV/hybrid/PHEV.
    """
    catalog = catalog or load_catalog()
    cands = match_brand(brand, catalog) if brand else list(catalog)
    mt = set(normalize(model).split()) if model else set()
    if mt:
        cands = [v for v in cands if mt and mt <= set(normalize(v["model"]).split())]
    out = []
    for v in cands:
        vt2 = set(normalize(v["model"]).split()) | (set(normalize(v.get("variant") or "").split()))
        famvar = normalize(f"{model or ''} {variant or ''}")
        if _has_ice_marker(famvar):
            continue
        out.append((len(vt2), v))
    if not out:
        return None
    # prefer candidates whose catalog model tokens exactly equal the
    # marketplace model tokens (e.g. "KONA EV" -> base Kona Electric)
    exact = [v for n, v in out if set(normalize(v["model"]).split()) == mt]
    if exact:
        return exact[0]
    out.sort(key=lambda x: x[0])
    return out[0][1]
