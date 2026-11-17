#!/usr/bin/env python3
"""Mirror a same-origin static site: follows HTML href/src, CSS url()/@import, JS static and
dynamic imports, and quoted same-origin paths with asset extensions in JS/JSON. Saves each
URL path (query dropped) under OUT. Usage: crawl.py ORIGIN OUT [extra start paths...]"""
import re, sys, os, time, json, urllib.request, urllib.parse, collections

ORIGIN = sys.argv[1].rstrip("/")
OUT = sys.argv[2]
starts = ["/"] + sys.argv[3:]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
ASSET_EXT = r"(?:js|mjs|css|json|png|jpe?g|gif|webp|avif|svg|ico|wav|mp3|ogg|m4a|flac|mp4|webm|woff2?|ttf|otf|glb|gltf|bin|wasm|txt|xml|html?|map|csv|tsv|atlas|fnt|frag|vert|glsl|data|dat|pak|zip)"

seen, queue, status = set(), collections.deque(), {}
host = urllib.parse.urlsplit(ORIGIN).netloc


def norm(base_url, ref):
    ref = ref.strip()
    if not ref or ref.startswith(("data:", "blob:", "javascript:", "mailto:", "tel:", "#", "about:")):
        return None
    if "${" in ref or "{{" in ref:
        return None
    u = urllib.parse.urljoin(base_url, ref)
    p = urllib.parse.urlsplit(u)
    if p.scheme not in ("http", "https") or p.netloc != host:
        return None
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path or "/", p.query, ""))


def add(base_url, ref):
    u = norm(base_url, ref)
    if u and u not in seen:
        seen.add(u)
        queue.append(u)


def local_path(u):
    p = urllib.parse.urlsplit(u).path
    p = urllib.parse.unquote(p)
    if p.endswith("/"):
        p += "index.html"
    elif "." not in os.path.basename(p):
        p += "/index.html"  # extensionless route: a page
    return os.path.join(OUT, p.lstrip("/"))


def scan(u, body, ctype):
    text = body.decode("utf-8", "replace")
    path = urllib.parse.urlsplit(u).path
    if "html" in ctype or path.endswith((".html", ".htm", "/")):
        for m in re.finditer(r"""(?:src|href|data-src|poster|content)\s*=\s*["']([^"']+)["']""", text, re.I):
            v = m.group(1)
            if v.startswith(("/", ".", "http")) or re.search(r"\." + ASSET_EXT + r"(?:\?|$)", v):
                add(u, v)
        for m in re.finditer(r"srcset\s*=\s*[\"']([^\"']+)[\"']", text, re.I):
            for part in m.group(1).split(","):
                add(u, part.strip().split(" ")[0])
        for m in re.finditer(r"<script[^>]*>(.*?)</script>", text, re.S | re.I):
            scan_js(u, m.group(1))
        for m in re.finditer(r"<style[^>]*>(.*?)</style>", text, re.S | re.I):
            scan_css(u, m.group(1))
    if "css" in ctype or path.endswith(".css"):
        scan_css(u, text)
    if "javascript" in ctype or path.endswith((".js", ".mjs")) or "json" in ctype or path.endswith(".json"):
        scan_js(u, text)


def scan_css(u, text):
    for m in re.finditer(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", text):
        add(u, m.group(1))
    for m in re.finditer(r"@import\s+['\"]([^'\"]+)['\"]", text):
        add(u, m.group(1))


def scan_js(u, text):
    for m in re.finditer(r"""(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]""", text):
        add(u, m.group(1))
    for m in re.finditer(r"""import\s*\(\s*['"]([^'"]+)['"]\s*\)""", text):
        add(u, m.group(1))
    for m in re.finditer(r"""import\s+['"]([^'"]+)['"]""", text):
        add(u, m.group(1))
    for m in re.finditer(r"""new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url""", text):
        add(u, m.group(1))
    # quoted paths with asset extensions (relative to the page for fetch(), to the module for imports;
    # try both: a miss is just a 404)
    for m in re.finditer(r"""['"`]((?:\.{0,2}/)?[A-Za-z0-9_\-./%]+\.""" + ASSET_EXT + r""")(?:\?[^'"`]*)?['"`]""", text):
        v = m.group(1)
        add(u, v)
        if PAGE_BASE.get(u):
            add(PAGE_BASE[u], v)


PAGE_BASE = {}


def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "*/*"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.headers.get("content-type", ""), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get("content-type", ""), b""
        except Exception as e:  # noqa
            time.sleep(1 + attempt)
    return 0, "", b""


for s in starts:
    add(ORIGIN + "/", s)
while queue:
    u = queue.popleft()
    code, ctype, body = fetch(u)
    status[u] = code
    if code != 200:
        continue
    lp = local_path(u)
    os.makedirs(os.path.dirname(lp), exist_ok=True)
    if os.path.exists(lp) and os.path.isdir(lp):
        lp = os.path.join(lp, "index.html")
    with open(lp, "wb") as f:
        f.write(body)
    # the page a module tree belongs to: fetch() paths resolve against it
    base = PAGE_BASE.get(u) or (u if ("html" in ctype) else None)
    for m in []:
        pass
    if "html" in ctype:
        PAGE_BASE[u] = u
    scan(u, body, ctype)
    # children inherit the page base
    for q in list(queue):
        if q not in PAGE_BASE and base:
            PAGE_BASE[q] = base
    time.sleep(0.05)

ok = sum(1 for c in status.values() if c == 200)
bad = {u: c for u, c in status.items() if c != 200}
json.dump({"ok": ok, "missing": bad}, open(os.path.join(OUT, "..", "crawl-report.json"), "w"), indent=1)
print(f"fetched {ok}, missing {len(bad)}")
for u, c in sorted(bad.items())[:60]:
    print(c, u)
