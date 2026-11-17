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

| Address     | Guest                 | What                                                       |
| ----------- | --------------------- | ---------------------------------------------------------- |
| 172.16.5.1  | divide                | gateway, NAT, its own ACME client (`divide.eli.gift`)      |
| 172.16.5.3  | amph                  | abulxt origin (`[origin]`)                                 |
| 172.16.5.10 | edge (CT 201)         | the only abulxt edge (`[wisp_edge]`, `host_vars/edge.yml`) |
| 172.16.5.11 | wg                    | WireGuard, udp 51820                                       |
| 172.16.5.37 | sm                    |                                                            |
| 172.16.5.47 | kru                   | KrunkNative central node (krunk.io origin)                 |
| 172.16.5.48 | blockshooter (CT 202) | blockshooter relay (`[bs_ct_divide]`)                      |
| 172.16.5.62 | terp                  | Fracital origin, VM 116 (moved from meal 2026-11-16)       |
| 172.16.5.64 | chat                  | estro.help backend (`host_vars/amph.yml` `estro_upstream`) |
| 172.16.5.79 | holy (CT 205)         | holyunb.locker site (website2 :8080), was VM 127           |
| 172.16.5.94 | kn (CT 203)           | KrunkNative game servers (`[kn_ct_divide]`)                |
| (tap101i0)  | mull (VM 101)         | may only talk to chat and sm (bridge firewall below)       |

Ansible reaches the guests with `ProxyJump root@91.199.82.174` (`group_vars/divide_guests.yml`).

## Guest tags

Every guest's Proxmox tags follow one scheme, in this order (the UI shows them in config order,
`tag-style ordering=config` in `/etc/pve/datacenter.cfg`, which also holds the colours):

1. **Role**, exactly one: `edge`, `origin`, `app`, `game`, `gateway`, `vpn`, `ci`, `dev`, `desktop`,
   `template`.
2. **Project**, where the guest belongs to one: `abulxt`, `fracital`, `wisp-baby`, `holyunb`,
   `krunk`, `blockshooter`, `eaglercraft`, `estro`, `eli-gift`.
3. **How traffic gets in**, any of: `in-edge` (served through the edge, directly or by way of
   amph), `in-tunnel` (its own cloudflared tunnel), `in-dnat` (a port forward on divide, "NAT"
   below).
4. **How it gets out**, when not plain NAT: `out-mullvad` (may use mull), `out-warp` (the edge's
   WARP tunnels).
5. `legacy` for the two stopped Windows desktops that keep a meal address on `vmbr9`.

The software a guest runs is its name and the table above, not a tag.

| Guest                  | Tags                                              |
| ---------------------- | ------------------------------------------------- |
| vault (100)            | `app` `eli-gift` `in-tunnel`                      |
| mull (101)             | `gateway` `in-dnat`                               |
| eagler (104)           | `game` `eaglercraft` `in-edge` `in-dnat`          |
| fun (105)              | `desktop` `legacy`                                |
| chat (106)             | `app` `estro` `in-edge` `in-tunnel` `out-mullvad` |
| fum (110)              | `desktop` `legacy` `out-mullvad`                  |
| giftshop (111)         | `app` `eli-gift` `in-tunnel`                      |
| amph (113)             | `origin` `abulxt` `in-edge` `out-mullvad`         |
| terp (116)             | `origin` `fracital` `in-edge` `in-dnat`           |
| guca (117)             | `app` `eli-gift` `in-tunnel`                      |
| kru (120)              | `origin` `krunk` `in-edge` `in-tunnel` `in-dnat`  |
| wispdev (122)          | `dev` `wisp-baby`                                 |
| mac (126)              | `ci`                                              |
| wg (200)               | `vpn` `in-dnat`                                   |
| edge (201)             | `edge` `in-dnat` `out-warp`                       |
| blockshooter (202)     | `game` `blockshooter` `in-edge` `in-dnat`         |
| kn (203)               | `game` `krunk` `in-dnat`                          |
| runner (204)           | `ci`                                              |
| holy (205)             | `origin` `holyunb` `in-edge` `in-tunnel`          |
| templates (9000, 9001) | `template`                                        |

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
| 7, 23        | guca (117)                       |
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

Proxmox's own firewall (`proxmox-firewall`) is installed but **disabled**: the `nf_conntrack_bridge`
module it needs broke the host's masquerade. divide runs a plain `nftables.service` instead.

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
- **Hairpin**: `iifname vmbr1 oifname vmbr1 ct status dnat masquerade`. A guest that dials
  91.199.82.174 is DNATed back onto `vmbr1` and arrives from 172.16.5.1. This is why wisp.baby's
  speed test admits 172.16.5.0/24 (`host_vars/edge.yml` `wispbaby_speedtest_allow_extra`).

### `table bridge divide_guests` (guest-to-guest firewall)

The stateless equivalent of Proxmox's per-NIC `ipfilter`, on the `vmbr1` bridge:

- **Anti-spoof**: a set of `ifname . ipv4_addr` pairs, one per guest port (`veth<ct>i0`,
  `tap<vm>i0`) and its address. An IPv4 frame from a guest port whose pair is not in the set is
  dropped.
- **forward**, policy drop. Allowed:
  - ARP
  - IPv6 other than tcp/udp (neighbour discovery)
  - ICMP
  - the WireGuard port (udp 51820, to and from wg 172.16.5.11), both ways
  - mull (`tap101i0`): in and out only to and from chat 172.16.5.64 and sm 172.16.5.37
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

  Traffic between a guest and divide (its gateway, DNS, the NAT) is not bridged and does not
  pass this chain.

holy's pair is `veth205i0` (it was `tap127i1`, VM 127's second NIC, until 2026-11-17).

A new edge-to-origin path needs a line here as well as the origin's own firewall (amph:
`abulxt-firewall.sh`, `EDGE_SUBNETS="172.16.5.0/24"`; terp: ufw, `roles/fracital_origin`).

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
The bridge firewall lets wg's port (`veth200i0`) talk to anyone, and mull forwards to
`wg0-mullvad` from the LAN.

## Guest firewalls

Besides the bridge firewall on divide, the guests filter their own input (2026-11-17). On the
containers below it is one nft table, `inet guestfw`, in `/etc/nftables.d/guestfw.nft`, included
from `/etc/nftables.conf`. Input policy is drop; it accepts `lo`, established and related
traffic, ICMP, SSH from divide (172.16.5.1) and the VPN (172.16.5.11), and then:

| Guest         | Also accepts                                              |
| ------------- | --------------------------------------------------------- |
| wispdev (122) | nothing                                                   |
| vault (100)   | nothing (its tunnel reaches nginx over `lo`)              |
| guca (117)    | nothing (its tunnel reaches nginx over `lo`)              |
| holy (205)    | tcp 8080 from the edge 172.16.5.10 and amph 172.16.5.3    |
| kn (203)      | tcp and udp 21015-21017, 21115 from anyone                |
| runner (204)  | anything from `docker0` (job containers)                  |
| kru (120)     | tcp 80, 443 from the edge; udp 21100 (kn-rtc, after DNAT) |

The table is rendered and loaded by `divide/guestfw/apply.sh <ctid> [rule ...]` (run on divide,
it arms a 180 s revert timer first) and kept by `divide/guestfw/persist.sh <ctid>`, which also
deletes `flush ruleset` from `/etc/nftables.conf`. That line would otherwise wipe tables other
services load on a restart of `nftables.service` (kru's `krurtc`, Docker's on the runner).

- **eagler (VM 104)** keeps ufw, narrowed to: SSH from divide and the VPN; tcp 80, 443, 8080 from
  amph (the panel and Wings are reached edge, amph, eagler); tcp 3306 from `pterodactyl0`
  (172.18.0.0/16); tcp 2022 (Wings SFTP) from anyone. Minecraft 25565/25566 is Docker's DNAT and
  does not pass ufw. The old rules are in `/root/ufw-bak-20261117/`.
- **bs (CT 202)** already had its own default-deny table (`inet bsfilter`).
- **amph** (`abulxt-firewall.sh`) and **terp** (ufw from `roles/fracital_origin`) are default-deny
  through their roles.
- **Not yet**: the edge (`roles/edge_firewall` has never been applied on divide), chat, wg and mull.
  wg and divide carry the operator's own VPN; chat and mull carry chat's traffic.

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
  the token-file `cloudflared` tunnel.
- **Backups** (on divide): `/var/lib/vz/dump/vzdump-qemu-127-2026_11_17-21_26_03.vma.zst` (the
  stopped VM), and `/root/holy-ct-20261117T212522/` (the rootfs tarball, the VM config, the old
  `nftables.conf` and holy's SSH host keys).
- **VM 127** is kept stopped with `onboot: 0`, disk intact, until it is deleted.

Rollback: `pct stop 205; pct set 205 --onboot 0`, put `tap127i1` back in place of `veth205i0` in
both `divide_guests` sets in `/etc/nftables.conf` (`nft -c -f`, then `nft -f`), then
`qm set 127 --onboot 1; qm start 127`.
