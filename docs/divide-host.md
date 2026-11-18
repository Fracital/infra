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
| 172.16.5.3   | amph (CT 213)         | abulxt origin (`[origin]`), was VM 113                           |
| 172.16.5.10  | edge (CT 201)         | the only abulxt edge (`[wisp_edge]`, `host_vars/edge.yml`)       |
| 172.16.5.11  | wg                    | WireGuard, udp 51820                                             |
| 172.16.5.37  | sm                    |                                                                  |
| 172.16.5.47  | kru                   | KrunkNative central node (krunk.io origin)                       |
| 172.16.5.48  | blockshooter (CT 202) | blockshooter relay (`[bs_ct_divide]`)                            |
| 172.16.5.62  | terp (CT 216)         | Fracital origin, was VM 116 (moved from meal 2026-11-16)         |
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
| amph (213)             | `origin` `abulxt` `in-edge` `out-mullvad` |
| terp (216)             | `origin` `fracital` `in-edge` `in-dnat`   |
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

| Threads      | Guests                                                      |
| ------------ | ----------------------------------------------------------- |
| 0-2, 16-18   | edge (CT 201), exclusive (since 2026-11-18; was 0-3, 16-19) |
| 3, 6, 19, 22 | amph (CT 213)                                               |
| 4-5, 20-21   | kn (CT 203)                                                 |
| 7            | vault (100), wg (CT 200)                                    |
| 23           | chat (106), fg (CT 206)                                     |
| 0-7, 16-23   | every VM except mac                                         |
| 8-9, 24-25   | mac (VM 126)                                                |
| 10, 26       | runner (204)                                                |
| 11           | kru (120), guca (117)                                       |
| 27           | terp (CT 216), holy (205), blockshooter (CT 202)            |
| 12-15, 28-31 | wispdev (122), exclusive                                    |

Re-pinned 2026-11-18 (about 23:23 UTC) after guests were resized: a raw
`lxc.cgroup2.cpuset.cpus` overrides `cores` entirely (pvestatd skips the container and lxcfs
reports the pin's size as `nproc`), so each pin now has exactly `cores` threads and changing a
container's `cores` alone does nothing. Resize by editing the pin too, and apply it live with
`echo <cpus> > /sys/fs/cgroup/lxc/<id>/cpuset.cpus`. VMs: `qm set <id> --affinity` takes effect at
the next start; `taskset -a -pc <cpus> $(cat /var/run/qemu-server/<id>.pid)` applies it now.
mac and runner no longer share threads. Config backups from before the re-pin are in
`divide:/root/alloc-backup-20261118T232333/`.

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

tcp 22 is not forwarded: it is divide's own sshd. Nothing on the edge listens on 53, so the
tcp/udp 53 forward reaches a closed port. PowerDNS is retired. udp 443
is for holyWisp's WebTransport listener on the edge (live since about 23:30 UTC on 2026-11-18: "WebTransport
on udp 443" below).

NAT:

- `oifname bond0 masquerade`: the guests' egress is 91.199.82.174 (what Cloudflare Gateway, terp's
  old rules and every third party see).
- **Hairpin**: `oifname vmbr1 ip saddr 172.16.5.0/24 ct status dnat masquerade`. A guest that
  dials 91.199.82.174 is DNATed back onto `vmbr1` and arrives from 172.16.5.1. That works for any
  guest except the edge itself (see "The hairpin is bridged" below).
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

    | To                       | tcp ports                   |
    | ------------------------ | --------------------------- |
    | amph 172.16.5.3          | 80, 443, 1082, 8822, 9080   |
    | kru 172.16.5.47          | 80, 443                     |
    | blockshooter 172.16.5.48 | 80, 8080                    |
    | terp 172.16.5.62         | 443, 8443                   |
    | holy 172.16.5.79         | 8080                        |
    | fg 172.16.5.206          | 8787                        |
    | guca 172.16.5.38         | 80 (the edge's cloudflared) |
    | vault 172.16.5.63        | 80 (the edge's cloudflared) |
    | chat 172.16.5.64         | 80 (the edge's cloudflared) |

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
    | kn 172.16.5.94      | edge 172.16.5.10   | tcp 443                                  | edge-served names (krunk.io and the rest) through the hairpin, 2026-11-17                               |

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
  allowed it, which is why amph, holy and kn (whose SYNs to the edge's 443 were
  dropped until 22:20) also have their own tcp 443 lines to the edge.

  **A guest cannot hairpin to itself.** The edge's own stream to 91.199.82.174 is DNATed back to
  172.16.5.10, and `br_netfilter` would have to bridge it out the port it came in on (`fwpr201p0`),
  which a bridge port without hairpin mode never does. With hairpin mode on, the SYN arrives but the
  rest of the flow is INVALID in `fwbr201i0` (`PVEFW-FORWARD`). So wisp.baby's speed test failed
  from 22:10 UTC on 2026-11-17 to 2026-11-18 (Wisp reason 0x43, stream timed out). The edge now
  keeps those streams on the box ("The edge's view" below); divide is unchanged.

holy's pair is `veth205i0` (it was `tap127i1`, VM 127's second NIC, until 2026-11-17). fg's is
`veth206i0` . 172.16.5.206 (CT 206, 2026-11-17). amph's is `veth213i0` . 172.16.5.3 (CT 213; it was
`tap113i2`, VM 113's net2, until 2026-11-17). terp's is `veth216i0` . 172.16.5.62 (CT 216; it
was `tap116i0` until 2026-11-17).

A new edge-to-origin path needs a line here, a rule in the guest's `/etc/pve/firewall/<id>.fw`
(below), and the origin's own firewall where it has one (terp: ufw, `roles/fracital_origin`; amph
has none since 2026-11-18).

## CI keys on divide

divide's `/root/.ssh/authorized_keys` carries the CI keys that only jump through it, each as
`restrict,port-forwarding,command="/bin/false",permitopen="<guest>:22"`. `restrict` alone still lets
a key run commands; the forced `/bin/false` is what blocks them. Back the file up before editing it.
On divide it is a regular file, not the usual Proxmox symlink to `/etc/pve/priv/authorized_keys`;
sshd reads only `/root/.ssh/authorized_keys`, so a key added to the pve copy alone is refused.

| Key                                   | May forward to                     | Logs in on the guest as                                                   |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `infra-ci@Fracital/infra`             | `172.16.5.3:22`, `172.16.5.10:22`  | root (Ansible)                                                            |
| `abulxt-ci-vps@y9x/abulxt`            | `172.16.5.3:22`                    | `deploy` on amph, `abulxt-deploy-gate`                                    |
| `abulxt-ci-singlefile@y9x/abulxt`     | `172.16.5.3:22`                    | `deploy` on amph, `abulxt-deploy-gate`                                    |
| `abulxt-cloaks-ci@y9x/cloaks`         | `172.16.5.3:22`                    | `deploy` on amph, `abulxt-deploy-gate`                                    |
| `holt-ci@y9x/holt`                    | `172.16.5.3:22`                    | `deploy` on amph, `holt-deploy-gate`                                      |
| `krunknative-ci@rebel10n/KrunkNative` | `172.16.5.47:22`, `172.16.5.94:22` | root on kru and kn (KrunkNative deploys)                                  |
| `systemya-ci@edge`                    | `172.16.5.10:22`                   | `systemya` on the edge, rrsync of `/var/www/systemya` (roles/edge_static) |

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
unchanged: terp's ufw (`roles/fracital_origin`, it admits tcp 8443 only from Cloudflare),
blockshooter's `inet bsfilter`, eagler's original ufw. amph's `abulxt-firewall.sh` (iptables chain
`ABULXT_INPUT`, looser than `213.fw`) was retired on 2026-11-18: `roles/abulxt_origin` removes it.

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
| amph (213)    | tcp 80, 443, 1082, 8822, 9080 from the edge                                                              |
| terp (216)    | tcp 443, 8443 from the edge; tcp 8443 (the DNAT); tcp 22 from the runner                                 |
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

The edge (CT 201, 6 cores) does not have 91.199.82.174 on any interface (`edge_public_ip_on_box:
false`). Its own streams to that address, such as wisp.baby's speed test through holyWisp, must
not leave through WARP. `roles/edge_warp` adds `to 91.199.82.174 tcp dport 80 lookup main`
(priority 30400) for that (ansible/README.md "Kernel mode"). They must not leave the box either: a
guest's hairpin to itself is dropped (above). `roles/edge_network` runs `edge-own-address.service`,
which loads the nft table `ip edge_own_address` (nat output: `ip daddr 91.199.82.174 tcp dport 80
dnat to 172.16.5.10`) from `/etc/edge-own-address.nft`. It is NAT only, not a firewall.

`conf.d/05-divide-acme.conf` on the edge answers ACME for divide itself:
`divide.eli.gift` `/.well-known/acme-challenge/` goes to 172.16.5.1:80, and the rest of that name
is a 301 to `:8006`.

## WebTransport on udp 443 (prepared 2026-11-18)

Until 2026-11-18 the udp 443 forward reached a port the edge's firewall admits and nothing binds.
holyWisp's WebTransport listener (holyWisp `docs/webtransport.md`: Wisp over HTTP/3, QUIC and TLS
in holyWisp itself) is prepared to bind it: `holywisp_webtransport` in
`ansible/inventory/group_vars/edge.yml`, live once `holywisp_ref` reaches the holyWisp commit that
adds the listener. Until that pin lands with it, a run of the `wisp` tag stops on the controller
(the pinned build does not know the `webtransport-*` keys) before it touches the edge. Nothing on
divide changes:

- **The listener.** holyWisp binds **172.16.5.10:443/udp** (`webtransport-host`, from
  `host_vars/edge.yml`), one `SO_REUSEPORT` socket per worker, with `CAP_NET_BIND_SERVICE` in
  `abulxt-edge-wisp.service`. No nft redirect on the edge: `group_vars/edge.yml` says why.
  OpenResty has no QUIC listener, so nothing else wants the port. `201.fw` admits udp 443 (above);
  the edge has no firewall of its own (`host_vars/edge.yml` `edge_firewall_manage: false`).
- **Client addresses.** The DNAT keeps the client's source address, and holyWisp keys its per-IP
  limits and reputation on it. No proxy is in front of this UDP, so holyWisp reads no proxy
  headers on it.
- **Replies and the second uplink.** A reply leaves from 91.199.82.174 only while the DNAT's
  conntrack entry lives. A packet the edge sends after the entry is gone is a new flow from the
  edge, which `edge_out` sends out of VLAN 2832 from 37.9.34.169, an address the client never
  talked to, and the client drops it. divide keeps a UDP entry for about 30 s, so holyWisp sends a
  keepalive PING after 20 s without sending (its idle timeout, `webtransport-idle-timeout-s`, is
  30 s). A client whose own NAT changes its port mid-session keeps the session (QUIC path
  validation); divide just sees a new flow through the DNAT.
- **The page side** is TCP as before: `GET /webtransport.json` on holywisp.fracit.al and wisp.baby
  (and on every keyed relay path) goes through OpenResty to holyWisp's :6001 and names
  `https://holywisp.fracit.al/` and the current and previous certificate hashes (holyWisp makes
  its own P-256 certificate every 6 days; the page pins it with `serverCertificateHashes`). That
  one URL is right for every page: the Cloudflare-proxied names (fracit.al, stomp.fracit.al)
  resolve to Cloudflare, whose udp 443 does not reach divide.
- **Hairpin.** Other guests reach it on 91.199.82.174:443 through `hairpin_mark`, like tcp 443.
  The edge itself cannot (a guest cannot hairpin to itself): from the edge, test 172.16.5.10:443.

Rollout (a production change: the user's go-ahead first, AGENTS.md "Servers"):

1. `holywisp_ref` in `ansible/roles/edge_wisp/defaults/main.yml` is at or after holyWisp a1d06e6,
   the commit that adds WebTransport (pinned there on 2026-11-18).
2. Apply the relay and the page routes: `gh workflow run apply.yml -f playbook=edges -f
tags=wisp,relay -f check=false` (approved on `production`), or locally
   `ansible-playbook playbooks/edges.yml --tags wisp,relay --vault-password-file ~/.abulxt-vault-pass`.
   The play builds holyWisp, checks on the controller that it accepts the new config, restarts the
   relay (the config and the unit change, so every WebSocket session drops once), checks
   `/health`, `/webtransport.json` and the udp socket, and reloads OpenResty with the two
   `/webtransport.json` locations. `playbooks/firewall.yml` brings the drop-in's comment up to date
   (udp 443 is open already), whenever convenient.
3. From a machine outside divide:
   - `curl -sSi https://holywisp.fracit.al/webtransport.json` and the same on `https://wisp.baby/`:
     200, `cache-control: no-store`, `access-control-allow-origin: *`, a body with
     `"url":"https://holywisp.fracit.al/"` and at least one `sha-256` hash.
   - `curl --http3-only -kv https://holywisp.fracit.al/` (a curl with HTTP3 in `curl -V`): the QUIC
     and TLS 1.3 handshake completes with ALPN h3 and TLS_CHACHA20_POLY1305_SHA256. `-k` because
     the certificate is self-signed; the HTTP answer to a plain GET does not matter.
   - Chrome, DevTools console on `https://holywisp.fracit.al/`:
     `const j = await (await fetch('/webtransport.json')).json(); const wt = new WebTransport(j.url, { serverCertificateHashes: j.hashes.map((h) => ({ algorithm: h.algorithm, value: Uint8Array.from(atob(h.value), (c) => c.charCodeAt(0)) })) }); await wt.ready;`
     resolves. Leave it idle for a minute and check `wt.closed` has not settled: that is the
     keepalive holding divide's conntrack entry.
4. On the edge: `ss -Hlun 'sport = :443'` lists 172.16.5.10:443 once per worker, and
   `journalctl -u abulxt-edge-wisp` has no WebTransport errors. On divide (read only):
   `conntrack -L -p udp --orig-port-dst 443` shows the session's flow.

Rollback: `holywisp_webtransport: false` in `group_vars/edge.yml` and the same apply. The config
and the unit then render as they did before 2026-11-18, and the OpenResty files differ only by two
header comments.

## Cloudflare Tunnel: one daemon on the edge (2026-11-17)

Every Cloudflare Tunnel hostname on divide comes in through one tunnel, **`divide-edge`**, run by
the edge. It replaced six daemons, one per guest. Set up by hand on 2026-11-17 and adopted by
`roles/edge_cloudflared` (`playbooks/edges.yml` and `wisp.yml`, tag `cloudflared`, where
`edge_local_cloudflared_tunnel` is set), which renders the same files byte for byte. The token is
the secret `edge_cloudflared_tunnel_token` (ansible/README.md "Secrets"); without it the role
leaves the running connector alone.

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
- **DNS**: each name is a proxied CNAME to `<tunnel id>.cfargotunnel.com` (the id is in the
  dashboard; like the other Zero Trust ids it stays out of this repository).

Retired the same evening (2026-11-17, about 22:35 to 22:50 UTC):

- The per-guest connectors on vault (tunnel `v`), chat (`chat`), guca (`guca`), holy (`holy`),
  kru (`kru`) and eagler (`eagler`, which had no ingress): stopped, then removed with their
  credentials (`cloudflared` itself, `/etc/cloudflared`, `/root/.cloudflared`, the token-mode
  `cloudflared.service` and `cloudflared-update.*` units, the apt source). No guest but the edge
  has `cloudflared` now.
- Those six tunnels, giftshop's two (`giftshop` and `pages`), `goldenticket-mcp` and `abulxt-mcp2`:
  deleted in Cloudflare, which also revokes the tokens that were in plain text in their units.
  `divide-edge` is the account's only tunnel.
- DNS `kru.eli.gift`, `mcp.eli.gift` and `mcp2.eli.gift`: deleted. kru's tunnel also listed
  krunk.io names whose DNS is not on Cloudflare; those rows died with it.

Rolling a name back now means a new tunnel: create it, run its connector where the origin is, and
point the CNAME at it.

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

## terp: VM 116 to CT 216 (2026-11-17)

terp (Fracital's origin) was converted from VM 116 (Debian 13 cloud image) to the unprivileged
container CT 216 on 2026-11-17, with the owner's approval. It keeps its address (172.16.5.62), its
MAC (`BC:24:11:94:13:6A`), its SSH host keys and its machine-id, and everything on the root
filesystem: `/root`, `/opt` (Fracital's `repo` and `dev` checkouts, stomp, cloaks-fracital, with
their `.env` files), `/etc` (OpenResty, ufw, fail2ban, `/etc/fracital-edge`, `/etc/ssl/terp-db`,
the `terp.db` line in `/etc/hosts`), the `deploy` user with its gates, `/etc/sudoers.d/deploy`,
`/var/lib/fracital-deploy` and `/var/lib/stomp-deploy`, and the pm2 dump.

- **Downtime**: about 1 minute 50 seconds. The VM was shut down at 22:44:04 UTC and its disk
  mapped read-only on divide (`losetup -r`, `mount -o ro,noload`), tarred (25 s, with
  `--numeric-owner --xattrs --acls`) and created with `pct create --unprivileged 1` (25 s). The CT
  started at 22:45:02 and served again at 22:45:51. A rehearsal from a live tar into a CT without a
  NIC ran first.
- **Config**: 2 cores, 4096 MB, no swap, rootfs `local:216` 32 GB (the VM's size), `nesting=1`,
  nameservers 1.1.1.1 and 1.0.0.1, `lxc.cgroup2.cpuset.cpus: 0-7,16-23` (the VM's affinity),
  `onboot: 1`, the VM's tags. `net0` has `firewall=1`; `/etc/pve/firewall/216.fw` is 116.fw without
  the `ipfilter-net0` ipset (a container's address is filtered from its config).
- **Inside**: as on holy. cloud-init, the kernels, grub, shim and netplan are purged (the
  `apt-get purge` needs `--allow-remove-essential`, grub-efi-amd64-signed is protected),
  `/etc/fstab` is empty (the VM's is `/etc/fstab.vm-20261117`), networking is ifupdown2 with
  Proxmox's `/etc/network/interfaces` and systemd-networkd is disabled, and
  `10-keep-foreign-routes.conf` is in place. `pm2-root.service.d/lxc-limits.conf` sets
  `LimitNOFILE=524288` and `LimitNPROC=131072`. The `sys-kernel-*` and `sys-fs-fuse-connections`
  mounts are masked. `/etc/modules-load.d/tcp_bbr.conf` is gone (divide loads `tcp_bbr`;
  `roles/fracital_origin` now removes the file). The role's two sysctls are per network namespace
  and still apply.
- **First boot without network**: netplan's generated `.network` matches
  `PermanentMACAddress`, which a veth does not have, so eth0 stayed unmanaged and OpenResty's
  start hung on DNS until eth0 was set up by hand (22:45:48). The rehearsal had no NIC and did
  not show it. A later VM-to-CT move should switch to ifupdown2 before the first boot, or expect
  this.
- **Firewall**: ufw is kept and loads the VM's exact iptables rules (same `iptables -S`); the
  `xt_hl` and `ip6t_rt` matches its IPv6 rules need are autoloaded on divide's kernel. It is
  behind `216.fw` as well. Checked after the move: the edge reaches 443 and 8443, the runner
  reaches 22, and 8080, 8081 and 443 from other guests are dropped.
- **Unchanged**: `pm2-root` runs `fracital`, `fracital-dev` (stopped, as before) and `stomp`
  (:8081, under the same root pm2, not its own user). Fracital logs "Accounts ready (TLSv1.3,
  certificate verified against DATABASE_CA)". `fracital-deploy-gate` refused a test
  command with its usual message, and the runner reaches sshd as `deploy` and sees the same host
  key. `fstrim.timer` skips itself in a container.
- **Backups** (on divide): `/var/lib/vz/dump/vzdump-qemu-116-2026_11_17-22_46_38.vma.zst` (the
  stopped VM, 9 GB), and `/root/terp-ct-20261117T223829/` (the rootfs tarball, the VM and CT
  configs, `216.fw`, the cutover scripts and logs, the old fstab, and terp's SSH host keys). The
  `nftables.conf` from before is `/root/nftables.conf.bak-terp-ct-20261117T224333`.
- **VM 116** is kept stopped with `onboot: 0`, disk intact, until it is deleted.

Rollback: `pct stop 216; pct set 216 --onboot 0`, put `tap116i0` back in place of `veth216i0` in
both `divide_guests` sets in `/etc/nftables.conf` (under `flock /root/.nftables-edit.lock`,
`nft -c -f`, then `nft -f`), then `qm set 116 --onboot 1; qm start 116`. Deploys since the
cutover exist only in the CT.

## amph: VM 113 to CT 213 (2026-11-17)

amph (abulxt's origin) was converted from VM 113 (Debian 13 cloud image) to the unprivileged
container CT 213 on 2026-11-17, with the owner's approval. It keeps its address (172.16.5.3), its
MAC (`BC:24:11:4C:1A:93`), its SSH host keys and its machine id. Downtime: services stopped on
the VM at 22:42:46 UTC and were up in the CT at 22:43:24, except OpenResty, which failed at boot
(below) and was started by hand at 22:43:35. A reboot test at 22:46:44 took 9 s.

Unprivileged is enough because nothing on amph needs a kernel feature a container lacks:

- **mullvad-pool** (`/opt/mullvad-pool`, 127.0.0.1:1080) is a userspace SOCKS5 balancer over
  Mullvad's in-tunnel SOCKS relays. It has no WireGuard, network namespace or policy routing of
  its own: the tunnel is mull's (VM 101), reached by four static routes via 172.16.5.6.
- **abulxt-firewall.sh** used iptables-nft in the CT's own network namespace (retired
  2026-11-18, "Guest firewalls"). fail2ban's `inet f2b-table` works the same way; the `xt_*`
  modules are already loaded on divide.
- **Docker** only ran the retired `abulxt-db` container (stopped by hand at 21:56 that day; the
  app uses terp.db). `docker.service`, `docker.socket` and `containerd.service` are masked. The
  volumes (`/var/lib/docker/volumes`, the database rollback) came along; the images and layers
  did not (overlay whiteouts cannot be created in an unprivileged CT), they are in the VM's
  vzdump.
- No sysctl.d or modules-load.d files; `abulxt-edge-wisp`'s systemd sandbox works with
  `nesting=1` (tested in a scratch CT first).

- **Config**: 2 cores, 6144 MB, no swap, rootfs `local:213` 48 GB (25 GB used, 12 GB of it
  OpenResty's `access.log`), `nesting=1`, nameservers 1.1.1.1 and 1.0.0.1,
  `lxc.cgroup2.cpuset.cpus: 0-7,16-23` (the VM's affinity), `onboot: 1`, tags as before. net0 is
  `eth0` on `vmbr1` with `firewall=1`; `/etc/pve/firewall/213.fw` is 113.fw without the
  `ipfilter-net2` ipset. The CT sees 16 CPUs (the VM had 2), so holyWisp now opens 16 listeners
  on 127.0.0.1:6001; `cpulimit: 2` would cap it at the VM's budget.
- **Inside**: cloud-init, the kernels, grub, shim, initramfs-tools and netplan are purged,
  `/etc/fstab` is empty. ifupdown2 with the file Proxmox writes; the four mull routes
  (10.64.0.0/16, 10.124.0.0/16, 100.64.0.0/16, 100.124.0.0/16) are `post-up` lines in it, and
  systemd-networkd is masked. DNS stays systemd-resolved (`resolved.conf.d/10-divide-dns.conf`,
  the 1.1.1.1 and 1.0.0.1 netplan gave), with `/etc/.pve-ignore.resolv.conf` so Proxmox leaves
  the stub symlink alone. `networking.service.d/10-before-network-online.conf` orders ifupdown2
  before `network-online.target`: without it OpenResty starts before 172.16.5.3 exists and fails
  on `listen 172.16.5.3:8822` (EADDRNOTAVAIL), as on the first boot. The VM-only files (fstab,
  netplan, cloud config) are in `/root/vm113-config-20261117/`.
- **Unchanged**: every unit and its autostart (OpenResty, the abulxt, holt and Abstract units,
  holyWisp, mullvad-pool, shady-relay, Redis, fail2ban, the firewall), `/etc/openresty`, the
  `deploy` user with its gates and sudo rule, `/etc/hosts` (terp.db), `/etc/ssl/terp-db`, all of
  `/opt`, `/root`, `/home` and `/var`. `deploy/amph-drift.sh` in abulxt reported in sync before
  and after.
- **Method**: a live `rsync -aHAXSx --numeric-ids --delete` of the VM's `/` into the CT's mounted
  rootfs, run inside the CT's uid map (`lxc-usernsexec -m b:0:100000:65536`) so ownership, ACLs
  and file capabilities land shifted by 100000. The final pass, with the services stopped, took
  18 s; then the VM was shut down and a fixup script made the copy a container root.
- **divide**: `veth213i0` . 172.16.5.3 replaced `tap113i2` in both `divide_guests` sets.
- **Backups** (on divide): `/var/lib/vz/dump/vzdump-qemu-113-2026_11_17-22_38_13.vma.zst` (live,
  before) and `vzdump-qemu-113-2026_11_17-22_47_44.vma.zst` (the stopped VM), plus
  `/root/amph-ct-20261117T223813/` (VM and CT configs, both `.fw` files, `nftables.conf` before
  each edit, the cutover script and logs).
- **VM 113** is kept stopped with `onboot: 0`, disk intact, until it is deleted.

Rollback: `pct stop 213; pct set 213 --onboot 0`, put `tap113i2` back in place of `veth213i0` in
both `divide_guests` sets (under `flock /root/.nftables-edit.lock`, `nft -c -f`, then `nft -f`),
then `qm set 113 --onboot 1; qm start 113`. Redis, holt-lab's and the music data written in the
CT since the cutover stay in the CT unless copied back.

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
- **Redis on terp.db** since 22:57 UTC (database 1, as on giftshop: sessions revoked and live runs,
  a few keys with TTLs): its own instance `redis-server@fg`, `FG_REDIS_ADDR=terp.db:6381` and
  `FG_REDIS_PASSWORD` (fg-api's client has no username setting, so it is not a user on the shared
  Redis). fg's local `redis-server` is stopped and disabled with its data; see "Guest Redis on
  terp.db" below.
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
- **Then**: `qm destroy 111`, delete the dump, and remove `tap111i0` from both `divide_guests`
  sets. The two tunnels are already deleted (with the others, "Cloudflare Tunnel" above), which
  retired the token that was in plain text in the token-mode unit.

Rollback: `qm start 111` (and "Rollback" under fg above for the game). pages.eli.gift's old
tunnel is gone, so serving it from giftshop again needs a new one (or an edge route to
172.16.5.78:80).

## Guest databases on terp.db (2026-11-17)

Every Postgres database on divide's guests now lives on terp.db (`docs/terp-db.md`, "The
2026-11-17 move"). The guests keep their old clusters stopped, disabled and `start.conf` `manual`,
with the data in place as the rollback:

| Guest      | Stopped cluster                                   | Its app, now on terp.db                                |
| ---------- | ------------------------------------------------- | ------------------------------------------------------ |
| chat (106) | `postgresql@17-main` (`labelsupplier`, `elichat`) | `labelsupplier-gateway.service`, `elichat.service`     |
| guca (117) | `postgresql@15-main` (`guacamole_db`)             | `tomcat9` (Guacamole 1.6.0, JDBC PostgreSQL extension) |
| kru (120)  | `postgresql@18-krunknative` (port 5434)           | `kn-brain-coord.service` (kn-brain-finder has no DB)   |
| holy (205) | `postgresql@17-main` (`holy`)                     | website2 (`pm2-holy`)                                  |

guca and kru got `/etc/ssl/terp-db/ca.crt` and `80.93.219.21 terp.db` in `/etc/hosts` (outside the
PVE block). Both leave through divide's NAT without a host route. The other guests (vault, wispdev,
wg, edge, bs, kn, runner, fg, mull, mac) run no database server.

eagler (VM 104): the Pterodactyl panel's MariaDB database `panel` moved on 2026-11-18 (00:43 UTC,
3.5 s down) to terp.db's host MariaDB on port 3307 (`docs/terp-db.md`, "MariaDB (3307)"), over TLS
verified against `/etc/ssl/terp-db/ca.crt` (copied to eagler then). eagler's `mariadb.service`
(MariaDB 11.8) is stopped and disabled, datadir `/var/lib/mysql` kept as the rollback. eagler's
services now: `nginx` and `php8.3-fpm` (the panel, `/var/www/pterodactyl`, database on
`terp.db:3307`, Redis on `terp.db:6383`), `pteroq` (queue worker), the `artisan schedule:run` cron,
`wings` (Docker, the two game servers), `pm2-root` (its `eagler` app is stopped), `exim4`. Wings
does not use MariaDB, and no game-server plugin uses MySQL (AuthMe SQLite, LuckPerms H2,
LoginSecurity and DiscordSRV with MySQL off).

## Guest Redis on terp.db (2026-11-17)

Each guest Redis moved to its own instance on terp.db (`docs/terp-db.md`, "App Redis instances"),
not to the shared one. The local servers are stopped and disabled, their data kept:

| Guest        | Stopped server                              | Its app, now on terp.db                                     |
| ------------ | ------------------------------------------- | ----------------------------------------------------------- |
| fg (206)     | `redis-server` (127.0.0.1:6379)             | `fg-api`, `terp.db:6381`                                    |
| kru (120)    | `kn-redis` (127.0.0.1:6380, no persistence) | `kn-brain-coord`, `kn-brain-finder`, `redis://terp.db:6382` |
| eagler (104) | `redis-server` (127.0.0.1:6379)             | Pterodactyl panel (`php8.3-fpm`, `pteroq`), `terp.db:6383`  |
| chat (106)   | `redis-server` (127.0.0.1:6379)             | `labelsupplier-gateway`, `terp.db:6384`                     |

- eagler got `80.93.219.21 terp.db` in `/etc/hosts` and in `/etc/cloud/templates/hosts.debian.tmpl`
  (cloud-init is disabled there, `/etc/cloud/cloud-init.disabled`, so only the first matters now).
- kru: KrunkNative's `kn_redis` role has a `kn_redis_remote_url` mode for this (set for kru in
  `group_vars/central/main.yml`): it keeps `kn-redis` off and writes `redis.env` for terp.db, and
  never touches `KN_REDIS_PASSWORD`, which is terp.db's now.
- amph (213): its `redis-server` (6379, the edge's certificates until 2026-11-17, then only
  wisp.baby's stats) is stopped and disabled since 2026-11-18 00:47 UTC; the stats moved to the
  shared instance (`docs/terp-db.md` "Shared Redis (6380)"), and 6379 left `from_edge` above and
  `213.fw` (backups `/root/nftables.conf.bak-wispredis-20261118004827`,
  `/root/213.fw.bak-wispredis-20261118004827`).
- chat (106): `redis-server` stopped and disabled since 2026-11-18 01:10 UTC, data in
  `/var/lib/redis`. `labelsupplier-gateway` was rebuilt the same day with `REDIS_USERNAME` and
  `REDIS_PASSWORD` (it could not send `AUTH` before) and reads them from `/opt/labelsupplier/.env`
  (backup `.env.bak-terpdb-redis-*`, old binary `labelsupplier.bak-redis-*`). chat already had
  `80.93.219.21 terp.db` in `/etc/hosts` and the host route to it via divide. Nothing else on chat
  used its Redis. No guest or VM (mull, mac and every CT, checked 2026-11-17) runs Redis, KeyDB or
  Valkey locally any more.

## goldenticket and labelsupplier: shut down (2026-11-18)

Both are off for good, at the owner's request. On chat (CT 106), `goldenticket`,
`goldenticket-queue` (:6981), `goldenticket-leaderboard`, `labelsupplier-gateway` (:8088) and
`labelsupplier-scraper` are stopped and disabled. Their files stay in `/opt/goldenticket*`,
`/opt/labelsupplier` and `/srv/git`. chat.eli.gift lost the `/queue`, `/shop/heroin`, the API
prefixes (`/v1`, `/claude`, `/codex` and the rest) and the labelsupplier snippet; it keeps the SPA,
the Stripe webhook and `/cpa/`, `/cpa2/` (cli-proxy-api). nginx backup
`chat:/root/eli.gift.conf.bak-shutdown-*`. `106.fw` no longer opens 8088.

The same day amph got tcp 8317 to chat (`from_amph` and `106.fw`): abulxt's AI provider uses
cli-proxy-api at `172.16.5.64:8317` over vmbr1, which the guest firewall had dropped since 22:10
UTC on 2026-11-17.

On terp.db the `labelsupplier` database is kept but closed (`lsupplier` NOLOGIN, its `pg_hba`
line commented out, a final dump `/var/backups/migrate/labelsupplier-shutdown-*.dump`), and
`redis-server@chat` (6384) is stopped and disabled, its nft line removed. To bring it back, undo
those three, start the units, and restore the nginx backup.
