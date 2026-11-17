# divide, the Proxmox host

divide (alias wisp.baby) is the Proxmox host that every abulxt host, terp and holy have been
guests of since 2026-11-16 (G-Core Labs AS202422, Ashburn/Manassas). It has one public IPv4,
**91.199.82.174** (`divide_public_ip`, on `bond0`), and no public IPv6 for guests. The guests sit
behind NAT on `vmbr1`, **172.16.5.0/24**, with divide at **172.16.5.1** as their gateway.

**Second uplink (2026-11-17).** VLAN 2832 on `bond0` (`/etc/network/interfaces.d/60-wan2832`)
gives divide **172.16.0.2/24**; the provider's router at 172.16.0.1 NATs it to **37.9.34.169**.
Every connection the edge opens leaves that way: the nftables chain `inet divide edge_out` marks
it `0x2832` and routing table 2832 sends it out the VLAN. That covers holyWisp's direct streams,
the WARP tunnels and the name gate's Gateway DoH (so `gateway_dns_extra_networks` lists
37.9.34.169/32). Replies to inbound clients still leave from 91.199.82.174.

**No role in this repo configures divide.** `roles/proxmox_host` is for the wisp cloud's routed
10GbE hosts (`[wisp_pve]`, public addresses on `vmbr0`); divide is NATed and was set up by hand.
This page records what runs there, so it can be rebuilt. The authoritative copy of each file is
the one on divide: diff against it before you reuse anything here. Changing divide needs explicit
authorization, like any other live host (AGENTS.md "Servers").

## Guests on vmbr1

| Address      | Guest                 | What                                                             |
| ------------ | --------------------- | ---------------------------------------------------------------- |
| 172.16.5.1   | divide                | gateway, NAT, its own ACME client (`divide.eli.gift`)            |
| 172.16.5.3   | amph                  | abulxt origin (`[origin]`)                                       |
| 172.16.5.10  | edge (CT 201)         | the only abulxt edge (`[wisp_edge]`, `host_vars/edge.yml`)       |
| 172.16.5.11  | wg                    | WireGuard, udp 51820                                             |
| 172.16.5.37  | sm                    |                                                                  |
| 172.16.5.47  | kru                   | KrunkNative central node (krunk.io origin)                       |
| 172.16.5.48  | blockshooter (CT 202) | blockshooter relay (`[bs_ct_divide]`)                            |
| 172.16.5.62  | terp                  | Fracital origin, VM 116 (moved from meal 2026-11-16)             |
| 172.16.5.64  | chat                  | estro.help backend (`host_vars/amph.yml` `estro_upstream`)       |
| 172.16.5.78  | giftshop (VM 111)     | powered off 2026-11-17 (see "giftshop: retired" below)           |
| 172.16.5.79  | holy (CT 205)         | holyunb.locker site (website2 :8080), was VM 127                 |
| 172.16.5.94  | kn (CT 203)           | KrunkNative game servers (`[kn_ct_divide]`)                      |
| 172.16.5.206 | fg (CT 206)           | Flying Gorilla game API (fg-api :8787), from giftshop 2026-11-17 |
| (tap101i0)   | mull (VM 101)         | may only talk to chat and sm (bridge firewall below)             |

Ansible reaches the guests with `ProxyJump root@91.199.82.174` (`group_vars/divide_guests.yml`).

## Guest tags

Every guest's Proxmox tags follow one scheme, in this order (the UI shows them in config order,
`tag-style ordering=config` in `/etc/pve/datacenter.cfg`, which also holds the colours):

1. **Role**, exactly one: `edge`, `origin`, `app`, `game`, `gateway`, `vpn`, `ci`, `dev`, `desktop`,
   `template`.
2. **Project**, where the guest belongs to one: `abulxt`, `fracital`, `wisp-baby`, `holyunb`,
   `krunk`, `blockshooter`, `eaglercraft`, `estro`, `eli-gift`.
3. **How traffic gets in**, any of: `in-edge` (served through the edge, directly or by way of
   amph), `in-tunnel` (runs the cloudflared tunnel; only the edge since 2026-11-17), `in-dnat` (a port forward on divide, "NAT"
   below).
4. **How it gets out**, when not plain NAT: `out-mullvad` (may use mull), `out-warp` (the edge's
   WARP tunnels).
5. `legacy` for the two stopped Windows desktops that keep a meal address on `vmbr9`.

The software a guest runs is its name and the table above, not a tag.

| Guest                  | Tags                                      |
| ---------------------- | ----------------------------------------- |
| vault (100)            | `app` `eli-gift` `in-edge`                |
| mull (101)             | `gateway` `in-dnat`                       |
| eagler (104)           | `game` `eaglercraft` `in-edge` `in-dnat`  |
| fun (105)              | `desktop` `legacy`                        |
| chat (106)             | `app` `estro` `in-edge` `out-mullvad`     |
| fum (110)              | `desktop` `legacy` `out-mullvad`          |
| giftshop (111)         | `app` `eli-gift` (powered off 2026-11-17) |
| amph (113)             | `origin` `abulxt` `in-edge` `out-mullvad` |
| terp (116)             | `origin` `fracital` `in-edge` `in-dnat`   |
| guca (117)             | `app` `eli-gift` `in-edge`                |
| kru (120)              | `origin` `krunk` `in-edge` `in-dnat`      |
| wispdev (122)          | `dev` `wisp-baby`                         |
| mac (126)              | `ci`                                      |
| wg (200)               | `vpn` `in-dnat`                           |
| edge (201)             | `edge` `in-dnat` `in-tunnel` `out-warp`   |
| blockshooter (202)     | `game` `blockshooter` `in-edge` `in-dnat` |
| kn (203)               | `game` `krunk` `in-dnat`                  |
| runner (204)           | `ci`                                      |
| holy (205)             | `origin` `holyunb` `in-edge`              |
| fg (206)               | `game` `eli-gift` `in-edge`               |
| templates (9000, 9001) | `template`                                |

A guest that gains or loses a port forward, a tunnel or an edge route gets its `in-` tags changed
in the same change (`pct set <id> --tags "a;b"`, `qm set` for VMs).

## CPU pinning and memory (2026-11-17)

Set by hand on 2026-11-17 (about 05:10 to 05:22 UTC) from the holyWisp session, with the
owner's approval. Backups of every guest config from before the change, and chat's pre-repair
disk image (43 GB), are in `divide:/root/alloc-backup-20261117T051000/`.

divide is a Ryzen 9 7950X: CCD0 is threads 0-7 and 16-23, CCD1 is 8-15 and 24-31. Containers
are pinned with `lxc.cgroup2.cpuset.cpus` in `/etc/pve/lxc/<id>.conf` (which stops pvestatd
rebalancing them), VMs with `qm set --affinity`.

| Threads      | Guests                           |
| ------------ | -------------------------------- |
| 0-3, 16-19   | edge (CT 201), exclusive         |
| 4-5, 20-21   | kn (CT 203)                      |
| 6, 22        | kru (120), blockshooter (CT 202) |
| 7, 23        | guca (117), fg (CT 206)          |
| 7            | vault (100), wg (CT 200)         |
| 23           | chat (106)                       |
| 0-7, 16-23   | every VM except mac, holy (205)  |
| 8-11, 24-27  | mac (126), runner (204)          |
| 12-15, 28-31 | wispdev (122), exclusive         |

Allocation changes (total allocated memory 104.5 of 125 GiB, was 122.5; every other guest
unchanged):

| Guest        | Before                | After                |
| ------------ | --------------------- | -------------------- |
| vault        | 4 GiB                 | 1 GiB                |
| guca         | 4 GiB                 | 2 GiB                |
| kru          | 16 GiB, 4 cores       | 8 GiB, 2 cores       |
| blockshooter | 4 GiB, 4 cores        | 2 GiB, 2 cores       |
| chat         | 4 cores, rootfs 48 GB | 1 core, rootfs 64 GB |
| mull         | 2 GiB                 | 1 GiB                |
| giftshop     | 4 GiB                 | 2 GiB                |
| holy         | 4 GiB                 | 2 GiB                |
| amph         | 4 GiB                 | 6 GiB                |

chat's ext4 had errors (EFSCORRUPTED in a block bitmap, first seen 2026-11-16 23:36). It was
repaired offline with e2fsck before the rootfs was grown.

## Host firewall: /etc/nftables.conf

divide's own firewall, its NAT and the `vmbr1` bridge rules are a plain `nftables.service`. The
guests' firewalls are Proxmox's legacy `pve-firewall` (iptables), see "Guest firewalls" below. The
nftables engine, `proxmox-firewall`, is disabled (`systemctl disable`, and `nftables: 0` in
`host.fw`): the `nf_conntrack_bridge` module it needs broke the host's masquerade.

The file manages **only its own tables**. Each table starts with the create-then-delete idiom, so a
reload replaces it without touching anyone else's:

```
table inet divide
delete table inet divide
table inet divide {
    ...
}
```

Never `flush ruleset`: fail2ban keeps its bans in its own table, and a flush drops them.

### `table inet divide` (the host itself)

- **input**, policy drop:
  - established/related
  - `lo`
  - from `vmbr1` saddr 172.16.5.11 (wg)
  - `vmbr1` tcp 80: divide's ACME HTTP-01. The edge forwards `divide.eli.gift` to it, see below.
  - icmp
  - tcp 22 (divide's own sshd, from anywhere; fail2ban watches it)
  - tcp 8006 (web UI, VNC/xterm.js) and 3128 (spiceproxy) from the admin IPs
    `{ 5.188.124.57, 108.217.204.73 }` only
- **forward**: from the LAN (`vmbr1`) to the WAN and to the LAN is accepted. Traffic in from the
  WAN is accepted with `ct status dnat` (the port forwards below). The LAN's outbound connections
  also need their replies admitted (established/related): check the live file when you rebuild.
  The first rule accepts `iifname "fwbr*"`: frames bridged inside a guest's Proxmox firewall
  bridge, which `pve-firewall` filters.
- **fwbr_zone** (prerouting, priority raw): `iifname "fwbr*" ct zone set 1`. With `br_netfilter`
  a guest's packet is tracked twice, once bridged in its `fwbr` and again routed on `vmbr1`. The
  routed pass needs its own conntrack entry to be NATed, so the bridged pass uses zone 1 (the
  setup the Proxmox firewall docs give for masquerading hosts).
- **hairpin_mark** (prerouting, priority dstnat + 10): `iifname "vmbr1" ct status dnat meta mark
set meta mark | 0x4000`. `divide_guests` accepts that mark, see "The hairpin is bridged" below.

### `table ip divide_nat` (port forwards and NAT)

DNAT of the public address:

| Proto     | Ports                                                             | To                                                                 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| tcp       | 53, 80, 443, 8080                                                 | edge 172.16.5.10                                                   |
| udp       | 53, 443                                                           | edge 172.16.5.10                                                   |
| udp       | 51820                                                             | wg 172.16.5.11                                                     |
| udp       | 41820                                                             | mull 172.16.5.6:51820 (mull's WireGuard; clients exit via Mullvad) |
| tcp + udp | 21015-21017, 21115                                                | kn 172.16.5.94 (game servers)                                      |
| udp       | 21100                                                             | kru 172.16.5.47 (kn-rtc)                                           |
| udp       | 4433, 8443                                                        | blockshooter 172.16.5.48                                           |
| tcp       | 7778, only from `{ 2.56.245.71, 65.187.172.101, 172.93.218.175 }` | blockshooter 172.16.5.48                                           |
| tcp       | 8443                                                              | terp 172.16.5.62 (dev.fracit.al)                                   |
| tcp       | 2022, 25565, 25566                                                | eagler 172.16.5.76 (wings SFTP, Abstract Anarchy, RLCraft)         |
| udp       | 25565, 25566                                                      | eagler 172.16.5.76 (game UDP; Simple Voice Chat shares 25565)      |

tcp 22 is not forwarded: it is divide's own sshd. The edge's firewall (`edge_firewall_dropins`)
does not open 53, so the tcp/udp 53 forward reaches a closed port. PowerDNS is retired.

NAT:

- `oifname bond0 masquerade`: the guests' egress is 91.199.82.174 (what Cloudflare Gateway, terp's
  old rules and every third party see).
- **Hairpin**: `oifname vmbr1 ip saddr 172.16.5.0/24 ct status dnat masquerade`. A guest that
  dials 91.199.82.174 is DNATed back onto `vmbr1` and arrives from 172.16.5.1. This is why
  wisp.baby's speed test admits 172.16.5.0/24 (`host_vars/edge.yml`
  `wispbaby_speedtest_allow_extra`).
- Both NAT chains start with `iifname "fwbr*" return` (prerouting) and `oifname "fwbr*" return`
  (postrouting): the bridged pass inside a Proxmox firewall bridge is never NATed; the routed pass
  on `vmbr1` is.

### `table bridge divide_guests` (guest-to-guest firewall)

The stateless equivalent of Proxmox's per-NIC `ipfilter`, on the `vmbr1` bridge:

- **Anti-spoof**: a set of `ifname . ipv4_addr` pairs, one per guest port (`veth<ct>i0`,
  `tap<vm>i0`) and its address. An IPv4 frame from a guest port whose pair is not in the set is
  dropped. Since every guest NIC has `firewall=1`, the port on `vmbr1` is `fwpr<id>p<n>`, not in
  the `ports` set, so this check is skipped and Proxmox's `ipfilter` does the job instead. A NIC
  set back to `firewall=0` gets its old port name, and this check, back.
- **forward**, policy drop. Allowed:
  - anything inside a Proxmox firewall bridge (`meta ibrname "fwbr*"`): `pve-firewall` filters it
  - the hairpin mark 0x4000 (below)
  - ARP
  - IPv6 other than tcp/udp (neighbour discovery)
  - ICMP
  - the WireGuard port (udp 51820, to and from wg 172.16.5.11), both ways
  - mull (`tap101i0`): in and out only to and from chat 172.16.5.64 and sm 172.16.5.37
  - The rules that name a port list both names, the plain one and the firewall one:
    `{ "veth200i0", "fwpr200p0" }` for wg and `{ "tap101i0", "fwpr101p0" }` for mull.
  - tcp without a lone SYN (it is stateless: established flows pass, new connections need a rule
    below)
  - new tcp from the edge 172.16.5.10 to the origins:

    | To                       | tcp ports                       |
    | ------------------------ | ------------------------------- |
    | amph 172.16.5.3          | 80, 443, 1082, 6379, 8822, 9080 |
    | kru 172.16.5.47          | 80, 443                         |
    | blockshooter 172.16.5.48 | 80, 8080                        |
    | terp 172.16.5.62         | 443, 8443                       |
    | holy 172.16.5.79         | 8080                            |
    | fg 172.16.5.206          | 8787                            |
    | guca 172.16.5.38         | 80 (the edge's cloudflared)     |
    | vault 172.16.5.63        | 80 (the edge's cloudflared)     |
    | chat 172.16.5.64         | 80 (the edge's cloudflared)     |

  - other guest-to-guest paths:

    | From                | To                 | Ports                                    | Why                                                                                                     |
    | ------------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
    | runner 172.16.5.204 | terp 172.16.5.62   | tcp 22                                   | CI deploys (stomp deploy gate)                                                                          |
    | runner 172.16.5.204 | chat 172.16.5.64   | tcp 22                                   | CI deploys (estro deploy gate)                                                                          |
    | kru 172.16.5.47     | kn 172.16.5.94     | tcp + udp 21015-21017, 21115             | kn-bridge (tcp) and kn-rtc (udp) to game servers                                                        |
    | kn 172.16.5.94      | kru 172.16.5.47    | udp from source ports 21015-21017, 21115 | the game servers' udp replies (stateless chain)                                                         |
    | amph 172.16.5.3     | chat 172.16.5.64   | tcp 80                                   | estro.help origin behind amph :9080                                                                     |
    | amph 172.16.5.3     | eagler 172.16.5.76 | tcp 443, 8080, 25565                     | mc, mcpanel, mcnode relay (25-mc-relay.conf)                                                            |
    | amph 172.16.5.3     | holy 172.16.5.79   | tcp 8080                                 | abulxt `/cdn/` (theatre) via `abulxt_cdn_backend`; added 2026-11-17, it had been dropped since the move |
    | amph 172.16.5.3     | edge 172.16.5.10   | tcp 443                                  | pages.eli.gift through the hairpin (abulxt `/cdn/html5/fg`, Flying Gorilla), 2026-11-17                 |
    | holy 172.16.5.79    | edge 172.16.5.10   | tcp 443                                  | the same for website2's `/cdn/html5/fg`                                                                 |

  Traffic between a guest and divide (its gateway, DNS, the NAT) is not bridged and does not
  pass this chain.

  **The hairpin is bridged.** `pve-firewall` turns on `br_netfilter` (and
  `bridge-nf-call-iptables`) for every bridge. A guest that dials 91.199.82.174 for a port DNATed
  to another guest is then DNATed in the bridge's prerouting, and `br_netfilter` bridges the frame
  straight to the other guest's port instead of routing it, so this chain sees a new SYN between
  two guests. It is still masqueraded (conntrack shows the reply going to 172.16.5.1). Since about
  22:21 UTC on 2026-11-17, `inet divide hairpin_mark` marks every DNATed connection from `vmbr1` with
  0x4000 and this chain accepts the mark, which is the same exposure as from the internet. Before
  that, every guest's hairpin was dropped from 22:10 UTC (pve-firewall started) unless a pair rule
  allowed it, which is why amph and holy also have their own tcp 443 lines to the edge.

holy's pair is `veth205i0` (it was `tap127i1`, VM 127's second NIC, until 2026-11-17). fg's is
`veth206i0` . 172.16.5.206 (CT 206, 2026-11-17).

A new edge-to-origin path needs a line here, a rule in the guest's `/etc/pve/firewall/<id>.fw`
(below), and the origin's own firewall where it has one (amph: `abulxt-firewall.sh`,
`EDGE_SUBNETS="172.16.5.0/24"`; terp: ufw, `roles/fracital_origin`).

## CI keys on divide

divide's root `authorized_keys` (a symlink to `/etc/pve/priv/authorized_keys`) carries the CI keys
that only jump through it, each as
`restrict,port-forwarding,command="/bin/false",permitopen="<guest>:22"`. `restrict` alone still lets
a key run commands; the forced `/bin/false` is what blocks them. Back the file up before editing it.

| Key                               | May forward to                    | Logs in on the guest as                |
| --------------------------------- | --------------------------------- | -------------------------------------- |
| `infra-ci@Fracital/infra`         | `172.16.5.3:22`, `172.16.5.10:22` | root (Ansible)                         |
| `abulxt-ci-vps@y9x/abulxt`        | `172.16.5.3:22`                   | `deploy` on amph, `abulxt-deploy-gate` |
| `abulxt-ci-singlefile@y9x/abulxt` | `172.16.5.3:22`                   | `deploy` on amph, `abulxt-deploy-gate` |
| `abulxt-cloaks-ci@y9x/cloaks`     | `172.16.5.3:22`                   | `deploy` on amph, `abulxt-deploy-gate` |
| `holt-ci@y9x/holt`                | `172.16.5.3:22`                   | `deploy` on amph, `holt-deploy-gate`   |

## fail2ban

Jails `sshd` and `proxmox` (the web UI login). `ignoreip` includes wg 172.16.5.11 and the admin IPs
5.188.124.57 and 108.217.204.73. This is divide's own setup, not the vendored `roles/fail2ban`.

## Routes and networkd inside the containers

The CTs configure eth0 with ifupdown from the `/etc/network/interfaces` Proxmox writes, and extra
routes are `post-up` lines in that file. systemd-networkd also runs in most CTs, and by default it
deletes every route it did not create whenever it restarts. A systemd package upgrade restarts it,
so an `apt upgrade` removed chat's default route via mull on 2026-11-17 (chat was offline from
20:47 to 21:10 UTC, until a reboot reapplied the `post-up` lines). Every CT now has
`/etc/systemd/networkd.conf.d/10-keep-foreign-routes.conf`:

```
[Network]
ManageForeignRoutes=no
ManageForeignRoutingPolicyRules=no
ManageForeignNextHops=no
```

A new CT gets the same file before its first upgrade.

Routes via mull (172.16.5.6, VM 101) to Mullvad's side, as `post-up ip route replace ... via
172.16.5.6 dev eth0` lines:

| Guest      | Prefixes                                                     |
| ---------- | ------------------------------------------------------------ |
| chat (106) | 10.64.0.0/16, 100.64.0.0/16, 10.124.0.0/16; default via mull |
| wg (200)   | 10.64.0.0/16, 100.64.0.0/16, 10.124.0.0/16, 100.124.0.0/16   |

wg masquerades its VPN clients (172.16.8.0/24) to 172.16.5.11 on eth0, so mull sees wg's address.
The bridge firewall lets wg's port (`veth200i0`, `fwpr200p0` behind its Proxmox firewall) talk to
anyone, and mull forwards to `wg0-mullvad` from the LAN.

## Guest firewalls

Every guest NIC on `vmbr1` has `firewall=1` since 2026-11-17 (22:10 to 22:24 UTC), filtered by
Proxmox's legacy `pve-firewall` (iptables and ipsets). Proxmox plugs such a NIC into its own bridge
`fwbr<id>i<n>`, joined to `vmbr1` by the veth pair `fwln<id>i<n>` and `fwpr<id>p<n>`, and filters
on that bridge. Not filtered: giftshop (VM 111, retired) and fum (VM 110, stopped).

Earlier that day the guests filtered themselves (an nft table `inet guestfw` in 7 CTs, and a
narrowed ufw on eagler). That is all removed, and `divide/guestfw/` with it: guest rules belong in
`/etc/pve/firewall`, not inside the guest. The firewalls the guests' own roles install are
unchanged: amph's `abulxt-firewall.sh`, terp's ufw (`roles/fracital_origin`, it admits tcp 8443 only
from Cloudflare), blockshooter's `inet bsfilter`, eagler's original ufw.

- `/etc/pve/firewall/cluster.fw`: `enable: 1`; ipsets `mgmt` (divide 172.16.5.1, wg 172.16.5.11)
  and `bs_game` (blockshooter's three game servers); security group `base`: icmp, ipv6-icmp, and
  tcp 22 from `+dc/mgmt`.
- `/etc/pve/nodes/divide/host.fw`: `enable: 0`, `nftables: 0`. divide's own input stays in
  `/etc/nftables.conf`.
- `/etc/pve/firewall/<id>.fw`: `policy_in: DROP`, `policy_out: ACCEPT`, `log_level_in: info`
  (drops go to `/var/log/pve-firewall.log`), `ipfilter: 1` (the NIC may only send from its
  configured address; a VM lists it in an `ipfilter-net<n>` ipset), `GROUP base`, and then:

| Guest         | Also accepts                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| vault (100)   | tcp 80 from the edge (cloudflared)                                                                       |
| mull (101)    | anything from 172.16.5.0/24 (the gateway: guest rules also see what it forwards); udp 51820              |
| eagler (104)  | tcp 443, 8080, 25565 from amph; tcp 2022, 25565, 25566 and udp 25565, 25566                              |
| chat (106)    | tcp 80 from amph and the edge; 8317, 8318 from wg; 5900, 8088 from `mgmt`; 22 from the runner; udp 33190 |
| amph (113)    | tcp 80, 443, 1082, 6379, 8822, 9080 from the edge                                                        |
| terp (116)    | tcp 443, 8443 from the edge; tcp 8443 (the DNAT); tcp 22 from the runner                                 |
| guca (117)    | tcp 80 from the edge (cloudflared)                                                                       |
| kru (120)     | tcp 80, 443 from the edge; udp 21100                                                                     |
| wispdev (122) | nothing                                                                                                  |
| mac (126)     | tcp 5900 from `mgmt`                                                                                     |
| wg (200)      | udp 51820                                                                                                |
| edge (201)    | tcp 53, 80, 443, 8080 and udp 53, 443                                                                    |
| bs (202)      | tcp 80, 8080 from the edge; udp 4433, 8443; tcp 7778 from `bs_game`                                      |
| kn (203)      | tcp and udp 21015-21017, 21115                                                                           |
| runner (204)  | nothing                                                                                                  |
| holy (205)    | tcp 8080 from the edge and amph                                                                          |
| fg (206)      | tcp 8787 from the edge                                                                                   |

A port with no source listed admits anyone: the port forwards keep the internet source, and the
hairpin arrives from 172.16.5.1. mull and wg have `ipfilter: 0` because they forward traffic that
is not from their own address. The `vmbr1` bridge rules above still apply as well, so a new
guest-to-guest path needs a line in both.

Changing it:

- Edit the `.fw` file. `pve-firewall` applies it within about 10 s; `pve-firewall compile` prints
  the iptables it would load.
- `divide/pvefw/fwnic.sh <id> <n> <0|1>` (in `/root` on divide) sets `firewall=` on `net<n>`, a
  live replug. Arm the undo first, `systemd-run --on-active=150 /root/fwnic.sh <id> <n> 0`, check
  with `divide/pvefw/fwcheck.sh <id> <ip>`, then stop the timer. wg carries the operator's VPN, so
  its switch ran detached (`systemd-run`) and went last.
- Turn it all off: `systemctl stop pve-firewall`, `enable: 0` in `cluster.fw`, and
  `sysctl -w net.bridge.bridge-nf-call-iptables=0`. The NICs can stay on their `fwbr`: with no
  rules it just bridges. The configs from before are in `/root/pvefw-bak/` on divide.

Things learned on the way:

- `pve-firewall` sets `net.bridge.bridge-nf-call-iptables=1`, for every bridge. Each frame bridged
  on `vmbr1` then crosses the inet and ip hooks with `iifname` the bridge, which is what the
  `fwbr*` rules, the zone and the hairpin mark in `/etc/nftables.conf` are for.
- `nf_conntrack_bridge` stays unloaded (it was removed with `modprobe -r`); only the nftables
  engine wants it.
- Moving a NIC onto its `fwbr` starts its flows in a new conntrack zone. FINs of connections
  opened before the move count as INVALID and are dropped (the first rule of `PVEFW-FORWARD`); they
  stop once those connections age out.

## TCP tuning and modules

The edge is a container. It can set its own per-namespace TCP keys (`roles/edge_network`,
`host_vars/edge.yml`: `/etc/sysctl.d/90-edge-tcp-speed.conf` with `tcp_wmem`,
`tcp_slow_start_after_idle 0` and `bbr`), but not the global keys, and it cannot load modules.
divide carries the rest:

- `/etc/sysctl.d/90-divide-tcp.conf`:
  ```
  net.core.default_qdisc = fq
  net.ipv4.tcp_congestion_control = bbr
  net.core.rmem_max = 33554432
  net.core.wmem_max = 33554432
  net.ipv4.tcp_rmem = 4096 131072 33554432
  net.ipv4.tcp_wmem = 4096 16384 33554432
  ```
- `/etc/modules-load.d/bbr.conf`: `tcp_bbr`. Without it, the edge's `tcp_congestion_control = bbr`
  fails.
- The `wireguard` module must be loaded on divide for the edge's WARP tunnels (`roles/edge_warp`).

## Guests that hold the public address themselves

Two guests run UDP services that must use the public address as their own (kn-rtc's ICE candidate,
for one, names the address the peer dials). Each one puts 91.199.82.174/32 on its own `lo` and
DNATs the port locally to it:

- **kru** (set up by hand in the 2026-11-16 migration; no repository renders these files, and
  KrunkNative's `kn_rtc` role leaves kru's nftables alone): `kru-public-ip.service` adds the address,
  `/etc/nftables.d/kru-rtc.nft` DNATs udp 21100 to it, and `rtc.env` has
  `KRUNK_NATIVE_RTC_ICE_ADDR=91.199.82.174:21100`. kru's `krunknative-edge-origin.conf` allowlist
  admits the edge as `allow 172.16.5.10;  # divide edge CT 201`. Because the address is local,
  kn-bridge and kn-rtc dialing `ashburn-N.krunk.io` would connect to kru itself (ECONNREFUSED, the
  2026-11-17 outage), so the same file has an `output` NAT chain that rewrites 91.199.82.174 on tcp
  and udp 21015-21017 and 21115 to kn 172.16.5.94, plus a `postrouting` masquerade for it. That
  needs the kru-to-kn bridge rules above.
- **blockshooter**: `bs-public-ip.service`, nft table `bsnat` (udp 8443), and
  `BS_RELAY_PUBLIC_IP=91.199.82.174`. Its Let's Encrypt IP certificate is issued with lego over
  HTTP-01. The edge forwards `Host: 91.199.82.174` `/.well-known/acme-challenge/` to
  172.16.5.48:80 (`edge_acme_forwards`, `conf.d/05-divide-acme.conf`).

On those two guests 91.199.82.174 is a local address, so a connection from them to "the public
address" (byod, dl.krunk.io) never leaves the box.

The kn game servers (CT 203) listen on 172.16.5.94 (`listen_host`) and advertise
`ashburn-N.krunk.io` (`public_host`, A records to 91.199.82.174). KrunkNative's CI configures them.

## The edge's view

The edge (CT 201, 8 cores) does not have 91.199.82.174 on any interface (`edge_public_ip_on_box:
false`). Its own streams to that address, such as wisp.baby's speed test through holyWisp, must
not leave through WARP. `roles/edge_warp` adds `to 91.199.82.174 tcp dport 80 lookup main`
(priority 30400) for that (ansible/README.md "Kernel mode").

`conf.d/05-divide-acme.conf` on the edge answers ACME for divide itself:
`divide.eli.gift` `/.well-known/acme-challenge/` goes to 172.16.5.1:80, and the rest of that name
is a 301 to `:8006`.

## Cloudflare Tunnel: one daemon on the edge (2026-11-17)

Every Cloudflare Tunnel hostname on divide comes in through one tunnel, **`divide-edge`**
(`d9c69781-5dac-4b6f-9bf0-f4f1c5dea137`), run by the edge. It replaced six daemons, one per guest.
Set up by hand: no role renders it yet.

- **On the edge**: the `cloudflared` package from `pkg.cloudflare.com/cloudflared`
  (`/etc/apt/sources.list.d/cloudflared.list`, key `/usr/share/keyrings/cloudflare-main.gpg`),
  `/etc/systemd/system/cloudflared-divide-edge.service` (`cloudflared --no-autoupdate --metrics
127.0.0.1:20241 tunnel run`), and the tunnel token as `TUNNEL_TOKEN=` in
  `/etc/cloudflared/divide-edge.env` (mode 600, never in the unit or the process list).
- **Ingress is remotely managed** (Cloudflare, Zero Trust, Networks, Tunnels, `divide-edge`):

| Hostname                    | Service                   | Notes                                                            |
| --------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `holy.eli.gift`             | `http://172.16.5.79:8080` | website2                                                         |
| `g.eli.gift`                | `http://172.16.5.38:80`   | guca's nginx (Guacamole)                                         |
| `v.eli.gift`                | `http://172.16.5.63:80`   | vault's nginx; its tunnel vhost also listens on 172.16.5.63:80   |
| `chat.eli.gift`             | `http://172.16.5.64:80`   | chat                                                             |
| `krunker.party`             | `https://127.0.0.1:443`   | the edge's krunk.io relay as `assets.krunk.io`, `noTLSVerify`    |
| `coordinator.krunker.party` | `https://127.0.0.1:443`   | as `coordinator.krunk.io` (`originServerName`, `httpHostHeader`) |
| `matchmaker.krunker.party`  | `https://127.0.0.1:443`   | as `matchmaker.krunk.io`                                         |
| anything else               | `http_status:404`         |                                                                  |

The krunker.party names ride the edge's own krunk.io relay (OpenResty to kru :443 with the
pinned certificate and `X-KN-Edge-Token`), because kru's apps listen on `127.0.0.1` only. The
edge has no certificate for `assets.krunk.io` (issuing fails), hence `noTLSVerify` on that one
row. A Cloudflare redirect answers `krunker.party` itself first (301 to `https://krunk.io/`, path
kept). The edge's `nginx.conf` trusts `CF-Connecting-IP` from `127.0.0.1` and `::1` too, so kru
sees the client's address and not the tunnel's.

- **Firewall**: the edge reaches guca, vault and chat on tcp 80 (their `.fw` files and
  `divide_guests` from_edge), holy on 8080. The tunnel's own connections leave like every edge
  connection, through VLAN 2832 (`edge_out`), over QUIC.
- **DNS**: each name is a proxied CNAME to `d9c69781-5dac-4b6f-9bf0-f4f1c5dea137.cfargotunnel.com`.

Retired the same evening:

- The per-guest daemons on vault (tunnel `v`), chat (`chat`), guca (`guca`), holy (`holy`) and kru
  (`kru`): `cloudflared.service` stopped and disabled (on holy also `cloudflared-update.timer`).
  The tunnels themselves are kept for now. To roll a name back: start that guest's
  `cloudflared.service` and point the CNAME back at the old tunnel's ID. Delete them once the
  edge's tunnel has run for a few days.
- eagler's `cloudflared.service` (tunnel `eagler`, no ingress): stopped and disabled.
- DNS `kru.eli.gift`, `mcp.eli.gift`, `mcp2.eli.gift`, and the tunnels `goldenticket-mcp` and
  `abulxt-mcp2` (both without a connector): deleted. kru's tunnel also listed krunk.io names whose
  DNS is not on Cloudflare; those rows died with it.
- giftshop's two tunnels are covered in "giftshop: retired" below.

## holy: VM 127 to CT 205 (2026-11-17)

holy was converted from VM 127 (Debian 13 cloud image) to the unprivileged container CT 205 on
2026-11-17 (21:25 to 21:31 UTC, about 4 minutes of downtime), with the owner's approval. It keeps
its address (172.16.5.79), its MAC (`BC:24:11:71:5D:B1`) and its SSH host keys. The VM's root
filesystem was tarred with `--numeric-owner --xattrs --acls` and created as the CT with
`pct create --unprivileged 1`, so ownership is shifted by 100000.

- **Config**: 2 cores, 2048 MB, no swap, rootfs `local:205` 24 GB, `nesting=1`, nameservers
  1.1.1.1 and 1.0.0.1, `lxc.cgroup2.cpuset.cpus: 0-7,16-23` (the VM's old affinity), `onboot: 1`.
- **Inside**: cloud-init, the kernels, grub, shim and netplan are purged and `/etc/fstab` is empty.
  Networking is ifupdown2 with the `/etc/network/interfaces` Proxmox writes (systemd-networkd is
  disabled), like the other CTs. `pm2-holy.service.d/lxc-limits.conf` sets `LimitNOFILE=524288`
  and `LimitNPROC=131072`, because systemd in an unprivileged CT cannot set `infinity`.
  `sys-kernel-config.mount` and `sys-kernel-debug.mount` are masked.
- **Unchanged**: website2 under `pm2-holy` on :8080, PostgreSQL 17 (local database `holy`) and
  the token-file `cloudflared` tunnel (disabled later that evening: holy.eli.gift now comes through
  the edge's tunnel, see "Cloudflare Tunnel" below).
- **Backups** (on divide): `/var/lib/vz/dump/vzdump-qemu-127-2026_11_17-21_26_03.vma.zst` (the
  stopped VM), and `/root/holy-ct-20261117T212522/` (the rootfs tarball, the VM config, the old
  `nftables.conf` and holy's SSH host keys).
- **VM 127** is kept stopped with `onboot: 0`, disk intact, until it is deleted.

Rollback: `pct stop 205; pct set 205 --onboot 0`, put `tap127i1` back in place of `veth205i0` in
both `divide_guests` sets in `/etc/nftables.conf` (`nft -c -f`, then `nft -f`), then
`qm set 127 --onboot 1; qm start 127`.

## fg: Flying Gorilla, from giftshop (2026-11-17)

The Flying Gorilla game API (`fg-api`, the owner's game, repository `Flying-Gorilla`, branch
`v3.10.0-anticheat`) moved from giftshop (VM 111) to its own container on 2026-11-17, with the
owner's approval. Its database moved to terp.db (`docs/terp-db.md`), and the static client to the
edge (below).

- **CT 206 `fg`**: unprivileged Debian 13 (`debian-13-standard_13.6-1`), 1 core
  (`lxc.cgroup2.cpuset.cpus: 7,23`, one physical core with both its threads), 1024 MB, no swap,
  rootfs `local:206` 8 GB, `nesting=1`, nameservers 1.1.1.1 and 1.0.0.1, `onboot: 1`,
  172.16.5.206/24 (MAC `BC:24:11:4D:DA:F9`). root's `authorized_keys` is giftshop's. On giftshop
  the service peaked at 26 MB and used 1 s of CPU in 16 hours; the unit caps it at 512 MB
  (`MemoryMax`), and each password hash takes 64 MiB (Argon2 default), hence the 1 GB.
- **Service**: `fg-api.service` (the repository's `server/deploy/fg-api.service`, unchanged, plus
  `fg-api.service.d/network-online.conf`, because the database is remote), binary
  `/opt/fg-api/fg-api` (the 2026-10-11 build giftshop ran, sha256 `b2f264e3...`), config
  `/etc/fg-api/` (`environment` root:fg-api 0640). Differences from giftshop: `FG_LISTEN=0.0.0.0:8787`,
  `FG_TRUSTED_PROXY=172.16.5.10/32` (the edge sets `X-Real-IP`) and `FG_POSTGRES_DSN` for
  `fg_api_beta` on terp.db (verify-full, `/etc/ssl/terp-db/ca.crt`, `80.93.219.21 terp.db` in
  `/etc/hosts`). The bbolt file `/var/lib/fg-api/state.db` came along.
- **Redis stays local** (`redis-server`, 127.0.0.1:6379, database 1, as on giftshop): sessions
  revoked and live runs, a few keys with TTLs. fg-api's Redis client has no username setting, so
  on terp.db's shared Redis it could only log in as `default`, which can read the edge's
  certificate keys. Moving it needs `FG_REDIS_USERNAME` in fg-api and an ACL user limited to
  `~fg:*`.
- **Guest firewall**: `inet guestfw` (see "Guest firewalls"), tcp 8787 from the edge only.
- **Deploys**: `server/deploy/deploy.sh` in the repository, run by hand (no CI), now defaults to
  `TARGET_HOST=fg` (root over SSH through divide). The client build goes to the edge (below).
- **Cutover**: the game was stopped on giftshop at 22:21:10 UTC and served from fg at 22:22:24.
  All 18 tables had the same row counts after the restore. Copies: giftshop
  `/root/fg-move-20261117T222110Z/` (dump, Redis RDB, state.db, row counts), terp.db
  `/var/backups/migrate/fg_api_beta-cutover-20261117T222110Z.dump`.
- **Not moved**: `fg-api-beta`, the retired `/fg/beta/` leftover (an older binary on the same
  database, no client). The edge answers `/fg/beta/` with 404, as giftshop did.

Rollback (while giftshop's disk exists): `systemctl disable --now fg-api` on fg; start VM 111,
set `/etc/postgresql/17/main/start.conf` back to `auto`, enable and start `postgresql@17-main`,
`redis-server` and `fg-api`; set host_vars `pages_fg_api_pass` and `pages_fg_socket_pass` back to
`"http://172.16.5.78"`, add `ip daddr 172.16.5.78 tcp dport 80 accept` to `from_edge` and apply
`playbooks/edge-static.yml`. Writes on terp.db since the cutover are lost unless dumped from
there first.

## Static sites on the edge (2026-11-17)

`roles/edge_static` (`playbooks/edge-static.yml`; also in `playbooks/edges.yml`, tag `static`)
serves sites from the edge's own disk: `conf.d/37-static.conf`, the listing filters in
`conf/edge_static/`, and a delivery user `static` whose keys are forced through
`rrsync /srv/static`. The sites are `edge_static_sites` in `host_vars/edge.yml`.

- **Disk**: CT 201's `mp0: local:201/vm-201-disk-1.raw,mp=/srv/static,backup=1,size=40G`,
  hot-plugged on 2026-11-17 (`pct set 201 -mp0 local:40,mp=/srv/static,backup=1`, no restart).
  The role checks it is mounted and does not create it.
- **pages.eli.gift** (from giftshop): the file listing (24 GB, 179 files) and the Flying Gorilla
  client under `/fg/`, with `/fg/api/` and `/fg/socket` proxied to fg. DNS is a DNS-only A record
  for 91.199.82.174 (it was a proxied CNAME to giftshop's tunnel; the old record is in
  `~/.local/share/abulxt/pages-eli-gift-dns-before-20261117.json` on the operator's machine), so
  abulxt-domains approves the certificate (`dns-match`) and no `edge_relay` change was needed.
- **After a proxied record turns DNS-only, flush amph's resolver** (`resolvectl flush-caches` on
  amph). On 2026-11-17 it kept Cloudflare's addresses for about 3 minutes after the change, the
  validator answered `dns-no-match`, and clients that already resolved to the edge got the
  fallback certificate from 22:12 to 22:16 UTC.
- **Kept from giftshop**: the redirects (`/fg`, `/fg/api`), `Cache-Control` per path (`/fg/Build/`
  revalidates, the rest of `/fg/` is `no-store`), the precompressed Unity files (`.br`, `.gz` with
  their `Content-Encoding` and types), dotfiles under `/fg/` answering 404, the maintenance 503
  for `/fg` while `/srv/static/.maintenance/pages.eli.gift` exists, and the styled directory
  listing. OpenResty has no XSLT module, so `listing-body.lua` renders nginx's JSON listing into
  the page giftshop's `superbindex.xslt` made (same entries and order, checked on three folders).
- **Different**: no Cloudflare in front (no Cloudflare cache, no IPv6), the edge gzips text types,
  and three files that were mode 600 (giftshop's nginx ran as root) are 644.
- **Publishing**: `rsync -a --delete -e "ssh -J root@91.199.82.174" build/
static@172.16.5.10:pages.eli.gift/fg/` (paths are relative to `/srv/static`). For a swap without
  half-copied builds, create `.maintenance/pages.eli.gift` first and delete it after. The
  repository's `publish_latest.py` still targets giftshop's paths.

## giftshop: retired (2026-11-17)

giftshop (VM 111, 172.16.5.78, Debian 13 cloud image) ran pages.eli.gift: nginx on :80 behind two
Cloudflare tunnels (`cloudflared-giftshop`, locally managed, the one DNS pointed at, and a
token-mode `cloudflared.service`), `fg-api` and `fg-api-beta`, PostgreSQL 17 (`fg_api_beta`) and
Redis. Everything moved as above; it was shut down cleanly at 22:27:30 UTC on 2026-11-17 and set to
`onboot: 0`, tags `app` `eli-gift`. Postgres and Redis inside were stopped and disabled first
(`start.conf` `manual`), data intact.

- **Backup**: a vzdump of the stopped VM in `/var/lib/vz/dump/vzdump-qemu-111-2026_11_17-22_27_39.vma.zst` (30.5 GB),
  and the VM's disk itself. Keep both until 2026-12-01.
- **Then**: `qm destroy 111`, delete the dump, remove `tap111i0` from both `divide_guests` sets,
  and delete the two tunnels in Cloudflare (Zero Trust, Networks, Tunnels). The token-mode unit
  had its tunnel token in plain text in a world-readable unit file; deleting the tunnel retires it.

Rollback: `qm start 111` (and "Rollback" under fg above for the game), then put pages.eli.gift
back to the proxied CNAME from the saved record.
