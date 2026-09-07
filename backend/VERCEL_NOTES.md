# Why there is no .vercelignore here

Deleted deliberately. With `vercel build` + `vercel deploy --prebuilt`, a
`.vercelignore` entry that matches a file which actually exists makes the build
manifest reference a path the upload then omits, and the deploy dies with:

    ENOENT: no such file or directory, lstat '/vercel/path0/<that path>'

Observed for `.env`, `.pytest_cache/.gitignore` and `.wrangler/cache/…`. Worse,
the patterns match gitignore-style at any depth, so an unanchored `tests/` also
stripped files out of an installed dependency
(`.vercel_python_packages/aiosqlite/tests/__init__.py`).

Anchoring the patterns fixed the dependency damage but not the mismatch, and
`tests/`, `wrangler.toml`, `fly.toml` and `.env.example` are all tracked — so the
same failure would have hit CI, not just local deploys.

What replaces it:

- **Secrets** — `excludeFiles: ".env*"` in `vercel.json`, the function-level
  mechanism, keeps a developer's `.env` out of the bundle.
- **Size** — `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`; the bundle is ~744 MB against a
  500 MB standard limit.
- **File count** — `vercel deploy --archive=tgz`; ~16,000 files against a 15,000
  limit on the plain upload path.

Deploying locally: `.venv/` would otherwise be bundled, so move it aside first.
CI never has one.

    cd backend
    mv .venv /tmp/venv.bak
    VERCEL_SUPPORT_LARGE_FUNCTIONS=1 vercel build --prod
    vercel deploy --prebuilt --prod --archive=tgz
    mv /tmp/venv.bak .venv
