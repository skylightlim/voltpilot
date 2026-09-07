#!/usr/bin/env bash
#
# Deploy the VoltPilot backend to Google Cloud Run.
#
# Builds from source with Cloud Build, so no local Docker daemon is required.
# Config is read from backend/.env at deploy time and passed through a
# mode-600 temp file that is deleted on exit — nothing is echoed or committed.
#
#   ./scripts/deploy_cloudrun.sh
#
# Prerequisites: see DEPLOY_CLOUDRUN.md
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GCLOUD="${GCLOUD:-$HOME/google-cloud-sdk/bin/gcloud}"
SERVICE="${SERVICE:-voltpilot-api}"
# Singapore is the closest region to Malaysian users. Put the database here too:
# this app is latency-bound on database round trips, not on compute.
REGION="${REGION:-asia-southeast1}"
ENV_FILE="${ENV_FILE:-backend/.env}"

[ -x "$GCLOUD" ] || { echo "gcloud not found at $GCLOUD"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }

PROJECT="$("$GCLOUD" config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "No project set.  Run:  $GCLOUD config set project <PROJECT_ID>"
  exit 1
fi

ENV_YAML="$(mktemp)"
chmod 600 "$ENV_YAML"
trap 'rm -f "$ENV_YAML"' EXIT

# A YAML file rather than --set-env-vars: DATABASE_URL contains both "@" and
# ":" and an SMTP password can contain anything, so every delimiter gcloud
# accepts on the command line is one a value might legitimately hold. JSON is
# valid YAML, and json.dump escapes correctly whatever the value is.
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-}" python3 - "$ENV_FILE" "$ENV_YAML" <<'PY'
import json, os, sys

src, dst = sys.argv[1], sys.argv[2]
cfg = {}
for line in open(src, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    k, v = k.strip(), v.strip().strip('"').strip("'")
    if k.isupper() and v:
        cfg[k] = v

missing = [k for k in ("DATABASE_URL", "GEMINI_API_KEYS") if not cfg.get(k)]
if missing:
    sys.exit(f"ERROR: missing from {src}: {', '.join(missing)}")

cfg["ENV"] = "production"
cfg["DATA_DIR"] = "/app/data"
# Migrations run once as a separate step, not on every cold start: with
# min-instances=0 the container cold-starts constantly, and `alembic upgrade
# head` on each one is slow and races itself.
cfg["RUN_MIGRATIONS"] = "0"
cfg["FRONTEND_ORIGIN"] = (
    os.environ.get("FRONTEND_ORIGIN")
    or cfg.get("FRONTEND_ORIGIN")
    or "https://voltpilot-five.vercel.app"
)
# Cloud Run sets PORT itself; passing it is rejected as a reserved variable.
cfg.pop("PORT", None)

json.dump(cfg, open(dst, "w", encoding="utf-8"), indent=2)
print("env keys:", " ".join(sorted(cfg)))
PY

echo "project : $PROJECT"
echo "service : $SERVICE"
echo "region  : $REGION"
echo

"$GCLOUD" run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 1 \
  --env-vars-file "$ENV_YAML" \
  --quiet

URL="$("$GCLOUD" run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "deployed: $URL"
echo "Next steps are in DEPLOY_CLOUDRUN.md"
