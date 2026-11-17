#!/usr/bin/env python3
"""Fail if a private value or a secret appears in a file git would publish.

The values come from the gitignored vars files (ansible/README.md "Secrets", "Private
values"): private.yml always, and the secret files when they are readable (plain text in
CI, vault-encrypted locally with --vault-password-file). Scanned: every tracked or
untracked, not-ignored file. Nothing found prints the count of values checked; a hit
prints the file and line, never the value.

    check-public.py [--vault-password-file FILE]

With no private.yml at all (a fork's pull request, which gets no secrets) it says so and
exits 0: there is nothing to compare against.
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
VARS_DIR = ROOT / "ansible/inventory/group_vars/all"
# Public values that also appear in private.yml's structure, and words too short to mean
# anything on their own.
ALLOW = {"block-adult", "block-shady", "plain"}


def scalars(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from scalars(v)
    elif isinstance(node, list):
        for v in node:
            yield from scalars(v)
    elif node is not None and not isinstance(node, bool):
        yield str(node)


def load(path, vault_pass):
    text = path.read_text()
    if text.startswith("$ANSIBLE_VAULT"):
        if not vault_pass or not Path(vault_pass).exists():
            return None
        text = subprocess.run(
            ["ansible-vault", "view", "--vault-password-file", vault_pass, str(path)],
            check=True, capture_output=True, text=True,
        ).stdout
    return yaml.safe_load(text) or {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-password-file", default=os.path.expanduser("~/.abulxt-vault-pass"))
    args = ap.parse_args()

    private = VARS_DIR / "private.yml"
    if not private.exists():
        print("check-public: no private.yml (no secrets in this run), nothing to compare")
        return

    values = {}
    for path in sorted(VARS_DIR.glob("*.yml")):
        if path.name != "private.yml" and not path.name.endswith("secrets.yml"):
            continue
        data = load(path, args.vault_password_file)
        if data is None:
            print(f"check-public: {path.name} is vault-encrypted and no password file; skipped")
            continue
        for v in scalars(data):
            if len(v) >= 6 and v not in ALLOW:
                # A multi-line value (a PEM key) is matched line by line.
                for part in v.splitlines():
                    part = part.strip()
                    if len(part) >= 6 and not part.startswith("-----"):
                        values[part] = path.name

    files = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.split("\0")
    hits = []
    for rel in sorted(set(filter(None, files))):
        path = ROOT / rel
        try:
            buf = path.read_bytes()
        except (FileNotFoundError, IsADirectoryError):
            continue
        text = buf.decode("utf-8", "replace").lower()
        for value, source in values.items():
            needle = value.lower()
            pos = text.find(needle)
            if pos >= 0:
                line = text.count("\n", 0, pos) + 1
                hits.append(f"{rel}:{line}: a value from {source}")
    if hits:
        print("\n".join(hits), file=sys.stderr)
        sys.exit(1)
    print(f"check-public: {len(values)} private and secret values, none in a published file")


if __name__ == "__main__":
    main()
