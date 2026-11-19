#!/bin/bash
# Runs INSIDE a throwaway debian:bookworm container.
# Called by build.sh: /in has the tarball, the key, the packaging debian/ dir and the patches;
# the packages land in /out.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
VER_UP=1.31.8.1
VER_DEB=1.31.8.1-1~bookworm1+nginx2root1

apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates gnupg >/dev/null
gpg --dearmor < /in/openresty-pubkey.gpg > /usr/share/keyrings/openresty.gpg
echo "deb [signed-by=/usr/share/keyrings/openresty.gpg] https://openresty.org/package/debian bookworm openresty" \
  > /etc/apt/sources.list.d/openresty.list
apt-get update -qq
# Same build deps as openresty-packaging deb/Makefile openresty-build target
# (it installs then --only-upgrade's them, i.e. the newest in the repo).
apt-get install -y -qq --no-install-recommends \
  build-essential debhelper devscripts autotools-dev systemtap-sdt-dev perl \
  libfile-temp-perl openresty-zlib-dev openresty-pcre2-dev openresty-openssl3-dev \
  >/dev/null
dpkg-query -W -f='${Package} ${Version}\n' openresty-zlib-dev openresty-pcre2-dev \
  openresty-openssl3-dev openresty-zlib openresty-pcre2 openresty-openssl3 debhelper gcc-12 \
  | tee /out/build-deps-versions.txt

mkdir -p /build && cd /build
cp /in/openresty-${VER_UP}.tar.gz openresty_${VER_UP}.orig.tar.gz
tar xf openresty_${VER_UP}.orig.tar.gz
cd openresty-${VER_UP}
cp -a /in/debian ./debian
rm -f debian/changelog.tt2
# changelog: official template rendered for bookworm, plus our entry on top
{
cat <<EOF
openresty (${VER_DEB}) bookworm; urgency=high

  * Rebuild of the official 1.31.8.1-1~bookworm1 package with the nginx
    1.31.8 -> 1.31.9 src/ changes applied to the bundled nginx-1.31.8 core
    (debian/patches/nginx-1.31.9-fixes-for-openresty-1.31.8.1.patch).
  * Security: CVE-2026-123007, CVE-2026-123633, CVE-2026-121810,
    CVE-2026-123634, CVE-2026-113425, CVE-2026-120967, CVE-2026-120993,
    CVE-2026-123640, CVE-2026-118899, CVE-2026-125283.
  * nginx.h version bump excluded: binary still reports openresty/1.31.8.1.
  * debian/patches/openresty-proxy-discard-subrequest-body.patch: keep the
    Content-Length of a subrequest body (ngx.location.capture{body=...},
    srcache_store) when the parent request is discarding its body; nginx
    148c75678 would otherwise announce 0 and desync keepalive upstreams.

 -- Local rebuild <root@localhost>  $(date -R)

EOF
sed 's/\[% distro %\]/bookworm/g' /in/debian/changelog.tt2
} > debian/changelog
mkdir -p debian/patches
cp /in/nginx-1.31.9-fixes-for-openresty-1.31.8.1.patch /in/openresty-proxy-discard-subrequest-body.patch debian/patches/
printf '%s\n' nginx-1.31.9-fixes-for-openresty-1.31.8.1.patch \
  openresty-proxy-discard-subrequest-body.patch > debian/patches/series
head -20 debian/changelog
# Same invocation as the official Makefile: debuild --no-lintian -j$(nproc),
# unsigned since this is a local build.
debuild --no-lintian -us -uc -j"$(nproc)"
cd /build
ls -la
cp -a /build/*.deb /build/*.dsc /build/*.debian.tar.* /build/*.changes /build/*.buildinfo /out/ 2>/dev/null || true
echo BUILD-OK
