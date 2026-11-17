# Abulxt Infrastructure Catalog

Collected 2026-10-02. All public IPs are **G-Core Labs (AS202422)**. Geolocation
via ip-api.com (city-level, lat/lon).

## Edges (OpenResty BYOD relays → amph)

The old byod VPSs are all gone: `abulxt-santaclara` (92.38.149.24), `abulxt-losangeles`
(92.223.30.23), `abulxt-chicago` (2.56.222.45) and `abulxt-ashburn` / `com.puter` (45.82.161.87 and
.85–.155) were retired with KrunkNative's move to kn-mia / kn-iev and cancelled at G-Core
(2026-11-13). byod was the wisp cloud from 2026-11-12, and since 2026-11-16 (iev, mia, jnb and ams
dismantled) it is one box, `edge`, CT 201 on the Proxmox host divide in Ashburn/Manassas (172.16.5.10,
public 91.199.82.174 through divide's NAT; it replaced `wisp-mnz`, a VM on meal)
(`[wisp_edge]`, README "The wisp cloud"). Customer domains still pointed straight at ashburn's addresses broke with it; the
supported target is the name `byod.abstracteducation.loan`. ashburn's linkgen (`/opt/linkgen`, no
repo) is archived, not running, on amph: `/root/archive/linkgen-ashburn-20261113025134.tar.gz`.

## Origin

| Alias                    | Name                | Public IP                                                   | City     | Region   | Country | Role                                                                |
| ------------------------ | ------------------- | ----------------------------------------------------------- | -------- | -------- | ------- | ------------------------------------------------------------------- |
| `amph` (`abulxt-origin`) | amph (VM on divide) | none (172.16.5.3 private, via ProxyJump root@91.199.82.174) | Manassas | Virginia | US      | OpenResty + app + Postgres + abulxt-domains + shared auto-ssl Redis |
