#!/usr/bin/env bash
#
# setup-sandbox-host.sh — prepare a VPS to run LifemarkAI preview sandboxes.
#
# Run ON THE VPS as root (or with sudo):
#     bash setup-sandbox-host.sh
#
# Idempotent: safe to re-run. Verifies more than it changes.
#
# ─────────────────────────────────────────────────────────────────────────────
#  READ FIRST — WHERE YOU RUN THIS MATTERS
# ─────────────────────────────────────────────────────────────────────────────
# These containers execute AI-GENERATED code from your users. If this host also
# runs your production app / Coolify / database, then a container escape reaches
# your Supabase credentials, API keys and customer data.
#
# The safe topology is a SEPARATE box that holds nothing valuable:
#
#     [ app + db VPS ]  ---- Docker API over SSH tunnel ---->  [ sandbox VPS ]
#
# If you run it on the same host anyway, at minimum keep the firewall rules
# below and never put real secrets in a sandbox's environment.
set -euo pipefail

PORT_LO="${SANDBOX_PORT_LO:-42000}"
PORT_HI="${SANDBOX_PORT_HI:-42099}"
IMAGE="${SANDBOX_IMAGE:-node:22-alpine}"
NET="${SANDBOX_NETWORK:-lifemark-sandboxes}"

say()  { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }
ok()   { printf "    \033[0;32m✓\033[0m %s\n" "$1"; }
warn() { printf "    \033[0;33m!\033[0m %s\n" "$1"; }

# ── 1. Docker ────────────────────────────────────────────────────────────────
say "Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker present: $(docker --version)"
else
  warn "installing Docker via get.docker.com"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "docker installed"
fi

if docker info >/dev/null 2>&1; then
  ok "daemon reachable"
else
  echo "    ERROR: docker daemon not reachable. Try: systemctl start docker" >&2
  exit 1
fi

# ── 2. Runtime image ─────────────────────────────────────────────────────────
say "Runtime image"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  ok "$IMAGE already pulled"
else
  warn "pulling $IMAGE (one-off; makes first preview much faster)"
  docker pull "$IMAGE"
  ok "pulled"
fi

# ── 3. Isolated network ──────────────────────────────────────────────────────
# Own bridge with inter-container communication OFF: one user's sandbox must not
# be able to reach another's, nor anything else you run on this host.
say "Isolated network"
if docker network inspect "$NET" >/dev/null 2>&1; then
  ok "network '$NET' exists"
else
  docker network create --driver bridge \
    --opt "com.docker.network.bridge.enable_icc=false" "$NET" >/dev/null
  ok "created '$NET' (inter-container comms disabled)"
fi

# ── 3b. Preview routing network (HTTPS previews via Traefik) ─────────────────
# Without this, previews are served as http://IP:PORT. A browser will NOT embed
# those in an https:// editor (mixed content) — it fails silently with a blank
# pane and no console error. Putting sandboxes behind the existing Traefik gives
# each one a real https://<id>.<domain> URL and removes the published-port range
# entirely (nothing of the sandbox is internet-reachable except via the proxy).
#
# NOTE: this network has ICC *enabled*, unlike the isolated one above — Traefik
# has to reach the sandboxes to proxy them. Sandboxes can therefore reach each
# other on this network. Acceptable for a single-tenant product; for untrusted
# multi-tenant use, give each sandbox its own network and attach Traefik to each.
PREVIEW_NET="${SANDBOX_PROXY_NETWORK:-lifemark-previews}"
PROXY_CONTAINER="${TRAEFIK_CONTAINER:-coolify-proxy}"
say "Preview routing network"
if docker network inspect "$PREVIEW_NET" >/dev/null 2>&1; then
  ok "network '$PREVIEW_NET' exists"
else
  docker network create --driver bridge "$PREVIEW_NET" >/dev/null
  ok "created '$PREVIEW_NET'"
fi
if docker ps --format '{{.Names}}' | grep -qx "$PROXY_CONTAINER"; then
  if docker inspect -f '{{json .NetworkSettings.Networks}}' "$PROXY_CONTAINER" \
      | grep -q "$PREVIEW_NET"; then
    ok "$PROXY_CONTAINER already attached to '$PREVIEW_NET'"
  else
    docker network connect "$PREVIEW_NET" "$PROXY_CONTAINER" 2>/dev/null \
      && ok "attached $PROXY_CONTAINER to '$PREVIEW_NET'" \
      || warn "could not attach $PROXY_CONTAINER — do it manually or previews won't route"
  fi
else
  warn "proxy container '$PROXY_CONTAINER' not running — set TRAEFIK_CONTAINER"
fi

# ── 4. Firewall ──────────────────────────────────────────────────────────────
say "Firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PORT_LO}:${PORT_HI}/tcp" >/dev/null 2>&1 || true
  ok "ufw: opened ${PORT_LO}-${PORT_HI}/tcp for preview traffic"
  if ufw status | grep -qE "^2375|^2376"; then
    warn "Docker API port is open in ufw — close it unless you know why"
  fi
else
  warn "ufw not installed — open ${PORT_LO}-${PORT_HI}/tcp in your provider's firewall"
fi

# ── 5. Docker API exposure check ─────────────────────────────────────────────
# Unauthenticated 2375 is remote root on this machine. Always worth checking.
say "Docker API exposure"
if ss -ltn 2>/dev/null | grep -qE ":2375\b"; then
  warn "PORT 2375 IS LISTENING — the Docker API is UNAUTHENTICATED."
  warn "Anyone who can reach it owns this server. Bind it to 127.0.0.1 or"
  warn "use an SSH tunnel from the app host instead."
else
  ok "2375 not listening (good — use the unix socket or an SSH tunnel)"
fi

# ── 6. Smoke test ────────────────────────────────────────────────────────────
# Proves the exact hardening flags the provider uses actually work here, rather
# than discovering a kernel/driver incompatibility on a user's first preview.
say "Smoke test (same flags the provider uses)"
if docker run --rm \
      --network "$NET" \
      --memory 512m --cpus 1 --pids-limit 512 \
      --cap-drop ALL --security-opt no-new-privileges \
      --user node \
      "$IMAGE" node -e 'console.log("sandbox ok:", process.version)' 2>/dev/null; then
  ok "hardened container ran successfully"
else
  warn "hardened run FAILED — check kernel support for the cap/pids options"
fi

# ── 7. Cleanup helper ────────────────────────────────────────────────────────
# IDLE-based, not age-based. Reaping by creation age cut off ACTIVE users at
# the age cutoff mid-edit ("preview goes blank after some time"). The app's
# keep-alive heartbeat touches /tmp/.lm-keepalive inside the container every
# ~15s while the editor tab is open, so idle time is measurable directly.
# Also dedupes: two live containers for one project share a stable preview
# hostname, Traefik round-robins them, and the browser ends up with two React
# copies -> blank preview. Keep the newest, remove the rest.
say "Stale sandbox cleanup"
cat >/usr/local/bin/lifemark-sandbox-gc <<'GC'
#!/usr/bin/env bash
# lifemark-sandbox-gc [IDLE_HOURS] [MAX_HOURS] [MAX_STOPPED]
#   Idle sandboxes are STOPPED. Removal is reserved for MAX_HOURS spent stopped
#   and for the MAX_STOPPED disk guard. Always dedupe per project.
#
# Why stop rather than remove: node_modules lives inside the container. Removing
# an idle sandbox throws away the installed dependency tree, so the next time
# that project is opened the app reinstalls it over the network — 40-90 seconds
# of spinner for packages that were already sitting on this disk. A stopped
# container starts again in about a second, and the app's warm path starts it,
# re-syncs whatever changed, and skips the install entirely.
#
# What that costs, and why MAX_STOPPED exists. The dependency tree measures
# 301MB across 28,199 files. On the PREBUILT sandbox image those files live in
# a shared read-only image layer, so every container reads the same copy and a
# stopped sandbox costs only its source and whatever it added — a few MB, and
# this guard will never bind. On a plain node:22-alpine each container installs
# its own copy into its own writable layer, so idle sandboxes cost ~300MB each
# and unbounded retention would fill the disk. Keeping the N most recently used
# bounds that at roughly N x 300MB no matter how many projects exist.
IDLE_HOURS="${1:-3}"
MAX_HOURS="${2:-48}"
MAX_STOPPED="${3:-20}"
now=$(date -u +%s)

# 1) One container per project — newest wins.
docker ps --filter "label=lifemark.sandbox=1" --format '{{.ID}} {{.Label "lifemark.project"}}' \
| awk '$2 != "" { print $2 " " $1 }' \
| while read -r proj id; do
    echo "$proj $(docker inspect -f '{{.Created}}' "$id" 2>/dev/null) $id"
  done \
| sort -k1,1 -k2,2r \
| awk 'seen[$1]++ { print $3 }' \
| while read -r dup; do
    docker rm -f "$dup" >/dev/null 2>&1 && echo "removed duplicate $dup"
  done

# 2) Idle -> stop (keeps node_modules); remove only after stopped retention.
#    Creation age must never evict an active project or a recently used cache.
docker ps -aq --filter "label=lifemark.sandbox=1" | while read -r id; do
  created=$(docker inspect -f '{{.Created}}' "$id" 2>/dev/null) || continue
  cts=$(date -u -d "$created" +%s 2>/dev/null) || continue
  running=$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null) || continue
  if [ "$running" != "true" ]; then
    finished=$(docker inspect -f '{{.State.FinishedAt}}' "$id" 2>/dev/null) || continue
    fts=$(date -u -d "$finished" +%s 2>/dev/null) || continue
    [ "$fts" -gt 0 ] || continue
    stopped=$(( now - fts ))
    if [ "$stopped" -gt $(( MAX_HOURS * 3600 )) ]; then
      # No force: a concurrent editor resume must win over garbage collection.
      docker rm "$id" >/dev/null 2>&1 && echo "removed $id (stopped ${stopped}s > cap)"
    fi
    continue
  fi
  # A resume keeps the old heartbeat file. Grant the new process its full idle
  # window, and never interpret an exec/daemon failure as proof of inactivity.
  started=$(docker inspect -f '{{.State.StartedAt}}' "$id" 2>/dev/null) || continue
  sts=$(date -u -d "$started" +%s 2>/dev/null) || continue
  [ "$sts" -gt 0 ] || continue
  last=$(docker exec "$id" stat -c %Y /tmp/.lm-keepalive 2>/dev/null) || continue
  case "$last" in (''|*[!0-9]*) continue;; esac
  [ "$last" -lt "$sts" ] && last="$sts"
  idle=$(( now - last ))
  if [ "$idle" -gt $(( IDLE_HOURS * 3600 )) ]; then
    docker stop -t 5 "$id" >/dev/null 2>&1 && echo "stopped $id (idle ${idle}s) — node_modules kept"
  fi
done

# 3) Disk guard — keep only the MAX_STOPPED most recently finished sandboxes.
#    Sorted by FinishedAt (when it was last stopped), newest first, so the ones
#    removed are the least recently used rather than merely the oldest: a
#    long-lived project someone opens daily outranks one created yesterday and
#    abandoned. Set MAX_STOPPED to 0 to disable.
if [ "$MAX_STOPPED" -gt 0 ]; then
  docker ps -aq --filter "label=lifemark.sandbox=1" --filter "status=exited" \
  | while read -r id; do
      fin=$(docker inspect -f '{{.State.FinishedAt}}' "$id" 2>/dev/null) || continue
      fts=$(date -u -d "$fin" +%s 2>/dev/null || echo 0)
      echo "$fts $id"
    done \
  | sort -rn \
  | awk -v keep="$MAX_STOPPED" 'NR > keep { print $2 }' \
  | while read -r old; do
      docker rm "$old" >/dev/null 2>&1 && echo "removed $old (beyond $MAX_STOPPED most-recent stopped)"
    done
fi
GC
chmod +x /usr/local/bin/lifemark-sandbox-gc
ok "installed /usr/local/bin/lifemark-sandbox-gc (idle-aware + per-project dedupe)"

if command -v crontab >/dev/null 2>&1; then
  ( crontab -l 2>/dev/null | grep -v lifemark-sandbox-gc; \
    echo "*/10 * * * * /usr/local/bin/lifemark-sandbox-gc 3 48 20 >/dev/null 2>&1" ) | crontab -
  ok "cron installed: every 10 min — stop idle>3h, remove stopped>48h, keep 20 most-recent stopped, dedupe per project"
else
  warn "no crontab — run lifemark-sandbox-gc periodically or containers accumulate"
fi

say "Done"
cat <<EOF

  RECOMMENDED — HTTPS previews via the existing Traefik (no published ports,
  no mixed-content problem). Requires a wildcard DNS record:

      *.preview.lifemarkai.com   A   <this server's IP>

  CERTIFICATE RATE LIMIT — read this before going wide. Coolify's Traefik uses
  the ACME HTTP-01 challenge (certificatesresolvers.letsencrypt.acme
  .httpchallenge=true), which CANNOT issue wildcard certs: every distinct
  preview hostname gets its own certificate. Let's Encrypt permits 50 certs per
  registered domain per week. The provider therefore uses one STABLE hostname
  per project, not per sandbox, so restarts reuse a cert. If you expect more
  than ~50 new projects a week, switch Traefik to a DNS-01 resolver and issue a
  single wildcard cert for *.preview.lifemarkai.com — after that, hostnames are
  free and you can go back to per-sandbox naming.

  Then in the app's environment:

    SANDBOX_PROVIDER=docker
    SANDBOX_PREVIEW_DOMAIN=preview.lifemarkai.com
    SANDBOX_PROXY_NETWORK=${PREVIEW_NET}
    SANDBOX_CERT_RESOLVER=letsencrypt      # must match your Traefik resolver name
    SANDBOX_TRAEFIK_ENTRYPOINT=https       # Coolify's Traefik calls it "https"
    SANDBOX_IMAGE=${IMAGE}
    DOCKER_SOCKET=/var/run/docker.sock

  FALLBACK — published host ports (http only, fine for local dev):

    SANDBOX_PROVIDER=docker
    SANDBOX_PUBLIC_HOST=<this server's IP or hostname>
    SANDBOX_PORT_RANGE=${PORT_LO}-${PORT_HI}
    SANDBOX_IMAGE=${IMAGE}
    DOCKER_SOCKET=/var/run/docker.sock

  If the app runs on a DIFFERENT machine, do NOT open 2375. Tunnel instead:

    ssh -N -L 2375:/var/run/docker.sock user@<this-server>
    # then on the app host: DOCKER_HOST=http://127.0.0.1:2375

  HTTPS: previews are served as http://IP:PORT. A browser will NOT embed those
  in an https:// page (mixed content) — it fails silently with a blank pane.
  For production, put the port range behind a TLS reverse proxy and set
  SANDBOX_PUBLIC_SCHEME=https.

EOF
