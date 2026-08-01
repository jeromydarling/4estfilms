#!/usr/bin/env bash
# Bootstrap Agent Reach in a fresh/ephemeral environment.
#
# The SKILL.md next to this script is vendored into the repo, but the
# `agent-reach` CLI and its upstream tools (gh, mcporter, yt-dlp, ...) live
# outside the repo and disappear when a container is recycled. Run this to
# put them back.
#
#   bash .claude/skills/agent-reach/bootstrap.sh
#   export PATH="$HOME/.agent-reach-venv/bin:$PATH"
#
# Upstream install guide:
#   https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md

set -euo pipefail

VENV="$HOME/.agent-reach-venv"
SRC="${AGENT_REACH_SRC:-https://github.com/Panniantong/agent-reach.git}"

if [ ! -x "$VENV/bin/agent-reach" ]; then
  echo "==> creating venv at $VENV"
  python3 -m venv "$VENV"

  # The archive/main.zip path in the upstream guide is often blocked by
  # egress proxies (403); cloning over git works in more places.
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "==> cloning $SRC"
  git clone --depth 1 "$SRC" "$tmp/agent-reach"
  echo "==> installing agent-reach"
  "$VENV/bin/pip" install -q "$tmp/agent-reach"
fi

export PATH="$VENV/bin:$PATH"
echo "==> $(agent-reach --version)"

# Installs gh CLI, mcporter, Exa search and the yt-dlp config, then writes
# the skill to ~/.claude/skills/agent-reach.
agent-reach install --env=auto

echo
echo "Done. Add this to your shell before using the upstream tools:"
echo "  export PATH=\"\$HOME/.agent-reach-venv/bin:\$PATH\""
