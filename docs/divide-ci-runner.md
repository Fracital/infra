# divide CI runner: CT 208

CT 208 (`ci`) is divide's only GitHub Actions runner container. It carries both the untrusted PR CI
runners and the trusted build and deploy runners. The five trusted runner registrations moved from
CT 204 to CT 208 on 2026-11-24 at the owner's request. CT 204 was destroyed after the move was
verified.

No workflow routing changed: the moved runners keep their names, registrations and labels, so
`[divide, ci]`, `[divide, deploy]` and the org build runners still select the same jobs. No role in
this repository configures the container; like divide itself it is managed by hand
(`docs/divide-host.md`). The authoritative copy of each file is the one on divide. Changing it
needs the owner's go-ahead for the host (AGENTS.md "Servers").

## Runners on CT 208

CT 208 is an unprivileged LXC at **172.16.5.208** on `vmbr1`, hostname `ci`, Proxmox tag `ci`.
It runs 31 runner services:

- **20 Fracital CI runners**, `ci-1` through `ci-20`, as `actions.runner.Fracital.ci-N.service`
  under `/home/runner`. They are in the Fracital runner group `ci`. powerMouse's `ci.yml`,
  estrogen's Linux x64 and node jobs, and SystemYA's CI, build and STomp updater jobs use them.
- **6 KrunkNative CI runners**, `ci208-kn-1` through `ci208-kn-6`, also under the CI installs.
- **5 trusted build and deploy runners** under `/opt/actions-runner/<scope>`: `org-fracital`,
  `org-rebel10n`, `org-y9x`, `fracital-deploy` and `y9x-deploy`. Their units are
  `actions.runner.{Fracital,rebel10n,y9x}.divide-{runner,deploy}.service` as applicable.

`fracital-deploy` (`divide-deploy`, labels `divide` and `deploy`) is in the Fracital runner group
`deploy`, which admits only powerMouse's `deploy.yml` on `master` and SystemYA's `deploy.yml` on
`main`. SystemYA's deploy reaches the edge by ProxyJump through root@91.199.82.174. The deploy
keys come from GitHub secrets and live only in `RUNNER_TEMP` for the job; no deploy key is kept in
the runner user's `~/.ssh`.

This consolidation deliberately removes the old container boundary between contributor PR code and
deploy jobs. CT 208 has Docker enabled and is not a hostile-code sandbox. Its firewall still denies
private destinations except the three deploy SSH paths below, but every job on the container shares
its network position and available runner files.

Resources (`/etc/pve/lxc/208.conf`):

| Key      | Value                                                         |
| -------- | ------------------------------------------------------------- |
| cores    | 28 (lower this, see "CPU pin" below)                          |
| memory   | 64 GiB (`65536`)                                              |
| swap     | 8 GiB (`8192`)                                                |
| rootfs   | `local:208/vm-208-disk-0.raw`, 160 GB                         |
| cpuunits | 25 (a low scheduler weight, four times below a default guest) |
| features | `nesting=1,keyctl=1` (Docker in a job, and the keyring)       |
| onboot   | 1                                                             |

It has **no CPU pin** today (no `lxc.cgroup2.cpuset.cpus`, no `cpulimit`), the only running guest
that pvestatd spreads across every host thread. That is what the pin below fixes.

## Firewall and deploy paths

Proxmox's legacy `pve-firewall` filters the NIC on its own bridge `fwbr208i0`, the same scheme as
every other guest (`docs/divide-host.md` "Guest firewalls"). `/etc/pve/firewall/208.fw` has
`policy_in: DROP`, `policy_out: ACCEPT`, `ipfilter: 1` and no logging.

Before the private-range drops, three OUT accepts carry the deploy jobs:

| Destination      | Port   | Why                                             |
| ---------------- | ------ | ----------------------------------------------- |
| 172.16.5.62 terp | tcp 22 | powerMouse's stomp deploy gate                  |
| 172.16.5.64 chat | tcp 22 | estro deploy gate                               |
| 91.199.82.174    | tcp 22 | SystemYA's ProxyJump through divide to the edge |

The same three paths are admitted by `inet divide forward` where applicable and by the destination
rules in `106.fw` and `216.fw`, whose source is now 172.16.5.208. TCP 22 to divide itself is admitted
by divide's input chain. All three routes were tested from CT 208 after the move.

The remaining rules are unchanged: ICMP to gateway 172.16.5.1 is allowed and everything else to the
gateway is dropped; `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`,
`169.254.0.0/16` and `fc00::/7` are dropped. TCP and UDP 443 to 91.199.82.174 stay open for the
edge's public HTTPS, Wisp and WebTransport, as any internet client sees them. Everything else to
91.199.82.174 and all of 37.9.34.169 is dropped. What remains is the public internet plus the three
SSH exceptions above.

## How jobs are assigned

GitHub hands a queued job to a free runner with the requested labels and runner group. Nothing on
divide routes the jobs. When CT 208 is stopped all of divide's self-hosted runners go offline and
GitHub queues their jobs until it is back. GitHub Actions is disabled on the owner's account as of
2026-11-03, so the runners cannot receive jobs until Actions is re-enabled; their services still
connect and listen.

## Operating it

Config lives in `/etc/pve/lxc/208.conf`; the firewall in `/etc/pve/firewall/208.fw`. CI runner
installs are under `/home/runner` and trusted installs under `/opt/actions-runner/<scope>`. All
commands run on divide (`ssh root@91.199.82.174`).

- State: `pct status 208`.
- Start or stop CT 208: `pct start 208` / `pct stop 208`. Stopping it pauses all CI and deploys.
- List the runners: `pct exec 208 -- systemctl list-units 'actions.runner.*'`.
- One runner's log: `pct exec 208 -- journalctl -u actions.runner.Fracital.ci-5`.
- Restart one runner: `pct exec 208 -- systemctl restart actions.runner.Fracital.ci-5.service`.
- All 31 units should be enabled and active on CT 208.

### CT 204 removal

CT 204 was destroyed on 2026-11-24 after all 31 runners were active on CT 208 and the three deploy
SSH routes passed. Its disk, Proxmox config, `204.fw`, nftables guest set entries,
`/var/lib/lxc/204` directory and migration backups were removed. There is no CT 204 rollback copy.

## CPU pin for CT 208 (prepared 2026-11-19, not applied)

This is the recommended pin. It is **not applied yet**. Applying it needs the owner's go-ahead for
the host (AGENTS.md "Servers").

Why pin: CT 208 is the only running guest with no CPU limit. pvestatd spreads its 28 cores across
all 32 host threads, including the six threads `docs/divide-host.md` keeps exclusive for the edge
(0-2, 16-18) and the shared threads amph, kn and the origins sit on. A PR storm can compete with
the edge's request serving. Deploy jobs now share this container, so a hard limit can also slow a
deploy while CI is busy.

The pin:

```
pct set 208 --cores 20 --cpulimit 16 --cpuunits 25
```

The numbers, against the host's 16 cores and 32 threads (Ryzen 9 7950X) and the pins in
`docs/divide-host.md`:

- **cores 20**, down from 28: the container advertises `nproc` 20, one apparent CPU per Fracital
  `ci-N` runner, so a build tool that reads `nproc` for its `-j` does not spin up 28-way parallelism
  per job on top of 20 concurrent jobs. The KrunkNative and trusted runners share the same limit.
- **cpulimit 16**, up from 0 (unlimited): a hard ceiling of 16 cores of CPU time, half of the 32
  threads and all 16 physical cores. The other 16 threads stay for the edge (6), amph (4) and kn (4).
- **cpuunits 25**, unchanged: under contention a default-weight (100) production guest gets four
  times CT 208's scheduler share. The command repeats it to keep the intent in one place.

Tradeoff: all CI and deploy work on CT 208 gets at most 16 cores instead of the whole box, so a burst
finishes slower. If production still contends, lower `cpulimit` to 12. If jobs back up while
production is idle, raise it toward 20.

Why `pct set` and not a cpuset pin: a raw `lxc.cgroup2.cpuset.cpus` line overrides `cores` and takes
the container out of pvestatd's balancing (`docs/divide-host.md` "CPU pinning and memory"). CT 208
is bursty and should float on spare capacity, not own named threads, so it keeps `cores`, `cpulimit`
and `cpuunits` and stays balanced. Do not add a `cpuset.cpus` line to 208 unless you also move it
onto the exclusive-threads scheme, or `cores` and `cpulimit` stop taking effect.

Applying it later:

1. Back up the config first: `cp -p /etc/pve/lxc/208.conf /root/208.conf.bak-cpupin-$(date +%Y%m%d%H%M%S)`.
2. `pct set 208 --cores 20 --cpulimit 16 --cpuunits 25`, then `pct config 208` to confirm.
3. `cpulimit` and `cpuunits` take effect live. The new core count lands on pvestatd's next cycle;
   restart the runner services (or the container) so they re-read `nproc`.
4. Verify: `pct exec 208 -- nproc` reads 20, and `pct exec 208 -- cat /proc/loadavg` under CI load
   stays under 16. Add a CT 208 row to the "CPU pinning and memory" table in `docs/divide-host.md`
   once it is applied.
