#!/bin/sh
# nazu backplane one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nazuraki/nazu/main/apps/backplane/install.sh | sh
#
# Pulls the published image and starts the backplane stack (backplane,
# prometheus, cadvisor, grafana) with Docker Compose, as its own compose
# project ("backplane") — deliberately separate from any stack it manages.
# Re-running is safe: it refreshes the compose + config files, pulls the
# latest images, and restarts. This IS the self-update path.
#
# Prompts for the install directory (default ~/nazu-backplane, or
# BACKPLANE_HOME). Non-interactive runs (CI, automation) take defaults
# without prompting.
#
# The compose and config files are downloaded from the repo, not generated
# here. Re-running overwrites them — put customizations in
# docker-compose.override.yml, and settings (BACKPLANE_API_KEY,
# BACKPLANE_POLL_INTERVAL) in .env, which is never overwritten.

set -eu

RAW_BASE="https://raw.githubusercontent.com/nazuraki/nazu/main/apps/backplane"
DIR_DEFAULT="${BACKPLANE_HOME:-$HOME/nazu-backplane}"
PORT=8430

fail() {
  echo "error: $1" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v docker >/dev/null 2>&1 || fail "Docker is required — install it from https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (the 'docker compose' plugin)"
docker info >/dev/null 2>&1 || fail "the Docker daemon isn't running (or you lack permission to talk to it)"

# Under `curl | sh` stdin is the script, so prompts must use the terminal
# directly. No terminal (CI, automation) = take defaults silently.
# test -r/-w only checks permission bits; actually opening /dev/tty is what
# fails when there is no controlling terminal.
HAVE_TTY=0
if { : < /dev/tty; } 2>/dev/null; then
  HAVE_TTY=1
fi

DIR="$DIR_DEFAULT"
if [ "$HAVE_TTY" = "1" ]; then
  printf 'Install directory [%s]: ' "$DIR_DEFAULT" > /dev/tty
  IFS= read -r reply < /dev/tty || reply=""
  case "$reply" in
    "") ;;
    "~") DIR="$HOME" ;;
    "~/"*) DIR="$HOME/${reply#\~/}" ;;
    *) DIR="$reply" ;;
  esac
fi
mkdir -p "$DIR"

# Update-or-append KEY=value in $DIR/.env (compose reads it automatically).
set_env() {
  f="$DIR/.env"
  touch "$f" && chmod 600 "$f"
  if grep -q "^$1=" "$f" 2>/dev/null; then
    tmp="$f.tmp.$$"
    grep -v "^$1=" "$f" > "$tmp" || true
    printf '%s=%s\n' "$1" "$2" >> "$tmp"
    mv "$tmp" "$f"
  else
    printf '%s=%s\n' "$1" "$2" >> "$f"
  fi
}

# Pin the compose project name regardless of the install directory's name, so
# this matches the repo's `just backplane-*` targets (-p backplane) and stays
# distinct from the stacks the backplane manages.
set_env COMPOSE_PROJECT_NAME backplane

# Download a repo file into $DIR atomically, so a failed fetch can't leave a
# truncated file behind for an already-running stack's bind mounts.
fetch() {
  dest="$DIR/$1"
  mkdir -p "$(dirname "$dest")"
  tmp="$dest.tmp.$$"
  curl -fsSL "$RAW_BASE/$1" -o "$tmp" \
    || { rm -f "$tmp"; fail "could not download $1 from $RAW_BASE"; }
  mv "$tmp" "$dest"
}

fetch docker-compose.yml
fetch prometheus/prometheus.yml
fetch grafana/provisioning/datasources/prometheus.yml

cd "$DIR"
docker compose pull
docker compose up -d

echo
echo "The backplane is running."
echo
echo "  UI/API:      http://localhost:$PORT"
echo "  Grafana:     http://localhost:3001  (admin/admin)"
echo "  Prometheus:  http://localhost:9090"
echo
echo "  The API is open (no auth) by default. To require a bearer key, set"
echo "  BACKPLANE_API_KEY in $DIR/.env and re-run this installer."
echo
echo "  Installed in: $DIR"
echo "  Update with:  re-run this installer"
echo "  Stop with:    docker compose -p backplane -f $DIR/docker-compose.yml down"
