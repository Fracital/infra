#!/usr/bin/env bash
set -euo pipefail
rm -rf /tmp/abulxt-fail2ban
mkdir -p /tmp/abulxt-fail2ban
python3 - <<'PY'
import zipfile
zipfile.ZipFile('/tmp/abulxt-fail2ban.zip').extractall('/tmp/abulxt-fail2ban')
print('extracted')
PY
find /tmp/abulxt-fail2ban -type f
# zip may nest one level
if [[ -f /tmp/abulxt-fail2ban/install.sh ]]; then
  ROOT=/tmp/abulxt-fail2ban
elif [[ -f /tmp/abulxt-fail2ban/fail2ban/install.sh ]]; then
  ROOT=/tmp/abulxt-fail2ban/fail2ban
else
  echo 'install.sh not found' >&2
  ls -laR /tmp/abulxt-fail2ban >&2
  exit 1
fi
sed -i 's/\r$//' "$ROOT"/install.sh "$ROOT"/jail.local "$ROOT"/filter.d/* "$ROOT"/action.d/* "$ROOT"/jail.d/* 2>/dev/null || true
bash "$ROOT/install.sh"
