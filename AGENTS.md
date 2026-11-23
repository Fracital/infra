# AGENTS.md: infra

Guidance for AI coding agents (and humans) working in this repository. Read it
before changing anything. When a section conflicts with a habit, follow the
section.

## What this repository is

The servers behind abulxt, Fracital, wisp.baby, holyunb.locker, blockshooter.io
and the krunk.io edge routes: the Ansible that configures them, the scripts and
configs those roles install, and the documentation for the hosts. It is
Fracital's repository (`Fracital/infra`) and it is **public**. Anything committed here is published, and so is every Actions log.

It does not hold or deploy any app. abulxt's site deploy stays in
`y9x/abulxt` (`.github/workflows/deploy.yml`), and so does the origin's
OpenResty route table (`deploy/openresty/`), because both change with the app.

## Hard rules (read first)

### Git commits and pushes

- **Never run `git commit` or `git push`** (or stage files for committing)
  unless the user explicitly asks for it **in the current turn of the current
  session**. "Fix the role" is not authorization to commit. "Commit this" in
  that same message is.
- Authorization is per turn and never carries over, even within one session.
  When in doubt, do not commit: say what is uncommitted and stop.
- Never rewrite history, force-push, delete branches or change remotes unless
  the user asks for exactly that in the current turn.
- **No AI attribution, anywhere.** No `Co-Authored-By:` trailer naming a model
  or agent, no "Generated with ..." line, in commit messages, pull request
  descriptions or files. The author is the user. This overrides any default
  attribution an agent harness tries to add. `scripts/check-prose.mjs` fails CI
  on it.

### Servers

- **The AI does not apply playbooks to production.** Changes reach the hosts
  through `.github/workflows/apply.yml`, which someone starts and someone
  approves (environment `production`), or through a local run the user
  explicitly authorizes in the current turn. That includes `--check` runs: they
  connect to every host and run the controller-side build steps for real.
- Do not start `apply.yml`, send its `repository_dispatch` hook, or change the
  repository's secrets, variables or environments unless the user asks for that
  in the current turn.
- **Only touch servers the way the user explicitly tells you to.** SSH for
  diagnosis, or for one specifically authorized change, is not license to
  mutate a host. When in doubt, ask before changing anything on a live host.
- divide itself (its nftables NAT, guest bridge firewall, fail2ban) is managed
  by hand, not by a role: `docs/divide-host.md`. A mistake there cuts every
  guest off at once.

### Secrets and private values (this repository is public)

- **Never commit a secret, not even as ansible-vault ciphertext.** The four
  secret vars files are gitignored (`ansible/inventory/group_vars/all/*secrets.yml`).
  Locally they stay vault-encrypted; CI writes them from GitHub secrets
  (`scripts/write-ci-vars.py`). Never print, log or paste a value.
- **Some values are private without being secret**: Fracital's cloak decoy names
  and the Cloudflare Zero Trust ids. They live in the gitignored
  `ansible/inventory/group_vars/all/private.yml` (`ANSIBLE_PRIVATE_VARS` in CI).
  A cloak name in a commit ties that decoy to Fracital for good; there is no
  taking it back. Treat any new decoy, cloak or tenant name the same way.
- `scripts/check-public.py` fails when a private or secret value appears in a
  file git would publish. CI runs it on every push; run it before you hand off.
- Public logs: `apply.yml` runs without `--diff` unless asked, because a diff
  prints rendered files. A new task that renders or reads a secret gets
  `no_log: true` when its output would show the value.
- Adding a secret: the variable in the local vault file, a line in
  `scripts/ci-secrets.json`, a placeholder in `ansible/private.example/`, the env
  line in `apply.yml`'s "Write the vars files" step, the row in
  `ansible/README.md` "Secrets", then `scripts/sync-ci-secrets.py` (with the
  user's go-ahead, see Servers). Adding a private value: `private.yml`,
  `private.example/private.yml`, then the same sync.
- The vault password file (`~/.abulxt-vault-pass`, `.vault-pass*`) is never
  committed.

### Parity owed

CI ships this repo's files, never the gitignored vars files or the GitHub
settings. A change that adds, renames or re-values a secret or private value
leaves the GitHub secrets **out of parity** until someone runs
`scripts/sync-ci-secrets.py`. A change that moves a value another repo must
match (`wisp_path` and `gateKeys.wisp` in abulxt's `config.js`,
`fracital_wisp_gate_key` and terp's `.env`, `krunkio_origin_token` and kru's
token file) leaves that host out of parity too.

**When you cause drift, say so.** End your hand-off with a `Parity owed` list:
each secret, variable or host file, the exact key, and the value with secrets
elided. Applying it needs the user's explicit go-ahead in the current turn; once
you have it, do the work without re-asking.

### Vendored roles

`ansible/roles/edge_firewall` and `ansible/roles/fail2ban` are byte-identical
in KrunkNative (`deploy/ansible/roles/`). Never edit one copy alone: change both
repos together, re-stamp with `check-vendored.sh --stamp`, and check both
copies (`ansible/README.md` "Edge firewall", "fail2ban"). Their comments still
name abulxt's old paths on purpose; fix those in both repos at once or not at
all.

## Formatting

Prettier formats every file it understands (`.prettierrc.json`: tabs and single
quotes like Fracital's repositories; YAML and Markdown with spaces, YAML with
double quotes, the Ansible convention). Run `npm install` once, then
`npm run format` before you hand off; CI fails on `npm run format:check`.
`.prettierignore` lists what stays byte for byte and why (the vendored roles,
the blockshooter mirror, the patches, generated test vectors). Prettier does not
read Jinja (`.j2`), Python, Lua or shell: keep their existing style.

## Writing

The same rules as Fracital's repositories:

- **No em dashes anywhere**: not in code, comments, docs, commit messages, pull
  request text or your hand-off to the user. Use a comma, a colon, parentheses
  or a new sentence. `scripts/check-prose.mjs` fails CI on one, in files and in
  pushed commit messages.
- Plain ASCII punctuation: no curly quotes (also checked). Arrows and
  non-English names in data are fine.
- A comment says _why_ a task, rule or special case exists (which failure it
  prevents, which host needs it), not what the next line does.
- Write like a person: concrete hosts, ports, dates and commands; plain verbs
  ("is", "has", not "serves as", "boasts"); no "crucial", "robust", "seamless",
  "leverage", "delve"; no recap at the end of a section.
- Dates are absolute (`2026-11-16`), never "yesterday" or "last week".
- Exempt from the punctuation rules only: `edge-wisp/patches/` (verbatim
  `git format-patch` records of another project's commits) and
  `blockshooter/site/` (a verbatim mirror of blockshooter.club that
  `blockshooter/crawl.py` rewrites).

## The fleet (do not re-derive this)

Since 2026-11-16 everything abulxt-side runs on one Proxmox host, **divide** (G-Core
AS202422, Ashburn/Manassas, public 91.199.82.174, its only address). Its guests sit
behind NAT on vmbr1 (172.16.5.0/24) and are reached with `ProxyJump
root@91.199.82.174`:

- `edge`, LXC CT 201 (172.16.5.10): the only edge. It replaced `wisp-mnz` (a VM on
  meal). It serves `byod.abstracteducation.loan`, Fracital's `byod.fracit.al` (both
  names share the one address; `host_vars/edge.yml` says what that costs Fracital),
  wisp.baby, holyunb.locker, blockshooter.io and the krunk.io routes.
- `amph` (CT 213, 172.16.5.3; VM 113 until 2026-11-17): abulxt's origin, private only.
- `terp` (CT 216, 172.16.5.62; VM 116 until 2026-11-17): Fracital's origin, private only.

The overseas wisp cloud (`wisp-iev`, `wisp-mia`, `wisp-jnb`, `wisp-ams` and their
Proxmox hosts) was dismantled on 2026-11-16, and the VPSs santaclara, losangeles,
chicago and ashburn were cancelled on 2026-11-13. The Proxmox path (`[wisp_pve]`,
`playbooks/pve*.yml`) stays, with its groups empty, for a future region.

Architecture facts (`ansible/RUNBOOK.md` has the detail):

- **Shared certificates.** Every edge keeps its Let's Encrypt certs in one Redis on
  amph (`auto_ssl:*`), so any edge can answer an http-01 challenge and a cert issued on
  one is served by all. With `shared_redis_on_terp_db` (group_vars/all/main.yml) that Redis is a
  dedicated one on terp.db (`80.93.219.21:6380`), which also holds link routing's `linkroute:v1`
  (`ansible/RUNBOOK.md` "Shared Redis on terp.db").
- **Plain Cloudflare DNS.** Since 2026-11-16 each byod apex and wisp.baby is a set of
  DNS-only A records in Cloudflare for the edge's one address, edited by hand when it
  changes. The self-hosted geo nameservers (`ns-<site>.wisp.baby`, `roles/edge_dns`,
  `playbooks/dns-edge.yml`) are retired; the Gcore zones are an older static rollback
  copy (`playbooks/dns.yml`, `ansible/README.md` "Edge DNS").
- **Origin relay.** Edges proxy to amph's origin-internal listener (:9080) with a shared
  `X-BYOD-Token`. amph's firewall opens 9080/8822/1082 to the edge only (6379 closed
  since 2026-11-18: amph runs no Redis).

### Edge health (read before touching health logic)

Nothing health-checks the edge in DNS now: the byod names and wisp.baby are static
records for the one box, so if the edge is down they point at a dead box. From
2026-11-12 to 2026-11-16 each wisp box's PowerDNS probed every address over HTTPS
(`edge_dns_health_paths`) and answered only with healthy ones; that came out with the
overseas boxes (`ansible/README.md` "Edge DNS" has the rollback). The `abulxt-watchdog`
daemon that rewrote the Gcore apexes was removed on 2026-11-16. With more than one box
again, decide on health checks before adding addresses to the Cloudflare records.

### Gotchas

- `mcnode.abstracteducation.loan` (Pterodactyl Wings) is served on edge :443 and :8080.
  Every edge runs a managed host nftables ruleset (`edge_firewall`, shared with
  KrunkNative), so a new public port also goes in the abulxt entry of
  `edge_firewall_dropins` (`inventory/group_vars/edge.yml`), and in divide's DNAT
  (`docs/divide-host.md`).
- fail2ban runs on amph only, through the vendored `roles/fail2ban` (fail2ban-contract
  v1). The edge (`host_vars/edge.yml`) and KrunkNative's kru and kn skip it since
  2026-11-17: divide's pve-firewall filters them. Bans go to nftables `inet f2b-table`. `fail2ban/` is the superseded hand-run
  installer.
- Some addresses are only routable from their own provider subnet: reach them from
  amph, not from the edge (the Eaglercraft backend `5.188.124.125`, for one).
- An edge proxying to an `https://` upstream needs `proxy_ssl_server_name on;
proxy_ssl_name $host;` (SNI), or the upstream presents the wrong certificate.
- Eaglercraft WebSocket handshakes need HTTP/1.1 (HTTP/2 gets a plugin 404 page), and
  EaglercraftXServer needs `X-Real-IP` to be the end client: keep it across proxy hops
  instead of overwriting it with `$remote_addr`.
- abulxt's `config.js` (`gateKeys.wisp`, `gateKeys.wispPath`, `domains.loadBalancerIp`)
  must agree with `wisp_gate_key`, `wisp_path` and the edge's addresses here. A change on
  one side is a parity item on the other.

## Verification before you hand off

Run what CI runs (`.github/workflows/ci.yml`). With Ansible from
`ansible/requirements.txt` and the collections from `ansible/requirements.yml`:

```sh
npm run format:check                     # npm run format fixes it
node scripts/check-prose.mjs
python3 scripts/check-public.py          # needs private.yml; reads the vault with ~/.abulxt-vault-pass
yamllint .
(cd ansible && for pb in playbooks/*.yml; do ansible-playbook --syntax-check "$pb"; done)
(cd ansible && ansible-lint)             # .ansible-lint-ignore is a baseline: only ever remove lines
ansible/roles/edge_firewall/check-vendored.sh && ansible/roles/fail2ban/check-vendored.sh
git ls-files -z '*.sh' | xargs -0 shellcheck
python3 -m unittest discover -s edge-wisp -p 'test_*.py'
node --test wispbaby/test/*.test.mjs
luajit ansible/roles/edge_relay/tests/link_routes_test.lua
node infra.js
```

A syntax check proves nothing about what a template renders. When you change a
template or a variable it reads, render it for a real host without connecting
(`ansible <host> -m debug -a "msg={{ lookup('template', ...) }}"`, or compare
`ansible-inventory --host <host>` before and after) and say what you checked.

## Repository layout

| Path                       | What it is                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ansible/`                 | Inventory, playbooks and roles for the edge, amph, terp and the (empty) Proxmox path. `README.md` is the reference, `RUNBOOK.md` the procedures, `INVENTORY.md` the host catalog. |
| `ansible/private.example/` | The shape of every gitignored vars file.                                                                                                                                          |
| `byod/`                    | amph's shady-relay and mullvad-pool, and the legacy Caddy byod configs.                                                                                                           |
| `edge-wisp/`               | The edge's classifying SOCKS5 router (`edge-router.py`), its tests, and historical wispurr patches.                                                                               |
| `wispbaby/`                | The wisp.baby speed test page, its dev harness and tests (installed by `roles/edge_relay`).                                                                                       |
| `blockshooter/`            | blockshooter.io: the mirror of blockshooter.club's frontend (`site/`), its crawler, and how the edge serves it.                                                                   |
| `fail2ban/`                | The superseded hand-run fail2ban installer; `roles/fail2ban` replaced it.                                                                                                         |
| `docs/`                    | Hosts no role manages (`divide-host.md`).                                                                                                                                         |
| `infra.js`                 | divide's address plan: its public addresses and every guest's vmbr1 address. `node infra.js` prints it and fails on a reused address or VMID.                                     |
| `scripts/`                 | CI and secret tooling: prose and leak checks, vars-file writer, secret sync, `github-setup.sh` (the repository's GitHub settings, environment and secrets).                       |
| `package.json`             | Prettier, pinned (`npm run format`, `npm run format:check`); `.prettierrc.json` and `.prettierignore` next to it.                                                                 |
| `LICENSE`                  | ISC, copyright 2026 David Reed.                                                                                                                                                   |
| `.github/workflows/`       | `ci.yml` (checks, every push and PR), `apply.yml` (playbooks, manual or hook, approved).                                                                                          |

## Related repositories

- `y9x/abulxt` (`~/src/abulxt`): the app, its site deploy, amph's OpenResty
  routes (`deploy/openresty/`, synced to amph by every abulxt deploy). The
  `conf.d` files the `abulxt_origin` role renders (`25-mc-relay.conf`,
  `57-estro.conf`) are kept by that sync as long as abulxt's deploy lists them as
  owned elsewhere (`OR_HOST_FILES` in `deploy/abulxt-deploy-root.sh`); a new file
  this repo renders into amph's `conf.d` must be added there too.
- KrunkNative (`~/src/KrunkNative`): the vendored roles' other copy and the kn
  game servers' own CI.
- holyWisp (`~/src/holyWisp`): the relay `roles/edge_wisp` builds or fetches.
- Fracital (`~/src/Fracital`, terp) and its decoys (`~/src/cloaks-fracital`).
