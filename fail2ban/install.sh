#!/usr/bin/env bash
# SUPERSEDED by the vendored Ansible role deploy/ansible/roles/fail2ban
# (fail2ban-contract v1, ansible/README.md "fail2ban"). Running this
# overwrites the role's /etc/fail2ban/jail.local with iptables actions that
# never applied on amph (their jumps sat after ABULXT_INPUT). Kept for reference.
#
# Install / refresh fail2ban on an abulxt host.
# Usage (on the target as root):
#   bash install.sh
# Or from laptop:
#   scp -r deploy/fail2ban/. host:/tmp/abulxt-fail2ban/
#   ssh host 'bash /tmp/abulxt-fail2ban/install.sh'
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
echo "==> Installing fail2ban on $(hostname)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y fail2ban iptables

mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/action.d /etc/fail2ban/jail.d

install -m 0644 "$ROOT/jail.local" /etc/fail2ban/jail.local
install -m 0644 "$ROOT/filter.d/caddy-register.conf" /etc/fail2ban/filter.d/caddy-register.conf
install -m 0644 "$ROOT/action.d/cloudflare-token.conf" /etc/fail2ban/action.d/cloudflare-token.conf
install -m 0644 "$ROOT/jail.d/caddy-register.local" /etc/fail2ban/jail.d/caddy-register.local

# Debian ships defaults that sometimes force Debian-specific backends; ensure
# our jail.local wins and drop a tiny override that forces sshd on.
cat >/etc/fail2ban/jail.d/00-abulxt-sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
EOF

# Discover Cloudflare API token from abulxt config without printing it.
CF_TOKEN=""
CF_ZONE=""
CFG=""
for candidate in /opt/abulxt-main-site/config.js /root/config.js; do
  if [[ -f "$candidate" ]]; then CFG=$candidate; break; fi
done

if [[ -n "$CFG" ]]; then
  # Pull apiKey string; ignore CHANGE_ME placeholders.
  CF_TOKEN=$(python3 - <<PY
import re
from pathlib import Path
text = Path("$CFG").read_text(encoding="utf-8", errors="replace")
m = re.search(r"apiKey\s*:\s*['\"]([^'\"]+)['\"]", text)
print(m.group(1).strip() if m and m.group(1).strip() not in ("", "CHANGE_ME") else "")
PY
)
fi
if [[ -z "$CF_TOKEN" && -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  CF_TOKEN=$CLOUDFLARE_API_TOKEN
fi
if [[ -z "$CF_TOKEN" && -n "${CLOUDFLARE_API_KEY:-}" ]]; then
  CF_TOKEN=$CLOUDFLARE_API_KEY
fi

if [[ -n "$CF_TOKEN" ]]; then
  umask 077
  cat >/etc/fail2ban/cloudflare.env <<EOF
CF_TOKEN=${CF_TOKEN}
CF_ZONE=${CF_ZONE}
EOF
  chmod 600 /etc/fail2ban/cloudflare.env

  # Enable the register-flood jail with Cloudflare edge bans.
  # Token stays in cloudflare.env, action script sources it.
  cat >/etc/fail2ban/jail.d/caddy-register.local <<'EOF'
[caddy-register]
enabled  = true
filter   = caddy-register
backend  = systemd
maxretry = 300
findtime = 5m
bantime  = 12h
action   = cloudflare-token
EOF
  chmod 0644 /etc/fail2ban/jail.d/caddy-register.local
  echo "==> Cloudflare token found, enabled caddy-register jail (edge bans)"
else
  # Keep disabled stub from package copy
  echo "==> No Cloudflare token found, SSH jails only (caddy-register disabled)"
fi

# fail2ban.log must exist for recidive
touch /var/log/fail2ban.log
chmod 640 /var/log/fail2ban.log || true

systemctl enable fail2ban
systemctl restart fail2ban
sleep 2
systemctl --no-pager --full status fail2ban | sed -n '1,20p'
echo
fail2ban-client ping
fail2ban-client status
echo
for jail in $(fail2ban-client status | awk -F: '/Jail list/{print $2}' | tr ',' ' '); do
  echo "---- $jail ----"
  fail2ban-client status "$jail" || true
done

echo "==> fail2ban ready on $(hostname)"
