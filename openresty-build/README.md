# OpenResty 1.31.8.1 with nginx 1.31.9's fixes

nginx 1.31.9 and 1.30.7 (2026-11-18) fix nginx2root and eight more CVEs. OpenResty had no
release on them (openresty/openresty#1166; its master had an untagged 1.31.9.1 bump). This
directory rebuilds openresty.org's own `openresty 1.31.8.1-1~bookworm1` Debian package with
nginx's 1.31.8 to 1.31.9 source changes applied to the bundled nginx-1.31.8 core, as
`1.31.8.1-1~bookworm1+nginx2root1`. That version sorts above 1.31.8.1-1~bookworm1 and below any
1.31.9.1 openresty.org ships, so `roles/openresty` (`openresty_min_version`, README.md
"OpenResty packages on Debian 13") moves to the official package when it appears. The edge runs it
since 2026-11-19.

```sh
openresty-build/build.sh /some/dir     # needs docker; the .debs land in /some/dir
```

`build.sh` checks the source tarball's SHA256 and openresty.org's key fingerprint, takes the
packaging (`deb/openresty/debian`) from openresty/openresty-packaging at e0e517d (the commit that
built 1.31.8.1), and runs `build-in-container.sh` in a throwaway `debian:bookworm` container with
the newest `openresty-openssl3-dev`, `-pcre2-dev` and `-zlib-dev` from openresty.org, as the
official Makefile does. The configure line is the official package's (`nginx -V` of both match).

## Patches (`debian/patches/series`)

- `nginx-1.31.9-fixes-for-openresty-1.31.8.1.patch`: `diff -r` of nginx-1.31.8 and nginx-1.31.9
  (nginx.org tarballs, PGP-verified), `src/` only, without the version bump in `src/core/nginx.h`
  (the binary still says openresty/1.31.8.1; the package version is what tells them apart). It
  applies to OpenResty's patched core with offsets only, no fuzz or rejects. After the build the
  HTTP/2, HTTP/3, request body, mail, try_files and PROXY protocol sources are byte-identical to
  nginx 1.31.9's; the rest differ only by OpenResty's own patches.
- `openresty-proxy-discard-subrequest-body.patch`: nginx 148c75678 ("Proxy: use zero
  Content-Length while discarding request body") also hits OpenResty subrequests that carry a body
  of their own while the parent discards its body (`ngx.location.capture{body=...}`,
  `srcache_store`): they announced `Content-Length: 0` and then sent the body, desyncing a
  keep-alive upstream. The zero length is kept to requests with no body of their own.

## CVEs this closes

Fixed in 1.31.9 (all in this build): CVE-2026-123007 (HTTP/2 flow-control underflow, RCE),
CVE-2026-123633 (HTTP/2 use-after-free when proxying), CVE-2026-121810 (HTTP/3 use-after-free),
CVE-2026-123634 (resolver use-after-free with subrequests), CVE-2026-113425 (mail auth_http
use-after-free), CVE-2026-125283 (try_files with alias, buffer overflow), CVE-2026-118899,
CVE-2026-120967, CVE-2026-120993 and CVE-2026-123640. Moving the edge from 1.31.1.1 also brings the
fixes OpenResty 1.31.8.1 already had over 1.31.1.1.

## Tests (`tests/`)

nginx-tests (Test::Nginx) scripts written for this backport, run against the official 1.31.8.1
binary and this build:

- `h2_window_update_queued.t` (CVE-2026-123007, nginx e27f5fa84): a WINDOW_UPDATE that takes the
  window plus queued DATA past 2^31-1 must end in GOAWAY FLOW_CONTROL_ERROR. The official binary
  fails 2 of 6, this build passes 6 of 6.
- `or_proxy_discard_subrequest_body.t`: the subrequest body patch above.
