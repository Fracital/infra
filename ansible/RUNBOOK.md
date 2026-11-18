# Abulxt Edge Unification: Runbook

> **Status: DEPLOYED 2026-10-03.** All four phases are live. This runbook is now
> the reference for re-running, extending, or rolling back the deployment.

Phased rollout for bringing all four edges up, networking them to amph, and
cutting `byod.abstracteducation.loan` over to the round-robin.

## What's live now

> Since 2026-11-12 the byod names are served by the wisp cloud (README "Wisp cloud"), and
> the old VPSs (santaclara, losangeles, chicago and ashburn) were retired and cancelled on
> 2026-11-13 (INVENTORY.md). The history below still names them.

- `byod.abstracteducation.loan` round-robins (TTL 120) across all four edges:
  92.38.149.24 (santaclara), 92.223.30.23 (losangeles), 2.56.222.45 (chicago),
  45.82.161.87 (ashburn). Zone is the delegated subzone `byod.abstracteducation.loan`;
  the record is its apex A.
- Since 2026-11-08 the fleet's addresses are split between that name (16 IPv4 + 1 IPv6)
  and Fracital's `byod.fracit.al` (15 IPv4 + 1 IPv6, zone `byod.fracit.al`, same Gcore
  token); README "Two byod names". The edge nameservers serve and health-check both apexes (README "Edge DNS"); Gcore holds a static rollback copy.
- Every edge runs OpenResty 1.31.1.1 + lua-resty-auto-ssl, terminates TLS, and
  relays to amph `:9080` with the shared `X-BYOD-Token`.
- All edges share **one** Let's Encrypt cert via the central Redis (`auto-ssl:*`),
  on terp.db since 2026-11-17 ("Shared Redis on terp.db"). Any edge can answer the ACME http-01 challenge; a cert issued
  on one is served by all.
- amph firewall opens 9080/8822/1082 to the edge (6379 only with `shared_redis_on_terp_db: false`).
- Edge ingress: 80 and 443 on all four edges, udp 443 (HTTP/3), and tcp 8080 for
  `mcnode.abstracteducation.loan` (Pterodactyl Wings). Every edge runs the
  host nftables of the `edge_firewall` role (tag `firewall`,
  edge-firewall-contract v1 shared with KrunkNative, see README "Edge
  firewall"); applied to all four on 2026-10-11. The relay's :6001 is no longer
  reachable from outside. KrunkNative's `60-krunknative.nft` opens 21015.. tcp+udp.
- Gcore API token (`abulxt-edge-dns`, Administrators) is in the vault.

## Phase 0: Prereqs

1. Vault password file available locally (not committed), e.g. `~/.abulxt-vault-pass`.
2. SSH aliases work (already configured in `~/.ssh/config`):
   ```bash
   ssh wisp-mnz true && ssh amph true
   ```
3. Syntax sanity:
   ```bash
   cd ~/src/infra/ansible
   ansible-playbook playbooks/site.yml --syntax-check --vault-password-file ~/.abulxt-vault-pass
   ```

## Phase 1: Origin (amph)

Opens the firewall to the edge (9080 origin-internal, 8822 validator, 1082 shady-relay). With
`shared_redis_on_terp_db: false` it also brings up the auto-ssl Redis store (6379); otherwise it
keeps amph's Redis stopped.

```bash
ansible-playbook playbooks/origin.yml --vault-password-file ~/.abulxt-vault-pass
```

Verify:

```bash
ssh amph 'systemctl is-active redis-server'   # inactive while the Redis is on terp.db
ssh amph 'iptables -L ABULXT_INPUT -n | grep -E "9080|8822|1082"'
```

> Note: the validator code change (`target=edge` + all edge IPs in
> `domains.loadBalancerIp`) ships via the normal app deploy (CI/CD). Confirm
> abulxt's `main/config.js` lists all four edge IPs under `domains.loadBalancerIp` and
> that the deployed `abulxt-domains` service includes the `target=edge` handling
> before Phase 3.

## Phase 2: Edges (OpenResty + relay)

Installs OpenResty everywhere and configures the shared-storage BYOD relay.
Review with `--check --diff` first.

```bash
# Dry run first
ansible-playbook playbooks/edges.yml --check --diff --vault-password-file ~/.abulxt-vault-pass

# Apply
ansible-playbook playbooks/edges.yml --vault-password-file ~/.abulxt-vault-pass
```

Verify each edge:

```bash
for e in wisp-mnz; do
  echo "== $e"; ssh $e 'systemctl is-active openresty; ss -tlnp | grep -E ":80 |:443 " | head -2'
done
```

## Phase 3: Confirm relaying to amph

Before DNS cutover, prove each edge terminates TLS and relays to amph. From
your workstation (bypasses DNS via `--resolve`):

```bash
for ip in 91.199.82.174; do   # the edge's public_ip (divide DNATs 443 to it)
  echo "== $ip"
  curl -skI --resolve byod.abstracteducation.loan:443:$ip \
    https://byod.abstracteducation.loan/ | head -1
done
```

The first request per edge triggers on-demand issuance (allowed because the
validator sees the name resolves to edge IPs; the cert lands in the shared
Redis and is immediately usable by all four edges).

## Phase 4: DNS cutover (Gcore)

1. Put a real token in the vault:
   ```bash
   ansible-vault edit inventory/group_vars/all/secrets.yml --vault-password-file ~/.abulxt-vault-pass
   # set gcore_api_token: "<real token>"
   ```
2. Push the round-robins (one apex A/AAAA RRset per name in `byod_names`, plus
   the per-site records for abulxt; `--skip-tags gateway` leaves the DoH allowlist alone):
   ```bash
   ansible-playbook playbooks/dns.yml --skip-tags gateway --vault-password-file ~/.abulxt-vault-pass
   ```
3. Verify:
   ```bash
   dig +short byod.abstracteducation.loan A | sort   # the abstract half (16)
   dig +short byod.fracit.al A | sort                # the Fracital half (15), disjoint
   ```
4. Since 2026-11-12 these zones are delegated to the edge nameservers, so this push only
   refreshes the Gcore rollback copy; the live answers come from `playbooks/dns-edge.yml`
   (README "Edge DNS").

## Phase 5: Gateway DoH classifier (Cloudflare Zero Trust)

The edge proxy classifies each hostname by querying three Cloudflare Gateway
DoH "DNS locations" (account `proxy industry`, Zero Trust Free plan). Each has
one DNS policy; a blocked category answers `A 0.0.0.0` (NOERROR), anything
else resolves normally. Location ids/subdomains live in
`inventory/group_vars/all/main.yml` (`cloudflare_zt_gateway_locations`).

| Location      | Blocks                                                                                 | Verdict                             |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `block-adult` | Adult Themes, Nudity, Pornography, Sexuality                                           | adult → block at edge               |
| `block-shady` | 13 security-threat cats + Gambling, New/Newly-Seen Domains, Hacking, File Sharing, P2P | shady → hop to amph, Mullvad egress |
| `plain`       | nothing                                                                                | clean → serve direct from edge      |

Policies pin `dns.location == "<id>"`, so a leaked `plain` subdomain only
yields unfiltered resolution, never the block policies.

**Endpoint auth is source-IP filtering**, pushed by the `gateway_dns` role the
same way `gcore_dns` pushes the RRset: it aggregates `edge_subnet` (/24) and
`edge_advertise_ips_v6` (/128) across `groups['edge']` plus amph, and PUTs
them to every location. Per-/24 rather than per-/32 because Gateway sees the
edge's **egress** address, which can be any alias on the box. Dual-stack
edges (losangeles, chicago) reach Gateway over IPv6, so the v6 egress must be
listed too.

```bash
ansible-playbook playbooks/dns.yml --tags gateway --vault-password-file ~/.abulxt-vault-pass
```

Verify from an edge and from a non-fleet host (pornhub.com, wire-format A):

```bash
Q=AAABAAABAAAAAAAAB3Bvcm5odWIDY29tAAABAAE
curl -s -H 'accept: application/dns-message' \
  "https://<block-adult doh>.cloudflare-gateway.com/dns-query?dns=$Q" | xxd | tail -1
# edge:       ... 0000 0000   (A 0.0.0.0, rcode 0 → blocked by policy)
# non-fleet:  rcode 5 REFUSED, 29-byte reply, still HTTP 200
```

Gateway rejects with DNS **REFUSED inside a 200**, not an HTTP error. Don't
alert on HTTP status alone.

Gotchas:

- The first location created (`block-adult`) is the account default and the
  API refuses `client_default: false` on it; the role reads and echoes the
  current flag.
- `max_ttl` is set to `override`/300s per location so an edge never caches a
  verdict longer than 5 min after a category change.
- Adding an edge: add its `host_vars` (`edge_subnet`, `edge_advertise_ips_v6`)
  and re-run the playbook. No dashboard work.

## Phase 6: Edge-local Wisp with verdict routing

Each edge now runs its own Wisp server; the keyed `/wisp/<gate_key>/` path is
served on the edge, not relayed to amph. Every TCP stream is classified by
hostname and routed (UDP streams: the paragraph under the table):

| Verdict | Source                                     | Action                                                             |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ |
| adult   | `block-adult` location answers `A 0.0.0.0` | SOCKS "not allowed" → stream closes, no connect                    |
| shady   | `block-shady` location answers `A 0.0.0.0` | hop to amph `:1082` (auth SOCKS5) → `mullvad-pool` → Mullvad relay |
| clean   | neither blocks                             | direct from the edge's own IP                                      |
| error   | both lookups fail / REFUSED                | **fail open** → treated as clean, cached 30s                       |

Adult wins over shady when both block (e.g. `1337x.to`).

UDP streams (on since 2026-11-10 for STomp's HTTP/3) never reach the router:
holyWisp cannot send UDP through a proxy, so it sends it itself, from the
edge's own address (`proxy-udp = direct`), without a verdict. One verdict is
applied all the same, through DNS: a shady name's UDP is refused ("UDP to a
shady name" below). An adult name's UDP is still relayed.

Components per edge (role `edge_wisp`, playbook `edges.yml`):

- `/opt/abulxt-wisp/holywisp`: [holyWisp](https://github.com/Fracital/holyWisp)
  (C11 Wisp v1/v2 server), one static binary the controller pushes
  (`holywisp_source`, role defaults; README "holyWisp from npm"). `npm` (the
  default): `bin/linux-x64/holywisp` from the npm package
  `holywisp@<holywisp_npm_version>`, checked against `dist.integrity` and its
  npm provenance, cached as `holywisp-npm-<version>-linux-x64`. `build` (the
  rollback): `tasks/build.yml` clones `holywisp_repo` at `holywisp_ref` into
  `~/.cache/abulxt/holywisp/src`, builds `Release` with
  `-DCMAKE_EXE_LINKER_FLAGS=-static` inside a Debian 12 container
  (`files/holywisp-build.Containerfile`, podman or docker; the controller has
  no static glibc) and caches `holywisp-<commit>-linux-amd64-static`. Either
  way `tasks/verify.yml` checks it is statically linked x86-64, `--version`
  runs, and every host's rendered config parses. One static binary runs on
  Debian 11 (glibc 2.31), 12 and 13.
  - **holyWisp binary (2026-11-10 comparison, same source a262092).** npm: zig
    0.17.1 (clang 22), musl, `-O2`, stripped, 242 KB. Container: gcc 12, glibc
    2.36, `-O2`, 1.4 MB. Neither uses LTO; both have the splice relay path and
    pass holyWisp's Node tests (the npm build's C suite also passes under musl).
    The glibc build warns that a static `getaddrinfo` needs glibc 2.36's NSS
    modules at run time, which Debian 11 lacks; the role only resolves literal
    addresses through it (`dns-server` is set, the proxy is `127.0.0.1`), and
    musl has no such dependency. The npm binary reports only its package version
    (`holywisp 0.5.2`), no commit; the provenance check ties it to one. holyWisp's bench/run.py
    (the wispmark method, the role's flow-control flags, 10 s x 6, 7950X with
    other load on the host): throughput equal within the run-to-run spread
    (wisp-js 10 streams 663 vs 651 MiB/s container vs npm, 5x10 1116 vs 1163,
    native 16x4 3219 vs 3251), churn 59.7k vs 68.2k streams/s, but the npm
    build used 10 to 25% more server CPU with many connections (wisp-js 5x10
    1.41 vs 1.75 cores, native 16x4 4.27 vs 4.71) and its 64 B round trip was
    slightly slower (p50 37 vs 39.5 us). Watch the relays' CPU after a switch. Config
    `/etc/abulxt/holywisp.conf` (`host`, `port = 6001`,
    `proxy = socks5h://127.0.0.1:1081`, `allow-direct-ip = on` on the edges
    (`holywisp_allow_direct_ip`, for the v86 guests in vibeOS; literal-IP streams
    skip the name classification) and `off` on amph, `allow-udp = on` with
    `proxy-udp = direct` on the edges since 2026-11-10 (`holywisp_allow_udp`),
    `dns-order` from `holywisp_dns_order` ("One egress address" below),
    `dns-server = 127.0.0.1:1083` ahead of the public resolvers
    (`edge_router_dns_port`, "UDP to a shady name" below), trusted headers reset to
    `X-Real-IP`, `X-Forwarded-For` from `127.0.0.1`/`::1`, `flood-protection =
off` for parity with the wispurr config, `serve-webclient = on`: GET / is
    holyWisp's browser client, public on `https://holywisp.fracit.al/`). `GET
/health` and `GET /stats` answer on the same port (loopback; `/health` is
    also public on `holywisp.fracit.al`).
  - **Replaced wispurr v4.2.1 in 2026-11.** The relay still speaks plain Wisp
    over TLS and the `/<path>/<gate_key>/` route is the only access control.
    `edge-wisp/patches/` (the wispurr relay fixes) is historical: the
    list of bugs holyWisp was audited against. Rollback: README "Rollback to
    wispurr" (the wispurr binary and `/etc/abulxt/wispurr.json` stay on each
    host until `edge_wisp_remove_wispurr: true`).
  - Unit: holyWisp's upstream sandbox (`CapabilityBoundingSet=`,
    `ProtectSystem=strict`, `RestrictAddressFamilies=AF_INET AF_INET6`,
    `SystemCallFilter=@system-service` minus the dangerous groups,
    `MemoryDenyWriteExecute`, `ProtectProc=invisible`), `LimitNOFILE=262144`,
    `Restart=always`, and on the edges `IPAddressDeny=<amph>` ("UDP to a shady
    name" below). On Debian 11 (systemd 247) watch the first start:
    `journalctl -u abulxt-edge-wisp -b` must show `listening on *:6001`.
- `/opt/abulxt-wisp/edge-router.py`: classifying SOCKS5 on `127.0.0.1:1081`.
  Two persistent DoH connections (adult + shady locations), per-host verdict
  cache (300s), in-flight dedupe. Config `/etc/abulxt/edge-router.json`
  (Gateway subdomains + relay credential, mode 0640, group `abulxt-wisp`).
  With `dns_port` in that file (`edge_router_dns_port`, 1083 on the edges) it
  also answers DNS on `127.0.0.1:1083/udp`, the name gate: holyWisp's first
  `dns-server`. Clean connects go through its own `dial` (IPv6 bounded to 3 s,
  one family per name, below), which dials only public unicast addresses from
  its own lookup (IPv4 inside IPv6 judged as the IPv4): holyWisp hands it a
  hostname, and a name can answer that second lookup with 127.0.0.1 or 10.x
  (DNS rebinding). Literal IPs must be public too. Shady streams are not
  checked here; the Mullvad exit resolves them on its own network.
  `refused HOST:PORT: no public address` in its journal is this check. Tests:
  `python3 -m unittest discover -s edge-wisp -p 'test_*.py'`.
- Units `abulxt-edge-router.service` → `abulxt-edge-wisp.service`
  (`Requires=`), user `abulxt-wisp`, `ProtectSystem=strict`. The role health
  checks `curl -fsS http://127.0.0.1:6001/health` after the start.
- OpenResty: `location ~* ^/wisp/<key>(/.*)?$` → `127.0.0.1:6001`, 86400s
  read/send timeouts, buffering off. Unkeyed `/wisp` → 403 (never forwarded).

On amph (role `abulxt_origin`, playbook `origin.yml`):

- `/opt/abulxt/shady-relay.py` on `0.0.0.0:1082`: RFC 1929 username/password
  (`shady_relay_user` + vaulted `shady_relay_password`), then chains every
  CONNECT into `mullvad-pool` at `127.0.0.1:1080`. `shady-relay.service`.
- Only the edge reaches `1082`: divide's pve-firewall (`213.fw`); amph has no firewall of its own.

amph's own relay on `127.0.0.1:6001` serves the main-domain `/wisp/<key>/`
path on amph itself (the edges never forward `/wisp` to it). OpenResty is the
live front: upstream `abulxt_wisp_backend` → `127.0.0.1:6001` in
`conf.d/00-upstreams.conf`, included via `snippets/wisp.conf`; Caddy is
inactive on amph (abulxt's `deploy/abulxt-amph.caddy` is legacy).

**amph's relay is Ansible-managed by the same `edge_wisp` role**, run from
`playbooks/origin.yml` (hosts `origin`, tag `wisp`) with the overrides in
`inventory/host_vars/amph.yml`. Same static holyWisp binary as the edges
(`holywisp_source`: the npm package by default, the container build as the
rollback).

- Unit `abulxt-edge-wisp.service` (same unit name as on the edges), user
  `abulxt-wisp`, `ExecStart=/opt/abulxt-wispurr/holywisp --config
/etc/abulxt/holywisp.conf`, plus `MemoryHigh=5G` / `MemoryMax=6G`
  (`edge_wisp_service_extra`). The loopback bind (`host = 127.0.0.1` in the
  config) is mandatory: `10.203.0.2:6001` is held by the proton-socks
  `wisp.server` listeners and a wildcard `*:6001` bind fails with EADDRINUSE
  (the old node front also bound `127.0.0.1`).
- Config `/etc/abulxt/holywisp.conf`: `proxy = socks5h://127.0.0.1:1080`
  (mullvad-pool directly; **no edge-router.py**, `edge_wisp_manage_router:
false`), `allow-udp = on` with `proxy-udp = direct` (mullvad-pool is
  TCP-only, so UDP leaves amph directly; `holywisp_proxy_udp_direct`),
  `dns-server 1.1.1.3` / `1.0.0.3`, reputation store
  `/opt/abulxt-wispurr/data/reputation.json`. `/etc/abulxt` itself stays
  root:root 0755 (`edge_wisp_manage_conf_dir: false`; `abulxt_origin` owns it
  and other services' env files live there). The previous
  `/opt/abulxt-wispurr/wispurr` + `/etc/abulxt/wispurr.json` stay for rollback.
- Install dir is `/opt/abulxt-wispurr`, not `/opt/abulxt-wisp`, on purpose:
  `/opt/abulxt-wisp/` is the old hand-managed npm wrapper (`server.mjs`,
  `config.json`, `node_modules/wispurr` 4.2.0 whose prebuilt binary was
  restored to stock on 2026-10-10; `*.cloak-bak-2026-10-10` copies beside it).
  It, its unit `abulxt-wisp.service` (node front on `127.0.0.1:6001` + 8 Go
  workers on `6011`–`6018`, user `suki`) and the `memory-guard.conf` drop-in
  are left in place, stopped and disabled, for rollback.
- `edge_wisp_retire_units: [abulxt-wisp.service]` makes the role stop and
  disable that old unit right before `abulxt-edge-wisp.service` first binds
  `:6001` (idempotent; a missing unit is not an error).
- Rollback: `systemctl disable --now abulxt-edge-wisp && systemctl enable
--now abulxt-wisp` (OpenResty needs no change; the upstream is the same
  address).

Verify with a plain upgrade to `127.0.0.1:6001` → `101` (one-liner below);
through the front, `curl --http1.1` the keyed `https://<abulxt host>/wisp/<key>/`
→ `101` (h2 answers `200 Upgrade Required`, which is not a failure) and the
unkeyed `/wisp/` → `403`.

**Status 2026-10-10:** applied with `origin.yml --limit amph --tags wisp`
(8 changed, 0 failed). `abulxt-edge-wisp.service` (Go v4.2.1, stock) now serves
`127.0.0.1:6001`; `abulxt-wisp.service` (npm wrapper) is stopped and disabled,
its files left under `/opt/abulxt-wisp` for rollback. Verified: local upgrade
`101`, keyed `https://<abulxt host>/wisp/<key>/` over HTTP/1.1 `101`, unkeyed
`403`. The `--tags wisp` form was used because a full `origin.yml` run also
wants to re-create `conf.d/25-mc-relay.conf` (see Troubleshooting); decide
that separately before running the play untagged.

Verify any relay (edge or amph) from the host itself:

```bash
curl -s -o /dev/null -w '%{http_code}' -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Sec-WebSocket-Key: eCBzdGFuZGFyZCB0ZXN0IQ==' -H 'Sec-WebSocket-Version: 13' http://127.0.0.1:6001/
# 101 = stock relay. 426 meant cloak-required (cloak era only).
```

Verify (from each edge):

```bash
# verdicts straight from the router (port 443 so the TLS host is a hostname)
python3 - <<'PY'
import asyncio, struct
async def go(h):
    r, w = await asyncio.open_connection("127.0.0.1", 1081)
    w.write(b"\x05\x01\x00"); await w.drain(); await r.readexactly(2)
    b = h.encode(); w.write(b"\x05\x01\x00\x03"+bytes([len(b)])+b+struct.pack("!H",443)); await w.drain()
    print(h, "rep", (await r.readexactly(10))[1]); w.close()
asyncio.run(go("pornhub.com"))   # rep 2 = adult refused
asyncio.run(go("google.com"))    # rep 0 = connected
PY
curl -s --proxy socks5h://127.0.0.1:1081 https://api.ipify.org   # edge's own IP (clean)
journalctl -u abulxt-edge-router -n 20   # "fail-open" lines mean the DoH allowlist rejected this edge
```

Where a shady stream exits: open a stream through `relay_host:1082` with the
credential from `/etc/abulxt/edge-router.json` and `GET api.ipify.org`; you
get a Mullvad relay IP (`23.234.x`, `146.70.x`, `103.81.x` seen), never the
edge's or amph's.

End-to-end with the real protocol, from anywhere:

```bash
cd main && node --input-type=module -e '
import { client } from "@mercuryworkshop/wisp-js/client";
const c = new client.ClientConnection(process.argv[1]);
c.onopen = () => { const s = c.create_stream("api.ipify.org", 80, "tcp");
  s.onmessage = d => process.stdout.write(Buffer.from(d)); s.onclose = () => process.exit(0);
  s.send(new TextEncoder().encode("GET / HTTP/1.0\r\nHost: api.ipify.org\r\n\r\n")); };
' "wss://byod.abstracteducation.loan/wisp/<gate_key>/"
```

**One egress address** (`holywisp_dns_order`). A client's streams leave an edge
by two dialers. Clean TCP: holyWisp hands the hostname to the router
(`proxy = socks5h://127.0.0.1:1081`), which connects in getaddrinfo order, IPv6
first on a dual-stack edge (losangeles, chicago). UDP: holyWisp dials it itself
(`proxy-udp = direct`) in `dns-order`, and its default is `ipv4first`. With
that default a dual-stack edge sent a client's TCP from its IPv6 address and
its UDP from its primary IPv4 address, so a session carried partly over HTTP/3
reached a site from two addresses (YouTube ties playback to the address that
loaded the page). holyWisp has no bind or egress address option and cannot
proxy UDP, so the family order is the lever: `group_vars/edge.yml` renders
`dns-order = ipv6first` on an edge with an IPv6 address in the inventory and
`ipv4first` on the others, where TCP already leaves over IPv4. Only UDP
changes family; TCP is untouched. Check one edge (the relay port is
loopback-only, so tunnel to it):

```bash
ssh <edge> "grep '^dns-order' /etc/abulxt/holywisp.conf"
ssh -N -L 16001:127.0.0.1:6001 <edge> &
# Through ws://127.0.0.1:16001/ open a UDP stream to a STUN server
# (stun.l.google.com:19302, binding request) and a TCP stream to an address echo
# (GET /report_mapping?di=no on redirector.googlevideo.com:80): both must name
# the same address, IPv6 on a dual-stack edge, the primary IPv4 elsewhere.
```

If an edge's two paths still differ (its router dials the other family), pin
`holywisp_dns_order` for it in `host_vars`. Back to the old behaviour for one
run: `-e holywisp_dns_order=ipv4first`.

**One family per name** (`edge-router.py`, `FamilyPins` and `dial`). The order
above only says which family is tried first; what happens when IPv6 fails
differs per dialer. holyWisp sends UDP to the first address in `dns-order` and
moves on only when the kernel has no route to it, so on a dual-stack edge it
stays on IPv6 whatever the destination does. The router therefore decides for
both:

- A clean connect tries the addresses one after the other in getaddrinfo
  order (never a race: that would put TCP on IPv4 while UDP stays on IPv6).
  While the name still has an IPv4 address to try, IPv6 gets 3 s in all
  (`V6_WAIT`), inside the 10 s `CONNECT_TIMEOUT`. Before, an IPv6 address
  that neither answered nor refused used up the 10 s and the stream failed
  with a working A record never tried.
- A name whose connect landed on IPv4 is pinned. While it is, the name gate
  answers its AAAA question with no records, so holyWisp's UDP for it goes
  over IPv4 too, and the router's own connects to it go to IPv4 first. After
  5 minutes (`PIN_RETRY`) one connect tries the resolver's order again: on
  IPv6 it unpins the name, on IPv4 the pin holds another 5 minutes. A pin
  nothing refreshed is gone after 15 minutes (`PIN_TTL`); the table holds
  20000 names (`MAX_PINS`), oldest out first. It lives in the router's
  memory: a router restart starts empty.
- `journalctl -u abulxt-edge-router | grep -E 'pinned|unpinned'` lists the
  names that fell back (`IPv6 failed, connect landed on IPv4; pinned to IPv4`)
  and came back. A name with no usable IPv6 at all is pinned without a line.

The pin reaches UDP through DNS, so it needs the name gate
(`edge_router_dns_port`), and it is late by holyWisp's own DNS cache: a UDP
stream opened while holyWisp still holds the name's AAAA (the record's TTL, at
most 120 s, `dns-ttl-s`) goes over IPv6 once more. The HTTP/3 connection that
follows a page's first, fallen-back TCP connect is usually inside that window;
the ones after it are not.

**UDP to a shady name** (`edge_router_dns_port`). A shady name's TCP leaves
through amph's relay and a Mullvad exit. That path is CONNECT only at every hop
we run (`edge-router.py`, `shady-relay.py`, `mullvad-pool.py`), and holyWisp
has no SOCKS5 UDP associate, so the same name's UDP used to leave from the
edge: two addresses for one site, and the edge's own address
shown to exactly the names the relay exists to hide it from. holyWisp has no
setting that refuses UDP per name either (`block-host` is a fixed list and
closes TCP too). The one thing it asks before it sends UDP is DNS, so the
router answers that:

- `edge-router.py` listens on `127.0.0.1:1083/udp` and is holyWisp's first
  `dns-server`. For an A or AAAA question it takes the name's verdict (the same
  cache the SOCKS side uses). Shady: the A answer is the relay's address
  (`relay_host`, amph), the AAAA answer is empty, TTL 60 s. Anything else goes
  to the public resolvers (`holywisp_dns_servers`) and their answer comes back
  untouched.
- `abulxt-edge-wisp.service` has `IPAddressDeny=<amph>`. holyWisp never sends
  to amph itself (its TCP streams reach the relay through the router, another
  unit), so the only effect is that a UDP stream to a shady name gets `EPERM`
  on its first datagram and holyWisp closes it (reason `0x03`). The client
  falls back to TCP, which holyWisp hands to the router by name, as before.
- Fail open, like the classifier: no verdict within 1 s, or a failed lookup,
  is answered as clean. If the gate does not answer at all holyWisp asks the
  public resolvers itself (at once when the port is closed, after its 3 s
  `dns-timeout-ms` per question when the gate is silent). A router that
  cannot bind the port logs `name gate NOT listening` and keeps routing TCP.

What the client sees (holyWisp 0.5.2, `src/server/`). The gate's refusal is
for one destination and comes late: the CONNECT is accepted, the stream opens
(a UDP `connect()` cannot fail for this, `stream.c:309-317`), and the first
DATA packet is answered with CLOSE `0x03` (network error: `send()` returns
`EPERM`, `stream.c:621-626`, which `map_errno` turns into the default,
`stream.c:46-47`). A relay with UDP off altogether answers the CONNECT itself
with CLOSE `0x48` (blocked) before any DATA: `allow-udp = off` at
`conn.c:930-933` (and its Wisp v2 INFO then carries no UDP extension,
`conn.c:685`), `proxy-udp = refuse` at `stream.c:435-440` (the INFO still
offers UDP: it only looks at `allow-udp`). `0x48` on CONNECT is not proof of a
relay without UDP, though: one destination refused by the egress policy
(`stream.c:402-408`, `:458-472`) or by `block-host` (`stream.c:441-446`) gets
it too. A name that does not resolve, or an address without a route, closes
with `0x42` (`stream.c:386-389`, `:41-45`).

Side effects: a STomp client that reads any UDP stream closed during its QUIC
handshake as a relay without UDP turns HTTP/3 off for every origin for 5
minutes (STomp's `docs/http3.md`, fallback rule 5), so one shady site that
advertises h3 costs such a session its HTTP/3 for those windows; a STomp that
tells `0x03` after DATA from `0x48` on CONNECT loses it for that origin only.
Everything stays on TCP and on one address either way. A UDP stream to amph's
own address (a literal, or a name hosted on amph) is refused the same way.
holyWisp keeps a
resolved name for up to 120 s (`dns-ttl-s`), so a verdict that changes, or one
that arrived after the 1 s wait, takes that long to reach new UDP streams. And
holyWisp keys its per-destination limits by resolved address: every shady name
would share one bucket if `holywisp_flood_protection` were turned on.

Check one edge after a run:

```bash
ss -lunp | grep ':1083 '                                  # the gate (python3)
journalctl -u abulxt-edge-router -n 5 | grep 'name gate'  # "name gate on 127.0.0.1:1083 (udp)"
systemctl show abulxt-edge-wisp -p IPAddressDeny          # 172.16.5.3/32 (amph, abulxt_origin_ip)
journalctl -u abulxt-edge-wisp -b | grep -i bpf           # must print nothing: a line here means
                                                          # this host cannot enforce IPAddressDeny
# What holyWisp is told. Try a few names Gateway should call shady (a torrent
# index, a gambling site) until one says so, and keep it for the last step.
python3 - thepiratebay.org google.com <<'PY'
import socket, struct, sys
for name in sys.argv[1:]:
    q = struct.pack("!HHHHHH", 1, 0x0100, 1, 0, 0, 0) + b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0\0\1\0\1"
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(4); s.sendto(q, ("127.0.0.1", 1083))
    r = s.recv(4096); print(name, "shady: answered with the relay" if r[7] == 1 and r.endswith(socket.inet_aton("172.16.5.3")) else "not shady")
PY
# Through the relay (ssh -N -L 16001:127.0.0.1:6001 <edge> &), from main/:
node --input-type=module -e '
import { client } from "@mercuryworkshop/wisp-js/client";
const c = new client.ClientConnection("ws://127.0.0.1:16001/");
c.onopen = () => { for (const h of process.argv.slice(1)) { const s = c.create_stream(h, 443, "udp");
  s.onclose = r => console.log(h, "closed 0x" + r.toString(16)); s.send(new Uint8Array(1200)); }
  setTimeout(() => process.exit(0), 3000); };
' <shady name> google.com
# The shady name prints "closed 0x3" at once; google.com prints nothing (its stream stays open).
```

Off for one run: `-e edge_router_dns_port=0` (the router's file and the unit
then render as they did before the gate existed).

Known limits:

- Hostname-only classification. Platform-hosted adult content (Reddit, X,
  Telegram) is not caught. Gateway's SafeSearch/YouTube-Restricted policies
  are the next lever if wanted.
- `myip.wtf` is categorised benign by Cloudflare; anything that must be shady
  despite that needs a manual Gateway list.
- UDP never reaches the router, which only handles TCP CONNECT: the edges
  relay it directly (`proxy-udp = direct`). The name gate refuses it for a
  shady name. An adult name's UDP is still relayed (its TCP is refused, so no
  site sees two addresses, but a client that already knows a site speaks
  HTTP/3 is not stopped), and so is UDP to a literal address, like TCP to one.
- UDP to a shady name is refused, not carried: such a site works over TCP
  only. Carrying it needs holyWisp to speak SOCKS5 UDP associate (`proxy-udp`
  knows only `refuse` and `direct`) and a UDP path through amph to a Mullvad
  exit, which `shady-relay.py` and `mullvad-pool.py` do not have. What would
  replace the gate with less machinery is smaller: a `proxy-udp = ask` in
  holyWisp that, before a direct UDP dial, sends the proxy the name (a SOCKS5
  request the proxy answers without opening anything) and takes back either
  a refusal or the address to dial. The router would then refuse shady and
  adult names outright, with no DNS detour, no `IPAddressDeny` and no shared
  destination key, and could name the family at once instead of through
  holyWisp's DNS cache (next item).
- One family per name ("One family per name" above) is late by holyWisp's DNS
  cache, up to 120 s, and it follows TCP only: a name whose AAAA the edge's
  own resolver (the router's) returns and 1.1.1.1 (holyWisp's) does not is
  IPv6 for TCP and IPv4 for UDP, and nothing pins that. A slow IPv6 path
  (more than 3 s to connect) is treated as a dead one. Lowering holyWisp's
  `dns-ttl-s` on the edges would shorten the first gap at the price of more
  lookups through the gate; the role leaves it at holyWisp's default.

### Ansible speed

`ansible.cfg` pins `interpreter_python`, uses publickey-only SSH auth with a
10-minute ControlPersist, and enables `profile_tasks`. Before this, every task
paid ~2.5s for GSSAPI fallback + a fresh handshake; a full `edges.yml` across
all four hosts now takes ~70s. If a run looks stalled, don't pipe its output
through `grep | tail`: that buffers until exit.

### Troubleshooting

- **`edges.yml --check` and the holyWisp build.** `tasks/build.yml` runs for
  real in check mode (controller only: git checkout + container build into
  `~/.cache/abulxt/holywisp`), so the rest of the role diffs against the real
  binary. It fails early with "no working container engine" when neither
  `podman info` nor `docker info` succeeds on the controller. The post-start
  health check is skipped in check mode. In `origin.yml --check` the "Enable
  and start" task fails with `Could not find the requested service
abulxt-edge-wisp.service` on a host that has never had the unit, a
  check-mode artifact.
- **`mcpanel.`/`mc.`/`mcnode.` serve the abulxt SPA through santaclara,
  losangeles and chicago, but work through ashburn.** amph lost
  `conf.d/25-mc-relay.conf` (Ansible-rendered, `abulxt_origin` role), so the
  remote edges' forward to amph hits its catch-all. Ashburn proxies to the
  backend directly and never notices. abulxt's `deploy/openresty-deploy.sh` used to
  replace amph's `conf.d/` wholesale from abulxt's `deploy/openresty/conf.d/`, deleting
  every host-only file. It did that on 2026-10-09 and again on 2026-10-19
  (`conf.d.bak.1792369984/` holds the last good copy); restored 2026-10-25 with
  `cp -p` from that backup, `openresty -t`, reload. Since 2026-11-17 abulxt's deploy syncs
  amph's OpenResty itself (`sync_openresty` in its `deploy/abulxt-deploy-root.sh`) and keeps
  this role's files by name (`OR_HOST_FILES`); `deploy/openresty-deploy.sh` is gone. Check with
  `curl -sk --resolve mcpanel.abstracteducation.loan:443:<edge-ip> https://mcpanel.abstracteducation.loan/`
  per edge IP (expect the Pterodactyl title; `mcnode.` answers `401` JSON).
  The script now carries host-only `conf.d/*.conf` files over (the mc relay,
  holt's `06-holt-licenses.conf` / `55-holt.conf` / `56-holtlab.conf`) and
  writes `conf.d/.repo-files`, so a conf the repo later removes is dropped
  rather than carried. A conf removed from the repo before the first deploy
  that writes `.repo-files` is carried as host-only: delete it on amph by hand.
  To re-render only the relay, `origin.yml --tags origin` does it (the role no
  longer rebuilds a firewall on amph).
- **abulxt-ashburn: `openresty` role fails in the apt cache update** (observed
  2026-10-10). A Cloudsmith Caddy apt source
  (`dl.cloudsmith.io/public/caddy/stable/deb/debian`) returns `402` / "no
  longer signed" and `apt-get update` aborts. Fix: remove or disable that
  source on the host (`/etc/apt/sources.list.d/`). Until then, run the wisp
  roles with `--start-at-task` or a role-limited play so the apt step is
  skipped.

## Link routing

Which site a domain on the edge's catch-all leads to (README.md "Link routing"). The table is in
the edges' shared Redis, terp.db `80.93.219.21:6380` (amph's `127.0.0.1:6379` with
`shared_redis_on_terp_db: false`). terp.db admits only divide's address, so ask from a divide
guest with `redis-cli`, amph for one. Paste `shared_redis_password` at the prompt: in the
environment it never shows in `ps` or the shell history.

```sh
# on amph
read -rs REDISCLI_AUTH && export REDISCLI_AUTH
r() { redis-cli -h 80.93.219.21 -p 6380 "$@"; }
r HGET linkroute:v1 example.com     # the entry for that name, nil when none
r HGET linkroute:v1 __ready         # last full sync (unix s); nil = table lost, edges use their stale cache
r HLEN linkroute:v1
date +%s                            # __ready should be under ~60 s behind
```

A name with no entry of its own takes its nearest registered parent (`a.b.example.com`, then
`b.example.com`, then `example.com`); none means the placeholder page. The edge caches each
answer for 30 s (`link_routes_fresh_ttl`): a change in the bot shows within that. A reload keeps
the cache (shared dicts survive it); only a restart empties it, stale copies included.
What the edge actually does, without a certificate request for an unready name (send the Host
header only, as in "Fracital routes"):

```sh
# from the edge
curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: example.com' https://127.0.0.1/
curl -sk -H 'Host: example.com' https://127.0.0.1/ | grep -c __FRX_OBF__          # 1 on fracital, 0 elsewhere
curl -sk -H 'Host: example.com' https://127.0.0.1/ | grep -c 'Nothing is set up'  # 1: nobody registered it
grep 'link_routes:' /usr/local/openresty/nginx/logs/error.log | tail              # Redis trouble, one line a minute
```

## Shared Redis on terp.db

The edges keep their certificates (`auto-ssl:*`) and link routing's `linkroute:v1` in one Redis.
It was amph's auto-ssl Redis (`allkeys-lru`, which could evict either); with this change it is
a dedicated Redis on terp.db (`shared_redis_*` in `group_vars/all/main.yml`: `noeviction`, AOF,
`requirepass` = `shared_redis_password`, firewalled to divide's `91.199.82.174`). wisp.baby's live
stats (`wispbaby:*`) followed on 2026-11-18 (`docs/terp-db.md` "Shared Redis (6380)"). One switch,
`shared_redis_on_terp_db`, picks the side for all three, and `roles/abulxt_origin` stops amph's Redis
and closes 6379 while it is true.

Order (each step needs the go-ahead for that host):

1. terp.db's Redis answers from amph (`r PING` above), and `shared_redis_password` is in the
   vault and in GitHub (`scripts/sync-ci-secrets.py`, secret `SHARED_REDIS_PASSWORD`). Without
   the secret, `apply.yml` stops at "Write the vars files".
2. abulxt points its link-routing writer and `/ask` at terp.db (abulxt `config.js`) and the bot's
   first full sync has written `__ready` with every existing name seeded as `abstract`.
3. `playbooks/fracital-origin.yml`: terp's default server learns `X-FRX-App`.
4. Right before step 5, copy the certificates from amph (it reaches both). `MIGRATE ... COPY`
   leaves amph's copy for a rollback; `-x` hands the password over stdin, so it is not in `ps`:

   ```sh
   # on amph
   export REDISCLI_AUTH="$(awk '/^requirepass /{print $2}' /etc/redis/redis.conf)"   # amph's
   read -rs DST && export DST                                                         # shared_redis_password
   redis-cli --scan --pattern 'auto-ssl:*' | while read -r k; do
     printf '%s' "$DST" | redis-cli -x MIGRATE 80.93.219.21 6380 "$k" 0 5000 COPY REPLACE AUTH >/dev/null
   done
   redis-cli --scan --pattern 'auto-ssl:*' | wc -l
   REDISCLI_AUTH="$DST" redis-cli -h 80.93.219.21 -p 6380 --scan --pattern 'auto-ssl:*' | wc -l   # the same
   ```

5. `playbooks/edges.yml --tags relay` (the edge reads terp.db from here on), then `--tags wisp`
   (holyWisp may not reach terp.db: `IPAddressDeny`; restarting it drops the relay sessions).
6. Run the copy loop once more without `REPLACE`: it adds what the edge issued on amph between
   steps 4 and 5 and leaves terp.db's newer keys alone (`BUSYKEY` for those).

Check: `curl -skI --resolve <any byod name>:443:127.0.0.1 https://<name>/` from the edge serves
its real certificate, and `grep -c 'auto-ssl' /usr/local/openresty/nginx/logs/error.log` does not
grow.

Rollback: `shared_redis_on_terp_db: false`, `--tags relay` and `--tags wisp`. Copy back first the
certificates terp.db issued (the same loop on amph with source and destination swapped, without
`REPLACE`). abulxt's writer goes back to amph too, or link routing answers from its stale cache.

The amph side of the rollback (amph's Redis has been stopped since 2026-11-18 00:47 UTC; its last
dump is `amph:/root/redis-amph-retired-20261118004759.rdb`, also still `/var/lib/redis/dump.rdb`):
`playbooks/origin.yml -l amph --tags origin` with the switch false starts it again and reopens 6379
in amph's firewall. Put 6379 back by hand in divide's `from_edge` chain and in `213.fw`
(`docs/divide-host.md`). Set abulxt's `wispStats.redis` back to `127.0.0.1:6379` (backup
`/opt/abulxt-main-site/config.js.bak-wispredis-20261118004313`), restart `abulxt-wispstats`, and copy
the `wispbaby:hll:*` keys back if the visitor counts should carry over.

## Rollback

- **DNS:** re-run `playbooks/dns.yml` after trimming `groups['edge']`, or set
  the RRset back to just ashburn in the Gcore portal.
- **Gateway allowlist:** re-run `playbooks/dns.yml --tags gateway` with the
  trimmed inventory. To open a location to all sources, PUT it with
  `endpoints.doh.networks: []`. To revoke everything, delete the
  `abulxt-gateway-ansible` token under the account's API Tokens.
- **Edge Wisp:** to fall back to relaying `/wisp` to amph, delete the two
  `location ~* ^/wisp` blocks from
  `roles/edge_relay/templates/byod-edge.conf.j2` and rerun `edges.yml`; the
  catch-all `location /` then forwards `/wisp/<key>/` to amph `:9080` as
  before. `systemctl disable --now abulxt-edge-wisp abulxt-edge-router` on
  each edge if you want them stopped too. The amph relay can stay up; it is
  harmless without callers.
- **amph relay (Ansible → old npm wrapper):** `ssh amph 'systemctl disable --now
abulxt-edge-wisp && systemctl enable --now abulxt-wisp'`. Both units point
  at `127.0.0.1:6001`, so OpenResty is untouched. Reverse it with the two names
  swapped (or re-run `origin.yml --tags wisp`).
- **Classifier bypass (emergency):** on an edge, point holyWisp at nothing:
  edit `/etc/abulxt/holywisp.conf`, set `proxy =` (empty) and delete the
  `dns-server = 127.0.0.1:1083` line (the name gate: with it a shady name
  still resolves to amph, which the unit may not reach), `systemctl restart
abulxt-edge-wisp`. Every stream then goes direct with no verdict.
- **Relay rollback to wispurr:** README "Rollback to wispurr".
- **Edges:** the role is idempotent, so re-running is safe. To pull an edge out of
  rotation, remove its IP from the DNS RRset (no need to stop OpenResty).
- **Edge nftables:** a failed apply rolls itself back (`edge-firewall-rollback`
  timer, README "Edge firewall"). To undo the 2026-10-11 migration by hand on a
  host: `cp -a /etc/nftables.conf.bak-firewall-<ts> /etc/nftables.conf && rm -f
/etc/nftables.d/*.nft && systemctl reload nftables`. On santaclara,
  losangeles and chicago (no firewall before) also `systemctl disable nftables`
  (`/etc/nftables.svc.bak-firewall-<ts>` records the old enable state, and
  `/etc/nftables.live.bak-firewall-<ts>.nft` the old live ruleset). On ashburn
  the pre-8080 file is still `/etc/nftables.conf.bak-8080`. Each Ansible render
  also leaves a timestamped `/etc/nftables.conf.<pid>.<date>@<time>~` copy beside
  it, which nftables ignores. Set `edge_firewall_manage: false` before rerunning
  the edge play, or it puts the contract back.
- **mcnode :8080:** remove `listen 8080` lines and the catch-all `server` block from
  `roles/edge_relay/templates/mc-routes.conf.j2`, then rerun `playbooks/edges.yml`.
  Clients fall back to 443.

## Nearest-site relay routing (per-site DNS)

The browser picks the relay site nearest the user (Cloudflare colo from
`/cdn-cgi/trace` -> city -> distance, confirmed by a round-trip race; see
abulxt `main/src/proxy/relay-geo.ts`). It needs one hostname per site:

1. Create the records (Gcore, zone `byod.abstracteducation.loan`):
   `ansible-playbook playbooks/dns.yml --tags sites --vault-password-file <file>`
   This upserts `<site>.byod.abstracteducation.loan` A RRsets from each edge's
   `edge_advertise_ips` (ashburn, chicago, losangeles, santaclara), the abstract
   half only. It does not touch the apex RRsets. No edge change is needed: the domains service approves
   TLS for any name that resolves to an edge IP.
2. Check: `dig +short ashburn.byod.abstracteducation.loan` lists only that site.
3. Set `client.relaySites` in every host's `config.js` (see
   abulxt `main/config.example.js`) and redeploy.

These per-site RRsets are static in Gcore (the live zone on the edge nameservers
health-checks them, README "Edge DNS"); a dead site is skipped by the browser's round-trip race, which falls back to the
apex. Re-run step 1 after changing an edge's `edge_advertise_ips`.
