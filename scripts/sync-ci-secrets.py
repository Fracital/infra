#!/usr/bin/env python3
"""Copy the local secret and private vars files into the repo's GitHub Actions secrets.

Run after changing a value locally (ansible/README.md "Secrets"):

    scripts/sync-ci-secrets.py [--repo Fracital/infra] [--vault-password-file ~/.abulxt-vault-pass]
                               [--dry-run]

The secrets go to the `production` environment, so only the approved apply job reads them;
ANSIBLE_PRIVATE_VARS is a repository secret, because the leak check on every push needs it.
Values travel on gh's stdin and are never printed; --dry-run lists the names only.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
VARS_DIR = ROOT / "ansible/inventory/group_vars/all"
MAP = json.loads((ROOT / "scripts/ci-secrets.json").read_text())


def read_vars(path, vault_pass):
    text = path.read_text()
    if text.startswith("$ANSIBLE_VAULT"):
        text = subprocess.run(
            ["ansible-vault", "view", "--vault-password-file", vault_pass, str(path)],
            check=True, capture_output=True, text=True,
        ).stdout
    return text


def gh_set(repo, name, value, env, dry_run):
    where = f"environment {env}" if env else "repository"
    if dry_run:
        print(f"would set {name} ({where})")
        return
    cmd = ["gh", "secret", "set", name, "--repo", repo]
    if env:
        cmd += ["--env", env]
    subprocess.run(cmd, input=value, text=True, check=True, stdout=subprocess.DEVNULL)
    print(f"set {name} ({where})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="Fracital/infra")
    ap.add_argument("--env", default="production")
    ap.add_argument("--vault-password-file", default=os.path.expanduser("~/.abulxt-vault-pass"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    problems = []
    for name, variables in MAP["files"].items():
        path = VARS_DIR / name
        if not path.exists():
            problems.append(f"{path} is missing")
            continue
        data = yaml.safe_load(read_vars(path, args.vault_password_file)) or {}
        for var, secret in variables.items():
            value = data.get(var)
            if value in (None, ""):
                problems.append(f"{name}: {var} is empty")
                continue
            gh_set(args.repo, secret, str(value), args.env, args.dry_run)
        extra = sorted(set(data) - set(variables))
        if extra:
            problems.append(f"{name}: not in scripts/ci-secrets.json: {', '.join(extra)}")

    private = VARS_DIR / MAP["private"]["file"]
    if private.exists():
        gh_set(args.repo, MAP["private"]["secret"], private.read_text(), None, args.dry_run)
    else:
        problems.append(f"{private} is missing")

    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
