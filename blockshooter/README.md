# blockshooter.io

blockshooter.io (and www.) is a mirror of blockshooter.club's frontend, served from disk by every
wisp box (`roles/edge_relay`, `templates/blockshooter-routes.conf.j2`, `conf.d/36-blockshooter.conf`).
blockshooter.club is ours; this copy makes the same site load from our edge fleet.

| Path    |                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site/` | The mirrored files: `/`, `/faq`, `/privacy`, `/warnings`, `global.css`, `global.js` and the whole `/towerdefense/` game (its ES modules under `towerdefense/src/`, its CSS). Copied to `/var/www/blockshooter/` on each box. |

What is NOT mirrored: the tower defense backend. The game calls `/towerdefense/api/*` and opens
`/towerdefense/ws` on its own origin (`towerdefense/src/net/config.js`). The edges proxy both to
`https://blockshooter.club` (`blockshooter_backend`), so accounts, saves and multiplayer are the
.club ones. The API authenticates with a token header (localStorage), not cookies, and the backend
accepts a blockshooter.io Origin.

The main game's staging build is not mirrored either: `/play-staging/` is proxied to
`https://blockshooter.club/play-staging/` (since 2026-11-19). It changes with every build (its HTML
loads `v/<build>/`) and fetches a ~1.1 GB asset pack in Range pieces from `/play-staging/parts/`,
so the edge streams it unbuffered. The client calls its API at `location.origin + /api/v1/` (guest
sign-in, profile, loadout, matchmaking), so `/api/` is proxied to the same backend; the mirror has
no `/api/` of its own. The session is a host-only `bs_session` cookie, which works on
blockshooter.io as is, and the backend's CORS list includes `https://blockshooter.io`. Matches
connect to the game servers directly (WebTransport, WebSocket or WebRTC to the host and port the
API hands out), not through the edge. The production game (`/play/`) answers 403 on
blockshooter.club and is not proxied. blockshooter.club's Cloudflare sees the edge as the client
(`CF-Connecting-IP`); the player's address only travels in `X-Forwarded-For`, like
`/towerdefense/api/`'s.

## Refreshing the mirror

The game's modules are loaded by `import`, which `wget --mirror` does not follow. The crawler that
made `site/` follows HTML `href`/`src`, CSS `url()`/`@import`, JS static and dynamic imports and
quoted asset paths in JS/JSON:

```
python3 -I blockshooter/crawl.py https://blockshooter.club /tmp/bsc-site /towerdefense/ /faq /privacy /warnings /robots.txt
rsync -a --delete /tmp/bsc-site/ blockshooter/site/
grep -rl discord.blockshooter.club blockshooter/site | xargs sed -i 's/discord\.blockshooter\.club/discord.blockshooter.io/g'
```

The last line keeps the Discord links on our own `discord.blockshooter.io` (a 301 to the invite,
`blockshooter_discord_invite`); `global.js` finds the Discord nav button by that hostname.

Check that nothing under `/towerdefense/` is missing in the crawl's report (`/tmp/crawl-report.json`;
the 404s at the site root are expected guesses), then deploy the page:
`ansible-playbook playbooks/wisp.yml --tags relay` (or `apply.yml` with playbook `wisp`, tags `relay`). Query strings (`?v=...`) are dropped on save;
the box serves the file whatever the query.

## DNS

blockshooter.io is a Cloudflare zone (registrar Spaceship). `@`, `www` and `discord` are proxied CNAMEs to
`wisp.baby`, like holyunb.locker. Since 2026-11-16 wisp.baby is a plain A record for divide's one
address (91.199.82.174), so Cloudflare reaches the one edge (`edge`, CT 201), which has its own
certificate for the names (approved locally in `nginx.conf.j2`). Deploy a change with
`ansible-playbook playbooks/wisp.yml --limit edge --tags relay`.
