#!/usr/bin/env bash
# abulxt firewall for amph (origin VPS).
#
# Persistent ingress firewall for abulxt's traffic path:
#   - 22          SSH management
#   - 80/443      public HTTP/HTTPS (OpenResty, on-demand TLS)
#   - udp/443     HTTP/3 (QUIC)
#   - 9080, 8822, 6379, 1082  reachable ONLY from the BYOD edge subnets (EDGE_SUBNETS;
#       since the move to divide: divide's vmbr1 172.16.5.0/24, where divide's bridge
#       firewall lets only the edge CT 172.16.5.10 reach these ports)
#       9080  origin-internal reverse-proxy target (BYOD edge → amph traffic)
#       8822  abulxt-domains /ask (edges call before issuing BYOD certs)
#       6379  shared lua-resty-auto-ssl Redis store (certs + ACME tokens)
#       1082  shady-relay: authenticated SOCKS5 hop for edge Wisp → Mullvad egress
# Everything else inbound is dropped.
set -euo pipefail

# Space-separated list of edge source subnets: the Ansible abulxt_origin role
# writes them to /etc/abulxt/firewall.env (host_vars/amph.yml abulxt_edge_subnets_override,
# 172.16.5.0/24; else each edge's edge_origin_source / edge_subnet; the old regional /24s
# were dead edges and are gone). Unset means
# none (the edge ports stay closed, everything else still applies). The old default
# was ashburn's 45.82.161.0/24, cancelled 2026-11-13: those addresses go back to G-Core.
EDGE_SUBNETS=${EDGE_SUBNETS:-}
[ -n "$EDGE_SUBNETS" ] || echo "abulxt-firewall: EDGE_SUBNETS is empty, the edge ports stay closed" >&2
AUTO_SSL_REDIS_PORT=${AUTO_SSL_REDIS_PORT:-6379}
SHADY_RELAY_PORT=${SHADY_RELAY_PORT:-1082}

iptables -N ABULXT_INPUT 2>/dev/null || true
iptables -F ABULXT_INPUT
iptables -A ABULXT_INPUT -i lo -j ACCEPT
iptables -A ABULXT_INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -A ABULXT_INPUT -p icmp -j ACCEPT
iptables -A ABULXT_INPUT -p tcp --dport 22 -j ACCEPT
iptables -A ABULXT_INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
iptables -A ABULXT_INPUT -p udp --dport 443 -j ACCEPT
# BYOD edges → origin: proxy target + domain validator + shared auto-ssl Redis.
for subnet in $EDGE_SUBNETS; do
  iptables -A ABULXT_INPUT -p tcp -s "$subnet" -m multiport --dports 9080,8822,"$AUTO_SSL_REDIS_PORT","$SHADY_RELAY_PORT" -j ACCEPT
done
iptables -A ABULXT_INPUT -j DROP
iptables -C INPUT -j ABULXT_INPUT 2>/dev/null || iptables -I INPUT 1 -j ABULXT_INPUT

ip6tables -N ABULXT_INPUT 2>/dev/null || true
ip6tables -F ABULXT_INPUT
ip6tables -A ABULXT_INPUT -i lo -j ACCEPT
ip6tables -A ABULXT_INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
ip6tables -A ABULXT_INPUT -p ipv6-icmp -j ACCEPT
ip6tables -A ABULXT_INPUT -p tcp --dport 22 -j ACCEPT
ip6tables -A ABULXT_INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
ip6tables -A ABULXT_INPUT -p udp --dport 443 -j ACCEPT
# The edge reaches amph over IPv4 only (vmbr1); v6 path stays closed to non-local traffic.
ip6tables -A ABULXT_INPUT -j DROP
ip6tables -C INPUT -j ABULXT_INPUT 2>/dev/null || ip6tables -I INPUT 1 -j ABULXT_INPUT
