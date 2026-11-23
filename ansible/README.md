# Abulxt Edge Infrastructure: Ansible

Fully automated provisioning and networking of the abulxt edge fleet and its
relay back to the central origin (`amph`). Everything is driven by Ansible;
nothing here deploys the app itself (that stays in CI/CD per repo policy).

## What's managed

| Layer           | Role                                                                 | Hosts                                       | What it does                                                                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin          | `abulxt_origin`                                                      | `amph`                                      | Firewall open to the edge (9080/8822/1082); amph's Redis only with `shared_redis_on_terp_db: false`                                                                                                                                                                                   |
| Edge install    | `openresty`                                                          | all `edge`                                  | OpenResty from openresty.org (Debian 13: its checked `.debs`, kept current, see [OpenResty packages on Debian 13](#openresty-packages-on-debian-13)) + lua-resty-auto-ssl via luarocks + fallback cert                                                                                |
| Edge relay      | `edge_relay`                                                         | all `edge`                                  | On-demand TLS (shared Redis) + reverse-proxy to amph `:9080` with `X-BYOD-Token`                                                                                                                                                                                                      |
| krunk.io routes | `edge_relay` (`krunkio_enabled`)                                     | all `edge`                                  | `assets.`/`coordinator.`/`matchmaker.`/`play.krunk.io` relayed straight to KrunkNative's kru over pinned TLS, assets cached on the edge. See [krunk.io routes](#krunkio-routes)                                                                                                       |
| Fracital routes | `edge_relay` (`fracital_enabled`)                                    | all `edge`                                  | `fracital_hosts` (+ `www.`) relayed to Fracital's terp over pinned TLS; the keyed relay path goes to the edge's own holyWisp; `fracital_wisp_hosts` (`holywisp.fracit.al`) serve only a placeholder page, the relay, that path and `/health`. See [Fracital routes](#fracital-routes) |
| holyunb routes  | `edge_relay` (`holyunb_enabled`)                                     | `wisp_edge`                                 | `holyunb.locker`: the keyed relay path `/wisp/<holyunb_wisp_gate_key>/` goes to the box's own holyWisp (tag `holyunb`); everything else to the site on holy (`172.16.5.79:8080`). See [holyunb routes](#holyunb-routes)                                                               |
| Link routing    | `edge_relay` (`link_routes_enabled`)                                 | all `edge`                                  | A Host with no server block of its own goes to the site registered for it in the shared Redis (`linkroute:v1`, abulxt's Discord bot): fracital, stomp, abstract or holy; unregistered names get a placeholder page. See [Link routing](#link-routing)                                 |
| Fracital origin | `fracital_origin` (`playbooks/fracital-origin.yml`)                  | `terp`                                      | OpenResty in place of nginx; ufw admits only the edge /24s on :443. See [Fracital routes](#fracital-routes)                                                                                                                                                                           |
| Deploy user     | `deploy_user` (tag `deploy_user`)                                    | `amph`, `terp`                              | The unprivileged `deploy` user CI logs in as: root-owned authorized_keys with forced-command keys, fixed sudo rules. See [Deploy user](#deploy-user)                                                                                                                                  |
| Edge firewall   | `edge_firewall` (vendored; `playbooks/firewall.yml`, tag `firewall`) | all `edge` (`edge_firewall_manage`)         | Host nftables, edge-firewall-contract v1 shared with KrunkNative: base policy drop + ssh 22, abulxt drop-in tcp 80/443/8080 + udp 443. See [Edge firewall](#edge-firewall)                                                                                                            |
| fail2ban        | `fail2ban` (vendored; `playbooks/fail2ban.yml`, tag `fail2ban`)      | `amph` (`fail2ban_manage`; the edge is off) | sshd + recidive jails banning into nftables `inet f2b-table`, fail2ban-contract v1 shared with KrunkNative; edges also get sshd MaxStartups 50:30:200. See [fail2ban](#fail2ban)                                                                                                      |
| DNS             | `gcore_dns`                                                          | localhost                                   | Round-robin A/AAAA RRsets for the two byod names, `byod.abstracteducation.loan` and `byod.fracit.al` (`byod_names`), each on its half of the edge IPs; per-site records for abulxt. See [Two byod names](#two-byod-names)                                                             |
| Edge DNS        | `edge_dns`                                                           | `wisp_edge`                                 | PowerDNS on every wisp box: authoritative for every `byod_names` zone, the apex answering with the healthy addresses of the box nearest the client. See [Edge DNS](#edge-dns)                                                                                                         |
| DNS classifier  | `gateway_dns`                                                        | localhost                                   | Locks the Cloudflare Gateway DoH classifier locations to the edge fleet's source networks                                                                                                                                                                                             |
| Edge Wisp       | `edge_wisp`                                                          | all `edge`                                  | Edge-local holyWisp + classifying SOCKS5 router for TCP streams (adult → refuse, shady → amph Mullvad hop, clean → direct); UDP streams leave the edge directly (`proxy-udp = direct`), refused for a shady name (the router's name gate, `edge_router_dns_port`)                     |
| Origin Wisp     | `edge_wisp` (tag `wisp`, vars in `host_vars/amph.yml`)               | `amph`                                      | Same holyWisp build as `abulxt-edge-wisp.service` on `127.0.0.1:6001`, TCP egress straight into `mullvad-pool` (`:1080`), UDP direct (`proxy-udp = direct`), no router; retires the old npm wrapper `abulxt-wisp.service`                                                             |
| Shady relay     | `abulxt_origin`                                                      | `amph`                                      | Authenticated SOCKS5 on `:1082` chaining into `mullvad-pool`; firewall opened to edge /24s                                                                                                                                                                                            |

Every relay (4 edges + amph) runs the same fully static
[holyWisp](https://github.com/Fracital/holyWisp) binary (C11 Wisp v1/v2 server;
one binary serves Debian 11, 12 and 13; plain Wisp over TLS, no frame cloak),
which the controller takes from the npm package `holywisp` at
`holywisp_npm_version` or builds from `holywisp_ref` (`holywisp_source`, see
[holyWisp from npm](#holywisp-from-npm)). The keyed `/<path>/<key>/` route is the
only access control. Unit `abulxt-edge-wisp.service` (holyWisp's upstream
sandbox: no capabilities, `ProtectSystem=strict`, `AF_INET`/`AF_INET6` only,
syscall filter), binary `<edge_wisp_dir>/holywisp`, config
`/etc/abulxt/holywisp.conf` (`root:abulxt-wisp` 0640), `/health` and `/stats`
on `127.0.0.1:6001`. amph's relay is configured by `origin.yml`; install dir
`/opt/abulxt-wispurr` (the old `/opt/abulxt-wisp` npm install stays for
rollback). holyWisp replaced the Go `wispurr` v4.2.1 in 2026-11; see
[Rollback to wispurr](#rollback-to-wispurr) and RUNBOOK Phase 6.

### holyWisp from npm

`holywisp_source: npm` (the default) takes `package/bin/linux-x64/holywisp` from
`holywisp@<holywisp_npm_version>` on registry.npmjs.org: an exact version
(`npm view holywisp versions`), a release `X.Y.Z` from holyWisp's `release.yml`
on tag `vX.Y.Z` (0.5.2 = commit 1008eef since 2026-11-10) or a nightly
`0.1.0-nightly.<UTC yyyymmddhhmm>.g<sha>`. `tasks/npm.yml` runs `files/holywisp-npm-fetch.py` on the
controller: the tarball must match the registry's `dist.integrity` (sha512, and
`holywisp_npm_integrity` when pinned), and its provenance must pass
`npm audit signatures` and name `holywisp_npm_provenance_repo` /
`_workflow` / `_ref` and the right commit (a nightly's `.g<sha>`, or the commit
a tag ref names in the repository, via `git ls-remote`). The binary is
cached as `~/.cache/abulxt/holywisp/holywisp-npm-<version>-linux-x64`. Then
`tasks/verify.yml` (both sources) checks it is static x86-64, runs `--version`,
and parses every host's rendered `holywisp.conf` with it, so a binary that lacks
a key the role sets fails on the controller before any host changes. The npm
binary is static against musl, built by zig (clang) at `-O2`, stripped; the
source build is static against glibc, gcc 12 at `-O2`. Same throughput in
the 2026-11-10 comparison; see RUNBOOK "holyWisp binary".

Bump: set `holywisp_npm_version` and `holywisp_npm_integrity` (`npm view
holywisp@<version> dist.integrity`); for a nightly also set
`holywisp_npm_provenance_workflow` to its workflow and
`holywisp_npm_provenance_ref: refs/heads/master`. Then
`ansible-playbook playbooks/edges.yml --tags wisp --check --diff` and
`playbooks/origin.yml --tags wisp --check --diff`. Back to the source build
for one run: add `-e holywisp_source=build` (builds `holywisp_ref` in the
container, as before); to stay there, set `holywisp_source: build` in the role
defaults (or in `host_vars/amph.yml` for amph alone). Either way the role pushes
the binary to `<edge_wisp_dir>/holywisp` and restarts `abulxt-edge-wisp`, nothing
else changes on the hosts.

### Rollback to wispurr

The role leaves the previous relay in place until `edge_wisp_remove_wispurr:
true`: binary `<edge_wisp_dir>/wispurr` (`/opt/abulxt-wisp/wispurr` on the
edges, `/opt/abulxt-wispurr/wispurr` on amph) and config
`/etc/abulxt/wispurr.json`. To go back on one host, edit
`/etc/systemd/system/abulxt-edge-wisp.service`: `ExecStart=<edge_wisp_dir>/wispurr
--config /etc/abulxt/wispurr.json` (amph adds `--host 127.0.0.1`), delete the
sandbox lines below `LimitNOFILE` (wispurr was not tested under them), then
`systemctl daemon-reload && systemctl restart abulxt-edge-wisp`. OpenResty, the
router and the firewall need no change (same port, same unit name). The next
`edges.yml --tags wisp` / `origin.yml --tags wisp` run puts holyWisp back; to
stay on wispurr for longer, check out the pre-holyWisp `edge_wisp` role from git.

### WebTransport certificate

holyWisp's WebTransport listener (udp 443 on the edge, `holywisp_webtransport`) terminates its own
QUIC and TLS, and signs with ECDSA P-256 only. With `holywisp_webtransport_acme` (on for the edges
since 2026-11-18, `group_vars/edge.yml`) it uses a Let's Encrypt certificate of its own for
`holywisp.fracit.al`, so a page calls `new WebTransport("https://holywisp.fracit.al/")` without
`serverCertificateHashes`. Without it, holyWisp makes a self-signed certificate every 6 days and
`/webtransport.json` lists its hashes. Every other edge name gets its auto-ssl certificate, by SNI,
once that certificate is P-256 (`holywisp_webtransport_host_certs`, below).

- **Issuance.** Debian's `certbot` (4.0 on trixie), `certonly --webroot` with `--key-type ecdsa
--elliptic-curve secp256r1`, run once by `roles/edge_wisp/tasks/acme.yml`; renewals are
  `certbot.timer` (twice a day) with the options in `/etc/letsencrypt/renewal/holywisp.fracit.al.conf`.
  No account e-mail and no DNS token: holywisp.fracit.al is DNS-only to public_ip, and http-01
  reaches the edge's OpenResty through divide's tcp 80 DNAT.
- **Tokens.** The `:80` server for `fracital_wisp_hosts` (`fracital-routes.conf.j2`) serves
  `/.well-known/acme-challenge/<token>` from `/var/lib/abulxt-wisp-acme` when that file exists and
  hands every other token to auto-ssl's challenge server, which reads them from Redis as before.
  Only that one server changes; auto-ssl's own issuance and renewals for every other name, and
  for holywisp.fracit.al's TLS on tcp 443, are untouched.
- **Files.** The deploy hook `/etc/letsencrypt/renewal-hooks/deploy/abulxt-wisp-webtransport`
  checks that the key is P-256 and the leaf's (holyWisp does not start on anything else) and
  renames the pair into `/etc/abulxt/webtransport/{cert,key}.pem` (`root:abulxt-wisp`, 0640;
  readable under the unit's `ProtectSystem=strict`). `holywisp.conf` names them only once both
  exist, so a box without the certificate yet keeps the self-signed one.
- **Reload.** holyWisp (at or after cc6782f) re-reads the files once both have stopped changing:
  new sessions get the new certificate, live ones keep theirs, nothing restarts. For an older
  `holywisp_ref`, `holywisp_webtransport_acme_restart: true` makes the hook restart
  `abulxt-edge-wisp` after a renewal instead.
- **Checks in the play.** `/webtransport.json` lists no hash with the certificate and at least
  one without; the play fails when the installed certificate has under 7 days left
  (`holywisp_webtransport_acme_min_days`).

- **The other names (`holywisp_webtransport_host_certs`, on by default with WebTransport).**
  holyWisp's `webtransport-cert-dir` picks the certificate by SNI from
  `/etc/abulxt/webtransport/hosts/<name>.pem` (the chain, leaf first, then the key) and falls back
  to the pair above. `abulxt-wisp-wt-certs.timer` runs `/usr/local/sbin/abulxt-wisp-wt-certs` every
  60 s (`roles/edge_wisp/tasks/webtransport_certs.yml`): it reads every `auto-ssl:<name>:latest`
  from the shared Redis (the settings, password included, in `/etc/abulxt/wisp-wt-certs.json`,
  root 0600), keeps the names whose key is P-256, is the leaf's, and whose leaf has not expired,
  writes each that changed (root:abulxt-wisp 0640, renamed into place) and removes the files of
  names that stopped qualifying. The RSA certificates, issued before 2026-11-16, are skipped
  until auto-ssl renews them; on 2026-11-18 that was 116 of 126 names. A Redis error changes
  nothing. `journalctl -u abulxt-wisp-wt-certs` has one line of counts per run, and
  `abulxt-wisp-wt-certs --dry-run` lists the names it would write. The play runs it once before
  it renders `holywisp.conf` and fails when the directory is still empty.
- **Paths (`holywisp_webtransport_paths`).** `webtransport-path` lines name the CONNECT paths a
  session may open, the same routes OpenResty sends to holyWisp over a WebSocket: abulxt's,
  Fracital's and holyunb's keyed paths and the keyless `/` of `fracital_wisp_hosts`
  (`holywisp_webtransport_path_rules`). They hold the relay keys, so `holywisp.conf` gets no
  `--diff`.

Rollout and rollback: [docs/divide-host.md](../docs/divide-host.md) "Let's Encrypt certificate".

## Hosts (all G-Core Labs AS202422)

Everything is in Ashburn/Manassas, VA since 2026-11-16, when the overseas wisp cloud (iev, mia,
jnb, ams) was dismantled. The same day everything on the Proxmox host meal, terp and holy included,
moved to the Proxmox host **divide** (alias wisp.baby, `divide_public_ip` 91.199.82.174, its only
public address, no public IPv6 for guests). Guests are NATed on divide's `vmbr1` 172.16.5.0/24
(gateway 172.16.5.1) and reached by ProxyJump `root@91.199.82.174`
(`group_vars/divide_guests.yml`). divide DNATs tcp 80/443/8080 + udp 443 to the edge, udp 51820
to wg, tcp+udp 21015-21017,21115 to kn, udp 21100 to kru, udp 4433/8443 and tcp 7778 to
blockshooter, tcp 8443 to terp (dev.fracit.al); its tcp 22 is its own sshd. divide itself (its
nftables, the guest bridge firewall, fail2ban, TCP tuning) is not managed by this repo:
[docs/divide-host.md](../docs/divide-host.md).

| Alias                | What                   | IP                                              | Notes                                                                          |
| -------------------- | ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `amph` (origin)      | CT 213 on divide       | 172.16.5.3 (private only)                       | OpenResty + app (Postgres and Redis on terp.db)                                |
| `edge`               | CT 201 on divide       | 172.16.5.10, public 91.199.82.174 (`public_ip`) | the only edge: abulxt byod, Fracital, wisp.baby (replaced wisp-mnz on meal)    |
| `terp`               | CT 216 on divide       | 172.16.5.62 (private only)                      | Fracital's origin (`[fracital_origin]`), moved from meal                       |
| `kn`, `blockshooter` | CTs 203, 202 on divide | 172.16.5.94, 172.16.5.48                        | KrunkNative and blockshooter game servers, not edges (replaced kn-mnz, bs-mnz) |

See [INVENTORY.md](INVENTORY.md) for the full catalog with geolocations.

## Secrets

This repository is public, so no secret is committed, not even as vault ciphertext. The four
secret files are gitignored and stay **ansible-vault** encrypted on your machine; CI writes
the same files in plain text, in the runner only, from GitHub Actions secrets
(`scripts/write-ci-vars.py`, [CI](../README.md#ci)).

| File (gitignored)                               | Variable                           | GitHub secret                   | What it is                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory/group_vars/all/secrets.yml`          | `byod_token`                       | `BYOD_TOKEN`                    | Shared `X-BYOD-Token` the edges send to amph's origin-internal listener.                                                                                             |
|                                                 | `auto_ssl_redis_password`          | `AUTO_SSL_REDIS_PASSWORD`       | `requirepass` for amph's auto-ssl Redis (only with `shared_redis_on_terp_db: false`), and the seed of `wispstats_client_salt`.                                       |
|                                                 | `shared_redis_password`            | `SHARED_REDIS_PASSWORD`         | `requirepass` for the edges' shared Redis on terp.db (certificates, link routing's `linkroute:v1`); the same value in abulxt's writer config.                        |
|                                                 | `gcore_api_token`                  | `GCORE_API_TOKEN`               | Gcore API token for `dns.yml` (the Gcore rollback zones).                                                                                                            |
|                                                 | `cloudflare_zt_api_token`          | `CLOUDFLARE_ZT_API_TOKEN`       | Cloudflare Account API token `abulxt-gateway-ansible` (Account, Zero Trust, Edit, one account). `gateway_dns` PUTs the DoH source-IP allowlist with it.              |
|                                                 | `shady_relay_password`             | `SHADY_RELAY_PASSWORD`          | RFC 1929 password the edge routers present to amph's `shady-relay` on `:1082` (`/etc/abulxt/edge-router.json` on edges, `/etc/abulxt/shady-relay.json` on amph).     |
|                                                 | `wisp_gate_key`                    | `WISP_GATE_KEY`                 | The keyed `/wisp/<key>/` path segment; same value as `gateKeys.wisp` in amph's abulxt `config.js`.                                                                   |
|                                                 | `vault_holywisp_client_key_master` | `HOLYWISP_CLIENT_KEY_MASTER`    | Master key the per-client holyWisp keys derive from (`roles/edge_wisp`).                                                                                             |
|                                                 | `edge_cloudflared_tunnel_token`    | `EDGE_CLOUDFLARED_TUNNEL_TOKEN` | Token of the Cloudflare Tunnel `divide-edge` (`roles/edge_cloudflared`, `/etc/cloudflared/divide-edge.env` on the edge). Cloudflare can rotate it; then update both. |
| `inventory/group_vars/all/krunkio_secrets.yml`  | `krunkio_origin_token`             | `KRUNKIO_ORIGIN_TOKEN`          | `X-KN-Edge-Token` the edges send to kru; same value as `/etc/krunknative/edge-origin/token` on kru. Rotate both together.                                            |
| `inventory/group_vars/all/fracital_secrets.yml` | `fracital_origin_token`            | `FRACITAL_ORIGIN_TOKEN`         | `X-FRX-Edge-Token`, edges to terp.                                                                                                                                   |
|                                                 | `fracital_wisp_gate_key`           | `FRACITAL_WISP_GATE_KEY`        | Same value as `WISP_GATE_KEY` in terp's `/opt/fracital/repo/.env`. Rotate both together.                                                                             |
|                                                 | `fracital_origin_tls_key`          | `FRACITAL_ORIGIN_TLS_KEY`       | Key of the pinned `roles/edge_relay/files/fracital-origin.crt`.                                                                                                      |
| `inventory/group_vars/all/holyunb_secrets.yml`  | `holyunb_wisp_gate_key`            | `HOLYUNB_WISP_GATE_KEY`         | holyunb.locker's keyed relay path.                                                                                                                                   |
| `inventory/group_vars/all/systemya_secrets.yml` | `systemya_holt_license`            | `SYSTEMYA_HOLT_LICENSE`         | SystemYA's holt license (`X-Holt-License` on systemya.fracit.al `/room/`); its copy is `amph:/root/holt-licenses/systemya.license`.                                  |

`private.example/secrets.yml` shows the shape. Edit a local file with:

```bash
ansible-vault edit inventory/group_vars/all/secrets.yml --vault-password-file ~/.abulxt-vault-pass
```

The vault password file is never committed (`.gitignore` covers `.vault-pass*`). When you
change a value, change its GitHub secret too: `scripts/sync-ci-secrets.sh` reads the local
vault files and sets every secret above without printing a value.

## Private values

Some values are not secret but are kept out of the public repo because publishing them would
undo what they are for: Fracital's cloak decoy names (`fracital_cloak_hosts`; published, they
would tie the decoys to Fracital) and the Cloudflare Zero Trust account and DoH location ids
(`cloudflare_zt_account_id`, `cloudflare_zt_gateway_locations`; a location's DoH subdomain is
all a client needs to use it). They live in the gitignored
`inventory/group_vars/all/private.yml`; `private.example/private.yml` shows the shape, and CI
writes the file from the `ANSIBLE_PRIVATE_VARS` secret. `edge_relay` stops before it renders
anything when the file is missing, because rendering without it would drop the cloak routes.

## Usage

```bash
cd ansible

# 1. Origin first (Redis + firewall + amph Wisp relay): edges depend on the shared store.
ansible-playbook playbooks/origin.yml --vault-password-file ~/.abulxt-vault-pass
#    Relay only (skips Redis/firewall/mc-relay): add --tags wisp
#    estro.help vhost only (conf.d/57-estro.conf): add --tags estro

# 2. All edges (OpenResty install + relay config).
ansible-playbook playbooks/edges.yml --vault-password-file ~/.abulxt-vault-pass

# Or everything at once (origin runs first, then edges).
ansible-playbook playbooks/site.yml --vault-password-file ~/.abulxt-vault-pass

# 3. The byod names are plain Cloudflare records ("Edge DNS"); dns.yml only writes the
#    Gcore rollback copy and, with --tags gateway, the Cloudflare Gateway allowlist.
#    (requires a real gcore_api_token in the vault)
ansible-playbook playbooks/dns.yml --vault-password-file ~/.abulxt-vault-pass
```

Check mode / diff:

```bash
ansible-playbook playbooks/site.yml --check --diff --vault-password-file ~/.abulxt-vault-pass
```

The `edge_wisp` fetch, build and verify steps (`tasks/npm.yml`,
`tasks/build.yml`, `tasks/verify.yml`) run for real in check mode too: they only
touch the controller (npm download or git checkout and container build into
`~/.cache/abulxt/holywisp`) and the rest of the role then diffs against the real
binary path. The npm source needs `python3` and `npm` (>= 9.5) on the
controller; the build source needs a working `podman` or `docker`.

## Deploy user

CI never logs in to amph or terp as root. Each host has an unprivileged `deploy` user
(`roles/deploy_user`, run by `playbooks/origin.yml` and `playbooks/fracital-origin.yml`, tag
`deploy_user`):

- `/home/deploy/.ssh/authorized_keys` is root-owned and lists only the CI keys in
  `deploy_user_keys` (host_vars), each restricted to a forced command: the app's deploy gate.
  deploy cannot loosen its own restrictions.
- `/etc/sudoers.d/deploy` allows exactly the command lines in `deploy_user_sudo_commands`, the
  root half of each app's deploy (unit installs, restarts, health checks, re-owning the trees).
- The gate and root-helper scripts belong to the app repos and are installed by hand from there:
  abulxt `deploy/abulxt-deploy-{gate,root}.sh` and holt `deploy/holt-deploy-{gate,root}.sh` on
  amph, Fracital `deploy/terp-deploy-{gate,root}.sh` on terp.
- deploy owns the code it ships. The app directories are `root:deploy 1775`, so it cannot
  rename or replace root's files there; `config.js` and `.env` stay root 600 and unreadable to it.

The services still run as root, so a deploy still runs the shipped code as root. Moving each
service to its own user is the next step.

## Edge firewall

The edges run abulxt's OpenResty relays and KrunkNative's game servers, so their host
firewall is a shared contract, **edge-firewall-contract v1**, implemented by one role.

**`roles/edge_firewall` is vendored**: the same role ships byte-identical in abulxt and KrunkNative
(here at `ansible/roles/edge_firewall`, in KrunkNative at `deploy/ansible/roles/edge_firewall`). Never edit one copy alone: change both repos
together, re-stamp with `roles/edge_firewall/check-vendored.sh --stamp` (rewrites `VERSION`:
contract version + sha256 of the role), then check both copies:

```sh
roles/edge_firewall/check-vendored.sh ~/src/KrunkNative/deploy/ansible/roles/edge_firewall
```

Both repos call the role the same way: directly from their playbooks (`firewall.yml` alone,
and their full edge play with tag `firewall`), with all inputs in group_vars, the same
`edge_firewall_*` variables in the same order (this repo: `inventory/group_vars/edge.yml`):

- `edge_firewall_own_base`: render the base `/etc/nftables.conf`. Exactly one repo sets true
  (now abulxt). Base: `flush ruleset`; `table inet filter` with interval sets `tcp_accept` /
  `udp_accept`; input policy drop (lo, established/related, icmp + ipv6-icmp, tcp
  `edge_firewall_ssh_port` 22, `@tcp_accept`, `@udp_accept`); forward drop; output accept;
  then `include "/etc/nftables.d/*.nft"`. `edge_firewall_owner` fills its `# Owner:` line.
- `edge_firewall_dropins`: this repo's drop-in, `{name, priority, source, comment, tcp,
udp}`, rendered to `/etc/nftables.d/<priority>-<name>.nft`; it only adds elements to the
  two sets. abulxt: `50-abulxt.nft` (tcp 80/443/8080, udp 443). KrunkNative:
  `60-krunknative.nft` (game ports 21015..21015+count-1, tcp and udp). Port lists must not
  overlap between repos (nft 0.9.8 on santaclara/clara rejects duplicate interval elements);
  an empty list renders no line.
- `edge_firewall_manage` (role off when false), `edge_firewall_ssh_port`,
  `edge_firewall_rollback_seconds`.

This repo: holyWisp `:6001` (proxied over loopback) and ntp `:123` are deliberately not open;
nothing on the edges forwards (`ip_forward=0`, no docker/wireguard). A new public abulxt port
goes into the abulxt entry of `edge_firewall_dropins`.

Safe apply (`roles/edge_firewall/tasks/apply.yml`), only when a rendered file changed: the files are
tarred to `/etc/nftables.rollback.tgz` before rendering; `nft -c -f /etc/nftables.conf` (on
failure the files are restored and the play fails); the live ruleset is saved to
`/etc/nftables.rollback.nft`; a transient `edge-firewall-rollback.timer` is armed (120 s)
that reloads it and restores the files; nftables is enabled and reloaded; the SSH
ControlMaster is dropped and Ansible logs in again on a fresh connection; the timer is
disarmed. If the fresh login fails the play fails and the timer rolls back. Each base render
also leaves a timestamped `/etc/nftables.conf.<pid>.<date>@<time>~`.

One firewall command per repo (from `ansible/`; add `--check --diff` first, and
`--limit <host>` to go one host at a time):

| repo        | command                                                                |
| ----------- | ---------------------------------------------------------------------- |
| abulxt      | `ansible-playbook playbooks/firewall.yml --vault-password-file <file>` |
| KrunkNative | `ansible-playbook firewall.yml`                                        |

### Handover (who owns the base)

Exactly one repo has `edge_firewall_own_base: true` (now abulxt). To move the base, change
both repos in the same change window (abulxt `inventory/group_vars/edge.yml`, KrunkNative
`group_vars/edges/main.yml`):

1. New owner `edge_firewall_own_base: true`, old owner `edge_firewall_own_base: false`.
2. New owner's firewall command with `--check --diff`: only the base's `# Owner:` line
   changes. Then run it (same rules, so the reload changes no traffic).
3. Old owner's firewall command with `--check --diff` must show no change, then run it (it
   now manages only its drop-in).

Never let both repos own the base at the same time (they would fight over the `# Owner:`
line).

## fail2ban

Every host of both repos (the four edges, amph, kru) runs fail2ban under one shared contract,
**fail2ban-contract v1**, implemented by one role. **`roles/fail2ban` is vendored** exactly like
`roles/edge_firewall`: byte-identical here and in KrunkNative (`deploy/ansible/roles/fail2ban` there),
re-stamped with `roles/fail2ban/check-vendored.sh --stamp` after an edit, then checked:

```sh
roles/fail2ban/check-vendored.sh ~/src/KrunkNative/deploy/ansible/roles/fail2ban
```

Per host exactly one repo owns the base (`fail2ban_own_base: true`): abulxt on the edges and
amph, KrunkNative on kru. Both repos set the same `fail2ban_*` variables in the same order
(this repo: `inventory/group_vars/abulxt.yml`; sshd settings in `inventory/group_vars/edge.yml`, retired files in `inventory/host_vars/amph.yml`), and keep `fail2ban_ignoreip` identical.

- Base (owner only): `/etc/fail2ban/jail.local` with `[DEFAULT]` ignoreip (127.0.0.1/8, ::1,
  `fail2ban_ignoreip`, the host's own addresses, optionally GitHub's Actions ranges), backend
  systemd, ban actions `nftables[type=multiport]` / `nftables[type=allports]`,
  `bantime.increment` (each repeat ban doubles, capped at `fail2ban_bantime_maxtime` 1w);
  `[sshd]` (mode normal, port 22, journalmatch for ssh.service / sshd / sshd-session, 5
  failures in 10m = 1h ban); `[recidive]` (5 bans in 1d = every TCP port for 1w).
  `fail2ban.d/50-fail2ban-contract.local` (`dbpurgeage` 8d, longer than any ban, so a restart
  keeps them), the nftables.service hook below, the optional sshd drop-in, the packages
  (fail2ban, python3-systemd, nftables for the `nft` binary: Debian never enables
  nftables.service on install and the role never does) and `fail2ban_retire_files`.
- Drop-ins (every repo): `fail2ban_dropins` entries `{name, priority, source, comment,
filters, jails}` render `/etc/fail2ban/jail.d/<priority>-<name>.local` (+
  `filter.d/<name>-<filter>.conf`). Jails inherit ignoreip, ban action and times from the
  base and never redefine sshd or recidive. Today neither repo has one: no HTTP jails, because
  edge clients share school and carrier NAT addresses, and amph's HTTP arrives via Cloudflare
  and the edges. A non-owner run on a host without fail2ban only prints a note.
- `fail2ban_sshd_settings` (owner only, `{}` = none): `/etc/ssh/sshd_config.d/10-fail2ban-contract.conf`.
  sshd keeps the first value it reads, so it beats `sshd_config` and `11-*`..`99-*`, not `00-*`.
  Edges and kru: `MaxStartups 50:30:200` (scanners filled 10:30:100 and sshd dropped CI's
  connections) and `LoginGraceTime 30`. amph: none.

**Firewall coexistence.** Bans live in fail2ban's own nftables table `inet f2b-table` (hook
input, priority -1), which runs before edge_firewall's `inet filter` and iptables-nft (both
priority 0), whatever those accept. The edge_firewall base starts with `flush ruleset`, which
drops that table and its bans; the base's `/etc/systemd/system/nftables.service.d/50-fail2ban-contract.conf`
(`ExecReload=` / `ExecStartPost=` `systemctl --no-block try-restart fail2ban`) restarts fail2ban
after every load, and fail2ban restores the bans from its database. The edge_firewall rollback
(`nft -f /etc/nftables.rollback.nft`) puts the table back as snapshotted (it is part of
`nft list ruleset`; `nft -c` accepts it on nft 0.9.8 and 1.1.3). After any other flush,
fail2ban's next ban fails `actioncheck`, recreates the table and re-bans. edge_firewall itself
is unchanged.

**Lockout.** ignoreip covers the admin workstation's egress, divide (91.199.82.174; amph and kru are on its private vmbr1), the edges, the private ranges and each host's own
addresses. CI logs in with keys: in mode normal, key logins, pre-auth closes and MaxStartups
drops never count as failures, so GitHub's runners are not listed.
`fail2ban_ignoreip_github_actions: true` adds api.github.com/meta "actions" (about 7000
CIDRs, fetched on the controller with its `GITHUB_TOKEN` if set, since anonymous requests are
limited to 60/hour; fail2ban restarts whenever GitHub edits the list); turn it on before
`fail2ban_sshd_mode: aggressive`, which also counts pre-auth closes. recidive blocks every
TCP port of an address, the web and game ports included. Unban: `fail2ban-client unban <ip>`.

Safe apply, only when a rendered file changed: `/etc/fail2ban` is tarred to
`/etc/fail2ban.rollback.tgz` before rendering; `fail2ban-client -t` (on failure the files are
restored, a running fail2ban keeps its config, the play fails); then the owner restarts
fail2ban (a non-owner reloads it) and `fail2ban-client status sshd` must answer. The sshd
drop-in: `sshd -t`, a transient `fail2ban-sshd-rollback.timer` (120 s) that restores the
previous file, `systemctl reload ssh` (open sessions stay), a fresh SSH login, disarm.

One fail2ban command per repo (from `ansible/`; add `--check --diff` first, and
`--limit <host>` to go one host at a time):

| repo        | command                                                                |
| ----------- | ---------------------------------------------------------------------- |
| abulxt      | `ansible-playbook playbooks/fail2ban.yml --vault-password-file <file>` |
| KrunkNative | `ansible-playbook fail2ban.yml`                                        |

Handover of a host's base works like the firewall's (above): flip `fail2ban_own_base` in both
repos together, run the new owner first (only `# Owner:` lines change), then the old owner
(no change).

This repo only: `fail2ban/` (install.sh, iptables actions, the Cloudflare register
jail) is the hand-run predecessor on amph. Its iptables bans never applied there (the `f2b-*`
jumps sat after `ABULXT_INPUT`, which accepts tcp/22 and drops everything else); the role's
first run on amph replaces its jail.local and retires the register jail. Do not run install.sh
again: it would overwrite the base.

## krunk.io routes

KrunkNative's web services leave Cloudflare's proxy and tunnel for this fleet. `assets.`,
`coordinator.`, `matchmaker.` and `play.krunk.io` are DNS-only CNAMEs to
`byod.abstracteducation.loan`, so they resolve to wisp-mnz's abstract addresses ([Edge DNS](#edge-dns)). `edge_relay` renders
`conf.d/20-krunkio.conf` + `snippets/krunkio-origin.conf` when `krunkio_enabled` is true
(`inventory/group_vars/edge.yml`; false removes them again). Not included: the game servers
`<edge>-<n>.krunk.io` (A records straight to the edges, tcp/udp 21015.., KrunkNative's firewall
drop-in) and the front end `krunk.io`/`www.` (GitHub Pages).

- **Path.** Host-specific server blocks (like the mc routes) win over the byod catch-all, so
  these names never reach amph. They proxy to kru's `172.16.5.47:443`. kru and the edge are
  both guests on divide's vmbr1, so this stays on the bridge; there is no
  tunnel, WireGuard or extra port. `upstream krunkio_origin` keeps 32 idle connections per worker.
- **Origin authentication.** TLS to kru with `proxy_ssl_verify` against the pinned
  self-signed certificate `roles/edge_relay/files/krunkio-origin.crt` (SNI `kn-origin.krunk.io`;
  the private key never leaves kru), plus `X-KN-Edge-Token` (`krunkio_origin_token`). kru also
  only accepts the edge's address: its `krunknative-edge-origin.conf` allowlist has
  `allow 172.16.5.10;  # divide edge CT 201` (KrunkNative's repo owns that file; the old edge
  /24s are obsolete). A wrong pin is a 502 at the edge.
- **dl.krunk.io** (`krunkio_direct_hosts`, client downloads) is an A record (DNS only) to
  divide's 91.199.82.174. kru serves it with its own vhost and certificate, so the edge proxies it
  to `https://172.16.5.47` with `proxy_ssl_name dl.krunk.io` (no pin, no token); it is in the
  locally approved names like the four above.
- **Client address.** `X-Real-IP` / `X-Forwarded-For` = `$remote_addr` (already rewritten by the
  Cloudflare realip rule if a CF range relayed the request); kru trusts them only after the token
  check. A client's own `X-Real-IP`, `CF-Connecting-IP` or token header never passes.
- **WebSockets** (`play.` net-bridge `/native`, `coordinator.` incl. the game servers'
  `/mm/internal/ws`): `$ws_upgrade` + `$krunkio_connection`, 1 day timeouts, no buffering.
- **Assets.** `assets.` is cached per edge (`krunkio_cache_*`, `/var/cache/openresty/krunkio`,
  8 GB max). Only what kru marks cacheable is stored (`?v=` assets and `/updates/` objects are
  immutable for a year; unversioned assets and the update manifests are `no-cache` and go to kru
  every time), so a deploy never needs a purge. Range requests are answered from the cache;
  `/updates/client/builds/` (packages of tens of MB) is fetched in 4 MB slices. kru is asked for
  identity encoding; the edge gzips text itself. `X-Cache-Status` shows HIT/MISS. CORS
  (`Access-Control-Allow-Origin: *`, preflight, exposed `Content-Range`) comes from kru.
- **Certificates.** On demand like every byod name (shared Redis), but `krunkio_tls_local_approve`
  approves these names in the edge's `allow_domain` without asking amph's validator, so a
  name gets its certificate on the first handshake after its CNAME flip (the validator's DNS
  check would lag by the resolver TTL). Never send one of these SNIs to an edge before the name
  points at the fleet (test with `-H Host:` over the byod SNI instead): the http-01 check would
  fail, and five failures an hour block the name at Let's Encrypt.
- **Availability.** These names now depend on the edge fleet, terp.db's shared Redis (certificates) and
  kru. The edge nameservers' health checks only cover the byod names, not the edges' reach to kru.

Rollback: `krunkio_enabled: false` and `playbooks/edges.yml --tags relay`; the DNS records go
back to the Cloudflare tunnel (KrunkNative `ansible/README.md` "Edge origin").

## Fracital routes

Fracital (`github.com/NovaAppsInc/Fracital`, one Node server on terp `172.16.5.62`, pm2
`fracital` on `:8080`) uses the fleet as its edge. Inputs: `inventory/group_vars/all/fracital.yml`.

```
client -> Cloudflare (proxied CNAME -> byod.abstracteducation.loan, SSL Full) -> edge :443
  /pipe/<WISP_GATE_KEY>/  -> this edge's holyWisp (127.0.0.1:6001), same relay abulxt uses
  /pipe/<anything else>   -> 403 on the edge
  everything else         -> https://terp:443 (pinned cert, X-FRX-Edge-Token) -> OpenResty -> :8080

holywisp.fracit.al (fracital_wisp_hosts) -> edge :443
  GET /                   -> the placeholder page (files/placeholder.html); a WebSocket upgrade on / is
                             the relay itself (wss://holywisp.fracit.al/, the public endpoint, no key)
  /pipe/<WISP_GATE_KEY>/  -> this edge's holyWisp, as above
  GET /health             -> holyWisp's /health ({"status":"ok"}); monitoring target
  GET /webtransport.json  -> holyWisp's WebTransport URL and certificate hashes, no-store
                             (holywisp_webtransport; the session is udp 443 straight to holyWisp;
                             no hashes with holywisp_webtransport_acme)
  :80 /.well-known/acme-challenge/ -> a certbot token file for the WebTransport certificate
                             (holywisp_webtransport_acme), else auto-ssl's tokens from Redis
  everything else         -> 403 on the edge (no terp, no /stats)
```

- **Names.** `fracital_hosts` (apex; `www.` is added). Both direct hosts (`fracit.al`,
  `fracital.xyz`) and the cloak domains. A new cloak domain: add it here, run
  `playbooks/edges.yml --tags relay`, then repoint DNS. With `link_routes_replace_static` the
  lists leave the edge config and a new name is registered in the bot instead
  ([Link routing](#replacing-the-static-lists)). No terp change is needed (terp's
  vhost is a catch-all; Fracital picks the decoy by `Host`, after a restart for new folders).
- **Certificates.** Proxied CNAMEs resolve to Cloudflare, so the validator's DNS match can never
  approve them: the edge's `allow_domain` approves `fracital_server_names` locally. LE's http-01
  arrives through Cloudflare on :80 or :443; both answer from the shared Redis. SSL mode Full
  (not strict) also accepts the fallback cert, so a failed issuance does not take a site down.
- **Relay.** The edge's own holyWisp serves the keyed path, so Fracital's relay traffic never
  reaches terp. `fracital_wisp_hosts` are extra names for the same relay (certificates approved
  locally like the app names) that expose only the placeholder page and the keyless relay on `/`,
  the keyed path and `GET /health`. The client builds the relay URL from `location.origin` + the path terp injects
  (`window.__FRX_CFG__`), so it lands on whichever edge served the page. Key =
  `fracital_wisp_gate_key` = terp's `WISP_GATE_KEY`; segment `fracital_wisp_path` (`pipe`).
- **terp** (`fracital_origin`, `playbooks/fracital-origin.yml`). OpenResty (pinned bookworm
  .debs, as on the Debian 13 edges) replaces the hand-made nginx site; nginx is stopped and
  disabled, not removed. `:443` is the edge listener: pinned cert, `X-FRX-Edge-Token` checked,
  then stripped; `X-Real-IP` comes from the edge. Its default server proxies to the app named in
  `X-FRX-App` (a `fracital_origin_apps` name; anything else is Fracital), which only the edge's
  link routing sets ([Link routing](#link-routing)). The edge reaches terp on its private
  `172.16.5.62` (`fracital_origin_ip`), and ufw admits `:443` and `:8443` only from
  `fracital_edge_subnets` (each edge's `edge_origin_source`, else `edge_subnet`: `172.16.5.10/32`
  since the move to divide; the old public-IP edge ranges are obsolete, delete their leftover
  `abulxt edge` rules by hand). While `fracital_origin_allow_cloudflare` is true, the old
  Cloudflare-only `:80` vhost and its ufw rules stay, so un-migrated names keep working.
  The cutover stops nginx, starts OpenResty, health-checks both paths and puts nginx back on
  failure.
- **dev.fracit.al** does not go through the edge. A Cloudflare origin rule sends it to port 8443;
  divide DNATs tcp 8443 to terp `172.16.5.62:8443` ([docs/divide-host.md](../docs/divide-host.md)).
  terp's ufw admits `:8443` only from Cloudflare's ranges (`fracital_cloudflare_ports`, rules
  commented `Cloudflare dev`, kept when `fracital_origin_allow_cloudflare` is false) and the edge.
- **DNS** (cloaks-fracital `.agents/skills/cloak-domain-hunter/cloudflare`):
  `npm run point-edge -- [--apply] <domain>...` sets apex + www to a proxied CNAME to
  `byod.fracit.al` (replacing terp's A records or the Pages CNAMEs) and SSL Full.
  Dry run without `--apply`. `byod.fracit.al` is Fracital's own round-robin over half the
  fleet's addresses (see [Two byod names](#two-byod-names)); the edge serves it like an app
  name (relayed to terp, certificate approved locally) so the edge nameservers' health check gets
  a real certificate and a 200.

Order:

1. `playbooks/fracital-origin.yml` (`--check --diff` first). terp now runs OpenResty.
2. `playbooks/edges.yml --tags relay`. Test each edge before DNS moves with the Host header
   only: `curl -sk -H 'Host: fracit.al' https://<edge-ip>/`. Never send a Fracital SNI
   (`--resolve`) before DNS points at the fleet: the edge approves these names locally, the
   http-01 check would fail, and five failures an hour block the name at Let's Encrypt.
3. `npm run point-edge -- --apply <domains>`.
4. Once every name is on the edges: `fracital_origin_allow_cloudflare: false`, rerun
   `playbooks/fracital-origin.yml`. terp's `:80` vhost and the `# Cloudflare` ufw rules go;
   only ssh and the edges reach it.

Status: live since 2026-11-06, all 17 names on the edges and `fracital_origin_allow_cloudflare: false`.
Since 2026-11-08 the names CNAME to `byod.fracit.al` (Fracital's half of the fleet) instead of
`byod.abstracteducation.loan`.
Pre-cutover backups: terp `/root/pre-openresty-20261106005542` (nginx, ufw, ruleset); the Cloudflare
records and SSL modes are in `~/.local/state/fracital-edge/cf-dns-before-*.json` on the admin workstation.

Rollback: set `fracital_origin_allow_cloudflare: true` and rerun step 1 (restores terp's `:80` vhost but
not the Cloudflare ufw rules: re-add them from the backup's `ufw-status.txt`), then DNS back to
`A 5.188.124.62` (proxied, SSL Flexible); `fracital_enabled: false` + `--tags relay` removes the edge routes; on terp
`systemctl disable --now openresty && systemctl enable --now nginx` restores the old site.
The edge nameservers' health checks go through the edges' relay; a relay to terp that is down drops
the Fracital addresses from DNS like any other failure.

## holyunb routes

Holy Unblocker (`holyunb.locker`, website2 on `holy`, VM 110 on run) uses the wisp boxes' holyWisp
as its relay since 2026-11-14; holy runs no Wisp of its own.

- **Path.** Cloudflare (zone in the abulxt account, SSL mode full): `holyunb.locker` is a proxied
  CNAME to `wisp.baby`, so Cloudflare connects to the nearest wisp box. `conf.d/35-holyunb.conf`
  (wisp boxes only, `holyunb_on`) relays `/wisp/<holyunb_wisp_gate_key>/` to the box's holyWisp and
  everything else to `http://172.16.5.79:8080` (`holyunb_origin_*`, holy's private address), with the end client in
  `X-Real-IP`, `X-Forwarded-For` and `CF-Connecting-IP`. A wrong key on `/wisp/` is a 403 at the edge.
- **Client.** holy's `/home/holy/website2/config/config.js` has
  `separateWispServer: "wss://holyunb.locker/wisp/<key>/"`, which also stops website2 starting
  mrrowisp. The config is bundled into `dist/server`, so a change there needs `npm run build` and
  `pm2 restart holy` (as user `holy`).
- **Secret.** `holyunb_wisp_gate_key` in `inventory/group_vars/all/holyunb_secrets.yml` (vault); rotate
  it together with holy's config.js.
- **Certificates.** Approved on the edge itself (`allow_domain` in nginx.conf), like Fracital's: a
  proxied name resolves to Cloudflare, so the validator's DNS match can't approve it.
- **Stats.** Sessions on the keyed path count as `holyunb`, labelled "Holy Unblocker"
  (`config.wispStats.domains`).

Rollback: point the `holyunb.locker` record back at holy's Cloudflare tunnel
(`<tunnel id>.cfargotunnel.com`, proxied) and remove `separateWispServer` from holy's config.js
(rebuild, restart). `holyunb_enabled: false` and `playbooks/wisp.yml --tags relay` drop the routes.

## Link routing

Staff register a domain in abulxt's Discord bot and pick the site it leads to. The edge's `:443`
default server (`00-edge-relay.conf`, the catch-all for every Host without a server block of its
own) looks the Host up and proxies it there. Inputs: `link_routes_*` in
`roles/edge_relay/defaults/main.yml`, switched on in `inventory/group_vars/edge.yml`. Code:
`roles/edge_relay/files/link_routes.lua` (tests: `roles/edge_relay/tests/link_routes_test.lua`).

| Answer     | Where it goes                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `abstract` | `@link_abstract`: amph `:9080` with `X-BYOD-Token`, the same proxy as before, `www.` still redirected to the apex                  |
| `fracital` | `@link_fracital`: terp, as `30-fracital.conf`'s `location /` (pinned TLS, `X-FRX-Edge-Token`, `/ads.txt` to rev.iq); bundles below |
| `stomp`    | the same, with `X-FRX-App: stomp`, which terp's default server routes to the stomp app (`fracital_origin_apps`)                    |
| `holy`     | `@link_holy`: holy `172.16.5.79:8080`, as `35-holyunb.conf`'s `location /`                                                         |
| `holywisp` | `@link_holywisp`: the placeholder page (`files/placeholder.html`, "Nothing is set up here yet."), any path, `no-store`             |

- **Contract.** The edges' shared Redis (`edge_redis_host`: terp.db, see below), hash
  `linkroute:v1`. Field: the domain, lowercase, punycode, no trailing dot, no leading `www.`.
  Value: `fracital`, `stomp`, `abstract` or `holy`. An entry covers the domain and every name under
  it, and the longest match wins. Field `__ready` is the unix time of the bot's last full sync
  (every 60 s). abulxt's bot is the only writer. `holywisp` is never stored.
- **Lookup.** One `HMGET linkroute:v1 __ready <name> <parent>...` (200 ms timeouts, pooled
  connections). The answer is cached in `lua_shared_dict link_routes` for 30 s
  (`link_routes_fresh_ttl`), so a fresh hit costs no Redis call and a change in the bot reaches
  the edge within 30 s, and kept 24 h as a stale copy (`link_routes_stale_ttl`). No entry:
  `link_routes_default_site` (`holywisp`, the placeholder), so a domain shows nothing until staff
  register it.
- **Failure.** Redis unreachable, or no `__ready` (the hash is gone): the stale copy answers, else
  `link_routes_unavailable_site` (`abstract`, the edge's behaviour before link routing). Such an
  answer is reused for 5 s (`link_routes_retry_ttl`) and never replaces the stale copy; when Redis
  does not answer it is skipped for 2 s. One warning a minute in the error log (`link_routes: ...`).
  A reload keeps the cache; a restart during an outage sends every name without a fresh entry to
  amph.
- **Equal to the sites' own server blocks.** Their keyed relay paths are in the default server
  (`/pipe/<fracital_wisp_gate_key>/`, `/wisp/<holyunb_wisp_gate_key>/`, to the edge's holyWisp,
  stats tags `fracital` and `holyunb`); a wrong key under `/pipe/` (fracital, stomp) or `/wisp/`
  (holy) is a 403; ACME http-01 over `:443` is answered from the shared Redis; Fracital bundles
  matching `fracital_asset_regex` go to `@link_fracital_assets`, which caches them for the Fracital
  app names only (`$fracital_asset_skip`), as `30-fracital.conf` does. abulxt's HSTS and other
  server-level headers stay on abulxt's answers, and only abulxt's names have `www.` redirected to
  the apex (on `:80` too). Each site keeps its body size limit: `location /` allows the largest
  (`link_routes_body_max`) and `link_routes.lua` refuses a `Content-Length` over the site's own with
  a 413; a chunked body is held to the named location's `client_max_body_size`. stomp's own relay
  is the app's same-origin `/wisp/`, which goes to terp.
- **X-FRX-App.** Set or removed by `link_routes.lua` for every request it sends to terp, and
  cleared in every static Fracital location, so a client's copy never reaches terp; terp reads it
  only after the token check.
- **Disabled targets.** A site's named location exists only when its routes do
  (`fracital_enabled`; `holyunb_on`; stomp also needs a `fracital_origin_apps` entry named
  `stomp`). An answer for a site that is off is served by amph.
- **Certificates.** A registered name gets its certificate through amph's validator (`/ask`),
  which approves the names the bot registered. `allow_domain` in nginx.conf needs no change.
- **Existing domains.** Before the switch the bot seeds every name with an edge certificate as
  `abstract`. A Host that relied on the catch-all and is missing from the table (a new abulxt BYOD
  name, estro.help if the seed missed it) shows the placeholder until it is registered.
- **holywisp.fracit.al** shows the same placeholder on a plain `GET /` (holyWisp's web client is
  not published any more). A WebSocket upgrade on `/` is still the keyless relay, the keyed path and
  `GET /health` are unchanged.

### Replacing the static lists

`link_routes_replace_static: true` takes these names out of the static server blocks and their
local certificate approval, so they reach their site through the default server like any
registered name. Import each list into `linkroute:v1` first, with the site shown (apex only: an
entry covers `www.` and every subdomain):

| Variable                                      | Site       |
| --------------------------------------------- | ---------- |
| `fracital_direct_hosts` (`all/fracital.yml`)  | `fracital` |
| `fracital_cloak_hosts` (private.yml, private) | `fracital` |
| `fracital_extra_hosts` (`stomp.fracit.al`)    | `stomp`    |
| `holyunb_hosts` (`all/holyunb.yml`)           | `holy`     |

What stays static, and why:

- `holywisp.fracit.al` (`fracital_wisp_hosts`): its own server (placeholder, keyless relay,
  `/health`, 403 elsewhere), not the Fracital app. `byod.fracit.al`: the app server keeps it, so
  the app server, its maps and `30-fracital.conf` stay. wisp.baby, krunk.io, blockshooter, the mc
  names and the ACME forwards keep their own servers.
- The upstreams, `$fracital_connection`, `$holyunb_connection`, `$fracital_asset_skip` (still keyed
  on `fracital_hosts`, which keeps the bundle cache for the Fracital names) and the cache zone stay
  in `30-fracital.conf` and `35-holyunb.conf`, which `@link_*` use.
- A `fracital_extra_hosts` name that is not a stomp host (`fracital_origin_apps`) keeps its static
  entry: the table has no way to name another terp app.

Differences that remain with the flag on: during a Redis outage with no stale copy (a restart in
the outage) these names go to amph, not their site; and their certificates depend on amph's
validator approving registered names. Rollback: the flag back to false and `--tags relay`.

Ship (link routing and the Redis move): RUNBOOK.md "Shared Redis on terp.db" and "Link routing".
Rollback: `link_routes_enabled: false` and `--tags relay`; every unknown Host goes to amph again.

## OpenResty user and sandbox

Every OpenResty this repo runs (the edge, amph, terp) starts its workers as `openresty:openresty`,
a system user with no shell or home (`openresty_user`, `group_vars/all`), not Debian's shared
`www-data`. The master stays root to bind :80/:443 and read the keys. `roles/openresty`
`tasks/isolation.yml` owns it, included by `roles/openresty` (the edge), `fracital_origin` (terp)
and `abulxt_origin` (amph, whose `nginx.conf` comes from abulxt's `deploy/openresty`):

- the user and group;
- `/etc/systemd/system/openresty.service.d/50-hardening.conf` (`openresty_hardening`): the whole
  service, master included, in a systemd sandbox. `/usr` and `/etc` are read-only except
  `openresty_rw_paths` (logs, temp dirs, `/etc/resty-auto-ssl`), `/home` and `/root` are hidden,
  `/tmp` is its own (sockproc's socket included), no new privileges, and the capability bounding
  set is what the master needs (bind, setuid/setgid, chown, read root's files, signal workers);
- the handler `restart openresty isolated`, when the user or the sandbox changes: it gives the
  trees the workers write (`openresty_worker_paths`: auto-ssl's certificates and ACME state, the
  proxy caches, the temp dirs) to `openresty` with nothing for others, checks the config and
  restarts once (the sandbox only applies to a new process). If openresty does not come back in
  the sandbox, the drop-in goes and it starts without it, and the play fails.

The static sites need nothing from it: their trees are world-readable (`edge_static`). Switched on
2026-11-18 (all three restarted once). A path the workers must write somewhere else needs a line in
`openresty_rw_paths` and, if they own it, `openresty_worker_paths`.

## OpenResty packages on Debian 13

Debian 13's apt refuses openresty.org's repository (its `sqv` rejects the SHA1 key binding), so a
host with `openresty_install_method: debs` (the edge, amph and terp) gets the bookworm `.debs` from
`roles/openresty` `tasks/debs.yml` instead (amph and terp through `abulxt_origin` and
`fracital_origin`, which include it first and flush the binary swap before they render anything), checked the way apt would: `files/openresty-debs`
verifies `InRelease` with `gpgv` against the pinned key (`openresty_signing_key_fpr`), `Packages`
against `InRelease`'s SHA256 and each `.deb` against `Packages`. Every run installs whatever the
repository has newer than the host (`openresty_debs`: openresty and its openssl3, pcre2 and zlib),
so applying the role is how the edge stays current.

A new binary or library goes in without a restart. `dpkg -i` leaves the running service alone
(the package's postinst only starts a stopped one, and a `policy-rc.d` refuses even that during the
transaction; `--force-confold` keeps `nginx.conf`, one of its conffiles), then the handler `upgrade openresty binary` runs `files/openresty-binary-upgrade`:
`nginx -t`, SIGUSR2 to the master, and once the new master and its workers are up, SIGQUIT to the
old one, whose workers finish their connections (WebSockets included) while the new ones take every
new connection. systemd follows the new master through the PID file. If the new master does not come
up, the old one keeps serving and the play fails.

`openresty_min_version` (dpkg order) is the oldest `openresty` a host may keep. When neither the
host nor the repository has it, the role installs `openresty_local_debs`, paths on the controller
to a build from `openresty-build/` (`-e '{"openresty_local_debs": ["/path/openresty_...deb"]}'`),
and fails without them. The edge, amph and terp hold `openresty_http2_fixed_version`, so a CI apply leaves their
build alone and moves to openresty.org's own fixed release when that appears.

### nginx2root and HTTP/2

nginx2root (CVE-2026-123007, an HTTP/2 flow-control underflow, RCE with HTTP/2 on; CVE-2026-123633,
an HTTP/2 use-after-free when proxying) is in nginx 1.9.5 to 1.31.8. nginx fixed it in 1.31.9 and
1.30.7 on 2026-11-18; OpenResty had no fixed release (openresty/openresty#1166), so HTTP/2 went
off everywhere (`openresty_http2: false`, group_vars/all). On 2026-11-19 the edge moved to
OpenResty 1.31.8.1 rebuilt with nginx 1.31.9's changes (`openresty-build/`, package version
`1.31.8.1-1~bookworm1+nginx2root1`) and turned HTTP/2 back on in `host_vars/edge.yml`. The role
refuses to run with `openresty_http2` on and an older package. amph and terp followed the same day
(04:47 and 04:51 UTC, `playbooks/origin.yml --tags origin` and `playbooks/fracital-origin.yml
--tags origin` with the build as `openresty_local_debs`), HTTP/2 on in their host_vars, in abulxt's
`deploy/openresty` and in terp's hand-managed `20-fracital-dev.conf`. Each host keeps the old
packages and a tarball of `/usr/local/openresty` in `/root/openresty-rollback/` (`ROLLBACK.txt`
there, RUNBOOK.md "Rollback"). HTTP/3 stays out of OpenResty (CVE-2026-121810 needs `quic`):
holyWisp answers udp 443, and no server block sends `Alt-Svc`.

## Internal HTTP front

`edge_relay` `templates/front.conf.j2` (`conf.d/02-front.conf`; `edge_front_*` in group_vars/all and edge_relay's defaults): a
plain-HTTP listener on the edge for holyWisp's coming HTTP/3 front, `172.16.5.10:8088` since
2026-11-19 (`host_vars/edge.yml`). holyWisp would terminate QUIC on udp 443 and hand each request
here as HTTP/1.1, the client's address in `X-Forwarded-For` (its last entry) or `X-Real-IP`.
Nothing is wired to it yet.

- **Who may connect.** `allow` for `edge_front_peers` (`172.16.5.10`, the edge itself, where
  holyWisp runs), `deny all` for the rest. Nothing outside reaches it anyway: divide DNATs only
  tcp 53/80/443/8080 to the edge, and the edge's guest firewall (`201.fw`) admits no 8088 from the
  other guests (`docs/divide-host.md`).
- **Same server blocks.** The front proxies every request, Host unchanged, to a unix socket
  (`edge_front_socket`, `/run/openresty/front/vhosts.sock`) that every :443 server block also
  listens on (the catch-all as its default), so the caches, Lua, wisp stats, flood guard and link
  routing are the ones :443 runs. WebSockets pass (Upgrade only when asked); bodies and responses
  stream (no buffering on the front).
- **Client address.** The front sends the client as `CF-Connecting-IP`, which `nginx.conf`'s
  realip believes from `unix:` (and Cloudflare's ranges) only. The socket's directory is
  `root:openresty` 0750, made at each start by the drop-in `60-front-socket.conf` (it is under
  the service's RuntimeDirectory, so no stale socket survives a stop), so no other local process
  can connect and claim an address. realip is not used on the front itself: it would make
  `allow`/`deny` judge the forwarded address instead of the peer.
- **Scheme.** Over the socket `$scheme` is `http`. `$edge_scheme` (`nginx.conf`) says `https` there
  for the origins' `X-Forwarded-Proto`, and the front turns `http://<host>/` redirects nginx builds
  itself back into `https://`.

## Flood guard

The edge, not the origin, sheds HTTP floods: it is where the clients connect, and a request it
refuses never costs amph a connection. `roles/edge_relay` renders `conf.d/01-flood-guard.conf`
(maps and `limit_req` zones) and applies it at the top of the :443 default server, before link
routing. Only the names in `edge_flood_guard_hosts` (and their `www.`) are guarded:

- a POST with neither Referer nor Origin gets 403 (`edge_flood_guard_block_bare_post`), and so
  does a POST to a path the sites only GET (`edge_flood_guard_block_post_paths`: `/api/updates`);
- each client address gets `edge_flood_guard_rate` (burst `edge_flood_guard_burst`) for every
  request and `edge_flood_guard_post_rate` (burst `edge_flood_guard_post_burst`) for POSTs, 429
  beyond. One address is often a whole school NAT, so the rates stay generous;
- those 403s and 429s are not written to access.log.

Why: on 2026-11-18 from 18:47 UTC, about 650 school and ISP NAT addresses (mostly ChromeOS) sent
about 13k POSTs a second to abstracteducation.loan, never with a Referer, switching path on the
minute (`/`, `/api/chat/me`, `/api/updates`). The single node process behind it on amph saturated
and the site answered 502; the edge ran out of worker connections (now `edge_worker_connections` 16384) and its access.log grew 3 MB/s toward a full disk (OpenResty's logs now rotate daily or past
`edge_log_maxsize`). Add a name to the list to guard it; an attacker who starts sending a Referer
still meets the per-address limits. When it did (from about 20:00 UTC, with an Origin and about
5 POSTs a second per address to `/api/updates`), the path rule took over; a hand-made limit on amph
for the same path was removed in favour of it. Rollback: an empty `edge_flood_guard_hosts` and `--tags relay`.

## Two byod names

The edge's advertised addresses are split between two names. Since 2026-11-16 both are plain
DNS-only A records in their Cloudflare zones, for the edge's one address ([Edge DNS](#edge-dns));
the Gcore subzones under `gcore_api_token` are only a rollback copy:

| Name                          | Records (Cloudflare)                                                | Inventory                                      | Serves                                                               |
| ----------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `byod.abstracteducation.loan` | A 91.199.82.174 (abstracteducation.loan zone)                       | `edge_advertise_ips` / `_v6`                   | abulxt, estro.help, krunk.io, mc names: everything that CNAMEs to it |
| `byod.fracit.al`              | A 91.199.82.174 (fracit.al zone), kept by hand: the lists are empty | `edge_advertise_ips_fracital` / `_v6_fracital` | Fracital's names (proxied CNAMEs), holywisp.fracit.al                |

Neither has an AAAA record (divide gives guests no public IPv6). With one shared address an
unknown Host on either name lands on `00-edge-relay.conf`, and [Link routing](#link-routing) picks
its site (the placeholder page when nobody registered it; host_vars/edge.yml).

Each half has its own catch-all. abulxt's `00-edge-relay.conf` is the wildcard
`default_server`, so it is the default on the abstract addresses; the Fracital app server in
`30-fracital.conf` also listens explicitly on every Fracital address (`listen <ip>:443 ssl
default_server`, same on :80) and is the default there. nginx matches a connection to an
explicitly listened address only against servers listening on that address, so an unknown Host
on a byod.fracit.al address (a BYOD name CNAMEd to it) renders Fracital, and on a
byod.abstracteducation.loan address renders abulxt. Certificates for such names come from amph's
validator DNS match, so `domains.loadBalancerIp` in amph's `config.js` lists every advertised
address of both names. A filter that blocks one name's addresses leaves the other's alone, and
each name's RRset is small enough to stay honest. Rules:

- An address belongs to one name. `gcore_dns` refuses to run otherwise.
- The box's primary address (the SSH host, .228) is wisp.baby's, in neither pool.
- The inventory (`byod_names` in `all/main.yml`, `host_vars/wisp-mnz.yml`) describes the split.
- Per-site `<site>.byod.abstracteducation.loan` records are no longer published (one site).
- Moving or adding an address: host_vars, `playbooks/wisp.yml --tags relay` (the Fracital
  default_server listens follow the host_vars), the A records in Cloudflare by hand, amph's
  `domains.loadBalancerIp`, and `playbooks/dns.yml` to keep the Gcore rollback copy.
- Check: `curl -sk --resolve any.name:443:<fracital-ip> https://any.name/ | grep -c __FRX_OBF__`
  is 1 on a Fracital address and 0 (abulxt's shell) on an abstract one.

## estro.help

`estro.help` and `www.` are DNS-only CNAMEs (apex flattened) to `byod.abstracteducation.loan`
in estro.help's own Cloudflare account (amph's Cloudflare key does not see that zone). No edge
change: the byod catch-all terminates TLS (validator DNS match) and relays to amph `:9080`, and
redirects `www.` to the apex, so the apex record is required. It reaches amph only while
`linkroute:v1` has it as `abstract` ([Link routing](#link-routing)). amph's `conf.d/57-estro.conf`
(`abulxt_origin`, tag `estro`) forwards to `estro_upstream` (`host_vars/amph.yml`,
172.16.5.64:80 on the meal VLAN), dropping `X-BYOD-Token`. Check per edge IP with
`curl -skI --resolve estro.help:443:<edge-ip> https://estro.help/`.

## The wisp cloud (wisp.baby)

Since 2026-11-16 the wisp edge is one box, `wisp-mnz`: a VM on meal (Ashburn/Manassas, VM 115) made by hand, running the same roles as `edges.yml` (edge_network, openresty, edge_wisp,
edge_relay, edge_firewall, fail2ban) on Debian 13 and serving abulxt byod, Fracital and
wisp.baby, each on its own addresses. The overseas boxes (iev, mia, jnb, ams: G-Core 2x10GbE
dedis, each a Proxmox VE host `hv-<site>` running one edge VM `wisp-<site>`) and the dormant
1 Gb/s `wisp-<site>-1g` boxes were dismantled; their host_vars are in git history. The Proxmox
path below (`[wisp_pve]`, `pve.yml`, `pve-vm.yml`, kn and bs VMs) is kept for a future region,
with its groups empty.

wisp.baby is registered at Spaceship with its nameservers at Cloudflare (zone in the "stupid
projects" account, `apollo` / `dorthy.ns.cloudflare.com`, since 2026-11-16): the apex and
`mnz.wisp.baby` are A 91.199.82.174 (divide, DNATed to the edge), DNS-only, no AAAA.

What wisp.baby serves (`edge_relay`, `conf.d/40-wispbaby.conf`, rendered only on
`[wisp_edge]`; the contract is `wispbaby/README.md` "Server"), on
`wisp.baby` and `*.wisp.baby`:

- `https://.../`: the speed test page, copied from `wispbaby/site/` to
  `/var/www/wispbaby/` (no reload needed for a page change; files removed from
  `site/` stay on the box).
- A WebSocket upgrade on `/`: the public Wisp relay, this box's holyWisp, no key
  (like holywisp.fracit.al). `GET /health` is holyWisp's health.
- `GET /where`: which box answered (`wisp_site`, `edge_city`, `edge_country` from
  host_vars, `addr` = the address the browser reached), no-store.
- `http://.../speedtest/range/A-B` on :80: GET sends B-A+1 random bytes (at most
  25 MiB), POST reads and drops the body. Only the box's own addresses may use it
  (`wisp_ips*`, `ansible_host`, loopback; anyone else 403), so it is reached only
  as a Wisp stream from this box's holyWisp to its own address. Everything else
  on :80 is ACME or a redirect to https.

Certificates come from lua-resty-auto-ssl like every edge name: amph's validator
approves a wisp.baby name once it resolves to an address in
`domains.loadBalancerIp` (step 3 below). Local dev: `wispbaby/dev/`.

`[wisp_edge]` is a child of `[edge]` (and `[edge_debian13]`), so everything that
reads `groups['edge']` (amph's firewall in `abulxt_origin`, the Cloudflare Gateway
allowlist, `fracital_edge_subnets`) includes the wisp boxes. A box joins those
only once `origin.yml` and `dns.yml --tags gateway` are re-run.

| Inventory / SSH alias | DNS                | What                                                     |
| --------------------- | ------------------ | -------------------------------------------------------- |
| `wisp-<site>`         | `<site>.wisp.baby` | the box's address (Cloudflare, by hand: `mnz.wisp.baby`) |
|                       | `wisp.baby`        | the box's `wisp_apex_ips*` (Cloudflare, by hand)         |

`<site>` comes from `wisp_sites` in group_vars/all/main.yml. The apex takes only a
few addresses per box, because fourteen boxes' full pools (~200 A records) would
not fit a 1232-byte UDP answer. `host_vars/wisp-<site>.yml` holds the edge facts
(`edge_subnet`, `edge_primary_if`, `edge_extra_interface_ips*`,
`edge_ipv6_gateway`: the panel configures v4 only), plus `wisp_ips`, `wisp_ips_v6`,
`wisp_apex_ips` and `wisp_apex_ips_v6`. `dns.yml` skips an empty `[wisp_edge]`
group, so regions are added as they come up.

Bringing a box up (root SSH key installed from the panel's instructions page):

1. Write `host_vars/wisp-<site>.yml` (copy an existing one) and add the host to
   `[wisp_edge]`.
2. On a `[wisp_pve]` box: `playbooks/pve.yml`, then `playbooks/pve-vm.yml`
   (below). Elsewhere (`wisp-mnz`): `ansible-playbook playbooks/wisp.yml --limit
wisp-<site>`, which steps Debian up to 13 (`debian_release`, one reboot per
   release), sets the hostname, then runs the edge roles.
3. Production, which needs authorization: `origin.yml` (amph firewall),
   `dns.yml --tags gateway`, the box's addresses in the Cloudflare records (byod names,
   `<site>.wisp.baby`, and the wisp.baby apex if it should share it), `dns.yml` (the
   Gcore rollback copy), amph `config.js` `domains.loadBalancerIp` += the box's addresses,
   and the site in `wispStats.sites`.

With more than one box, plain Cloudflare records hand out every address in random order
(no geo, no health checks). Bring back the edge nameservers ("Edge DNS") if that matters.

### Proxmox hosts (`[wisp_pve]`, `playbooks/pve.yml`)

The hypervisors are `hv-<site>` in `[wisp_pve]` (not in `[edge]`). `roles/proxmox_host`
turns a fresh G-Core dedi into a Proxmox VE 9 host:

```sh
ansible-playbook playbooks/pve.yml --limit hv-<site> --vault-password-file ~/.abulxt-vault-pass
```

`host_vars/hv-<site>.yml` (`roles/proxmox_host/defaults/main.yml` documents every variable):

| Variable                                        | Example                                  |                                                       |
| ----------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `pve_main_ip`, `pve_main_prefix`, `pve_gateway` | `92.38.186.16`, `24`, `92.38.186.1`      | the panel's main IPv4; it moves to `vmbr0`            |
| `pve_ipv6`, `pve_ipv6_gateway`                  | `2a03:90c0:16::34/48`, `2a03:90c0:16::1` | optional; no gateway = take router adverts            |
| `pve_uplink_if`                                 | `eno1`                                   | the 1 GbE port that carries the main IPv4 today       |
| `pve_10g_ifs`                                   | `[ens2f0, ens2f1]`                       | the 10GbE SFP+ ports; the first is the bond's primary |
| `pve_admin_sources_extra`                       | `[203.0.113.7]`                          | who else reaches :8006/:3128 (amph is the default)    |

What the role does, in order (Debian 13 is asserted; `debian_release` runs first):

1. Hostname = inventory name, `/etc/hosts` maps `pve_main_ip` to `hv-<site>.wisp.baby`
   (no 127.0.1.1 line; pve-cluster needs the node name on the real address).
2. The wiki's install (Install Proxmox VE on Debian 13 Trixie): keyring with a pinned
   checksum, `pve-no-subscription` (deb822), every `enterprise.proxmox.com` source
   deleted (each run), full-upgrade, `proxmox-default-kernel`, reboot, ifupdown2
   (alone, async, under a rescue timer; the panel's `allow-hotplug` lines become
   `auto` first), `proxmox-ve postfix open-iscsi chrony`
   (postfix Local only), Debian kernels and os-prober removed, update-grub, reboot. A
   host with `pveversion` skips the full-upgrade and reboots; every other step is a no-op.
3. Tuning: irqbalance, netdev backlog/budget sysctls, 10GbE rings to 4096
   (`pve-nic-rings` from post-up), and a modprobe hook that keeps
   `bridge-nf-call-*` at 0 if anything loads br_netfilter.
4. `/etc/network/interfaces`: `bond0` = 10GbE ports + 1 GbE uplink, active-backup,
   primary the first 10GbE port, miimon 100, the uplink's MAC; `vmbr0` on bond0 with
   the host's v4/v6, stp off (mtu from bond0, 1500). Applied by `ifreload -a` under
   `pve-net-rollback.timer` (180 s): backup `/etc/network/interfaces.bak-pve-<ts>`,
   fresh SSH login, checks, disarm. If the login or a check fails, the timer puts the
   backup back and reboots when the network is still dead.
5. Firewall: the `edge_firewall` base (abulxt owns it here; SSH 22 open as on every
   abulxt host) plus `/etc/nftables.d/55-abulxt-pve-admin.nft`, which opens 8006/3128
   to `pve_admin_sources` + `pve_admin_sources_extra` only (or `ssh -L
8006:127.0.0.1:8006`). The role refuses to run with the Proxmox datacenter
   firewall enabled.

**Bridged VM traffic is never filtered by the host.** Frames between a VM and the wire
cross `vmbr0` at layer 2 and reach the inet hooks only through br_netfilter, which is
kept neutral. With bridge-nf on, the base's `forward` drop would cut off every VM.

**LACP later.** Once G-Core bundles the 10GbE ports, set `pve_bond_mode: 802.3ad` in
the host_vars and re-run. The bond becomes the 10GbE ports only (hash
`layer3+4`, lacp-rate fast), and the 1 GbE uplink is left configured but down. Switch
before G-Core is ready and the bond won't come up. The rollback brings the box back.

### Edge VM on Proxmox (`playbooks/pve-vm.yml`)

On each `hv-<site>`: `roles/pve_template` builds the golden template (VM 9000)
from Debian's dated `genericcloud` image (`pve_template_image_release`, checked
against that release's SHA512SUMS), and `roles/pve_edge_vm` full-clones it into
VM 100 `wisp-<site>`, then the play imports `wisp.yml` for those VMs only (never
`wisp-mnz`). Plain `qm` as root on the host, one host at a time.

```sh
ansible-playbook playbooks/pve-vm.yml --limit hv-<site>,wisp-<site> --vault-password-file ~/.abulxt-vault-pass
```

- **First build.** Needs `host_vars/hv-<site>.yml` (`pve_main_ip`, `pve_gateway`,
  `pve_ipv6`) and `host_vars/wisp-<site>.yml` (`ansible_host` = the VM's first
  IPv4, `edge_subnet`, `edge_ipv4_prefix`, `edge_primary_if: eth0`,
  `edge_extra_interface_ips*`, `edge_ipv6_gateway`). The role refuses addresses
  outside `edge_subnet` or the host's own. The VM gets all host cores but 2 and
  all RAM but 4 GiB, net0 on `vmbr0` with a fixed per-site MAC, and cloud-init
  snippets on `local:snippets/`: user-data (root by key from
  `~/.ssh/id_ed25519.pub`, SSH host keys kept in `/var/lib/abulxt-pve/wisp-<site>/`
  on the host) and network-config (every IPv4/IPv6 and both gateways on `eth0`,
  persisted by netplan). The play waits for SSH and cloud-init, then runs `wisp.yml`.
- **Re-runs** never re-clone or reboot a running VM. What Proxmox can apply live
  (tags, the NIC, a disk grow) is applied; anything else, and new cloud-init
  data, is reported as due at the VM's next start
  (`-e pve_edge_vm_reboot_for_pending=true` reboots it). The disk only grows.
- **Rebuild** (a new image, or a clean VM) destroys and re-clones VM 100. It needs
  `-e pve_edge_vm_rebuild=true -e pve_edge_vm_rebuild_confirm=wisp-<site>` and one
  Proxmox host in `--limit`. MAC and host keys stay the same, so ARP caches and
  known_hosts do not change. The box's addresses go dark until `wisp.yml` has run.
- **Template image.** To update, bump `pve_template_image_release` in
  `roles/pve_template/defaults/main.yml` to a dated directory of
  `cloud.debian.org/images/cloud/trixie/`. The next run rebuilds the template; the
  running VM keeps its disk, and the play reports that it is on an older image
  until it is rebuilt.

#### KrunkNative VM next to the edge VM (`kn-<site>`, `[kn_vm]`)

A host can run a second, fixed-size VM: KrunkNative's game server `kn-<site>`
(VM 110, tags `abulxt;krunknative`). `roles/pve_edge_vm` builds it with the same
tasks as `wisp-<site>` (`tasks/vm.yml`, run once per VM), only when `kn-<site>` is
in `[kn_vm]` in `hosts.ini`. A host without one renders and runs exactly as
before. `[kn_vm]` is no child of `[edge]`, `[wisp_edge]` or `[abulxt]`, so
`edges.yml`, `dns.yml` and the `groups['edge']` allowlists never
see these VMs. Never put their addresses in DNS.

Defining one: list `kn-<site> ansible_host=<first IPv4>` under `[kn_vm]`, then write
`host_vars/kn-<site>.yml` (kn-mia, kn-iev, kn-jnb and kn-ams ran 2026-11-12 to 2026-11-16, dismantled with their hosts; their host_vars are in git history):

| Key                                                                      |                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `kn_subnet`, `kn_ipv4_prefix`                                            | the box's subnet, as `edge_subnet` (all its IPv4s and the gateway must be in it)                  |
| `kn_ipv4_gateway`                                                        | optional, default the hv's `pve_gateway`                                                          |
| `kn_primary_if`                                                          | `eth0` (asserted)                                                                                 |
| `kn_extra_interface_ips`, `kn_extra_interface_ips_v6`, `kn_ipv6_gateway` | more IPv4s, optional IPv6s (`<addr>/48`) and their gateway                                        |
| `kn_cores`, `kn_memory_mb`                                               | its fixed size (required)                                                                         |
| `kn_disk_size`                                                           | optional, default `64G`, only ever grown                                                          |
| `kn_ssh_authorized_keys`                                                 | root keys on top of the controller's (KrunkNative's CI key)                                       |
| `kn_mac`, `kn_fqdn`                                                      | optional; default MAC `02:` + sha256(`abulxt-kn-vm:<site>`)[:5 bytes], fqdn `kn-<site>.wisp.baby` |

Its SSH host keys live in `/var/lib/abulxt-pve/kn-<site>/` on the host. The play
checks, before touching either VM, that no address belongs to both VMs and that
both VMs plus the host's reserve fit. Nothing more runs on it from this repo
(no `wisp.yml`). KrunkNative's CI configures it. Rebuild it with
`-e pve_edge_vm_rebuild=true -e pve_edge_vm_rebuild_confirm=kn-<site> --limit hv-<site>`.
The confirm names the one VM that is rebuilt.

**Sizing.** `wisp-<site>` gets what the host has left: threads − 2 − `kn_cores`,
RAM − 4 GiB − `kn_memory_mb`. So adding a kn VM to a box shrinks its running wisp
VM, and Proxmox applies the smaller size only at that VM's next start. Until then
the run builds `kn-<site>` but leaves it stopped, so the two never overcommit the
host. **Restart one box at a time:** while a box's wisp VM is down, geo DNS fails
its names over to the other boxes. Either `qm reboot 100` on that host and re-run
the play, or run it with `-e pve_edge_vm_reboot_for_pending=true --limit hv-<site>`.
That flag reboots every VM on the host that has pending changes, the kn VM too.

#### blockshooter VM (`bs-<site>`, `[bs_vm]`)

A third fixed-size VM, built exactly like `kn-<site>` with `bs_` keys
(`host_vars/bs-<site>.yml`): VM 120, tags `abulxt;blockshooter`, MAC from
`abulxt-bs-vm:<site>`, default disk 20G. The fit check covers all three VMs, and
`wisp-<site>` gets threads − 2 − `kn_cores` − `bs_cores`. Built 2026-11-14 on iev, mia, jnb and ams
(dismantled 2026-11-16 with their hosts): 4 vCPU on iev and mia, 2 on jnb and ams, 4 GB and 20 GB each.
Each took the last address of its box's Abstract byod set, which also left amph's
`domains.loadBalancerIp`. Rebuild with
`-e pve_edge_vm_rebuild_confirm=bs-<site> --limit hv-<site>`. `blockshooter` (`[bs_ct_divide]`)
is a plain CT on divide like `kn` (CT 202, 172.16.5.48; it replaced bs-mnz on meal).

### Cloudflare WARP (`roles/edge_warp`)

On a wisp edge with `edge_warp_enabled: true`, clean Wisp TCP streams go out through
Cloudflare WARP instead of from the box's own address. Nothing else does.
`edge_warp_mode` picks how, per host:

- **`kernel`** (the default, and the design going forward). It sets up 4
  (`edge_warp_tunnel_count`) kernel WireGuard interfaces `warp0..3`, one free WARP
  identity each, so each tunnel has its own exit and its own ~1.2 Gbit/s.
- **`proxy`**, the first build. `warp-cli` in proxy mode, one identity, SOCKS5 on
  `127.0.0.1:40000`.

#### Kernel mode

- **Tunnels.** systemd-networkd sets them up. The wisp VMs already run it under netplan,
  and the role doesn't touch `eth0`'s files. Per tunnel `i`, with mark
  `m = edge_warp_mark_base + 1 + i` (`0x7701`…):
  - `/etc/systemd/network/50-warp<i>.netdev` holds the interface. It sets
    `RouteTable=off`, its peer is `162.159.192.1:2408` (`edge_warp_endpoint`, a literal,
    so no DNS is needed), and the MTU is 1280.
  - `50-warp<i>.network` holds the WARP addresses (every identity gets `172.16.0.2/32`,
    plus its own IPv6 /128), a default route in table `m` (v4 and v6), and
    `ip rule fwmark m lookup m` at priority `m`.
  - Every tunnel also carries a fail-closed rule:
    `fwmark 0x7700/0xff00 unreachable` at priority `0x7780`. A mark whose tunnel is gone
    then fails instead of falling through to `main`.
  - Each tunnel's private key is in `50-warp<i>.key` (root:systemd-network 0640). The
    rules and routes live in the `.network` files, so they are persistent.
  - Behind NAT (`edge_public_ip_on_box: false`, the edge on divide) each tunnel also gets
    `50-warp<i>.network.d/90-own-address-unmarked.conf`:
    `to <public_ip> ipproto tcp dport 80 lookup main` at priority 30400
    (`edge_warp_own_address_*`), ahead of the marks. holyWisp marks literal-IP streams, so
    wisp.baby's speed test stream to `91.199.82.174:80` otherwise left through WARP and came
    back from a Cloudflare address, which `/speedtest/range/` refuses (403). On the main table
    it starts from the box's own `172.16.5.10`, and `roles/edge_network`'s
    `edge-own-address.service` (an nft table `ip edge_own_address`, nat output, tcp
    `edge_own_address_tcp_ports`) DNATs it back onto the box. divide's hairpin can't carry a
    guest's stream to itself since pve-firewall (docs/divide-host.md "The hairpin is bridged").
- **Identities.** wgcf (`edge_warp_wgcf_version`, pinned by SHA-256) registers one
  account per tunnel into `/etc/abulxt/warp/warp<i>/` (`wgcf-account.toml` +
  `wgcf-profile.conf`, root 0700/0600), retrying on Cloudflare's rate limit.
  `edge_warp_adopt_dir` reuses identities registered earlier (wgcf's
  `account-<n>.toml` + `profile-<n>.conf`). wisp-ams adopts the four from the
  multi-tunnel test that way.
- **Isolation.** Only sockets that carry a tunnel's mark use it, and only `edge-router.py`
  sets marks. Everything unmarked stays on the main table:
  - inbound connections and their replies, SSH, :53, :80/:443/:8080 and the game ports
  - the relays to amph and kru (172.16.5.0/24 on divide) and the shady streams
  - the Gateway DoH lookups and the name gate's upstream DNS
  - holyWisp's own UDP
  - WireGuard's outer packets. They carry no mark, so they leave from the box's address.

  The kernel's default `rp_filter` on new links (2, loose) and `IPv4ReversePathFilter=loose`
  let replies in on `warp<i>`. `edge_firewall` accepts them as established.

- **Router.** `edge_wisp` renders `warp_tunnels` (name + mark per tunnel) and
  `warp_fallback_direct` into `/etc/abulxt/edge-router.json`. It also gives
  `abulxt-edge-router.service` `AmbientCapabilities=CAP_NET_ADMIN`, which `SO_MARK` needs.
  - The router still resolves the name, applies the public-address test and the
    IPv6/IPv4 order, then dials the address from a socket marked for one tunnel.
  - **Which tunnel:** rendezvous hashing on the site, an approximate registrable domain
    (`www.example.co.uk` → `example.co.uk`; a literal IP is its own key). One site always
    leaves from one exit, which keeps IP-bound cookies and challenges (`cf_clearance`)
    valid.
  - holyWisp passes no client identity, so this is per site, not per client.
  - When a tunnel dies, only its sites move, and they come back when it recovers.
  - **Health:** every 15 s, each tunnel fetches `https://1.1.1.1/cdn-cgi/trace` and
    `https://[2606:4700:4700::1111]/cdn-cgi/trace` through its mark. The probe must say
    `warp=on`, so a mark that somehow left directly counts as dead.
  - A tunnel goes down after 2 failed probes in a row and comes back after 1 good one,
    per address family. The router probes every tunnel once before it starts listening.
- **No healthy tunnel** for a family: with `edge_warp_fallback_direct: true` (the
  default), clean streams go out directly, logged once a minute. With false, they fail.
- **Safety.**
  - A transient timer (`edge-warp-deadman`, `edge_warp_deadman_seconds`, 180 s) runs
    `/usr/local/sbin/edge-warp-off` unless the play confirms three things from the
    controller: a new SSH connection, HTTPS on the main address, and DNS on :53 (the
    wisp.baby apex).
  - Before that, `/usr/local/sbin/edge-warp-check` must pass on the box. For every
    tunnel, `ip route get … mark m` must go out `warp<i>` and the marked trace must say
    `warp=on` over v4 and v6. The box's unmarked v4 must still say `warp=off`.
  - After the router restarts, the play's post_tasks probe every byod address of the box from
    amph the way the edge nameservers do (the name as SNI, its health path, any 2xx;
    `roles/edge_warp/tasks/serving.yml`). Two clean rounds in a row pass; after about five
    minutes without them the run fails and names the failing addresses.
  - Every check on the box has a timeout and a read cap. Nothing open-ended runs there.
  - `edge_wisp` refuses to render kernel mode on a box whose tunnels don't exist yet
    (run `warp` with `wisp`).
- **Retiring warp-cli.** Once the router runs on the tunnels, the post_tasks remove
  warp-cli (`edge_warp_retire_proxy`). They disconnect it, delete its registration, and
  purge `cloudflare-warp` and its apt repo. Its `fwmark 0x100cf` ip rule goes with it.
  Between the warp role finishing and the router restarting (seconds), clean streams
  still use the warp-cli proxy.
- **UDP on WARP (`holywisp_udp_warp`, off by default; on for all five wisp boxes in their host_vars).** holyWisp
  sends UDP itself (`proxy-udp = direct`). Without this, a site that ties UDP to the TCP
  source sees two addresses.
  - **The router's half (always on in kernel mode):** after every probe round, the router
    writes `/run/abulxt-edge-router/warp.json` atomically (`RuntimeDirectory`, 0750, the
    same user as holyWisp). It holds `{"v4": [{"name", "mark"}…], "v6": […]}`, listing only
    the tunnels that are up.
  - **holyWisp's half (`holywisp_udp_warp: true`):** `holywisp.conf` gets `udp-warp-marks`
    (the same marks), `udp-warp-state` and `udp-warp-fallback` (following
    `edge_warp_fallback_direct`). The holyWisp unit gets `CAP_NET_ADMIN`.
  - holyWisp then marks each UDP stream for the tunnel the router would pick for that site.
    It sends UDP unmarked (or refuses it, per the fallback) when the file is missing or
    older than 60 s.
  - **Shared rules:** `edge-wisp/warp_vectors.json` (holyWisp's
    `tests/gen_warp_vectors.py --json`) holds the site_key/score/pick vectors. The router
    tests fail if a change moves a pick.
  - **Known limit:** TCP's address family follows the router's family pins, and UDP's
    follows holyWisp's `dns-order`. The tunnel is the same either way; the exit address is
    that tunnel's address in whichever family was dialled.
  - **Turning it on:** the pin must have `udp-warp-*` (`71b0f31` and later). The role's config check
    refuses the keys on an older build (`unknown option 'udp-warp-marks'`). Then set
    `holywisp_udp_warp: true` (group_vars/edge.yml, or one box's host_vars) and run
    `--tags wisp`. Check holyWisp's `/stats` for `"udpWarp": {"marked", "direct", "refused"}`.
- **Per-client exits (`holywisp_proxy_client_key`, off by default; on for all five wisp boxes in their host_vars).**
  Without it, every client's streams to one site leave from the same tunnel.
  - **holyWisp's half:** `proxy-client-key = on` makes holyWisp offer SOCKS5 method 2 (RFC 1929).
    The username is the client's key: 16 lower-hex characters, BLAKE2b-64 of
    `proxy-client-key-secret`, `\0` and the client's address (IPv6 by /64). The password is ignored.
  - **The router's half (built, always on):** when the client offers method 2, the router reads the
    username. A valid key makes the pick key `<key>/<site_key(host)>`, or `<key>/<address>` for a
    literal IP. A missing or malformed key falls back to the per-site pick. A client offering only
    method 0 gets method 0, as before. Shared vector: secret `namespace-secret-0`, client
    `127.0.0.1` give key `91a987e9ff5ccbd5`; over warp0..3, `127.0.0.1` picks warp0 and
    `91a987e9ff5ccbd5/127.0.0.1` picks warp2.
  - **The secret:** `holywisp_proxy_client_key_secret` defaults to
    sha256(`vault_holywisp_client_key_master` + `/` + hostname). The vault holds one value
    (32+ random characters), and every box gets its own stable secret. Changing it moves every
    client to new exits. The role refuses the switch without the master, and the holyWisp config
    render shows no diff while the switch is on.
  - **Turning it on:** the pin must have `proxy-client-key` (`af8a6d9` and later). Add the master to
    `group_vars/all/secrets.yml`, set `holywisp_proxy_client_key: true`, and run `--tags wisp`.

#### Proxy mode

- **Mode.** `warp-cli mode proxy` puts a SOCKS5 proxy on `127.0.0.1:40000`
  (`edge_warp_proxy_port`). It changes no routes, DNS or firewall rules. `edge_wisp`
  renders `warp_proxy` instead of `warp_tunnels`, and the router hands WARP a literal
  address, never the name.
- **UDP.** The warp-cli proxy refuses SOCKS5 UDP ASSOCIATE, so UDP can't use WARP in
  this mode.
- **Its one ip rule.** Even in proxy mode, warp-svc installs
  `not from all fwmark 0x100cf lookup 65743` (v4 and v6), and puts it back if deleted.
  Table 65743 is empty, so lookups fall through to `main`. Leave the rule alone.
- **Safety.** The role sets proxy mode, checks `warp-cli settings`, and only then
  connects. The dead-man timer runs `warp-cli disconnect` unless the same outside
  checks pass. The last task checks that the box's own traffic still shows `warp=off`.

#### Both modes

- **Terms.** Registering (wgcf, or `warp-cli registration new`) accepts Cloudflare's
  WARP terms. The role refuses until `edge_warp_accept_tos: true`. These are free
  consumer identities: one per tunnel, with no Zero Trust enrollment.
- **Roll out one box at a time**, with `warp` and `wisp` in the same run so the router
  picks it up. Restarting the router restarts holyWisp, which drops open Wisp sessions
  on that box. Set the switches in the box's host_vars first (`edge_warp_enabled: true`,
  `edge_warp_accept_tos: true`, and `edge_warp_mode` if not kernel). Otherwise the next
  plain `--tags wisp` run renders the router config without WARP.

  ```
  ansible-playbook playbooks/wisp.yml --limit wisp-mnz --tags warp,wisp --check --diff --vault-password-file <file>
  ansible-playbook playbooks/wisp.yml --limit wisp-mnz --tags warp,wisp --vault-password-file <file>
  ```

- **Check (kernel mode):**
  - On the box: `edge-warp-check warp0:0x7701 warp1:0x7702 warp2:0x7703 warp3:0x7704`,
    `wg show`, and `ip rule`.
  - `journalctl -u abulxt-edge-router` shows the initial "warp0 IPv4 up, IPv6 up" lines,
    and any later "tunnel … is down" lines.
  - From amph, `curl -sS -o /dev/null -w '%{http_code}' --resolve <name>:443:<address> https://<name>/`
    answers 2xx for each of the box's byod addresses (`/health` for wisp.baby).
  - Proxy mode: `curl -s --socks5 127.0.0.1:40000 https://www.cloudflare.com/cdn-cgi/trace`
    shows `warp=on`.
- **Turn it off (kernel mode):**
  1. Set `edge_warp_enabled: false` in host_vars and run `--tags wisp`. The router
     stops marking, and the unit loses `CAP_NET_ADMIN`.
  2. On the box, run `edge-warp-off`. It moves the `50-warp*` networkd files to
     `/etc/abulxt/warp/off/`, deletes the tunnels and removes any rule left at the WARP
     priorities. Running only this step is safe too: the router's probes fail, and it
     goes direct (or fails, per `warp_fallback_direct`).
  3. The identities stay in `/etc/abulxt/warp/warp<i>/`. Delete that directory to
     discard them (or `wgcf` can delete each account first). Re-running the role brings
     everything back with the same identities.
- **Turn it off (proxy mode):** set `edge_warp_enabled: false` and run `--tags wisp`,
  then run `warp-cli --accept-tos disconnect` on the box. Optionally
  `apt purge cloudflare-warp`.
- **Change the tunnel count:** raising it registers the new tunnels on the next run.
  To lower it, run `edge-warp-off` first, then the role. Otherwise the old higher-numbered
  tunnels' files stay behind.

## Edge DNS

**Since 2026-11-16 the byod names and wisp.baby are plain Cloudflare records**, all DNS-only,
TTL 300, pointing at wisp-mnz ("Two byod names", "The wisp cloud"). With one box left there
is nothing for geo DNS to choose between, and the four dead nameservers made every lookup
wait on timeouts (5–15 s).

| Name                          | Where                                    | Records                |
| ----------------------------- | ---------------------------------------- | ---------------------- |
| `byod.abstracteducation.loan` | Cloudflare, abstracteducation.loan       | A 91.199.82.174        |
| `byod.fracit.al`              | Cloudflare, fracit.al                    | A 91.199.82.174        |
| `holywisp.fracit.al`          | Cloudflare, fracit.al                    | CNAME `byod.fracit.al` |
| `wisp.baby`, `mnz.wisp.baby`  | Cloudflare zone wisp.baby (Spaceship NS) | A 91.199.82.174        |

**Retired: the edge nameservers** (2026-11-12 to 2026-11-16). Every `[wisp_edge]` box was an
authoritative PowerDNS nameserver, `ns-<site>.wisp.baby` (`roles/edge_dns`,
`playbooks/dns-edge.yml`), serving every `byod_names` zone plus wisp.baby. The apex A/AAAA
were LUA records (`files/geo.lua`): the client's country centroid (`countryCode()`, DB-IP's
country mmdb; `latlon()` is unusable with DB-IP, which lacks `location.accuracy_radius`),
the boxes sorted by distance (`edge_geo`), and `ifurlup` returning the healthy addresses of
the nearest box. IPv6 was never health-checked. Gcore's free plan and Cloudflare's free DNS
only return a whole RRset in random order, which is why it existed: bring it back if the
edge spans continents again.

- **Rollback.** PowerDNS still runs on wisp-mnz. Re-create the NS records (`ns-mnz.wisp.baby`
  plus any new boxes) for `byod` in both Cloudflare parent zones, and point wisp.baby's
  nameservers at Spaceship back to the `ns-*` hosts (Spaceship API: `PUT
/v1/domains/wisp.baby/nameservers`, and `/personal-nameservers/<host>` for glue; keys in
  the cloaks repos' `.env`). Spaceship requires two nameservers, and the old glue for
  `ns-iev/mia/jnb/ams` may still be registered there.
- **Gcore.** `gcore_dns` (`playbooks/dns.yml`) still writes the Gcore copies of the byod
  zones, an older rollback. They are static: run `playbooks/dns.yml` before pointing anything
  back at Gcore.
- **Check:** `dig +short byod.fracit.al @1.1.1.1` answers .48 and .63 in well under a second.

## How cert sharing works (decision 1, conflict-free)

All four edges serve the same `byod.abstracteducation.loan` (round-robin DNS).
Per-edge on-demand HTTP-01 issuance would normally split-brain: Let's Encrypt
resolves the name to _any_ of the 4 IPs, but only the edge that started the
order holds the challenge token.

The fix: every edge points `lua-resty-auto-ssl` at a **single Redis**, amph's or, with
`shared_redis_on_terp_db`, the dedicated one on terp.db (`auto_ssl:*` keys). Certificates **and** ACME http-01 challenge tokens live in
that one namespace, so:

- whichever edge receives LE's validation request can answer it, and
- a cert issued on one edge is immediately served by all four.

Domain approval is still gated by amph's `abulxt-domains` validator
(`/ask?target=edge`), which only approves names whose DNS already resolves to a
configured edge IP, so bogus SNIs never burn CA rate limits.

### Implementation notes (learned during rollout)

- **Storage adapter**: use `auto_ssl_instance:set("storage_adapter",
"resty.auto-ssl.storage_adapters.redis")` with connection opts under
  `set("redis", {host,port,auth,prefix})`. The older `set("storage", ...)` is
  deprecated and silently falls back to file storage.
- **Hook server required**: every edge must run the internal auto-ssl hook
  server on `127.0.0.1:8999` (`auto_ssl_instance:hook_server()`); dehydrated
  calls it to deploy http-01 tokens into Redis before the CA validates. It's in
  `byod-edge.conf.j2`.
- **OpenResty on Debian 13**: there's no `trixie` repo and apt's `sqv` verifier
  rejects OpenResty's SHA1-signed repo, so the trixie edges install the pinned
  bookworm `.debs` directly (`openresty_install_method: debs`).
- **Gcore Free plan**: minimum DNS TTL is 120s. The replace-RRset endpoint is
  `PUT /dns/v2/zones/{zone}/{name}/{type}` (no `/rrsets/` segment).

## Repo policy

`AGENTS.md` at the top of this repository. In short: the AI does not run playbooks against
production, commit or push without explicit per-turn authorization; production changes go
through `.github/workflows/apply.yml` with approval; no secret or private name is committed.
