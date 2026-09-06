"""Extract & decode Nuxt `window.__NUXT__` payloads from SSR HTML.

The payload is a devalue-style IIFE:
    window.__NUXT__=(function(a,b,c,...){...}(v1,v2,v3,...));
Evaluating it in Node.js yields the state object as JSON.
"""
import shutil
import json
import re
import subprocess
import tempfile

_NUXT_RE = re.compile(
    '<script[^>]*>window\\.__NUXT__=\\(function.*?\\)\\);?\\s*</script>',
    re.S,
)


def extract_nuxt(html):
    """Return raw JS statement string or None."""
    m = _NUXT_RE.search(html)
    if not m:
        return None
    stmt = m.group(0)
    stmt = re.sub(r'^<script[^>]*>', '', stmt)
    stmt = re.sub(r'</script>\s*$', '', stmt)
    return stmt


def decode_nuxt(html, node=None):
    # was pinned to one machine's mise install of node 26.2.0
    node = node or shutil.which("node") or "node"
    """Decode window.__NUXT__ from HTML into a Python object."""
    stmt = extract_nuxt(html)
    if not stmt:
        return None
    script = (
        "const window = {};\n"
        + stmt
        + "\nprocess.stdout.write(JSON.stringify(window.__NUXT__));\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(script)
        path = f.name
    try:
        out = subprocess.run(
            [node, path], capture_output=True, text=True, timeout=60
        )
        if out.returncode != 0:
            raise RuntimeError(f"node decode failed: {out.stderr[:300]}")
        return json.loads(out.stdout)
    finally:
        import os
        os.unlink(path)
