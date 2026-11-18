# SystemYA

SystemYA's frontend, served as a static site on the edge at `https://systemya.fracit.al/`
(`roles/edge_static`, `src: systemya/site` in `ansible/inventory/host_vars/edge.yml`). Every run
of the role installs `site/` as the site's content, so a change here reaches the edge with
`ansible-playbook playbooks/edge-static.yml -l edge`.

| Path         | What it is                                                                                |
| ------------ | ----------------------------------------------------------------------------------------- |
| `/`          | The game grid (`site/app.js`), read through Holy Unblocker's SDK                          |
| `/play/?id=` | One game in a frame, from the SDK's launch metadata                                       |
| `/chat/`     | The chat: a frame of `/room/`                                                             |
| `/room/`     | holt, platform `systemya`, relayed by the edge to amph with SystemYA's license            |
| `/cdn/`      | Holy Unblocker's theatre CDN on holy; `/cdn/index.js` installs the SDK as `globalThis.HU` |
| `/v1/games/` | Holy Unblocker's public catalog API on holy, for the SDK's direct mode (`createHUClient`) |

The SDK is documented in Holy Unblocker's website2 (`docs/sdk.md`). Everything it reads is on
this origin, so the frontend needs no CORS and no keys.

holt treats every visitor as a guest (read-only) until SystemYA serves its user-state endpoint,
`https://systemya.fracit.al/api/me/chat`, and its session cookie `__Secure-better-auth.session_token`
exists. Both are set in holt's platform entry on amph (`/opt/holt/config.js`). The license is the
vaulted `systemya_holt_license` (ansible/README.md "Secrets").
