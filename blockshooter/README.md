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
`wisp.baby`, like holyunb.locker: Cloudflare reaches the nearest box through wisp.baby's geo DNS,
and each box has its own certificate for both names (approved locally in `nginx.conf.j2`).
