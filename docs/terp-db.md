# terp.db, the shared database host

terp.db is a G-Core VPS at **80.93.219.21** (Debian 13), on the same provider network as divide
(about 0.3 ms away). Since 2026-11-17 it holds the Postgres databases of abulxt, holt, Fracital,
holy and estro, and the edge's shared Redis. It also runs mailcow in Docker (its own Redis and
MariaDB); nothing on this page touches mailcow. No role in this repo configures terp.db: it was
set up by hand, and this page is the record. The copy on the host is authoritative.

Clients reach it by name: `terp.db` resolves to 80.93.219.21 through `/etc/hosts` on each client
(amph, holy, chat, terp), because the pinned certificate is issued to that name.

## Postgres 18

PostgreSQL **18** from the PGDG apt repository (`apt.postgresql.org`, added with
`/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`), cluster `18/main` on port 5432,
`listen_addresses = '*'`. It was upgraded from Debian's 17 on 2026-11-17 with
`pg_upgradecluster -v 18 -m upgrade 17 main` (log: `/root/pg_upgradecluster-17-18.log`).

`pg_upgradecluster` did not carry `conf.d/` over; the two files were copied by hand. Check
`conf.d/` after any future major upgrade before clients reconnect.

Settings in `/etc/postgresql/18/main/conf.d/`:

- `remote.conf`: `listen_addresses = '*'`, `password_encryption = scram-sha-256`, client address
  in `log_line_prefix`.
- `50-terpdb.conf`: sized for 32 GB shared with mailcow: `shared_buffers = 4GB`,
  `effective_cache_size = 20GB`, `work_mem = 16MB`, `maintenance_work_mem = 512MB`,
  `max_connections = 200`, `max_wal_size = 4GB`, `wal_compression = on`, SSD costs, and the
  server certificate (below).

Rollback to 17: the old cluster `17/main` is kept stopped on port 5433 with `start.conf` set to
`manual`. It has the data as of the upgrade (2026-11-17 21:33 UTC), so a rollback loses
everything written since, including the migrated databases. Prefer restoring a dump into 18.

### Databases and roles

| Database      | Owner role      | Client                                                   | Locale                                 |
| ------------- | --------------- | -------------------------------------------------------- | -------------------------------------- |
| `fracital`    | Fracital's role | terp, `/opt/fracital/repo/.env`                          | `en_US.UTF-8` (libc)                   |
| `abulxt`      | `abulxt`        | amph, abulxt `config.js` `db.url`                        | builtin `C.UTF-8`                      |
| `holt`        | `holt`          | amph, `/opt/holt/config.js` `db.url`                     | builtin `C.UTF-8`                      |
| `holy`        | `holy`          | holy, website2 `config/config.js` `db`                   | `C.UTF-8` (libc), `pg_trgm`            |
| `elichat`     | `elichat`       | chat, `/opt/elichat/.env` `DATABASE_URL`                 | `C`, `SQL_ASCII`                       |
| `fg_api_beta` | `fg_api`        | fg (CT 206), `/etc/fg-api/environment` `FG_POSTGRES_DSN` | `C.UTF-8` (libc), `citext`, `pgcrypto` |

Every app role is a plain login role (no superuser, createdb, createrole or replication) that
owns its own database and everything in it. `CONNECT` and `TEMPORARY` are revoked from `PUBLIC`
on the migrated databases. abulxt and holt came from a musl `en_US.utf8` cluster, which sorts by
code point; builtin `C.UTF-8` keeps that order and does not depend on glibc. elichat keeps the
`SQL_ASCII` encoding it had on chat, so restores cannot fail on bytes that are not UTF-8.
Extensions an app needs are created as `postgres` before its restore (`pg_trgm` in `holy`,
`citext` and `pgcrypto` in `fg_api_beta`; their `COMMENT ON EXTENSION` lines fail in the restore,
harmlessly).

Role passwords: `/root/terpdb-roles.secret` (root, 0600) and each client's own config.

### pg_hba policy

`/etc/postgresql/18/main/pg_hba.conf`, after the local lines:

```
hostssl all postgres 0.0.0.0/0 reject
hostssl all postgres ::/0      reject
hostssl fracital <fracital role> 91.199.82.174/32 scram-sha-256
hostssl abulxt   abulxt        91.199.82.174/32 scram-sha-256
hostssl holt     holt          91.199.82.174/32 scram-sha-256
hostssl holy     holy          91.199.82.174/32 scram-sha-256
hostssl elichat  elichat       91.199.82.174/32 scram-sha-256
hostssl fg_api_beta fg_api 91.199.82.174/32 scram-sha-256
hostssl all all      0.0.0.0/0 reject
hostssl all all      ::/0      reject
```

Every client is a divide guest and arrives from divide's NAT address, 91.199.82.174, so the
address does not tell clients apart: the one-line-per-database-and-role rule does. A new database
gets its own line above the final rejects, then `select pg_reload_conf()`. Plain `host` (no TLS)
matches nothing remote and is refused.

### Client TLS pinning

The server certificate is self-signed, `CN=terp.db`, `subjectAltName DNS:terp.db`, valid until
2036-10-31, SHA-256 fingerprint starting `8A:35:C7:D0`. It is the old Debian snakeoil pair, copied
to `/etc/postgresql/ssl/terp-db.{crt,key}` so a reinstall of the `ssl-cert` package cannot swap it
under the clients.

Each client (amph, holy, chat, terp) keeps a copy at `/etc/ssl/terp-db/ca.crt` and connects with

```
postgres://<role>:<password>@terp.db:5432/<db>?sslmode=verify-full&sslrootcert=/etc/ssl/terp-db/ca.crt
```

node-postgres (abulxt, holt, holy) and Go's pgx (elichat) read both parameters from the URL. The
host must be the name `terp.db`: with the address, verification fails by design. Fracital (terp,
both `/opt/fracital/repo/.env` and `/opt/fracital/dev/.env`) uses host `terp.db` in `DATABASE_URL`
plus `DATABASE_CA=/etc/ssl/terp-db/ca.crt`, and always verifies (since 2026-11-17, commit d164559).

Name resolution, on each client: `80.93.219.21 terp.db` in `/etc/hosts`. amph also has it in
`/etc/cloud/templates/hosts.debian.tmpl` (cloud-init rewrites `/etc/hosts` from it); on the
containers the line sits outside Proxmox's `# --- BEGIN PVE ---` block, which Proxmox leaves alone.

chat's default route goes out through mull (Mullvad), so chat has a host route
`80.93.219.21/32 via 172.16.5.1` (in `/etc/network/interfaces`, next to the Cloudflare routes)
to leave from divide's NAT address like the others.

Rotating the certificate: make a new pair for `terp.db`, install it on terp.db, copy the `.crt` to
every client's `/etc/ssl/terp-db/ca.crt` at the same time, then reload Postgres.

## Shared Redis (6380)

`redis-server@shared` (Debian's template unit), Redis 8.0.2, config
`/etc/redis/redis-shared.conf`, data and AOF in `/var/lib/redis/shared`, log
`/var/log/redis/redis-shared.log`. Debian's default `redis-server.service` (6379) is disabled.

- Bound to `127.0.0.1` and `80.93.219.21`, port **6380**.
- `maxmemory 2gb`, `maxmemory-policy noeviction`: the certificates are the only copy, so writes
  fail rather than evict.
- `appendonly yes`, `appendfsync everysec`, plus RDB snapshots.
- ACL: the `default` user (the clients' `AUTH <password>`, infra's `shared_redis_password`) has
  `+@all -flushall -flushdb -config -debug`. `SCAN`, `KEYS`, `RENAME`, `MULTI`, `DUMP` and
  `RESTORE` work. The `admin` user has everything, for `CONFIG GET` and the like. Both passwords
  are in `/root/terpdb-redis.secret`; the config holds only their SHA-256 hashes.
- Plain TCP, no TLS: the password crosses the provider network in the clear.

Data: the edge's certificates, `auto-ssl:*` (121 certificates on 2026-11-17), copied from amph.
amph's Redis is still the live copy until the edge's apply (`ansible/RUNBOOK.md` "Shared Redis on
terp.db"). amph has `/root/redis-copy-to-terp-db.sh` for steps 4 and 6 of that procedure (no
argument: copy with replace; `--add`: copy only missing keys; `--check`: compare).

## Firewall

`/etc/nftables.conf` manages only `table inet filter` (create-then-delete idiom). Never
`flush ruleset`: Docker's iptables-nft tables (mailcow) and fail2ban's `inet f2b-table` live next
to it.

- input, policy drop: established, loopback, ICMP, tcp 22 from anywhere, the containers' bridges.
- tcp 5432 and 6380 only from 91.199.82.174 (divide's NAT).
- tcp 6380 also from **37.9.34.169**: divide sends the edge's own connections out the second
  uplink (`inet divide edge_out`, `docs/divide-host.md`), so the edge reaches the Redis from that
  address. It is not allowed on 5432.
- mailcow's published ports are DNAT and pass the forward chain, not input.

fail2ban jails `sshd` and `postgresql` ban into `inet f2b-table`.

Rollback copies: `/root/nftables.conf.bak-terpdb-harden-20261117212641` (before the address
limits; `nft -f` it) and `/root/nftables.conf.bak-terpdb-edge6380-*`.

## Backups

On terp.db, `terpdb-backup.timer` (03:15 UTC) runs `/usr/local/sbin/terpdb-backup.sh`:

- `/var/backups/postgres/<UTC stamp>/`: `pg_dump -Fc` of every database that allows connections,
  `globals.sql` (`pg_dumpall --globals-only`: roles and their password hashes), `VERSION`.
- `/var/backups/redis/<UTC stamp>.rdb`: `redis-cli --rdb` of the shared Redis.
- 14 days kept. Everything is root or postgres only, mode 0700/0600.

Off the box, divide's `terpdb-pull.timer` (04:30 UTC) runs `/usr/local/sbin/terpdb-pull.sh`, which
pulls `postgres/` and `redis/` into `divide:/var/backups/terp-db/` with rsync and keeps 21 days.
It never deletes to match terp.db, so a wiped terp.db cannot empty divide's copy. The key
(`divide:/root/.ssh/terpdb-pull_ed25519`, host key pinned in `/root/.ssh/terpdb_known_hosts`) is
limited on terp.db to `restrict,from="91.199.82.174",command="/usr/bin/rrsync -ro /var/backups"`:
read only, that directory only.

Run one by hand: `systemctl start terpdb-backup.service` on terp.db, `systemctl start
terpdb-pull.service` on divide; `journalctl -u <unit>` prints a one-line summary.

### Restore

One database, into a fresh database (the same steps as the 2026-11-17 move):

```sh
sudo -u postgres psql -c "CREATE DATABASE abulxt_restore OWNER abulxt TEMPLATE template0 ENCODING UTF8 LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LOCALE 'C.UTF-8'"
sudo -u postgres pg_restore -j 4 --no-owner --no-acl --role=abulxt -d abulxt_restore /var/backups/postgres/<stamp>/abulxt.dump
```

Use the database's own locale from the table above, create its extensions first, then rename
the databases (with the clients stopped) or repoint the client. The abulxt dump (about 1 GB)
restores in about 2.5 minutes. Roles on a rebuilt server: `psql -f globals.sql` first.

Redis: with AOF on, Redis loads the AOF and ignores the RDB, so: stop `redis-server@shared`, move
`/var/lib/redis/shared/appendonlydir` aside, copy the `.rdb` to `/var/lib/redis/shared/dump.rdb`
(owner `redis`), set `appendonly no` in the config, start it and check `DBSIZE`, then
`CONFIG SET appendonly yes` as `admin` (it writes a new AOF from memory) and put `appendonly yes`
back in the config.

## The 2026-11-17 move

| Database      | From                              | Downtime           | Dump kept on terp.db                              |
| ------------- | --------------------------------- | ------------------ | ------------------------------------------------- |
| `fracital`    | (already here) PG 17 to 18        | 35 s, 21:33:42 UTC | `/var/backups/postgres/20261117T213319Z/`         |
| `holt`        | amph Docker `abulxt-db` (PG 18.6) | 15 s, 21:49:48 UTC | `/var/backups/migrate/holt-cutover-*.dump`        |
| `abulxt`      | amph Docker `abulxt-db` (PG 18.6) | 3.5 min, 21:50:21  | `/var/backups/migrate/abulxt-cutover-*.dump`      |
| `holy`        | holy's local PG 17 (CT 205)       | 10 s, 21:59:01 UTC | `/var/backups/migrate/holy-cutover-*.dump`        |
| `elichat`     | chat's local PG 17 (CT 106)       | 3 s, 22:02:01 UTC  | `/var/backups/migrate/elichat-cutover-*.dump`     |
| `fg_api_beta` | giftshop's local PG 17 (VM 111)   | 75 s, 22:21:10 UTC | `/var/backups/migrate/fg_api_beta-cutover-*.dump` |

Row counts matched for every table after each restore. The old copies are kept, not deleted:

- amph: container `abulxt-db` stopped (`docker start abulxt-db` brings it back; volume
  `db_abulxt-pgdata-18`). Config backups: `/opt/abulxt-main-site/config.js.bak-terpdb-*` and
  `/opt/holt/config.js.bak-terpdb-*`.
- holy: `postgresql@17-main` and its `pg_backupcluster` timers stopped and disabled, `start.conf`
  `manual`, data in `/var/lib/postgresql/17/main`. Config backup:
  `/home/holy/website2/config/config.js.bak-terpdb-*`.
- giftshop (VM 111, powered off 2026-11-17): `postgresql@17-main` stopped and disabled, `start.conf`
  `manual`, data in `/var/lib/postgresql/17/main`. The Flying Gorilla game keeps its Redis on fg
  (`docs/divide-host.md` "fg"), not on the shared Redis here.
- chat: local Postgres still runs (for `labelsupplier`); its `elichat` database has
  `ALLOW_CONNECTIONS false`. Config backup: `/opt/elichat/.env.bak-terpdb-*`.

Rolling one back: stop the app, bring the old database back (start the container, `systemctl
start postgresql@17-main`, or `ALTER DATABASE elichat ALLOW_CONNECTIONS true`), copy the config
backup over the config, start the app. Anything written on terp.db since the move is lost unless
you first dump it from terp.db and restore it into the old database.

Not moved: chat's `labelsupplier` (21 GB). Nothing routes to its gateway (port 8088) and nothing
in a repo deploys it, so who uses it is unclear.
