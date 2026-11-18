# BYOD server (amph.ashburn)

Public-facing edge box. OpenResty here (Caddy is stopped) is the only thing the internet ever talks to.
It reverse-proxies **directly** to amph (the abulxt origin) over the public
network; the legacy reverse SSH tunnel has been removed for abulxt's path.

## Inbound: site traffic

- OpenResty config (`/usr/local/openresty/nginx/conf`): BYOD catch-all `:443`, on-demand TLS, reverse-proxies to
  `{$ABULXT_ORIGIN}:9080` (amph's origin-internal listener) with the shared
  `X-BYOD-Token`.
- On-demand TLS approval (`on_demand_tls.ask`) calls amph's
  **abulxt-domains** validator at `http://{$ABULXT_ORIGIN}:8822/ask?target=ashburn`.
  A domain is approved only when its DNS A/AAAA already resolves to this box's
  IP (`45.82.161.87`), so bogus SNIs never burn CA rate limits.
- `50-origin-internal.conf` (installed on **amph**) is the `:9080` target. It
  listens on the public interface, is restricted to this edge's IP by the
  abulxt firewall, and only accepts requests carrying `X-BYOD-Token`.
- amph's firewall (`origin/abulxt-firewall.sh`) opens `9080` and `8822` **only**
  to `45.82.161.87`. Set `ABULXT_ORIGIN` (default `172.16.5.3`, amph on divide's private vmbr1, the
  only address it has since 2026-11-16) in the edge
  environment (`/etc/caddy/byod-proxy.env` on the Ashburn box) to point at amph.

## Outbound: Wisp egress (Mullvad pool, on amph)

abulxt's Wisp server no longer egresses through this box. On **amph**,
`mullvad-pool.service` runs `mullvad-pool.py`: a SOCKS5 front bound to
`127.0.0.1:1080` (no auth, loopback only) that load-balances CONNECTs across
the live Mullvad relay directory (`api.mullvad.net/www/relays/wireguard/`,
filtered to the cities in `/etc/abulxt/mullvad-pool.json`, default
was/qas/nyc). Relay names are resolved via Mullvad DNS `100.64.0.3` to their
in-tunnel `10.124.x.x` addresses; amph's static routes carry `10.124.0.0/16`
and `100.64.0.0/16` over `eth0` (`post-up` lines in `/etc/network/interfaces`
since amph became CT 213 on 2026-11-17; `ens20` on the VM). Upstreams are
probed every 30s and failed ones sit out for 45s; the relay list re-syncs
hourly.

`abulxt-wisp` points at `socks5://127.0.0.1:1080`, so every site the Wisp
server fetches on abulxt's behalf exits through a rotating Mullvad relay
instead of this box (or the origin's own IP).

### Shady relay for the edge fleet

`shady-relay.py` (`shady-relay.service`) listens on `0.0.0.0:1082` with
SOCKS5 username/password auth and chains every CONNECT into the pool above.
The edges' Wisp routers send only their "shady" verdicts here, so those
streams exit via Mullvad while clean traffic leaves the edge directly. The
port is opened to the edge /24s only by `abulxt-firewall.sh`
(`SHADY_RELAY_PORT`). Installed by the `abulxt_origin` Ansible role; the
credential lives in the vault (`shady_relay_password`). See
`ansible/RUNBOOK.md` Phase 6.

### Setup on amph

```sh
install -d -m 0755 /opt/mullvad-pool
cp mullvad-pool.py /opt/mullvad-pool/ && chmod 755 /opt/mullvad-pool/mullvad-pool.py
cp mullvad-pool.json /etc/abulxt/mullvad-pool.json && chmod 644 /etc/abulxt/mullvad-pool.json
cp mullvad-pool.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mullvad-pool
```

Verify:

```sh
journalctl -u mullvad-pool -n 20        # "relays added from directory: ..."
curl -sS -x socks5://127.0.0.1:1080 https://api.ipify.org   # Mullvad exit IP
```

## Bring-your-own subdomain (auto HTTPS)

Caddyfile shape (same idea as a plain `:443` + `tls { on_demand }` BYOD edge):
global `on_demand_tls.ask` → amph's **abulxt-domains** `:8822` (`target=ashburn`),
catch-all `:443` with default issuers (LE then ZeroSSL; **don't pin a single
issuer**), reverse_proxy DIRECTLY to amph's origin-internal `:9080` with
`X-BYOD-Token`.

1. Create a **CNAME** for your hostname to `byod.abstracteducation.loan`. For an apex,
   use your DNS host's ALIAS / CNAME flattening. Never use a fixed edge address: edges
   come and go (the old ashburn address 45.82.161.87 was cancelled 2026-11-13).
2. Do **not** SSH into the VPS. On-demand TLS asks amph's abulxt-domains validator.
3. Ask returns **204** only when the hostname's DNS A/AAAA (following CNAMEs)
   resolves to an edge address in `domains.loadBalancerIp`: this proves the domain
   is genuinely pointed at the edges and stops bogus SNIs from burning CA rate limits.
4. Caddy then issues a cert and reverse-proxies to amph origin directly.

Discord domain verification for `abulxteducation.loan` is served from origin as
`/.well-known/discord` (plain text) and is host-scoped to that domain only.

### Cert notes / LE rate-limit escapes (no Cloudflare)

LE's **50 certs / registered domain / week** limit bites hard on shared parents
like `student-*.lunabot.lol`. Workarounds, best → backup:

1. **ZeroSSL ACME fallback (live now)**: Caddyfile issues LE first, then
   `https://acme.zerossl.com/v2/DV90`. Validated: `student-7495.lunabot.lol`
   got a trusted ZeroSSL cert + HTTP 200 after LE 429'd.
   Use `issuer acme { dir https://acme.zerossl.com/v2/DV90 ... }`:
   do **not** use `issuer zerossl <email>` (that arg is an API access_key).
2. **Wildcard DNS-01** for `*.lunabot.lol` (+ apex) via the parent DNS API
   (`ns1.anko.rest` / Spaceship). One cert covers every student host forever;
   best long-term for high-churn parents.
3. **Unique apex per tenant**: `foo.loan`, `bar.site`, etc. LE treats each
   registered domain separately, so the 50/week bucket never piles up.
4. **Google Public CA / SSL.com / Sectigo ACME**: directories are live, but need
   EAB/account setup. Useful if ZeroSSL ever flakes.
5. **Wait for LE window**: slots free ~hourly as the oldest of the 50 age out
   of the 168h rolling window (not a real strategy under load).

BuyPass ACME is dead (`HTTP 404` on `/acme/directory`).

### Exact DNS for Discord domain

```
abulxteducation.loan      ALIAS  byod.abstracteducation.loan
www.abulxteducation.loan  CNAME  byod.abstracteducation.loan
```

After DNS propagates, open `https://abulxteducation.loan/` and
`https://abulxteducation.loan/.well-known/discord`: no Cloudflare proxy needed
(DNS-only / grey-cloud if the domain happens to live at CF).
