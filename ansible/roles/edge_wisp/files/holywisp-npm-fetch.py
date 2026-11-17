#!/usr/bin/env python3
"""
Fetch one holyWisp server binary from the npm package `holywisp` (roles/edge_wisp/tasks/npm.yml).
Runs on the Ansible controller; touches nothing but --out and a temporary directory.

    python3 -I holywisp-npm-fetch.py --registry URL --package holywisp --version X.Y.Z-... \
        --platform linux-x64 --out PATH [--integrity sha512-...] \
        [--provenance-repo URL --provenance-workflow PATH [--provenance-ref REF]]

1. Reads the version's manifest from the registry (an exact version: never a range or a tag).
2. Downloads dist.tarball (it must live on the same registry) and checks it against the
   manifest's dist.integrity (sha512), and against --integrity when the role pins one.
3. With --provenance-*: installs the same version into a scratch project with npm and runs
   `npm audit signatures --json --include-attestations`, which checks the registry signature and
   the Sigstore bundles (Fulcio certificate, Rekor entry, subject digest). Then, on the bundles npm
   verified: the SLSA provenance names this package and version, carries the sha512 of the very
   tarball downloaded in step 2, and was built by the expected repository and workflow (and ref).
   The commit it was built from must match: a nightly's .g<sha> suffix, and for a build from a tag
   (refs/tags/v...) the commit that tag names in the repository (`git ls-remote`, peeled).
4. Extracts package/bin/<platform>/holywisp (a regular file, nothing else) to --out, atomically.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

SLSA = "https://slsa.dev/provenance/v1"


def die(msg):
    print(f"holywisp-npm-fetch: {msg}", file=sys.stderr)
    sys.exit(1)


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "abulxt-edge_wisp"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def check_provenance(a, tarball_hex, integrity, tmp):
    proj = os.path.join(tmp, "audit")
    os.mkdir(proj)
    with open(os.path.join(proj, "package.json"), "w") as f:
        json.dump({"name": "holywisp-audit", "private": True}, f)
    npm = ["npm", "--prefix", proj, "--registry", a.registry, "--no-audit", "--no-fund", "--loglevel=error"]
    r = subprocess.run(npm + ["install", "--ignore-scripts", "--save-exact", f"{a.package}@{a.version}"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"npm install {a.package}@{a.version} failed:\n{r.stderr.strip()}")
    with open(os.path.join(proj, "package-lock.json")) as f:
        locked = json.load(f)["packages"].get(f"node_modules/{a.package}", {})
    if locked.get("version") != a.version or locked.get("integrity") != integrity:
        die(f"npm installed {locked.get('version')} ({locked.get('integrity')}), not the verified tarball")
    r = subprocess.run(npm + ["audit", "signatures", "--json", "--include-attestations"],
                       capture_output=True, text=True, cwd=proj)
    try:
        report = json.loads(r.stdout)
    except ValueError:
        die(f"npm audit signatures gave no report (exit {r.returncode}):\n{r.stderr.strip()}")
    if r.returncode != 0 or report.get("invalid") or report.get("missing"):
        die(f"npm audit signatures failed: invalid={report.get('invalid')} missing={report.get('missing')}")
    entry = next((v for v in report.get("verified", [])
                  if v.get("name") == a.package and v.get("version") == a.version), None)
    if not entry:
        die(f"npm audit signatures did not verify {a.package}@{a.version}")
    bundle = next((b for b in entry.get("attestationBundles") or [] if b.get("predicateType") == SLSA), None)
    if not bundle:
        die(f"{a.package}@{a.version} has no verified SLSA provenance (published without --provenance?)")
    stmt = json.loads(base64.b64decode(bundle["bundle"]["dsseEnvelope"]["payload"]))
    want_name = "pkg:npm/" + urllib.parse.quote(a.package, safe="/") + "@" + a.version
    if not any(s.get("name") == want_name and s.get("digest", {}).get("sha512") == tarball_hex
               for s in stmt.get("subject", [])):
        die(f"provenance subject is {stmt.get('subject')}, not {want_name} with this tarball's sha512")
    bd = stmt["predicate"]["buildDefinition"]
    wf = bd["externalParameters"]["workflow"]
    if wf.get("repository") != a.provenance_repo or wf.get("path") != a.provenance_workflow:
        die(f"built by {wf.get('repository')} {wf.get('path')}, expected {a.provenance_repo} {a.provenance_workflow}")
    if a.provenance_ref and wf.get("ref") != a.provenance_ref:
        die(f"built from ref {wf.get('ref')}, expected {a.provenance_ref}")
    commits = [c for c in (d.get("digest", {}).get("gitCommit", "") for d in bd.get("resolvedDependencies", [])) if c]
    if not commits:
        die("the provenance names no source commit")
    m = re.search(r"\.g([0-9a-f]{7,40})$", a.version)
    if m and not any(c.startswith(m.group(1)) for c in commits):
        die(f"version names commit {m.group(1)} but the provenance says {commits}")
    if wf.get("ref", "").startswith("refs/tags/"):
        tag = tag_commit(a.provenance_repo, wf["ref"])
        if tag not in commits:
            die(f"{wf['ref']} is commit {tag} in {a.provenance_repo}, but the provenance says {commits}")
    return f"{wf['repository']} {wf['path']} {wf.get('ref')} @ {commits[0][:12]}"


def tag_commit(repo, ref):
    """The commit a tag names now (an annotated tag's ^{} line wins over the tag object's own)."""
    r = subprocess.run(["git", "ls-remote", repo, ref, ref + "^{}"], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        die(f"git ls-remote {repo} {ref} failed:\n{r.stderr.strip()}")
    lines = dict(reversed(line.split("\t", 1)) for line in r.stdout.splitlines() if "\t" in line)
    sha = lines.get(ref + "^{}") or lines.get(ref)
    if not sha:
        die(f"{repo} has no {ref}")
    return sha


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True)
    ap.add_argument("--package", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--platform", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--integrity", default="")
    ap.add_argument("--provenance-repo", default="")
    ap.add_argument("--provenance-workflow", default="")
    ap.add_argument("--provenance-ref", default="")
    a = ap.parse_args()
    a.registry = a.registry.rstrip("/")
    if not re.fullmatch(r"\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?", a.version):
        die(f"'{a.version}' is not an exact version")
    if not re.fullmatch(r"[a-z0-9-]+-(x64|arm64)", a.platform):
        die(f"bad platform '{a.platform}'")

    manifest = json.loads(get(f"{a.registry}/{urllib.parse.quote(a.package, safe='@')}/{a.version}"))
    if manifest.get("name") != a.package or manifest.get("version") != a.version:
        die(f"the registry answered with {manifest.get('name')}@{manifest.get('version')}")
    dist = manifest.get("dist", {})
    integrity, url = dist.get("integrity", ""), dist.get("tarball", "")
    if not integrity.startswith("sha512-"):
        die(f"dist.integrity is not sha512: '{integrity}'")
    if a.integrity and a.integrity != integrity:
        die(f"the registry's dist.integrity {integrity} differs from the pinned {a.integrity}")
    if not url.startswith(a.registry + "/"):
        die(f"dist.tarball {url} is not on {a.registry}")

    out_dir = os.path.dirname(os.path.abspath(a.out))
    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out_dir, prefix=".npm-fetch.") as tmp:
        data = get(url)
        digest = hashlib.sha512(data).digest()
        if "sha512-" + base64.b64encode(digest).decode() != integrity:
            die(f"{url}: sha512 does not match dist.integrity {integrity}")
        tgz = os.path.join(tmp, "package.tgz")
        with open(tgz, "wb") as f:
            f.write(data)

        prov = "not checked"
        if a.provenance_repo or a.provenance_workflow:
            if not (a.provenance_repo and a.provenance_workflow):
                die("--provenance-repo and --provenance-workflow go together")
            prov = check_provenance(a, digest.hex(), integrity, tmp)

        member = f"package/bin/{a.platform}/holywisp"
        with tarfile.open(tgz, "r:gz") as t:
            try:
                info = t.getmember(member)
            except KeyError:
                die(f"{a.package}@{a.version} has no {member}")
            if not info.isreg() or info.size == 0:
                die(f"{member} is not a regular non-empty file")
            exe = t.extractfile(info).read()
        part = os.path.join(tmp, "holywisp")
        with open(part, "wb") as f:
            f.write(exe)
        os.chmod(part, 0o755)
        os.replace(part, a.out)

    print(json.dumps({"version": a.version, "integrity": integrity, "binary_sha256": hashlib.sha256(exe).hexdigest(),
                      "provenance": prov}))


if __name__ == "__main__":
    main()
