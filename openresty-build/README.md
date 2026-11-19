# OpenResty 1.31.8.1 with nginx 1.31.9's fixes

nginx 1.31.9 and 1.30.7 (2026-11-18) fix nginx2root and eight more CVEs. OpenResty had no
release on them (openresty/openresty#1166; its master had an untagged 1.31.9.1 bump). This
directory rebuilds openresty.org's own `openresty 1.31.8.1-1~bookworm1` Debian package with
nginx's 1.31.8 to 1.31.9 source changes applied to the bundled nginx-1.31.8 core, as
`1.31.8.1-1~bookworm1+nginx2root1`. That version sorts above 1.31.8.1-1~bookworm1 and below any
1.31.9.1 openresty.org ships, so `roles/openresty` (`openresty_min_version`, README.md
"OpenResty packages on Debian 13") moves to the official package when it appears. The edge, amph
and terp run it since 2026-11-19.

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

nginx 1.31.9's ten, all in this build (upstream commits from nginx's GitHub mirror):

| CVE             | Commits                                               | What                                           |
| --------------- | ----------------------------------------------------- | ---------------------------------------------- |
| CVE-2026-123007 | e27f5fa84                                             | HTTP/2 flow-control window underflow (RCE)     |
| CVE-2026-123633 | 2df48a501                                             | HTTP/2 use-after-free (proxying)               |
| CVE-2026-121810 | b5252dae1                                             | QUIC use-after-free                            |
| CVE-2026-123634 | 8492a8b8a, e39708edc                                  | resolver use-after-free                        |
| CVE-2026-113425 | e505109a3, 754fe68c2, a22ab7105, 013ce1879, 1d1d861a5 | mail use-after-free (mail is not compiled in)  |
| CVE-2026-120967 | 6f9fceed8                                             | stream: client certificates not checked by SNI |
| CVE-2026-120993 | c4892abca                                             | PROXY protocol v2 with dynamic certificates    |
| CVE-2026-123640 | 30b8bf67e, d9fd14eb3                                  | stream ssl_preread parsing                     |
| CVE-2026-118899 | 2b129b936, c51ffa2d1                                  | endless loop reading a body over TLS           |
| CVE-2026-125283 | d1ffe6fa8                                             | try_files with alias, buffer overflow          |

Moving the edge from 1.31.1.1 also closes the twelve nginx fixed between 1.31.2 and 1.31.8, which
OpenResty 1.31.8.1 already had: CVE-2026-42530, -42055, -48142 (1.31.2), -42533, -60005, -56434
(1.31.3), -90439 (1.31.6), -15176, -93479, -95101, -97629, -97205 (1.31.7).

## Tests (`tests/`)

nginx-tests (Test::Nginx) scripts written for this backport, run against the official 1.31.8.1
binary and this build:

- `h2_window_update_queued.t` (CVE-2026-123007, nginx e27f5fa84): a WINDOW_UPDATE that takes the
  window plus queued DATA past 2^31-1 must end in GOAWAY FLOW_CONTROL_ERROR. The official binary
  fails 2 of 6, this build passes 6 of 6.
- `or_proxy_discard_subrequest_body.t`: the subrequest body patch above.

With these and nginx-tests' h2, h3, proxy, body, ssl, stream_ssl, resolver and try_files scripts
(192 files, 2932 subtests, both binaries made to report 1.31.9 so the 1.31.9 checks run), the
official 1.31.8.1 fails 33 subtests in 8 files and this build 26 in 3: `h2_server_tokens.t` and
`h3_server_tokens.t` (OpenResty's `Server: openresty`) and `h3_reusable.t`, which fail on the
official build too.
