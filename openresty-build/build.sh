#!/bin/bash
# Build OpenResty 1.31.8.1's Debian package with nginx 1.31.9's fixes (README.md here).
# Needs docker; everything runs in a throwaway debian:bookworm container, inputs and outputs
# go in and out with docker cp. Usage: openresty-build/build.sh [outdir] (default ./out).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$(realpath -m "${1:-$here/out}")
OR_VER=1.31.8.1
OR_SHA256=b569c63b420f80a4ac8466f2deffe73ed93ab760026532e039c3658409a997f4
# openresty-packaging's "update openresty to 1.31.8.1 for rpm and deb" (2026-10-26).
PKG_REV=e0e517d00d99ef366d2d67db538ec6f63b179cc6
KEY_FPR=E52218E7087897DC6DEA6D6D97DB7443D5EDEB74

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
curl -fsSL -o "$stage/openresty-$OR_VER.tar.gz" "https://openresty.org/download/openresty-$OR_VER.tar.gz"
echo "$OR_SHA256  $stage/openresty-$OR_VER.tar.gz" | sha256sum -c -
curl -fsSL -o "$stage/openresty-pubkey.gpg" https://openresty.org/package/pubkey.gpg
fpr=$(gpg --batch --with-colons --show-keys "$stage/openresty-pubkey.gpg" | awk -F: '$1 == "fpr" { print $10; exit }')
[ "$fpr" = "$KEY_FPR" ] || { echo "openresty.org key is $fpr, not $KEY_FPR" >&2; exit 1; }
curl -fsSL "https://codeload.github.com/openresty/openresty-packaging/tar.gz/$PKG_REV" |
	tar -xz -C "$stage" --strip-components=3 "openresty-packaging-$PKG_REV/deb/openresty/debian"
cp "$here"/patches/*.patch "$here/build-in-container.sh" "$stage/"

name=openresty-build-$$
docker create --name "$name" docker.io/library/debian:bookworm bash /in/build-in-container.sh >/dev/null
docker cp "$stage/." "$name":/in
tmp=$(mktemp -d)
docker cp "$tmp/." "$name":/out
rmdir "$tmp"
rc=0
docker start -a "$name" || rc=$?
mkdir -p "$out"
docker cp "$name":/out/. "$out/" || true
docker rm -f "$name" >/dev/null
ls -l "$out"/*.deb
exit "$rc"
