#!/usr/bin/env bash
# Copies the MC compose override into the Mission Control install dir.
# Run once per dev machine; re-run is idempotent (prompts before clobber).

set -euo pipefail

PKG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MC_DIR="${MC_DIR:-$HOME/Arbeit/mission-control}"
TEMPLATE="$PKG_ROOT/templates/compose-override.yml"
TARGET="$MC_DIR/docker-compose.override.yml"

info() { echo -e "\033[1;34m[SETUP]\033[0m $*"; }
err()  { echo -e "\033[1;31m[ERR]\033[0m $*" >&2; }
ok()   { echo -e "\033[1;32m[OK]\033[0m $*"; }

[[ -d "$MC_DIR" ]] || { err "Mission Control not at $MC_DIR — install it first."; exit 1; }
[[ -f "$TEMPLATE" ]] || { err "Template missing: $TEMPLATE"; exit 1; }

HOST_UID="$(id -u)"
if [[ "$HOST_UID" != "1000" ]]; then
  info "Note: host uid=$HOST_UID. If MC's container user isn't 1001, edit userns_mode in the override manually."
fi

if [[ -f "$TARGET" ]]; then
  read -rp "Override exists — overwrite? [y/N] " yn
  [[ "$yn" =~ ^[yY]$ ]] || { info "Skipped."; exit 0; }
fi

cp "$TEMPLATE" "$TARGET"
ok "Installed: $TARGET"
info "Restart MC to apply: cd $MC_DIR && podman-compose down && podman-compose up -d"
