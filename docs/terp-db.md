# terp.db, the shared database host

terp.db is a G-Core VPS at **80.93.219.21** (Debian 13), on the same provider network as divide
(about 0.3 ms away). Since 2026-11-17 it holds the Postgres databases of abulxt, holt, Fracital,
holy and estro, the edge's shared Redis, one Redis each for fg, kru and eagler, and a MariaDB for
eagler's Pterodactyl panel (below). It
also runs mailcow in Docker (its own Redis and
MariaDB); nothing on this page touches mailcow. No role in this repo configures terp.db: it was
set up by hand, and this page is the record. The copy on the host is authoritative.

Clients reach it by name: `terp.db` resolves to 80.93.219.21 through `/etc/hosts` on each client
(amph, holy, chat, terp, fg, guca, kru), because the pinned certificate is issued to that name.
eagler has the line too, for its Redis and MariaDB (its `/etc/cloud/templates/hosts.debian.tmpl`
as well).

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

| Database        | Owner role       | Client                                                                                                | Locale                                 |
| --------------- | ---------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `fracital`      | Fracital's role  | terp, `/opt/fracital/repo/.env`                                                                       | `en_US.UTF-8` (libc)                   |
| `abulxt`        | `abulxt`         | amph, abulxt `config.js` `db.url`                                                                     | builtin `C.UTF-8`                      |
| `holt`          | `holt`           | amph, `/opt/holt/config.js` `db.url`                                                                  | builtin `C.UTF-8`                      |
| `holy`          | `holy`           | holy, website2 `config/config.js` `db`                                                                | `C.UTF-8` (libc), `pg_trgm`            |
| `elichat`       | `elichat`        | chat, `/opt/elichat/.env` `DATABASE_URL`                                                              | `C`, `SQL_ASCII`                       |
| `fg_api_beta`   | `fg_api`         | fg (CT 206), `/etc/fg-api/environment` `FG_POSTGRES_DSN`                                              | `C.UTF-8` (libc), `citext`, `pgcrypto` |
| `labelsupplier` | `lsupplier`      | closed 2026-11-18 (NOLOGIN, `pg_hba` line commented; divide-host.md "goldenticket and labelsupplier") | `C`, `SQL_ASCII`                       |
| `guacamole_db`  | `guacamole_user` | guca (CT 117), `/etc/guacamole/guacamole.properties`                                                  | `C`, `SQL_ASCII`                       |
| `krunknative`   | `krunknative`    | kru (CT 120), `/etc/krunknative/coord-db.env` + `secrets.env`                                         | `C.UTF-8` (libc)                       |

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
hostssl labelsupplier lsupplier 91.199.82.174/32 scram-sha-256
hostssl guacamole_db guacamole_user 91.199.82.174/32 scram-sha-256
hostssl krunknative krunknative 91.199.82.174/32 scram-sha-256
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

Each client (amph, holy, chat, terp, fg, guca, kru) keeps a copy at `/etc/ssl/terp-db/ca.crt` and
connects with

```
postgres://<role>:<password>@terp.db:5432/<db>?sslmode=verify-full&sslrootcert=/etc/ssl/terp-db/ca.crt
```

node-postgres (abulxt, holt, holy) and Go's pgx (elichat) read both parameters from the URL. The
host must be the name `terp.db`: with the address, verification fails by design. Fracital (terp,
both `/opt/fracital/repo/.env` and `/opt/fracital/dev/.env`) uses host `terp.db` in `DATABASE_URL`
plus `DATABASE_CA=/etc/ssl/terp-db/ca.crt`, and always verifies (since 2026-11-17, commit d164559).
labelsupplier (Go, lib/pq) reads both from the URL too. Guacamole sets them in
`guacamole.properties` (`postgresql-hostname: terp.db`, `postgresql-ssl-mode: verify-full`,
`postgresql-ssl-root-cert-file: /etc/ssl/terp-db/ca.crt`). kn_brain (KrunkNative, libpq) builds its
connection from `KN_DATABASE_*` and passes no TLS keyword, so `coord-db.env` also sets libpq's
`PGSSLMODE=verify-full` and `PGSSLROOTCERT=/etc/ssl/terp-db/ca.crt`.

Name resolution, on each client: `80.93.219.21 terp.db` in `/etc/hosts`. amph had it in
`/etc/cloud/templates/hosts.debian.tmpl` too while it was a VM (cloud-init is purged since it became
CT 213 on 2026-11-17); on the containers the line sits outside Proxmox's `# --- BEGIN PVE ---` block, which Proxmox leaves alone.

chat's default route goes out through mull (Mullvad), so chat has a host route
`80.93.219.21/32 via 172.16.5.1` (in `/etc/network/interfaces`, next to the Cloudflare routes)
to leave from divide's NAT address like the others.

Rotating the certificate: make a new pair for `terp.db`, install it on terp.db, copy the `.crt` to
every client's `/etc/ssl/terp-db/ca.crt` at the same time, then reload Postgres. The MariaDB
(below) serves a copy of the same pair from `/etc/mysql/ssl/`: replace that copy too and restart
`mariadb`.

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

Data, by key prefix (nothing on this instance flushes or uses `CONFIG`):

| Prefix             | Writer                                          | Readers                                     | Expiry                                                |
| ------------------ | ----------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `auto-ssl:*`       | the edge's lua-resty-auto-ssl                   | the edge; abulxt-wispstats (a `SCAN` count) | none (certificates); challenge tokens are short-lived |
| `linkroute:v1`     | abulxt-community (`abulxt-community-linkroute`) | the edge (`lua/link_routes.lua`)            | none                                                  |
| `wispbaby:box:`    | the edge (`lua/wispstats.lua`, every 2 s)       | abulxt-wispstats                            | 30 s                                                  |
| `wispbaby:hll:`    | the edge (`PFADD`, one HyperLogLog per UTC day) | abulxt-wispstats (`PFCOUNT`)                | about 35 days                                         |
| `wispbaby:live`    | abulxt-wispstats                                | the edge (wisp.baby `/live`)                | 60 s                                                  |
| `wispbaby:history` | abulxt-wispstats                                | the edge (wisp.baby `/live/history`)        | about 15 min                                          |

The certificates (121 on 2026-11-17) were copied from amph before the edge's switch
(`ansible/RUNBOOK.md` "Shared Redis on terp.db"). wisp.baby's stats followed at 00:43 UTC on
2026-11-18: the `wispbaby:hll:*` and `wispbaby:history` keys were copied with `MIGRATE ... COPY`, the
edge (`--tags relay`) and abulxt's `wispStats.redis` were switched within a second of each other, and
the HyperLogLogs written to amph in that second were merged in with `PFMERGE`. Every key here carries
a TTL except the certificates and `linkroute:v1`, so `noeviction` never fills up with stats. The stats
write about one pipeline a second in total and use well under 1 MB, too little to crowd the
certificates, so they did not get an instance of their own.

amph runs no Redis since then: `redis-server` is stopped and disabled there, port 6379 is closed in
amph's firewall, CT 213's guest firewall and divide's `from_edge` chain. Its last dump is the rollback
(`amph:/root/redis-amph-retired-20261118004759.rdb`, also `/var/lib/redis/dump.rdb`; RUNBOOK.md has
the steps).

## App Redis instances (6381 to 6384)

Since 2026-11-17 every app that had a Redis of its own on a divide guest has its own instance here
instead of a user on the shared one: the shared `default` user can read the certificate store, the
panel needs `FLUSHDB`, and fg-api's client cannot send a username. Each is `redis-server@<app>` (the
same template unit, enabled), config `/etc/redis/redis-<app>.conf` (root:redis 0640), data in
`/var/lib/redis/<app>`, log `/var/log/redis/redis-<app>.log`, bound to `127.0.0.1` and
`80.93.219.21`. Persistence and eviction copy the source's. Passwords (generated with `openssl rand
-hex 32`) are in `/root/terpdb-redis-<app>.secret` (`REDIS_APP_PASSWORD` for the app's user,
`REDIS_ADMIN_PASSWORD` for `admin`, which has everything); the configs hold only SHA-256 hashes.

| Port | Instance | App (client, config)                                                                                                                                                                                                            | Policy                                        | App user's ACL                                                                                   |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 6381 | `fg`     | fg-api on fg (CT 206), go-redis; `/etc/fg-api/environment` `FG_REDIS_ADDR=terp.db:6381`, `FG_REDIS_PASSWORD`                                                                                                                    | RDB snapshots, no AOF, 256 MB, `noeviction`   | `default`: all but flush, `CONFIG`, `DEBUG`, `SHUTDOWN`, `MODULE`, `MONITOR`, replication, `ACL` |
| 6382 | `kru`    | kn_brain on kru (CT 120), hiredis; `/etc/krunknative/redis.env`, `KN_REDIS_PASSWORD` in `secrets.env`                                                                                                                           | no persistence, 128 MB, `volatile-lru`, 4 DBs | `kn_brain`: `~kn:* &kn:* +@all -@dangerous`; `default` is off                                    |
| 6383 | `eagler` | Pterodactyl panel on eagler (VM 104), predis; `/var/www/pterodactyl/.env` `REDIS_HOST/PORT/PASSWORD`                                                                                                                            | RDB snapshots, no AOF, 256 MB, `noeviction`   | `default`: as fg's, but `FLUSHDB` allowed (Laravel's `cache:clear`)                              |
| 6384 | `chat`   | stopped and disabled 2026-11-18 with labelsupplier (nft line removed); was labelsupplier-gateway on chat (CT 106), its own RESP client; `/opt/labelsupplier/.env` `REDIS_ADDR=terp.db:6384`, `REDIS_USERNAME`, `REDIS_PASSWORD` | no persistence, 128 MB, `allkeys-lru`, 1 DB   | `labelsupplier`: `~ls:* resetchannels -@all +get +set +ping`; `default` is off                   |

- fg: in-flight state only (revoked sessions, live runs), database 1 (`FG_REDIS_DB=1`), every key
  has a TTL. `noeviction` so a revocation is never evicted.
- kru: kn_brain's hot tier (caches, presence, rate limits, pub/sub), nothing authoritative. As in
  KrunkNative's `kn_redis` role it has no persistence on purpose (a restored snapshot could bring
  back sessions revoked meanwhile), so it is not in the nightly backup either. KrunkNative's
  `group_vars/central/main.yml` sets `kn_redis_remote_url: redis://terp.db:6382`, so its deploys
  keep kn-redis off on kru and write `redis.env` for terp.db.
- eagler: Laravel cache, sessions and queue (databases 0 and 1, prefix `pterodactyl_database_`).
  Config is not cached (`bootstrap/cache/config.php` absent), so a `.env` change applies on the next
  request; `pteroq` needs a restart.
- chat (2026-11-18): the model-catalog cache of `labelsupplier-gateway`, keys `ls:models:*`, each
  with a TTL (30 s; `status_counts_stale` 24 h). chat's own Redis had no `maxmemory`, `noeviction`
  and default RDB snapshots; as a pure cache it got no persistence and `allkeys-lru` here, and it is
  not in the nightly backup. The gateway could not send `AUTH` before 2026-11-18. Its client
  (`labelsupplier/db/redis.go`) now reads `REDIS_URL` (`redis://` or `rediss://`) or `REDIS_ADDR`,
  `REDIS_USERNAME` and `REDIS_PASSWORD`, and any connect or `AUTH` error is a cache miss served from
  Postgres (logged at most once a minute). Its `--env .env` loader never exported `.env` to the
  process environment, so the `REDIS_ADDR` there was ignored until the same rebuild, which exports
  the `REDIS_*` keys. The binary is built locally (chat's Go is too old) and no repo deploys it; the
  one it replaced is `/opt/labelsupplier/labelsupplier.bak-redis-*`.

The data was copied key by key with its TTL (`SCAN`, `DUMP`, `PTTL`, `RESTORE` as `admin`; the
script is `/root/rcopy.py` on fg, kru and eagler), with the app stopped (fg) or as a first pass, the
switch and a second pass that adds only missing keys (kru, eagler).

| Instance | From                                 | Keys | Downtime                                            |
| -------- | ------------------------------------ | ---- | --------------------------------------------------- |
| `fg`     | fg `redis-server` 127.0.0.1:6379     | 16   | 0.1 s, 22:57:36 UTC (fg-api stop and start)         |
| `kru`    | kru `kn-redis` 127.0.0.1:6380        | 1    | 0.4 s, 22:58:28 UTC (both kn_brain restarts)        |
| `eagler` | eagler `redis-server` 127.0.0.1:6379 | 16   | none, 23:00:56 UTC (`pteroq` restart)               |
| `chat`   | chat `redis-server` 127.0.0.1:6379   | 0    | 1.7 s, 01:09:09 UTC on 2026-11-18 (gateway restart) |

The old Redis on each guest is stopped and disabled, its data kept (`/var/lib/redis/dump.rdb` on fg,
eagler and chat; kru's had none). chat's cache was not copied: its keys live 30 s and are rebuilt on
the next request. Config backups: fg `/etc/fg-api/environment.bak-terpdb-redis-*`, kru
`/etc/krunknative/{redis,secrets}.env.bak-terpdb-redis-*`, eagler
`/root/pterodactyl.env.bak-terpdb-redis-*` and `/etc/hosts.bak-terpdb-redis-*`, plus each guest's
old `redis.conf.bak-terpdb-redis-*`; chat `/opt/labelsupplier/.env.bak-terpdb-redis-*` (0600).
Rollback: copy the config backup back, `systemctl enable --now redis-server` (fg, eagler, chat) or
`kn-redis` (kru), restart the app (`fg-api`; `kn-brain-coord` and `kn-brain-finder`; `pteroq` and a
`php8.3-fpm` reload; `labelsupplier-gateway`). The new chat binary works with the old Redis too
(the `.env` backup sets only `REDIS_ADDR`), so its binary backup is needed only to undo the code.
On kru also set `kn_redis_remote_url: ""` in KrunkNative first, or its next deploy switches back
to terp.db. Keys written on terp.db since are lost unless copied back with the same script.

## MariaDB (3307)

Since 2026-11-18 a host MariaDB holds eagler's Pterodactyl panel database. It is Debian's
`mariadb-server` 11.8.6 as `mariadb.service` (enabled), datadir `/var/lib/mysql`, and has nothing
to do with mailcow's MariaDB, which runs in Docker and publishes only `127.0.0.1:13306`. Port
**3307**, so nothing here can be taken for mailcow's 3306.

Settings in `/etc/mysql/mariadb.conf.d/60-terpdb.cnf`:

- `port = 3307`, `bind-address = 127.0.0.1,80.93.219.21`, `skip-name-resolve`, `local-infile = OFF`.
- TLS: `ssl_cert`/`ssl_key` are a copy of the Postgres pair (`CN=terp.db`, fingerprint
  `8A:35:C7:D0`) in `/etc/mysql/ssl/terp-db.{crt,key}` (root:mysql, key 0640), so clients pin the
  same `/etc/ssl/terp-db/ca.crt`. `tls_version = TLSv1.2,TLSv1.3`, `require_secure_transport = ON`:
  every TCP connection must use TLS (a plain one gets error 3159); the unix socket is exempt.
- `innodb_buffer_pool_size = 256M`, `max_connections = 100`. `performance_schema` is off
  (Debian's default), so check sessions with `SHOW PROCESSLIST` and the `Ssl_accepts` counters.

Accounts:

- `root@localhost` and `mysql@localhost`: `unix_socket` only (`sudo mariadb` as root).
- `panel@91.199.82.174`: `REQUIRE SSL`, `ALL` on `panel` only. Password from `openssl rand -hex 24`
  in `/root/terpdb-mariadb.secret` (root 0600, `panel=`), and in the panel's `.env`.
- No anonymous users and no `test` database (removed after the install).

| Database | Charset, collation                                                | Client                                                                                                                                                                              |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panel`  | `utf8mb4`, `utf8mb4_uca1400_ai_ci` (tables: `utf8mb4_unicode_ci`) | Pterodactyl 1.15.2 on eagler (VM 104), PDO mysqlnd; `/var/www/pterodactyl/.env` `DB_HOST=terp.db`, `DB_PORT=3307`, `DB_USERNAME=panel`, `MYSQL_ATTR_SSL_CA=/etc/ssl/terp-db/ca.crt` |

The panel's `config/database.php` reads `MYSQL_ATTR_SSL_CA` and
`MYSQL_ATTR_SSL_VERIFY_SERVER_CERT` (default true, also set in `.env`), so the connection verifies
the certificate and the name `terp.db`.

The panel has no Pterodactyl database hosts (`database_hosts` and `databases` are empty), so there
are no game-server databases. Create one here only with its own user and a decision on scope:
Pterodactyl's database host user needs `ALL ... WITH GRANT OPTION`.

No fail2ban jail watches MariaDB; only 91.199.82.174 can reach the port.

## Firewall

`/etc/nftables.conf` manages only `table inet filter` (create-then-delete idiom). Never
`flush ruleset`: Docker's iptables-nft tables (mailcow) and fail2ban's `inet f2b-table` live next
to it.

- input, policy drop: established, loopback, ICMP, tcp 22 from anywhere, the containers' bridges.
- tcp 5432 and 6380 only from 91.199.82.174 (divide's NAT).
- tcp 6380 also from **37.9.34.169**: divide sends the edge's own connections out the second
  uplink (`inet divide edge_out`, `docs/divide-host.md`), so the edge reaches the Redis from that
  address. It is not allowed on 5432.
- tcp 6381 to 6384 (the app Redis instances) only from 91.199.82.174.
- tcp 3307 (the host MariaDB) only from 91.199.82.174. 3306 is not open.
- mailcow's published ports are DNAT and pass the forward chain, not input.

fail2ban jails `sshd` and `postgresql` ban into `inet f2b-table`.

Rollback copies: `/root/nftables.conf.bak-terpdb-harden-20261117212641` (before the address
limits; `nft -f` it), `/root/nftables.conf.bak-terpdb-edge6380-*` and
`/root/nftables.conf.bak-terpdb-redis-apps-*` (before 6381 to 6383),
`/root/nftables.conf.bak-terpdb-mariadb-*` (before 3307) and
`/root/nftables.conf.bak-terpdb-redis-chat-*` (before 6384).

## Backups

On terp.db, `terpdb-backup.timer` (03:15 UTC) runs `/usr/local/sbin/terpdb-backup.sh`:

- `/var/backups/postgres/<UTC stamp>/`: `pg_dump -Fc` of every database that allows connections,
  `globals.sql` (`pg_dumpall --globals-only`: roles and their password hashes), `VERSION`.
- `/var/backups/redis/<UTC stamp>.rdb`: `redis-cli --rdb` of the shared Redis.
- `/var/backups/redis/<UTC stamp>-fg.rdb` and `<UTC stamp>-eagler.rdb`: the same for those
  instances, read as their `admin` user. kru's and chat's instances are left out on purpose (no
  persistence by design; the script's loop names only fg and eagler). Script backup from before
  this: `/root/terpdb-backup.sh.bak-redis-apps-*`.
- `/var/backups/mariadb/<UTC stamp>/`: `<db>.sql.gz` per database of the host MariaDB
  (`mariadb-dump --single-transaction --routines --triggers --events --hex-blob --databases`, as
  root over the socket), `users.sql` (`mariadb-dump --system=users`: accounts, grants, password
  hashes), `VERSION`. Never mailcow's. Script and unit backups from before this:
  `/root/terpdb-backup.{sh,service}.bak-mariadb-*`.
- 14 days kept. Everything is root or postgres only, mode 0700/0600.

Off the box, divide's `terpdb-pull.timer` (04:30 UTC) runs `/usr/local/sbin/terpdb-pull.sh`, which
pulls `postgres/`, `redis/` and `mariadb/` into `divide:/var/backups/terp-db/` with rsync and keeps
21 days (`mariadb/` added 2026-11-18, backup `divide:/root/terpdb-pull.sh.bak-mariadb-*`).
Half-written dumps (`*.partial`) are excluded before the includes, because rsync takes the first
rule that matches (they came after them until 2026-11-18 and never applied; backup
`/usr/local/sbin/terpdb-pull.sh.bak-filter-*`).
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

The fg and eagler instances have no AOF: stop `redis-server@<app>`, copy `<stamp>-<app>.rdb` to
`/var/lib/redis/<app>/dump.rdb` (owner `redis`), start it and check `DBSIZE`.

MariaDB: the dump recreates the database (`--databases`), so restore it under another name with the
panel stopped (`php artisan down`, `systemctl stop pteroq`), or into the same one:
`zcat /var/backups/mariadb/<stamp>/panel.sql.gz | mariadb`. On a rebuilt server load `users.sql`
first.

## The 2026-11-17 move

| Database        | From                                                   | Downtime           | Dump kept on terp.db                                |
| --------------- | ------------------------------------------------------ | ------------------ | --------------------------------------------------- |
| `fracital`      | (already here) PG 17 to 18                             | 35 s, 21:33:42 UTC | `/var/backups/postgres/20261117T213319Z/`           |
| `holt`          | amph Docker `abulxt-db` (PG 18.6)                      | 15 s, 21:49:48 UTC | `/var/backups/migrate/holt-cutover-*.dump`          |
| `abulxt`        | amph Docker `abulxt-db` (PG 18.6)                      | 3.5 min, 21:50:21  | `/var/backups/migrate/abulxt-cutover-*.dump`        |
| `holy`          | holy's local PG 17 (CT 205)                            | 10 s, 21:59:01 UTC | `/var/backups/migrate/holy-cutover-*.dump`          |
| `elichat`       | chat's local PG 17 (CT 106)                            | 3 s, 22:02:01 UTC  | `/var/backups/migrate/elichat-cutover-*.dump`       |
| `fg_api_beta`   | giftshop's local PG 17 (VM 111)                        | 75 s, 22:21:10 UTC | `/var/backups/migrate/fg_api_beta-cutover-*.dump`   |
| `guacamole_db`  | guca's local PG 15 (CT 117)                            | 9 s, 22:55:27 UTC  | `/var/backups/migrate/guacamole_db-cutover-*.dump`  |
| `krunknative`   | kru's local PG 18 `18/krunknative` (CT 120, port 5434) | 4 s, 22:56:48 UTC  | `/var/backups/migrate/krunknative-cutover-*.dump`   |
| `labelsupplier` | chat's local PG 17 (CT 106)                            | 2 s, 22:59:26 UTC  | `/var/backups/migrate/labelsupplier-cutover-*.dump` |

Row counts matched for every table after each restore. The old copies are kept, not deleted:

- amph: container `abulxt-db` stopped (`docker start abulxt-db` brings it back; volume
  `db_abulxt-pgdata-18`). Config backups: `/opt/abulxt-main-site/config.js.bak-terpdb-*` and
  `/opt/holt/config.js.bak-terpdb-*`.
- holy: `postgresql@17-main` and its `pg_backupcluster` timers stopped and disabled, `start.conf`
  `manual`, data in `/var/lib/postgresql/17/main`. Config backup:
  `/home/holy/website2/config/config.js.bak-terpdb-*`.
- giftshop (VM 111, powered off 2026-11-17): `postgresql@17-main` stopped and disabled, `start.conf`
  `manual`, data in `/var/lib/postgresql/17/main`. The Flying Gorilla game's Redis went to fg and
  then to its own instance here ("App Redis instances"), not to the shared Redis.
- chat: `postgresql@17-main` stopped and disabled (22:59 UTC), `start.conf` `manual`, data in
  `/var/lib/postgresql/17/main`. Its `elichat` database has `ALLOW_CONNECTIONS false` (stale since
  22:02). Config backups: `/opt/elichat/.env.bak-terpdb-*`, `/opt/labelsupplier/.env.bak-terpdb-*`.
- guca: `postgresql@15-main` stopped and disabled, `start.conf` `manual`, data in
  `/var/lib/postgresql/15/main`. Config backup: `/etc/guacamole/guacamole.properties.bak-terpdb-*`;
  the cutover dump is also on guca in `/var/backups/terpdb-move/`.
- kru: `postgresql@18-krunknative` stopped and disabled, `start.conf` `manual`, data in
  `/var/lib/postgresql/18/krunknative`. Config backups: `/etc/krunknative/coord-db.env.bak-terpdb-*`
  and `/etc/krunknative/secrets.env.bak-terpdb-*` (the old `KN_DATABASE_PASSWORD`); the cutover dump
  is also on kru in `/var/backups/terpdb-move/`. KrunkNative's own Ansible (`kn_postgres`,
  `kn_db_cutover`) still describes the local cluster: a run of those roles starts it again (the app
  stays on terp.db) until KrunkNative's inventory is changed.

Rolling one back: stop the app, bring the old database back (start the container, `systemctl
start postgresql@17-main`, or `ALTER DATABASE elichat ALLOW_CONNECTIONS true`), copy the config
backup over the config, start the app. For a guest cluster stopped on 2026-11-17: set its
`start.conf` back to `auto`, `systemctl enable --now postgresql@<ver>-<cluster>`, then the config
backup (`systemctl restart tomcat9` on guca, `kn-brain-coord` on kru, `labelsupplier-gateway` on
chat). Anything written on terp.db since the move is lost unless
you first dump it from terp.db and restore it into the old database.

`labelsupplier` was 21 GB on chat but about 550 MB of live data (the rest was bloat), so it was
copied online first (one `pg_dump | psql -1` snapshot, 48 s, with the gateway running), checked by
row counts and sequences, and switched with a 2 s restart once `pg_stat_user_tables` showed no
writes since the snapshot. Its app is `labelsupplier-gateway.service` (`/opt/labelsupplier`, port
8088); no repo deploys it.

### eagler's `panel` (2026-11-18)

eagler's (VM 104) local MariaDB 11.8, database `panel` (2 MB, 35 tables, 790 rows, the Pterodactyl
panel), moved to the host MariaDB here ("MariaDB (3307)") at 00:43:16 UTC on 2026-11-18. Downtime
3.5 s: `php artisan down`, `pteroq` stopped, `mysqldump --single-transaction --routines --triggers
--events --hex-blob panel`, import, `.env` repointed, `config:clear` (config is not cached here),
`php artisan up`, `php8.3-fpm` restart, `pteroq` start. Row counts matched for all 35 tables. The
panel's TLS session reported `Ssl_cipher` `TLS_AES_256_GCM_SHA384` as `panel@91.199.82.174`;
the panel reached Wings (system info, both servers `running`) and Wings' token read
`/api/remote/servers` (200, 2 servers).

- Dump: `/var/backups/migrate/panel-cutover-20261118004316.sql` here, and on eagler in
  `/var/backups/terpdb-move/`.
- Config backup: `eagler:/var/www/pterodactyl/.env.bak-terpdb-20261118004316` (0600; the old
  `DB_*` lines, the Redis keys as they were after the Redis move).
- eagler's `mariadb.service` stopped and disabled, datadir `/var/lib/mysql` kept. It also had an
  unused `pterodactyluser@%` (all privileges, grant option, bound to 0.0.0.0), which was not
  carried over.

Rollback: on eagler `php artisan down`, `systemctl enable --now mariadb`, copy the `DB_*` lines
from the `.env` backup over the current ones (leave the `REDIS_*` keys) and drop the two
`MYSQL_ATTR_SSL_*` lines, `php artisan config:clear`, `php artisan up`, restart `php8.3-fpm` and
`pteroq`. Writes made on terp.db since are lost unless dumped from here and imported there first.
