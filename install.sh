#!/bin/sh
# nazu one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nazuraki/nazu/main/install.sh | sh
#
# Pulls the published images and starts the core stack (web, postgres, minio,
# falkordb) with Docker Compose. No configuration needed — everything (auth,
# GitHub, Anthropic key, optional services) is set up in the in-app Settings UI
# and stored in the database. Re-running is safe: it refreshes the compose file,
# pulls the latest images, and restarts.
#
# Prompts for the install directory (default ~/nazu, or NAZU_HOME).
# Non-interactive runs (CI, automation) take defaults without prompting.
#
# The compose file is downloaded from the repo, not generated here: the web
# container bind-mounts ./docker-compose.yml so the in-app "Optional services"
# toggles can drive `docker compose`, and that only works if this directory
# holds the canonical file. Re-running overwrites it — put customizations in
# docker-compose.override.yml instead.

set -eu

REPO_RAW="https://raw.githubusercontent.com/nazuraki/nazu/main"
DIR_DEFAULT="${NAZU_HOME:-$HOME/nazu}"
PORT=8420

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

# Pin the compose project name regardless of the install directory's name: the
# web app's in-container `docker compose` (service toggles) assumes project
# "nazu", and host + container must target the same project/network.
set_env COMPOSE_PROJECT_NAME nazu

# Download atomically so a failed fetch can't leave a truncated compose file
# behind for the already-running stack's web container mount.
tmp="$DIR/docker-compose.yml.tmp.$$"
curl -fsSL "$REPO_RAW/docker-compose.yml" -o "$tmp" \
  || { rm -f "$tmp"; fail "could not download docker-compose.yml from $REPO_RAW"; }
mv "$tmp" "$DIR/docker-compose.yml"

cd "$DIR"
docker compose pull
docker compose up -d

echo
echo "nazu is running."
echo
echo "  Open http://localhost:$PORT in your browser."
echo "  Everything is configured in-app under Settings — auth, GitHub,"
echo "  the Anthropic key, and optional services (HTTPS, Cloudflare Tunnel,"
echo "  graph recall, Discord ingest)."
echo
echo "  Installed in: $DIR"
echo "  Update with:  re-run this installer"
echo "  Stop with:    docker compose -f $DIR/docker-compose.yml down"
