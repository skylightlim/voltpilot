#!/usr/bin/env bash
# Weekly used-market scrape + import for all sources.
# Sources 1-4 (carbase, carro, mudah, caricarz) scrape+import in one python script.
# Sources 5-7 (carsome, carlist, autoselection) are node playwright scrapers that
# write JSONL to data/used_market_raw/, then python import scripts upsert into DB.
set -uo pipefail

# Derive from this script's own location. Was hard-coded to one developer's
# home directory, which meant the weekly run only worked on that machine.
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS="$BASE/scripts/used_market"
NODE="$SCRIPTS/node_scrapers"
RAW="$BASE/data/used_market_raw"
LOG_DIR="$BASE/data/used_market_raw/logs"
mkdir -p "$RAW" "$LOG_DIR"

STAMP=$(date +%Y%m%d_%H%M%S)
LOG="$LOG_DIR/weekly_$STAMP.log"
touch "$LOG"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

fail=0

run() {
  local name="$1"; shift
  log "=== $name: $*"
  if "$@" >> "$LOG" 2>&1; then
    log "=== $name OK"
  else
    log "=== $name FAILED (exit $?)"
    fail=1
  fi
}

# --- regenerate catalog for node scrapers ---
run catalog python3 "$SCRIPTS/make_catalog_flat.py"

# --- python all-in-one scrapers ---
run carbase python3 "$SCRIPTS/scrape_carbase.py"
run carro python3 "$SCRIPTS/scrape_carro.py"
run mudah python3 "$SCRIPTS/scrape_mudah.py"
run caricarz python3 "$SCRIPTS/scrape_caricarz.py"

# --- node playwright scrapers ---
# node_scrapers/ is tracked, but its node_modules is not. On a fresh clone the
# directory exists and the scrapers still cannot run until `npm ci` has been run
# there. Skip with a clear message rather than three opaque failures.
if [ ! -d "$NODE/node_modules" ]; then
  log "=== SKIP node scrapers: run \`npm ci\` in $NODE first (carsome/carlist/autoselection)"
  NODE_MISSING=1
fi
[ -z "${NODE_MISSING:-}" ] && run carsome-scrape node "$NODE/scrape_carsome.js"
[ -z "${NODE_MISSING:-}" ] && run carsome-import python3 "$SCRIPTS/import_carsome.py"

[ -z "${NODE_MISSING:-}" ] && run carlist-scrape node "$NODE/scrape_carlist.js"
[ -z "${NODE_MISSING:-}" ] && run carlist-import python3 "$SCRIPTS/import_carlist.py"

[ -z "${NODE_MISSING:-}" ] && run autoselection-scrape node "$NODE/scrape_autoselection.js"
[ -z "${NODE_MISSING:-}" ] && run autoselection-import python3 "$SCRIPTS/import_autoselection.py"

# --- cleanup stale runs + summary ---
DB="$BASE/data/used_market.db"
python3 - "$DB" <<'EOF' >> "$LOG" 2>&1
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
n = c.execute("UPDATE source_runs SET status='error', error='interrupted', finished_at=started_at WHERE status='running'").rowcount
c.commit()
print("stale running rows marked error:", n)
for r in c.execute("SELECT source, COUNT(*), SUM(vehicle_id IS NOT NULL) FROM listings GROUP BY source ORDER BY source"):
    print(f"  {r[0]}: {r[1]} listings, {r[2]} matched")
EOF
echo "cleanup done" | tee -a "$LOG"

if [ "$fail" -eq 0 ]; then
  log "WEEKLY RUN COMPLETE - all sources OK - log: $LOG"
else
  log "WEEKLY RUN COMPLETE - one or more sources FAILED - log: $LOG"
fi
exit $fail
