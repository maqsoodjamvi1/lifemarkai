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
say "Stale sandbox cleanup"
cat >/usr/local/bin/lifemark-sandbox-gc <<'GC'
#!/usr/bin/env bash
# Remove lifemark sandbox containers older than N hours (default 6).
HOURS="${1:-6}"
CUTOFF=$(date -u -d "-${HOURS} hours" +%s 2>/dev/null || date -u -v-"${HOURS}"H +%s)
docker ps -aq --filter "label=lifemark.sandbox=1" | while read -r id; do
  created=$(docker inspect -f '{{.Created}}' "$id" 2>/dev/null) || continue
  ts=$(date -u -d "$created" +%s 2>/dev/null) || continue
  [ "$ts" -lt "$CUTOFF" ] && docker rm -f "$id" >/dev/null && echo "removed $id"
done
GC
chmod +x /usr/local/bin/lifemark-sandbox-gc
ok "installed /usr/local/bin/lifemark-sandbox-gc"

if command -v crontab >/dev/null 2>&1; then
  ( crontab -l 2>/dev/null | grep -v lifemark-sandbox-gc; \
    echo "0 * * * * /usr/local/bin/lifemark-sandbox-gc 6 >/dev/null 2>&1" ) | crontab -
  ok "hourly cron installed (removes sandboxes older than 6h)"
else
  warn "no crontab — run lifemark-sandbox-gc periodically or containers accumulate"
fi

say "Done"
cat <<EOF

  Put these in the app's .env.local:

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
