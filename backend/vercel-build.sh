#!/usr/bin/env bash
# Vercel build step for the backend project.
#
# data/ and scripts/ live at the repository root, but a Vercel project rooted at
# backend/ only bundles what is under backend/. Copy them in when the parent is
# reachable — true for `vercel build` run in a full checkout, which is how CI
# deploys (see .github/workflows/ci.yml) — and fail loudly when it is not,
# rather than shipping an API that 500s on its first catalog read.
set -euo pipefail

if [ -d ../data ]; then
  rm -rf data scripts
  cp -R ../data ./data
  cp -R ../scripts ./scripts
fi

if [ ! -d data ] || [ ! -d scripts ]; then
  echo "ERROR: data/ and scripts/ are missing from the build context."
  echo "Deploy from a full checkout:  vercel build && vercel deploy --prebuilt"
  exit 1
fi

# Defining a buildCommand makes Vercel expect a static output directory, even
# though the rewrite sends every route to the Python function.
mkdir -p public
printf 'VoltPilot API\n' > public/index.txt
