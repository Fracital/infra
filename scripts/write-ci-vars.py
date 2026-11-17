#!/usr/bin/env python3
"""Write the gitignored vars files from GitHub Actions secrets, inside a CI runner.

The secret files (ansible/README.md "Secrets") are written in plain text: the runner is
thrown away after the job. The private values file is written from ANSIBLE_PRIVATE_VARS.
Every private scalar is registered with ::add-mask:: first, so a log line that names a
cloak host shows *** instead (GitHub masks a multi-line secret only as a whole).

    write-ci-vars.py            all files; exits 1 naming every missing secret
    write-ci-vars.py --private  only private.yml (for checks that need no secret)

Values come from the environment, never from argv, and are never printed.
"""
import json
import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
VARS_DIR = ROOT / "ansible/inventory/group_vars/all"
MAP = json.loads((ROOT / "scripts/ci-secrets.json").read_text())


def scalars(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from scalars(v)
    elif isinstance(node, list):
        for v in node:
            yield from scalars(v)
    elif node is not None and not isinstance(node, bool):
        yield str(node)


def write(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)


def main():
    private_only = sys.argv[1:] == ["--private"]
    missing = []

    raw = os.environ.get(MAP["private"]["secret"], "")
    if not raw.strip():
        missing.append(MAP["private"]["secret"])
    else:
        data = yaml.safe_load(raw)
        if not isinstance(data, dict):
            sys.exit(f"{MAP['private']['secret']} is not a YAML mapping")
        for value in sorted(set(scalars(data)), key=len, reverse=True):
            if len(value) >= 4:
                print(f"::add-mask::{value}")
        body = raw.strip("\n") + "\n"
        write(VARS_DIR / MAP["private"]["file"], body if body.startswith("---") else "---\n" + body)

    if not private_only:
        for name, variables in MAP["files"].items():
            lines = ["---"]
            for var, secret in variables.items():
                value = os.environ.get(secret, "")
                if not value:
                    missing.append(secret)
                    continue
                # A JSON string is a valid YAML double-quoted scalar, newlines included.
                lines.append(f"{var}: {json.dumps(value)}")
            write(VARS_DIR / name, "\n".join(lines) + "\n")

    if missing:
        print("missing GitHub secrets: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)
    print("vars files written" + (" (private only)" if private_only else ""))


if __name__ == "__main__":
    main()
