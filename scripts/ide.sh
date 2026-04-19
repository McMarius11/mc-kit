#!/usr/bin/env bash
# mc-kit ide — launch / stop / check the Mission Control container
# Invoked by the `mc-kit` CLI with subcommand: start | stop | status | logs

set -euo pipefail

MC_DIR="${MC_DIR:-$HOME/Arbeit/mission-control}"
MC_URL="${MC_URL:-http://localhost:3000}"
PROJECT_ROOT="${MC_KIT_PROJECT_ROOT:-$PWD}"
SUB="${1:-start}"

info()  { echo -e "\033[1;34m[IDE]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!!]\033[0m $*"; }
err()   { echo -e "\033[1;31m[ERR]\033[0m $*" >&2; }

# Runtime detection
if command -v podman-compose >/dev/null 2>&1; then COMPOSE="podman-compose"; RUNTIME="podman"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; RUNTIME="docker"
else err "Neither podman-compose nor docker compose installed."; exit 1; fi

case "$SUB" in
  start)
    [[ -d "$MC_DIR" ]] || { err "MC not at $MC_DIR — install first (see README)."; exit 1; }
    [[ -f "$MC_DIR/.env" ]] || { err "MC .env missing at $MC_DIR."; exit 1; }
    if curl -sf -o /dev/null "$MC_URL/setup" 2>/dev/null; then
      ok "MC already running on $MC_URL ($RUNTIME)"
    else
      info "Starting MC via $COMPOSE..."
      (cd "$MC_DIR" && $COMPOSE up -d 2>&1 | tail -5)
      for i in {1..60}; do
        if curl -sf -o /dev/null "$MC_URL/setup" 2>/dev/null; then ok "MC up (after ${i}s)"; break; fi
        sleep 1
        [[ $i -eq 60 ]] && { err "Timed out. Logs: $COMPOSE -f $MC_DIR/docker-compose.yml logs"; exit 1; }
      done
    fi
    # Sync project backlog if we have a project root
    if [[ -f "$PROJECT_ROOT/.mc-kit.json" ]]; then
      info "Syncing backlog from $PROJECT_ROOT..."
      (cd "$PROJECT_ROOT" && node "$(dirname "$(dirname "$0")")/bin/mc-kit" sync push 2>&1 | sed 's/^/  /') || warn "Sync issues, dashboard still usable"
    fi
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$MC_URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
      open "$MC_URL" >/dev/null 2>&1 &
    fi
    ok "Command Center ready ($RUNTIME)"
    echo ""
    echo "  Dashboard: $MC_URL"
    echo "  Stop:      mc-kit ide:stop"
    echo "  Logs:      mc-kit ide:logs"
    ;;
  stop)
    info "Stopping MC..."
    (cd "$MC_DIR" && $COMPOSE down 2>&1 | tail -3)
    ok "Stopped"
    ;;
  status)
    if command -v podman >/dev/null 2>&1; then
      podman ps --filter name=mission-control --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>&1 | head -5
    else
      docker ps --filter name=mission-control 2>&1 | head -5
    fi
    ;;
  logs)
    (cd "$MC_DIR" && $COMPOSE logs -f)
    ;;
  *)
    err "Unknown subcommand: $SUB (expected: start|stop|status|logs)"; exit 1
    ;;
esac
