#!/usr/bin/env bash
# Promote a node from a home-directory build to a hardened system service.
#
# Steps 1 through 9 of the build guide have you run everything as yourself, out
# of ~/.nband-venv and ~/node.toml, because that is the fastest way to find a
# miswired sensor. The systemd unit deliberately does not run that way: it runs
# as an unprivileged `nband` user with ProtectHome=true, which means it cannot
# read your home directory at all — not the venv, not the config, not the key.
#
# For a while the build guide ended by copying in a unit that referenced
# /opt/nband/venv, /etc/nband/node.toml and a user named nband, none of which
# anything had created. It could not start on any node built by following the
# instructions, and it failed at the one moment a builder had most reason to
# blame their own wiring.
#
# This script is the missing step. It is idempotent: run it again after changing
# your config and it will re-copy and restart.

set -euo pipefail

VENV=/opt/nband/venv
CONFDIR=/etc/nband
STATEDIR=/var/lib/nband
UNIT=/etc/systemd/system/nband-node.service
SRC_CONFIG="${1:-$HOME/node.toml}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }
note() { echo "  $*"; }

[[ $EUID -eq 0 ]] || die "run with sudo: sudo $0 [path-to-node.toml]"

# The invoking user's home, not root's, since sudo leaves HOME pointing at root
# on some configurations and at the caller's on others.
if [[ -n "${SUDO_USER:-}" ]]; then
  CALLER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
  [[ "$SRC_CONFIG" == "$HOME/node.toml" ]] && SRC_CONFIG="$CALLER_HOME/node.toml"
fi

[[ -f "$SRC_CONFIG" ]] || die "no config at $SRC_CONFIG. Finish step 8 first, or pass the path."
[[ -f "$REPO/firmware/pyproject.toml" ]] || die "run this from a checkout of the nband repository"

echo "Installing the nband node agent as a system service."
note "config:  $SRC_CONFIG"
note "repo:    $REPO"
echo

# 1. Service account -----------------------------------------------------------
if id nband &>/dev/null; then
  note "user 'nband' already exists"
else
  useradd --system --home-dir "$STATEDIR" --shell /usr/sbin/nologin nband
  note "created system user 'nband'"
fi

# The agent talks to buses and cameras. Missing groups are not fatal here —
# a node with no SPI channels does not need the spi group — so add what exists.
for g in i2c spi gpio video dialout plugdev; do
  getent group "$g" >/dev/null && usermod -aG "$g" nband
done
note "added nband to the hardware groups present on this system"

# 2. Virtualenv ----------------------------------------------------------------
install -d -m 0755 /opt/nband
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  note "created $VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
# Installed non-editable: an editable install would leave the service depending
# on a repository checkout that the builder may later move or delete.
"$VENV/bin/pip" install --quiet "$REPO/firmware[pi]" 2>/dev/null \
  || "$VENV/bin/pip" install --quiet "$REPO/firmware"
note "installed nband_node into $VENV"

# 3. Config --------------------------------------------------------------------
install -d -m 0755 "$CONFDIR"
install -d -m 0750 -o nband -g nband "$STATEDIR"
install -d -m 0750 -o nband -g nband "$STATEDIR/spool"

# The key must live somewhere the service can actually reach. If one was already
# generated during enrolment, move it rather than leaving the node to mint a new
# identity and lose its history under the old slug.
SRC_KEY=$(sed -n 's/^[[:space:]]*key_path[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$SRC_CONFIG" | head -1)
SRC_KEY="${SRC_KEY/#\~/${CALLER_HOME:-$HOME}}"
if [[ -n "$SRC_KEY" && -f "$SRC_KEY" && ! -f "$STATEDIR/node.key" ]]; then
  install -m 0600 -o nband -g nband "$SRC_KEY" "$STATEDIR/node.key"
  note "moved the node key to $STATEDIR/node.key (the original is still at $SRC_KEY — back it up, then delete it)"
elif [[ -f "$STATEDIR/node.key" ]]; then
  note "node key already present at $STATEDIR/node.key"
else
  note "no node key found; the agent will generate one on first start and you must re-enrol"
fi

# Rewrite the paths that only made sense from a home directory.
sed -e "s|^\([[:space:]]*key_path[[:space:]]*=\).*|\1 \"$STATEDIR/node.key\"|" \
    -e "s|^\([[:space:]]*spool[[:space:]]*=\).*|\1 \"$STATEDIR/spool\"|" \
    "$SRC_CONFIG" > "$CONFDIR/node.toml"
chmod 0640 "$CONFDIR/node.toml"
chgrp nband "$CONFDIR/node.toml"
note "wrote $CONFDIR/node.toml with service paths"

# The enrolment secret, if it is still in there, is not needed after enrolment
# and should not sit in a file the service reads on every start.
if grep -q "enrollment_secret" "$CONFDIR/node.toml"; then
  echo
  echo "  note: $CONFDIR/node.toml still contains an enrolment secret."
  echo "        It is only needed to enrol a new slug. Remove the line once the"
  echo "        node appears on the grid."
fi

# 4. Unit ----------------------------------------------------------------------
install -m 0644 "$REPO/firmware/systemd/nband-node.service" "$UNIT"
systemctl daemon-reload
systemctl enable --now nband-node
note "installed and started nband-node"

echo
echo "Verify with:"
echo "  systemctl status nband-node --no-pager"
echo "  journalctl -u nband-node -n 20 --no-pager"
echo
echo "Expect 'active (running)', your channel and band count, and clock=gnss_pps."
