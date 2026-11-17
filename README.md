# infra

Ansible and host configuration for the servers behind abulxt, Fracital,
wisp.baby, holyunb.locker, blockshooter.io and the krunk.io edge routes.

Since 2026-11-16 the fleet is one Proxmox host, **divide** (G-Core, Ashburn/Manassas,
public 91.199.82.174), with its guests behind NAT on 172.16.5.0/24:

| Host                         | What                                                                                                     | Managed by                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `edge` (CT 201, 172.16.5.10) | OpenResty edge and holyWisp: abulxt byod, Fracital, wisp.baby, holyunb.locker, blockshooter.io, krunk.io | `playbooks/edges.yml`, `wisp.yml`, `firewall.yml`, `fail2ban.yml` |
| `amph` (VM, 172.16.5.3)      | abulxt's origin: shared auto-ssl Redis, firewall, origin holyWisp, shady-relay                           | `playbooks/origin.yml`                                            |
| `terp` (meal, 5.188.124.62)  | Fracital's origin OpenResty                                                                              | `playbooks/fracital-origin.yml`                                   |
| divide                       | NAT, guest firewall, ACME                                                                                | by hand, `docs/divide-host.md`                                    |

`ansible/README.md` is the reference for every role, `ansible/RUNBOOK.md` has the
procedures, and `infra.js` is the G-Core address plan (`node infra.js`).

## Running it locally

```sh
cd ansible
ansible-galaxy collection install -r requirements.yml
# The gitignored vars files: copy them from a trusted machine, or start from private.example/.
ansible-playbook playbooks/edges.yml --check --vault-password-file ~/.abulxt-vault-pass
```

Hosts are reached as root over SSH; divide's guests through `ProxyJump root@91.199.82.174`
(`inventory/group_vars/divide_guests.yml`).

## Private values and secrets

This repository is public. No secret is committed, not even encrypted, and neither are a
few values that are private without being secret (Fracital's cloak decoy names, the
Cloudflare Zero Trust ids). Both live in gitignored files under
`ansible/inventory/group_vars/all/`; `ansible/private.example/` shows their shape and
`ansible/README.md` "Secrets" lists every value. A run without them stops before it
renders the edge.

## CI

**`ci.yml`**, on every push and pull request, never touching a server:

- `scripts/check-prose.mjs`: no em dashes or curly quotes in tracked files, no AI
  attribution in files or in the pushed commit messages.
- yamllint, `ansible-inventory --graph`, `--syntax-check` of every playbook, ansible-lint
  (findings that predate the repo are in `ansible/.ansible-lint-ignore`), the vendored
  roles' `VERSION` hashes.
- `scripts/check-public.py`: no private or secret value in a published file (skipped on a
  fork's pull request, which gets no secrets).
- shellcheck, the edge-router and wisp.baby tests, `node infra.js`.

**`apply.yml`** runs one playbook against production. It never runs on its own:

- From the Actions tab or `gh workflow run apply.yml -f playbook=edges -f check=false`.
- From a hook: a `repository_dispatch` event of type `apply`,
  `gh api repos/Fracital/infra/dispatches -f event_type=apply -F 'client_payload[playbook]=edges'`
  (payload: `playbook`, `limit`, `tags`, `check`, `diff`). Check mode is the default for a
  hook too; it applies only with `check: false`.
- Either way the job waits for approval on the `production` environment, runs one at a
  time, and validates every input against an allowlist.

Its settings (environment `production` unless noted):

| Name                                     | Kind                  | What                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFRA_SSH_KEY`                          | secret                | Private key of `infra-ci@Fracital/infra`, authorized as root on amph, edge and terp, and on divide limited to forwarding to amph's and edge's port 22 (`restrict,port-forwarding,command="/bin/false",permitopen=...`). Installed 2026-11-17. |
| `SSH_KNOWN_HOSTS`                        | variable (repository) | Host keys of divide, amph, edge and terp. Checking is strict: a host missing here fails the run.                                                                                                                                              |
| `ANSIBLE_PRIVATE_VARS`                   | secret (repository)   | The whole `private.yml`. Repository-level because the leak check on every push reads it.                                                                                                                                                      |
| `BYOD_TOKEN` ... `HOLYUNB_WISP_GATE_KEY` | secrets               | One per vars-file variable, mapped in `scripts/ci-secrets.json`.                                                                                                                                                                              |

`scripts/github-setup.sh` sets all of this (and the repository settings: secret scanning
and push protection, read-only `GITHUB_TOKEN`, approval for outside contributors' workflows,
the `production` environment with its reviewer and `main`-only policy, a ruleset that keeps
`main` from being deleted or force-pushed). After changing a value locally,
`scripts/sync-ci-secrets.py` copies every vars file into these secrets without printing a
value. Actions logs of a public repository are public:
`--diff` is off unless a run asks for it.

## Contributing

`AGENTS.md` has the rules for changes, human or agent: no committed secrets or private
names, no em dashes, Prettier formatting (`npm install`, then `npm run format`), and the checks
to run before a pull request.

## License

ISC, copyright 2026 David Reed. See `LICENSE`.
