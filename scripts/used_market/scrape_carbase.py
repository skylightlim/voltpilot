"""Carbase.my (ISM) used car valuation scraper.

Chain of POST endpoints (AJAX, no auth), each returning HTML <option> lists
except the final one which returns JSON:
  /ism/ajax-get-model              {make}              -> families
  /ism/ajax-get-year               {make, family}      -> years (desc)
  /ism/ajax-get-engine-capacity    {make, family, year} -> cc list ("0" = EV)
  /ism/ajax-get-transmission       {make, family, year, cc} -> transmissions
  /ism/ajax-get-generation         {make, family, year, cc, transmission} -> variant ids
  /ism/ajax-get-valuation-result   {+ variant}          -> JSON valuation

JSON result carries: id, nvic, year, make, family, variant, series, style,
cc, transmission, wm_new_pr, wm_rrr, em_new_pr, em_rrr, sum_insured,
valuation_date.  wm=wholesale market, em=external market, pr=price, rrr=...,
values are strings in RM.
"""
from pathlib import Path
import json
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
from http_client import get_text, post_json, session  # noqa: E402
from http_client import get_text, post_json  # noqa: E402
import db  # noqa: E402

BASE = "https://www.carbase.my"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE,
    "Referer": BASE + "/tool/car-market-value-guide",
}


def post(path, data):
    body = urllib.parse.urlencode(data).encode()
    r = session().post(BASE + path, data=body, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def parse_options(html):
    return [(v, t) for v, t in re.findall(r'<option value="([^"]*)"[^>]*>([^<]*)</option>', html) if v]


def get_families(make):
    return parse_options(post("/ism/ajax-get-model", {"make": make}))


def get_years(make, family):
    return parse_options(post("/ism/ajax-get-year", {"make": make, "family": family}))


def get_ccs(make, family, year):
    return parse_options(post("/ism/ajax-get-engine-capacity", {"make": make, "family": family, "year": year}))


def get_transmissions(make, family, year, cc):
    return parse_options(post("/ism/ajax-get-transmission", {"make": make, "family": family, "year": year, "cc": cc}))


def get_variants(make, family, year, cc, trans):
    return parse_options(post("/ism/ajax-get-generation", {"make": make, "family": family, "year": year, "cc": cc, "transmission": trans}))


def get_valuation(make, family, year, cc, trans, variant_id):
    raw = post("/ism/ajax-get-valuation-result", {
        "make": make, "family": family, "year": year,
        "cc": cc, "transmission": trans, "variant": variant_id,
    })
    return json.loads(raw)


def scrape_make(make, max_years=3):
    """Walk one make's full option tree (bounded years) and upsert valuations."""
    total = new = 0
    try:
        families = get_families(make)
    except Exception as e:
        print(f"[{make}] families failed: {e}")
        return 0, 0
    print(f"[{make}] {len(families)} families")
    for fam_id, fam_label in families:
        try:
            years = get_years(make, fam_id)
        except Exception as e:
            print(f"  {fam_label}: years failed {e}")
            continue
        years = years[:max_years]
        for year_id, year_label in years:
            try:
                ccs = get_ccs(make, fam_id, year_id)
            except Exception:
                continue
            for cc_id, cc_label in ccs:
                try:
                    trans = get_transmissions(make, fam_id, year_id, cc_id)
                except Exception:
                    continue
                for tr_id, tr_label in trans:
                    try:
                        variants = get_variants(make, fam_id, year_id, cc_id, tr_id)
                    except Exception:
                        continue
                    for var_id, var_label in variants:
                        try:
                            res = get_valuation(make, fam_id, year_id, cc_id, tr_id, var_id)
                        except Exception as e:
                            print(f"  {fam_label} {year_label} {var_label}: valuation failed {e}")
                            time.sleep(1)
                            continue
                        rid = f"{make}|{fam_id}|{year_id}|{var_id}"
                        if db.upsert_valuation({
                            "source": "carbase", "source_id": rid,
                            "variant_label": res.get("variant") or var_label,
                            "year": res.get("year") or year_id,
                            "cc": str(res.get("cc") or cc_id),
                            "transmission": res.get("transmission") or tr_id,
                            "wm_new_pr": res.get("wm_new_pr"),
                            "wm_rrr": res.get("wm_rrr"),
                            "em_new_pr": res.get("em_new_pr"),
                            "em_rrr": res.get("em_rrr"),
                            "sum_insured": res.get("sum_insured"),
                            "valuation_date": res.get("valuation_date"),
                            "raw": res, "run_id": db._ACTIVE_RUN,
                        }):
                            new += 1
                        total += 1
                        time.sleep(0.25)
    return total, new


def main():
    db.init_db()
    db._ACTIVE_RUN = db.start_run("carbase")
    try:
        page = get_text(BASE + "/tool/car-market-value-guide", headers={"User-Agent": HEADERS["User-Agent"]}, timeout=30)
        i = page.find('name="car_market_value_guide_form"')
        seg = page[i:i + 30000]
        makes = parse_options(seg)
    except Exception as e:
        print("failed to load make list:", e)
        makes = []
    total = new = 0
    if not makes:
        makes = [("PROTON", "PROTON"), ("BYD", "BYD"), ("TESLA", "TESLA")]
    for make_id, make_label in makes:
        t, n = scrape_make(make_id)
        total += t
        new += n
        print(f"carbase {make_label}: total={t} new={n}")
    db.finish_run(db._ACTIVE_RUN, total, new)
    print(f"carbase DONE total={total} new={new}")


if __name__ == "__main__":
    main()