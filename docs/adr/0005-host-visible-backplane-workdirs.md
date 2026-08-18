# ADR 0005 — Host-visible backplane workdirs for repo-relative bind mounts

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The backplane deploys a project by git-syncing its repo into
`workdirs/<project>` and running `docker compose` there — **from inside its own
container**, against the host daemon via the mounted socket. Bind-mount source
paths in compose files are resolved client-side by the compose CLI and passed
verbatim to the daemon, which interprets them as **host** paths.

With the checkouts stored in the `backplane_data` named volume, a repo-relative
bind mount like usr's `./caddy/Caddyfile:/config/Caddyfile:ro` resolved to a
container-side path (`/data/workdirs/usr/apps/usr/caddy/Caddyfile`) that does
not exist on the host. The daemon silently auto-creates a missing bind source
as an empty **directory**, so the service crashloops ("is a directory"). The
same failure hits nazu web's `./docker-compose.yml:/app/docker-compose.yml:ro`
self-mount (which powers the in-app optional-services toggle). Both stacks were
kept alive by hand-seeding files at the daemon-created host paths — copies that
go stale whenever the repo copy changes.

Options considered:

1. **Bake config files into images** (custom caddy image per stack): fixes only
   the files you bake, adds per-stack image builds and CI publishing, and still
   can't cover mounts that must track the checkout (the compose-file
   self-mount).
2. **Compose `configs` with inline `content:`**: no host path involved (compose
   copies content into the container over the API), but requires compose
   ≥ 2.23.1, duplicates file content into YAML where it drifts just like the
   hand-seeded copies, and again can't express the compose-file self-mount.
3. **Init/seed containers** copying files from the app image into shared
   volumes: an extra service + volume per config file, and the same staleness
   window between image publish and seed re-run.
4. **Make the workdirs host-visible**, bind-mounted into the backplane at the
   **identical path**, so every container-side checkout path is simultaneously
   a valid host path.

## Decision

**Option 4: mirror the workdir root between host and container.** This is the
same trick the self-update helper already uses (it mounts the host compose
project paths at identical paths so `-f`/`--project-directory` resolve), now
applied to managed projects.

- `BACKPLANE_WORKDIRS` names the host directory holding per-project checkouts.
  The backplane compose file mounts it at the same path
  (`${BACKPLANE_WORKDIRS}:${BACKPLANE_WORKDIRS}`) and passes it to the server,
  which uses it as the `ComposeTarget` workdir root. Defaults: `install.sh`
  pins `<install dir>/workdirs` in `.env`; `${PWD}/workdirs` covers
  `just backplane-up` from a checkout. The `backplane_data` volume keeps the
  registry DB and generated docker registry-auth config.
- **Sync adopts non-empty workdirs.** A workdir may pre-exist without `.git`
  (a hand-placed per-project `.env`, or leftovers from migrating the workdir
  root). `git clone` refuses non-empty targets, so the sync falls back to
  `git init` + `remote add` + the normal fetch + `reset --hard`, which
  overwrites tracked paths (healing stale hand-seeded copies) and leaves
  untracked files like `.env` alone.
- The image sets `safe.directory=*` (system git config): checkouts on a host
  bind may be owned by a different uid than the container's root, which git
  would otherwise refuse.

App compose files need **no changes**: repo-relative bind mounts are now a
supported, first-class pattern across the nazu, usr, and backplane stacks. The
backplane's own stack always runs with host-side compose (installer, `just`,
or the self-update helper's mirrored mounts), so it was never affected. Named
volumes for *generated* files (nazu's `caddy_config`, written by the web app)
remain the right pattern — this ADR is about files tracked in the repo.

## Consequences

- Deploy checkouts live on the host filesystem, inspectable and editable
  without `docker exec`; per-project `.env` files sit next to the compose files
  they configure.
- **Migration:** existing checkouts inside the `backplane_data` volume are
  abandoned; the next deploy re-clones under the new root. Copy any per-project
  `.env` out of the volume first (`docker cp <backplane>:/data/workdirs/<p>/.env …`),
  and delete stale hand-seeded trees the daemon auto-created — an empty
  directory squatting on a tracked *file* path is removed by git, but non-empty
  ones fail the sync with "untracked working tree files would be overwritten".
- The host path must be identical on both sides, so on Docker Desktop it must
  fall under a file-sharing root (the defaults — install dir or checkout — do).
- If `BACKPLANE_WORKDIRS` is unset and compose runs without `PWD` (non-shell
  invocation), the mount degrades to `/workdirs`; the installer pinning it in
  `.env` makes this moot on servers.
