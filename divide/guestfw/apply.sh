#!/bin/bash
# apply.sh <ctid> [extra nft rule lines...]: load a default-deny input table `inet guestfw` in a CT,
# with a 180 s revert timer armed first. Does NOT persist; persist.sh does that after checks pass.
set -euo pipefail
id=$1; shift
extra=""; for r in "$@"; do extra+="		$r"$'\n'; done
f="/root/guestfw/$id.nft"
cat > "$f" <<NFT
# Default-deny input for this guest (divide guest firewall, 2026-11-17). Rendered by
# /root/guestfw/apply.sh on divide; loaded from /etc/nftables.conf. Other tables are left alone.
table inet guestfw
delete table inet guestfw
table inet guestfw {
	chain input {
		type filter hook input priority filter; policy drop;
		iif "lo" accept
		ct state established,related accept
		ct state invalid drop
		meta l4proto { icmp, ipv6-icmp } accept
		ip saddr { 172.16.5.1, 172.16.5.11 } tcp dport 22 accept
${extra}		limit rate 10/minute log prefix "guestfw drop: "
	}
}
NFT
pct exec "$id" -- bash -c "command -v nft >/dev/null || (apt-get install -y -qq nftables >/dev/null 2>&1 && echo installed-nftables)"
pct exec "$id" -- mkdir -p /etc/nftables.d
pct push "$id" "$f" /etc/nftables.d/guestfw.nft --perms 644
pct exec "$id" -- bash -c "systemctl stop guestfw-revert.timer 2>/dev/null; systemctl reset-failed guestfw-revert.timer guestfw-revert.service 2>/dev/null; systemd-run --quiet --unit=guestfw-revert --on-active=180 /bin/sh -c \"nft delete table inet guestfw\"; nft -c -f /etc/nftables.d/guestfw.nft && nft -f /etc/nftables.d/guestfw.nft && echo loaded"
