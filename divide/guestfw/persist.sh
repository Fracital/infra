#!/bin/bash
# persist.sh <ctid>: cancel the revert, include guestfw from /etc/nftables.conf and drop `flush ruleset`
# there (it would wipe tables other services load, e.g. kru krurtc, docker).
set -euo pipefail
id=$1
pct exec "$id" -- bash -c "set -e; systemctl stop guestfw-revert.timer
c=/etc/nftables.conf; [ -f \$c ] && cp -n \$c /root/nftables.conf.bak-guestfw-20261117 || printf \"#!/usr/sbin/nft -f\n\" > \$c
sed -i \"/^flush ruleset\$/d\" \$c
grep -q nftables.d/guestfw.nft \$c || printf \"\ninclude \\\"/etc/nftables.d/guestfw.nft\\\"\n\" >> \$c
nft -c -f \$c && systemctl enable -q nftables && echo persisted"
