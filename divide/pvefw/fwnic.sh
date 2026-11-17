#!/bin/sh
# fwnic.sh <vmid> <n> <0|1>: set firewall= on net<n> of a guest (a live replug).
# Lives in /root on divide. Arm an undo first:
#   systemd-run --on-active=150 /root/fwnic.sh <vmid> <n> 0
set -e
id=$1 n=$2 v=$3
if [ -f "/etc/pve/lxc/$id.conf" ]; then tool=pct; else tool=qm; fi
cur=$("$tool" config "$id" | sed -n "s/^net$n: //p")
[ -n "$cur" ] || { echo "no net$n on $id"; exit 1; }
new="$(echo "$cur" | sed -E 's/,?firewall=[01]//'),firewall=$v"
"$tool" set "$id" "-net$n" "$new"
logger "fwnic $id net$n firewall=$v"
echo "$id net$n -> firewall=$v"
