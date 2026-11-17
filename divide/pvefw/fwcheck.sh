#!/bin/sh
# fwcheck.sh <vmid> <ip>: reachability after a firewall change (run on divide).
id=$1 ip=$2
if ping -c2 -W2 "$ip" >/dev/null; then echo "ping $ip ok"; else echo "PING $ip FAIL"; fi
if [ -f "/etc/pve/lxc/$id.conf" ]; then
	pct exec "$id" -- sh -c 'curl -s -o /dev/null -w "egress %{http_code}\n" -m 8 https://example.com || echo EGRESS FAIL'
	pct exec "$id" -- sh -c 'getent hosts debian.org >/dev/null && echo dns ok || echo DNS FAIL'
fi
bridge link | grep -oE "(fwpr|veth|tap)${id}[^:@ ]*" | sort -u | tr '\n' ' '
echo
iptables -L PVEFW-FORWARD -nv | awk 'NR==3 {print "invalid drops", $1}'
grep -h " $id " /var/log/pve-firewall.log 2>/dev/null | tail -5
