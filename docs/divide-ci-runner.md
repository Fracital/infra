# divide CI runners: CT 204 and CT 208

Two containers on divide run GitHub Actions self-hosted runners, split on purpose by trust.
CT 204 (`runner`) is trusted: it runs first-party workflow code and reaches the deploy gates.
CT 208 (`ci`) is untrusted: it runs pull request code for Fracital/powerMouse, fenced off from
every private address and from divide itself. This page records both, because no role in this
repository configures them; like divide itself they were set up by hand (`docs/divide-host.md`).

The authoritative copy of each file is the one on divide. Diff against it before reusing anything
here. Changing either container needs the owner's go-ahead for the host, like any other live host
(AGENTS.md "Servers").

## CT 208 (ci): untrusted powerMouse PR CI

CT 208 is an unprivileged LXC at **172.16.5.208** on `vmbr1`, hostname `ci`, Proxmox tag `ci`. It
runs **20** GitHub Actions runners, `ci-1` through `ci-20`, each a systemd service
`actions.runner.Fracital.ci-N.service` running as the user `runner`. They are registered to the
**Fracital** org in runner group `ci`. powerMouse's `ci.yml`, estrogen's Linux x64 and node jobs,
and all of SystemYA's CI, build and STomp updater jobs send their jobs to that group.

The jobs are pull request code from contributors, so the container is treated as hostile:

- Its firewall (`208.fw`, below) allows **outbound to the public internet only**. A job cannot
  reach any private range, the other guests, divide's gateway (past ping), divide's public
  addresses, or a hairpin back in.
- It is a separate container from the deploy runners (CT 204), so an untrusted PR job never shares
  a kernel namespace, a filesystem or a network position with the code that can deploy.

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

It has **no CPU pin** today (no `lxc.cgroup2.cpuset.cpus`, no `cpulimit`), the only guest that
pvestatd spreads across every host thread. That is what the pin below fixes.

## CT 204 (runner): trusted deploy and build runners

CT 204 is an unprivileged LXC at **172.16.5.204**, hostname `runner`, tag `ci`. It runs the
first-party runners under `/opt/actions-runner/<scope>`: `org-fracital`, `org-rebel10n`,
`org-y9x`, `fracital-deploy`, `y9x-deploy` and `_dist`. These are trusted: they run workflows from
the orgs' own repositories, and the deploy ones hold the position to deploy. The `vmbr1` bridge
firewall lets 172.16.5.204 reach terp `:22` and chat `:22`, the stomp and estro deploy gates
(`docs/divide-host.md` "table bridge divide_guests"). Its own `204.fw` admits nothing inbound.
`fracital-deploy` (`divide-deploy`, labels `divide` and `deploy`) is in the Fracital runner group
`deploy`, which admits only powerMouse's `deploy.yml` on `master` and SystemYA's `deploy.yml` on
`main`. SystemYA's deploy reaches the edge by ProxyJump through root@91.199.82.174, as it did
from GitHub's runners.

Resources: cores 2, memory 8 GiB, swap 0, rootfs 64 GB. It is pinned to host threads **10, 26**
(`docs/divide-host.md` "CPU pinning and memory").

Why it is a different container from CT 208: CT 204 runs first-party code and holds deploy trust;
CT 208 runs third-party PR code and holds none. The split is the boundary. CT 204 stays small and
pinned because its work is steady and must keep running when CI is busy; CT 208 is large and
bursty and must not be allowed to drown it.

## Firewall: /etc/pve/firewall/208.fw

Proxmox's legacy `pve-firewall` filters the NIC on its own bridge `fwbr208i0`, the same scheme as
every other guest (`docs/divide-host.md` "Guest firewalls"). `208.fw`:

- `policy_in: DROP`, `policy_out: ACCEPT`, `ipfilter: 1` (the NIC may only send from
  172.16.5.208), no logging.
- OUT rules, in order: ICMP to the gateway 172.16.5.1 is allowed (ping); everything else to
  172.16.5.1 is dropped (divide's own ssh and `:80`); the private ranges `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` and `169.254.0.0/16` are dropped;
  TCP and UDP 443 to 91.199.82.174 are allowed (the edge's public HTTPS and Wisp, which
  SystemYA's STomp smoke test opens through `holywisp.fracit.al`); the hairpin masquerades them
  to 172.16.5.1, an address the edge trusts for nothing, so a job sees what any internet client
  sees. Everything else to 91.199.82.174 and all of 37.9.34.169 (divide's two public addresses,
  which would hairpin to guests) is dropped; divide's `vmbr9` addresses `5.188.124.1`, `.38`, `.39` are dropped; and `fc00::/7` is
  dropped. What is left is the public internet.

The net effect: jobs fetch from GitHub and the public internet and nothing else. The `172.16.0.0/12`
drop already covers terp, vault, the edge and every other guest, so there is no path from a PR job
to a production service.

The 443 rule was added on 2026-11-20 (backup `/root/208.fw.bak-systemya-ci-20261120081509` on
divide), and the header comment now reads 20 instances.

## How powerMouse uses it

powerMouse's `ci.yml` runs on the self-hosted `ci` runner group. GitHub hands a queued PR job to
whichever of `ci-1` through `ci-20` is free, so up to 20 jobs run at once. Nothing on divide routes
the jobs; GitHub does, by the runner group. When CT 208 is stopped the runners deregister as
offline and GitHub queues the jobs until it is back; trusted deploys on CT 204 keep running.

## Operating it

Config lives in `/etc/pve/lxc/208.conf` and `/etc/pve/lxc/204.conf`; the firewalls in
`/etc/pve/firewall/208.fw` and `204.fw`. The runner installs are under `/home/runner` on CT 208 and
`/opt/actions-runner/<scope>` on CT 204. All commands run on divide (`ssh root@91.199.82.174`).

- State: `pct status 208`, `pct status 204`.
- Start or stop CT 208: `pct start 208` / `pct stop 208`. Stopping it pauses all powerMouse PR CI
  and leaves deploys (CT 204) untouched.
- List the runners: `pct exec 208 -- systemctl list-units 'actions.runner.*'`.
- One runner's log: `pct exec 208 -- journalctl -u actions.runner.Fracital.ci-5`.
- Restart one runner: `pct exec 208 -- systemctl restart actions.runner.Fracital.ci-5.service`.
- The same commands work on CT 204 with the `org-*`, `*-deploy` and `_dist` unit names.

## CPU pin for CT 208 (prepared 2026-11-19, not applied)

This is the recommended pin. It is **not applied yet**. Applying it needs the owner's go-ahead for
the host (AGENTS.md "Servers").

Why pin: CT 208 is the only guest with no CPU limit. pvestatd spreads its 28 cores across all 32
host threads, including the six threads `docs/divide-host.md` keeps exclusive for the edge (0-2,
16-18) and the shared threads amph, kn, the origins and the trusted CT 204 runner sit on. The
container idles around load average 17 of 28 and a PR storm pushes it higher, so untrusted builds
compete with the edge's request serving and with the deploy runners.

What it protects: the edge, amph and the origins, and CT 204's deploys.

The pin:

```
pct set 208 --cores 20 --cpulimit 16 --cpuunits 25
```

The numbers, against the host's 16 cores and 32 threads (Ryzen 9 7950X) and the pins in
`docs/divide-host.md`:

- **cores 20**, down from 28: the container advertises `nproc` 20, one apparent CPU per runner
  (`ci-1` through `ci-20`), so a build tool that reads `nproc` for its `-j` does not spin up 28-way
  parallelism per job on top of 20 concurrent jobs.
- **cpulimit 16**, up from 0 (unlimited): a hard ceiling of 16 cores of CPU time, half of the 32
  threads and all 16 physical cores. With every runner busy, CT 208 still cannot take more than
  half the host. The other 16 threads stay for the edge (6), amph (4), kn (4) and CT 204 (2), which
  is the sum of the heaviest production pins.
- **cpuunits 25**, unchanged: it is already 25, so under contention a default-weight (100)
  production guest gets four times CT 208's scheduler share. The command repeats it to keep the
  intent in one place.

Tradeoff: PR CI gets at most 16 cores instead of the whole box, so a burst of builds finishes
slower. For untrusted CI that should take leftover capacity, that is the right side of the trade.
If production still contends, lower `cpulimit` to 12. If CI backs up while production is idle, raise
it toward 20.

Why `pct set` and not a cpuset pin: every other guest is pinned with a raw
`lxc.cgroup2.cpuset.cpus` line, which overrides `cores` and takes the container out of pvestatd's
balancing (`docs/divide-host.md` "CPU pinning and memory"). CT 208 is bursty untrusted CI that
should float on spare capacity, not own named threads, so it keeps `cores`, `cpulimit` and
`cpuunits` and stays balanced. Do not add a `cpuset.cpus` line to 208 unless you also move it onto
the exclusive-threads scheme, or `cores` and `cpulimit` stop taking effect.

Applying it later:

1. Back up the config first: `cp -p /etc/pve/lxc/208.conf /root/208.conf.bak-cpupin-$(date +%Y%m%d%H%M%S)`.
2. `pct set 208 --cores 20 --cpulimit 16 --cpuunits 25`, then `pct config 208` to confirm.
3. `cpulimit` and `cpuunits` take effect live. The new core count lands on pvestatd's next cycle;
   restart the `ci-N` services (or the container) so the runners re-read `nproc`.
4. Verify: `pct exec 208 -- nproc` reads 20, and `pct exec 208 -- cat /proc/loadavg` under CI load
   stays under 16. Add a CT 208 row to the "CPU pinning and memory" table in `docs/divide-host.md`
   once it is applied.
