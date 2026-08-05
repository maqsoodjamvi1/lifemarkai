/**
 * Self-hosted sandbox provider — runs generated apps in Docker on YOUR server.
 *
 * WHY: Modal and E2B bill per sandbox-hour. If you already pay for a VPS, this
 * costs nothing extra. Same `SandboxProvider` contract as Modal, so the editor,
 * preview panel, progress UI and log endpoint all work unchanged.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  SECURITY — READ THIS BEFORE DEPLOYING
 * ────────────────────────────────────────────────────────────────────────────
 * This executes AI-GENERATED, UNTRUSTED code. Modal and E2B sell you strong
 * isolation (gVisor / Firecracker microVMs); plain Docker is a weaker boundary —
 * a container escape or a noisy-neighbour bug reaches your host.
 *
 * The hardening below is applied by default and is NOT optional decoration:
 *   • CPU + memory caps            → one runaway build can't take the box down
 *   • `--cap-drop ALL`, no-new-privileges → shrinks the escape surface
 *   • non-root user                → generated code can't write outside its home
 *   • pids limit                   → blocks fork bombs
 *   • dedicated bridge network     → containers can't reach each other
 *   • no host mounts, no socket    → never mount /var/run/docker.sock into these
 *
 * STRONGLY RECOMMENDED: run this on a SEPARATE VPS from your production app and
 * database. If a sandbox escapes on the same host as your Supabase creds and
 * API keys, the blast radius is your whole product. A $5 box is cheaper than
 * that incident.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  CONFIG
 * ────────────────────────────────────────────────────────────────────────────
 *   SANDBOX_PROVIDER=docker            select this provider
 *   DOCKER_SOCKET=/var/run/docker.sock unix socket (default), or
 *   DOCKER_HOST=http://127.0.0.1:2375  TCP daemon (never expose this publicly)
 *   SANDBOX_PUBLIC_HOST=1.2.3.4        host/IP users' browsers can reach
 *   SANDBOX_PORT_RANGE=42000-42099     host ports available for previews
 *   SANDBOX_IMAGE=node:22-alpine       runtime image
 *   SANDBOX_MEMORY_MB=1024             per-container memory cap
 *   SANDBOX_CPUS=1                     per-container CPU cap
 */

import http from "node:http";
import { createHash } from "node:crypto";
import type {
  ClaudeCodeResult,
  CommandResult,
  SandboxFile,
  SandboxProvider,
  SandboxRunResult,
  TypecheckResult,
} from "./index";
import { DEFAULT_TIMEOUT_MS, trunc, waitForServer } from "./shared";
import { SYNC_MANIFEST, filesToPrune } from "./prune-files";
import { parseTscOutput } from "./tsc-diagnostics";

const DEV_LOG = "/tmp/lifemark-dev.log";

/**
 * Marker embedded in the dev-server supervisor's command line.
 *
 * Reuse has to answer "is a supervisor already running in here?" before it
 * starts one. Getting that wrong means TWO `while true; do vite; done` loops
 * racing for the same port: each keeps losing the bind, exiting, and being
 * restarted a second later, so the preview flaps between working and refused
 * indefinitely — a worse failure than the cold start it was avoiding.
 *
 * A marker in the args is the reliable test: it survives in `ps` output for as
 * long as the supervising shell lives, and dies with it. A pidfile would have
 * to be cleaned up by a process that may have been killed.
 */
const SUPERVISOR_TAG = "LM_SUPERVISOR";

/** The dev-server supervisor loop — one definition, used by both boot paths. */
function supervisorCommand(cmd: string): string {
  return (
    `while true; do ${cmd} >> ${DEV_LOG} 2>&1; ` +
    `echo "[supervisor] dev server exited ($(date -u +%H:%M:%S)); restarting" >> ${DEV_LOG}; ` +
    `sleep 1; done # ${SUPERVISOR_TAG}`
  );
}

/**
 * Project directory INSIDE the node user's own home — not /app.
 *
 * VERIFIED ON A REAL DAEMON, do not "simplify" this back to /app:
 *   • Docker creates `WorkingDir` as root:root 0755 before the container's Cmd
 *     runs. Running as the non-root `node` user then cannot write there:
 *         touch: /app/probe: Permission denied
 *   • The obvious fix (chown it from root) ALSO fails, because `--cap-drop ALL`
 *     strips CAP_CHOWN — even uid 0 inside the container gets:
 *         chown: /app: Operation not permitted
 *
 * So the hardening and a root-owned workdir are mutually exclusive. The way out
 * is to never let Docker create the directory: `/home/node` already belongs to
 * node in the official image, so the container mkdir's the subdir itself as
 * node. Confirmed: `drwxr-sr-x node node /home/node/app`, writes succeed, and
 * every hardening flag stays on.
 *
 * Consequence: do NOT set `WorkingDir` on container create (that would recreate
 * the root-owned dir). It is passed per-exec instead.
 */
const APP_DIR = "/home/node/app";

/**
 * Accept whatever shape the host was configured as.
 *
 * People naturally paste a full URL ("http://1.2.3.4/") rather than a bare
 * host, and naive interpolation then yields "http://http://1.2.3.4/:42000" —
 * a URL that fails with a confusing browser error rather than a config error.
 * Strip the scheme, any path, and trailing slashes.
 */
/**
 * Traefik router/service names may only contain [a-zA-Z0-9-_.]; a hostname's
 * dots are legal but make the label read like a nested key, so flatten them.
 */
function routerId(previewHost: string): string {
  return "lmsbx-" + previewHost.replace(/[^a-zA-Z0-9]/g, "-");
}

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function cfg() {
  const [lo, hi] = (process.env.SANDBOX_PORT_RANGE ?? "42000-42099")
    .split("-")
    .map((n) => Number(n.trim()));
  // Wildcard domain enables hostname routing. Without it we fall back to
  // publishing host ports, which only works when the editor is also on http.
  const previewDomain = normalizeHost(process.env.SANDBOX_PREVIEW_DOMAIN || "");
  return {
    socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
    tcpHost: process.env.DOCKER_HOST || "",
    publicHost: normalizeHost(process.env.SANDBOX_PUBLIC_HOST || ""),
    // http for a bare IP; set to "https" once previews sit behind a TLS proxy.
    // This matters more than it looks — see mixedContentWarning() below.
    scheme: (process.env.SANDBOX_PUBLIC_SCHEME || "http").replace(/[^a-z]/gi, ""),
    portLo: Number.isFinite(lo) ? lo : 42000,
    portHi: Number.isFinite(hi) ? hi : 42099,
    image: process.env.SANDBOX_IMAGE || "node:22-alpine",
    memoryMb: Number(process.env.SANDBOX_MEMORY_MB) || 1024,
    cpus: Number(process.env.SANDBOX_CPUS) || 1,
    // ── routing ──────────────────────────────────────────────────────────────
    previewDomain,
    // Hostname routing is what makes previews usable in production: Traefik
    // terminates TLS and proxies https://<id>.<domain> to the container's port
    // on an internal network. No published ports, so no port-range exhaustion
    // and nothing of the sandbox is reachable from the internet except through
    // the proxy.
    routeViaProxy: Boolean(previewDomain),
    proxyNetwork: process.env.SANDBOX_PROXY_NETWORK || "lifemark-previews",
    certResolver: process.env.SANDBOX_CERT_RESOLVER || "letsencrypt",
    entrypoint: process.env.SANDBOX_TRAEFIK_ENTRYPOINT || "https",
  };
}

/**
 * Browsers refuse to embed an http:// iframe inside an https:// page ("mixed
 * content"), silently — no console error the user will find, just a blank
 * pane. So a raw-IP preview works on http://localhost during development and
 * then breaks the moment the editor is served over HTTPS.
 *
 * Returns a warning string when that mismatch is configured, or null.
 */
export function mixedContentWarning(): string | null {
  const c = cfg();
  // Proxy mode already returns https:// URLs — nothing to warn about.
  if (c.routeViaProxy) return null;
  if (c.scheme === "https") return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || "";
  if (!appUrl.startsWith("https://")) return null;
  return (
    `Preview URLs are http:// (${c.publicHost}) but the app is served over HTTPS ` +
    `(${appUrl}). Browsers block mixed-content iframes, so previews will show a ` +
    `blank pane in production. Put the sandbox ports behind a TLS reverse proxy ` +
    `and set SANDBOX_PUBLIC_SCHEME=https.`
  );
}

/**
 * Minimal Docker Engine API client.
 *
 * Uses node:http with `socketPath` so the unix socket works without dockerode —
 * one less dependency, and the API surface we need is tiny (create / start /
 * exec / archive / remove).
 */
async function docker(
  method: string,
  path: string,
  body?: unknown,
  raw?: Buffer,
): Promise<{ status: number; text: string }> {
  const c = cfg();
  const payload = raw ?? (body === undefined ? undefined : Buffer.from(JSON.stringify(body)));
  const headers: Record<string, string> = {};
  // `application/x-tar` on archive uploads is LOAD-BEARING, not cosmetic.
  // Docker's API middleware runs ParseForm on the request, and Go's ParseForm
  // CONSUMES the body when the content type is application/x-www-form-urlencoded
  // (the default for most HTTP clients). The daemon then extracts an empty
  // stream and answers **200 OK** — the upload silently no-ops and the preview
  // boots an empty directory. Verified on a live daemon: identical request,
  // only the header differing, gave 200-and-nothing vs 200-and-files.
  if (raw) headers["Content-Type"] = "application/x-tar";
  else if (payload) headers["Content-Type"] = "application/json";
  if (payload) headers["Content-Length"] = String(payload.byteLength);

  const opts: http.RequestOptions = c.tcpHost
    ? (() => {
        const u = new URL(c.tcpHost);
        return { host: u.hostname, port: u.port || 2375, method, path, headers };
      })()
    : { socketPath: c.socketPath, method, path, headers };

  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d) => chunks.push(Buffer.from(d)));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Build a POSIX tar archive in memory.
 *
 * Docker's `PUT /containers/{id}/archive` is the only bulk-upload endpoint, and
 * it wants a tar stream. Writing the header by hand avoids adding a tar
 * dependency — the format is fixed-width and we only emit regular files.
 */
export function buildTar(files: SandboxFile[]): Buffer {
  const blocks: Buffer[] = [];

  // Emit explicit DIRECTORY entries (parents first) owned by uid/gid 1000.
  // Without them the daemon auto-creates missing parent dirs as root:root
  // 0755 while extracting, and the non-root `node` user can then never CREATE
  // a new file inside them. That killed TanStack Start previews: the router
  // generator's rename into src/ (routeTree.gen.ts) failed with EACCES, the
  // dev server died, and Traefik answered 502 behind a "ready" phase.
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").replace(/^\/+/, "").split("/");
    parts.pop();
    let acc = "";
    for (const part of parts) {
      if (!part) continue;
      acc = acc ? `${acc}/${part}` : part;
      dirs.add(acc);
    }
  }
  for (const dir of [...dirs].sort()) {
    const header = Buffer.alloc(512);
    header.write((dir + "/").slice(0, 100), 0, "utf8");
    header.write("000755 \0", 100, "utf8");            // mode
    header.write("001750 \0", 108, "utf8");            // uid 1000 (node)
    header.write("001750 \0", 116, "utf8");            // gid 1000
    header.write("00000000000 ", 124, "utf8");          // size 0
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + " ", 136, "utf8");
    header.write("        ", 148, "utf8");              // checksum placeholder
    header.write("5", 156, "utf8");                     // type: directory
    header.write("ustar\0" + "00", 257, "utf8");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "utf8");
    blocks.push(header);
  }

  for (const f of files) {
    const name = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name) continue;
    const content = Buffer.from(f.content ?? "", "utf8");

    const header = Buffer.alloc(512);
    // Paths >100 chars need the PAX/ustar prefix field; split on a separator.
    let namePart = name;
    let prefix = "";
    if (Buffer.byteLength(name) > 100) {
      const cut = name.lastIndexOf("/", 154);
      if (cut > 0) {
        prefix = name.slice(0, cut);
        namePart = name.slice(cut + 1);
      } else {
        namePart = name.slice(-100);
      }
    }
    header.write(namePart.slice(0, 100), 0, "utf8");
    header.write("000644 \0", 100, "utf8");            // mode
    // uid/gid 1000 = the image's `node` user. The daemon extracts the archive
    // as root and honours these headers, so writing 0 here would drop
    // root-owned files into a node-owned directory: the app would boot but
    // anything rewriting a tracked file (npm updating package-lock.json, a
    // formatter, the AI editing a file in place) would fail with EACCES.
    header.write("001750 \0", 108, "utf8");            // uid  (octal 1750 = 1000)
    header.write("001750 \0", 116, "utf8");            // gid  (octal 1750 = 1000)
    header.write(content.length.toString(8).padStart(11, "0") + " ", 124, "utf8");
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + " ", 136, "utf8");
    header.write("        ", 148, "utf8");             // checksum placeholder
    header.write("0", 156, "utf8");                    // type: regular file
    header.write("ustar\0" + "00", 257, "utf8");
    if (prefix) header.write(prefix.slice(0, 155), 345, "utf8");

    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "utf8");

    blocks.push(header, content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }

  blocks.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  return Buffer.concat(blocks);
}

/** Ports handed out this process; avoids racing two boots onto one port. */
const claimedPorts = new Set<number>();

/**
 * Per-project provision lock. The client has TWO independent auto-recovery
 * paths (the 15s keep-alive heartbeat and the 1.2s phase poll) that can each
 * decide the sandbox is dead and POST a cold boot — OBSERVED LIVE as two
 * containers created 1 second apart for the same project. Both then carry
 * Traefik labels for the same stable hostname, Traefik round-robins them, the
 * browser assembles the app from two React copies, and the preview goes blank
 * ("Invalid hook call"). Concurrent runProject calls for one project must
 * therefore collapse into a single provision: first caller does the work,
 * everyone else awaits the same promise and shares the result.
 */
const inflightRuns = new Map<string, Promise<SandboxRunResult>>();

function claimPort(): number | null {
  const c = cfg();
  for (let p = c.portLo; p <= c.portHi; p++) {
    if (!claimedPorts.has(p)) {
      claimedPorts.add(p);
      return p;
    }
  }
  return null;
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly id = "docker" as const;

  isEnabled(): boolean {
    // A browser-reachable address is mandatory: without one we can hand back a
    // URL that only resolves on the server, which fails silently in the user's
    // browser — exactly the failure mode that wasted hours on the Modal tunnel.
    // Either mode satisfies that:
    //   - proxy mode: SANDBOX_PREVIEW_DOMAIN (Traefik serves https://<id>.<domain>)
    //   - port mode:  SANDBOX_PUBLIC_HOST (http://host:port)
    // This MUST accept proxy mode — checking only publicHost silently fell back
    // to Modal in production while every SANDBOX_* var was correctly set.
    const c = cfg();
    return Boolean(c.publicHost || c.routeViaProxy);
  }

  async runProject(opts: {
    files: SandboxFile[];
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
    projectId?: string;
    onProgress?: (phase: string, detail?: string) => void;
  }): Promise<SandboxRunResult> {
    // Serialize provisions per project (see inflightRuns). Projects without an
    // id can't be deduplicated — run those directly.
    const key = opts.projectId ?? "";
    if (!key) return this.runProjectInner(opts);
    const existing = inflightRuns.get(key);
    if (existing) return existing;
    const run = this.runProjectInner(opts).finally(() => {
      inflightRuns.delete(key);
    });
    inflightRuns.set(key, run);
    return run;
  }

  private async runProjectInner(opts: {
    files: SandboxFile[];
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
    projectId?: string;
    onProgress?: (phase: string, detail?: string) => void;
  }): Promise<SandboxRunResult> {
    const progress = opts.onProgress ?? (() => {});
    const c = cfg();
    if (!this.isEnabled()) {
      return {
        ok: false,
        error: "Docker sandbox needs SANDBOX_PREVIEW_DOMAIN (proxy mode) or SANDBOX_PUBLIC_HOST (port mode) set.",
      };
    }

    const innerPort = opts.port ?? 5173;
    // In proxy mode Traefik reaches the container over the shared network, so
    // there is no host port to claim and no range to exhaust.
    const hostPort = c.routeViaProxy ? null : claimPort();
    if (!c.routeViaProxy && hostPort == null) {
      return { ok: false, error: `No free port in ${c.portLo}-${c.portHi}. Raise SANDBOX_PORT_RANGE.` };
    }
    // Hostname is STABLE PER PROJECT, deliberately not per sandbox.
    //
    // Coolify's Traefik issues certs via the ACME **HTTP-01** challenge
    // (verified: certificatesresolvers.letsencrypt.acme.httpchallenge=true),
    // which cannot issue wildcards — every distinct hostname needs its own
    // certificate. Let's Encrypt allows 50 certs per registered domain per week,
    // so a per-sandbox hostname would exhaust the quota within days and then
    // previews would fail with opaque TLS errors that look nothing like a rate
    // limit. Reusing one hostname per project keeps issuance proportional to
    // projects, not to preview restarts.
    //
    // Trade-off: two live sandboxes for the SAME project would both claim this
    // hostname and Traefik would route to whichever registered last. The preview
    // panel only runs one sandbox per project at a time, so that doesn't arise —
    // but if that ever changes, either add a wildcard cert via a DNS-01 resolver
    // (then per-sandbox hostnames become free) or suffix the sandbox id here.
    const previewHost = c.routeViaProxy
      ? `${(opts.projectId || "sbx").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32) || "sbx"}.${c.previewDomain}`
      : "";

    try {
      // One sandbox per project: the preview hostname is stable per project, so
      // any leftover container for this project would make Traefik round-robin
      // across two vite servers → the browser assembles the app from two React
      // copies → "more than one copy of React" → blank preview. Tear those down
      // before creating the replacement.
      // WARM PATH — reuse this project's existing container instead of
      // destroying it.
      //
      // A cold boot's cost is almost entirely `npm install`: ~340 packages into
      // an empty cache, 40-90s of spinner. And it was paid far more often than
      // it needed to be, because the container is where node_modules lives and
      // every boot began by deleting the container. Reopen a project after the
      // host GC's 3h idle window and you reinstall from scratch — the same
      // dependencies, over the network, again.
      //
      // A container that still exists still has node_modules, so restarting it
      // and re-syncing the files skips the install entirely. writeFiles already
      // diffs against a content-hash manifest, so an unchanged project uploads
      // nothing at all. This is the difference between a 60-second open and a
      // 3-second one.
      //
      // Reuse is strictly safer than the create path for the duplicate-router
      // hazard too: it is the same single container, so Traefik never sees two
      // backends for the project's hostname.
      if (opts.projectId) {
        const reused = await this.reuseProjectContainer({
          projectId: opts.projectId,
          image: c.image,
          innerPort,
          startCommand: opts.startCommand,
          files: opts.files,
          progress,
          readyBudgetMs: Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000),
        });
        if (reused) return reused;
      }

      // No reusable container (first ever boot, GC removed it, or the image
      // changed) — fall through to a full cold provision.
      if (opts.projectId) {
        progress("cleanup", "Removing previous sandbox for project");
        await this.removeProjectContainers(opts.projectId);
      }

      progress("creating", "Creating container");
      const create = await docker("POST", "/v1.43/containers/create", {
        Image: c.image,
        // NO WorkingDir here on purpose — see the APP_DIR note above. Setting it
        // makes Docker pre-create the path as root, which the non-root user then
        // cannot write to and cannot chown (CAP_CHOWN is dropped).
        //
        // The container creates its own dir as `node`, then idles. Commands run
        // via exec so install and dev-server stay separately observable.
        Cmd: ["sh", "-c", `mkdir -p ${APP_DIR} && sleep infinity`],
        User: "node",
        Env: [
          "HOME=/home/node",
          "npm_config_cache=/home/node/.npm",
          "CI=1",
        ],
        ExposedPorts: { [`${innerPort}/tcp`]: {} },
        // Proxy mode: join the network Traefik watches. Port mode: publish to host.
        ...(c.routeViaProxy
          ? { NetworkingConfig: { EndpointsConfig: { [c.proxyNetwork]: {} } } }
          : {}),
        HostConfig: {
          PortBindings: c.routeViaProxy
            ? {}
            : { [`${innerPort}/tcp`]: [{ HostPort: String(hostPort) }] },
          ...(c.routeViaProxy ? { NetworkMode: c.proxyNetwork } : {}),
          // Init (tini) as pid 1 is LOAD-BEARING. Without it pid 1 is our
          // `sleep infinity`, which never reaps children: when vite's file
          // watcher triggers a self-restart (late .env/config writes), the
          // restarted process is orphaned onto sleep and dies — observed live
          // as `[npm run dev]`/`[esbuild]` zombies, "server restarted." as the
          // final log line, connection refused on 5173, and 502 from Traefik.
          Init: true,
          Memory: c.memoryMb * 1024 * 1024,
          NanoCpus: Math.round(c.cpus * 1e9),
          PidsLimit: 512,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges"],
          // No bind mounts. Never mount the docker socket into a sandbox.
          Binds: [],
          AutoRemove: false,
          RestartPolicy: { Name: "no" },
        },
        Labels: {
          "lifemark.sandbox": "1",
          "lifemark.project": opts.projectId ?? "",
          "lifemark.created": new Date().toISOString(),
          // Traefik discovers routes from container labels. The router name must
          // be unique per container or the last one created silently wins the
          // hostname — hence the timestamped previewHost, reused as the id.
          ...(c.routeViaProxy
            ? {
                "traefik.enable": "true",
                "traefik.docker.network": c.proxyNetwork,
                [`traefik.http.routers.${routerId(previewHost)}.rule`]: `Host(\`${previewHost}\`)`,
                [`traefik.http.routers.${routerId(previewHost)}.entrypoints`]: c.entrypoint,
                [`traefik.http.routers.${routerId(previewHost)}.tls`]: "true",
                [`traefik.http.routers.${routerId(previewHost)}.tls.certresolver`]: c.certResolver,
                [`traefik.http.services.${routerId(previewHost)}.loadbalancer.server.port`]:
                  String(innerPort),
              }
            : {}),
        },
      });
      if (create.status >= 400) {
        claimedPorts.delete(hostPort);
        return { ok: false, error: `docker create failed (${create.status}): ${trunc(create.text, 400)}` };
      }
      const id = (JSON.parse(create.text) as { Id: string }).Id;

      const start = await docker("POST", `/v1.43/containers/${id}/start`);
      if (start.status >= 400) {
        return { ok: false, error: `docker start failed (${start.status}): ${trunc(start.text, 400)}` };
      }

      // The Cmd above also mkdirs, but `start` returns as soon as the process is
      // SPAWNED — it does not wait for the shell to reach mkdir. The upload
      // below is a PUT to that exact path, and Docker's archive endpoint does
      // NOT create a missing target: it 404s. So do the mkdir as an awaited exec
      // and get deterministic ordering instead of a latency race that only
      // fails under load. `-p` makes it a no-op if the Cmd already won.
      const mk = await this.exec(id, `mkdir -p ${APP_DIR}`, "/");
      if (mk.exitCode && mk.exitCode !== 0) {
        return { ok: false, error: `could not create ${APP_DIR}: ${trunc(mk.stdout + mk.stderr, 300)}` };
      }

      progress("writing", `Uploading ${opts.files.length} files`);
      const put = await docker(
        "PUT",
        `/v1.43/containers/${id}/archive?path=${encodeURIComponent(APP_DIR)}`,
        undefined,
        buildTar(opts.files),
      );
      if (put.status >= 400) {
        return { ok: false, error: `file upload failed (${put.status}): ${trunc(put.text, 300)}` };
      }

      // A 200 does NOT prove the files landed (see the content-type note in
      // docker()). Confirm one file actually exists, so a silent no-op surfaces
      // here as a real error instead of as a mysteriously blank preview after a
      // successful-looking build.
      const probe = await this.exec(id, `ls -A | head -1`);
      if (!probe.stdout.trim()) {
        return {
          ok: false,
          error: `Upload reported success but ${APP_DIR} is empty — the archive did not extract.`,
        };
      }

      let logs = "";
      if (opts.files.some((f) => f.path.endsWith("package.json"))) {
        // Nothing is copied or linked into place. When the image already ships
        // node_modules at this path (see docker/sandbox/Dockerfile), it is
        // simply there, in a shared read-only layer, and npm reconciles it in
        // place — writing only what actually differs.
        //
        // This used to hardlink a staged copy from /opt/lm-base, which was
        // worse than doing nothing: on overlayfs, linking a file out of a lower
        // layer forces a copy-up, so every container paid the full 301MB of the
        // base tree into its own writable layer. Measured: 28,199 files. With
        // the modules already at the final path, that cost is paid once per
        // host instead of once per project — which is what makes keeping idle
        // sandboxes around affordable at all.
        const prebuilt = await this.exec(id, `[ -d node_modules ] && echo LM_PREBUILT`);
        progress(
          "installing",
          prebuilt.stdout.includes("LM_PREBUILT")
            ? "Reconciling dependencies"
            : "Installing dependencies",
        );
        // --prefer-offline: use anything already in the cache instead of
        // revalidating it over the network, which is most of the install once
        // the base modules are present. --progress/--loglevel keep npm from
        // streaming tens of thousands of lines back through the exec socket.
        const res = await this.exec(
          id,
          "npm install --no-audit --no-fund --prefer-offline --progress=false --loglevel=error",
        );
        logs += res.stdout + res.stderr;
        if (res.exitCode && res.exitCode !== 0) {
          return { ok: false, error: `npm install failed (exit ${res.exitCode}).`, logs: trunc(logs) };
        }
      }

      // Bind 0.0.0.0 or the port mapping can't reach it from outside the container.
      const cmd = opts.startCommand ?? `npx vite --host 0.0.0.0 --port ${innerPort}`;
      progress("starting", cmd);
      // TWO independent fixes here — both were needed, in order:
      //
      // (1) START DETACHED (Detach:true), not backgrounded over an attached
      //     exec. An attached exec (`Detach:false`) is torn down when its main
      //     process returns, killing all descendants regardless of nohup/setsid
      //     — proven locally. A detached exec is owned by the daemon and never
      //     attaches, so nothing is torn down.
      //
      // (2) SUPERVISE in a restart loop. With (1) alone the server started and
      //     served 200 — then DIED a minute later. The dev log showed why:
      //       vite.config.ts changed, restarting server...
      //       .env changed, restarting server...
      //       server restarted.        ← then the process was gone
      //     vite does a FULL restart (not HMR) whenever a config file changes,
      //     and every subsequent sandbox-preview call re-uploads the project,
      //     rewriting vite.config/tsconfig/.env and tripping that restart —
      //     which, run as a bare process, exits and never comes back. Users
      //     editing config files would hit the same thing. So don't run vite
      //     bare: wrap it in `while true; do …; sleep 1; done` so any exit
      //     (config restart, crash, OOM-of-the-process) is back within a second.
      //     Init:true (tini as pid 1) reaps the exited children so they don't
      //     pile up as zombies across restarts.
      await this.exec(id, supervisorCommand(cmd), APP_DIR, false, true);

      const previewUrl = c.routeViaProxy
        ? `https://${previewHost}`
        : `${c.scheme}://${c.publicHost}:${hostPort}`;

      // READINESS IS MEASURED INSIDE THE CONTAINER, not through the tunnel.
      //
      // The old probe fetched `https://<project>.<preview-domain>` from the app
      // server, which makes boot time depend on things that have nothing to do
      // with whether the app is up:
      //
      //   • Traefik obtains that hostname's certificate through the ACME
      //     HTTP-01 challenge on FIRST USE. Until it completes, an HTTPS fetch
      //     throws a TLS error, which the probe cannot distinguish from "vite
      //     isn't listening" — so a project whose dev server was serving in 15s
      //     could still burn the entire 120s budget waiting on issuance.
      //   • Traefik answers 502 for a booting backend, and the probe has to
      //     special-case that (see backendResponding) to avoid reading the
      //     proxy's own liveness as the app's.
      //   • It requires the app server to be able to reach its own public
      //     hostname, which is a hairpin through the edge on most hosts.
      //
      // `wget` against 127.0.0.1 inside the container answers the only question
      // that matters — is the dev server accepting requests? — in milliseconds,
      // with no TLS, no DNS and no proxy in the path. Requesting `/` rather
      // than just opening a socket is deliberate: it makes Vite start its
      // dependency pre-bundling pass now, during boot, instead of on the user's
      // first paint.
      const readyBudget = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000);
      const ready = await this.waitForLocalServer(id, innerPort, readyBudget);

      if (!ready) {
        // ONE-SHOT DIAGNOSTICS. Six deploys were spent guessing at this failure
        // because the result carried no evidence. Never again: on a non-ready
        // server, attach the dev log, the live process table, and — critically —
        // whether the kernel OOM-killed anything (a 1 GB cap silently killing
        // vite looks identical to every other cause). This runs only on failure.
        const devLog = await this.exec(id, `tail -n 40 ${DEV_LOG} 2>/dev/null`);
        const procs = await this.exec(id, `ps -o pid,rss,comm 2>/dev/null | head -n 15`);
        const inspect = await docker("GET", `/v1.43/containers/${id}/json`);
        let oom = "unknown";
        try {
          oom = String((JSON.parse(inspect.text) as { State?: { OOMKilled?: boolean } }).State?.OOMKilled);
        } catch { /* keep unknown */ }
        logs +=
          `\n[preview] dev server did not answer in time.` +
          `\n[preview] container OOMKilled=${oom}` +
          `\n[preview] probe=inner:${innerPort} (127.0.0.1 inside the container)` +
          `\n[preview] --- ${DEV_LOG} (tail) ---\n${devLog.stdout.trim() || "(empty)"}` +
          `\n[preview] --- processes ---\n${procs.stdout.trim() || "(none)"}`;
      }

      return {
        ok: true,
        sandboxId: id,
        previewUrl,
        // Report readiness HONESTLY. Returning ok:true unconditionally is what
        // put "Bad Gateway" in the preview pane: the caller persisted phase
        // "ready", the editor framed the URL, and Traefik answered 502 because
        // vite was still coming up. The container is fine — the supervisor loop
        // keeps trying — so this is "not yet", not "failed", and the phase
        // poller flips it to ready as soon as the tunnel actually answers.
        ready,
        logs: trunc(logs, 4000),
      };
    } catch (err) {
      claimedPorts.delete(hostPort);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Bring this project's existing container back into service, or return null.
   *
   * Returns null (never throws) whenever reuse isn't safe or doesn't work, so
   * the caller falls through to a normal cold provision. The bar for "safe":
   *
   *   • exactly one container, newest wins — extras are removed, because two
   *     live containers share the project's stable hostname and Traefik would
   *     round-robin them into the two-copies-of-React blank preview;
   *   • the image matches the currently configured SANDBOX_IMAGE, so bumping
   *     the image actually takes effect instead of pinning projects to
   *     whatever they first booted on;
   *   • node_modules is present — a container without it saves nothing, and
   *     the cold path handles it better.
   */
  private async reuseProjectContainer(opts: {
    projectId: string;
    image: string;
    innerPort: number;
    startCommand?: string;
    files: SandboxFile[];
    progress: (phase: string, detail?: string) => void;
    readyBudgetMs: number;
  }): Promise<SandboxRunResult | null> {
    const { projectId, image, innerPort, files, progress } = opts;
    try {
      const filters = encodeURIComponent(
        JSON.stringify({ label: [`lifemark.project=${projectId}`] }),
      );
      const listed = await docker("GET", `/v1.43/containers/json?all=1&filters=${filters}`);
      if (listed.status >= 400) return null;

      let containers: Array<{ Id: string; Image: string; State: string; Created: number }> = [];
      try {
        containers = JSON.parse(listed.text) as typeof containers;
      } catch {
        return null;
      }
      if (containers.length === 0) return null;

      containers.sort((a, b) => (b.Created ?? 0) - (a.Created ?? 0));
      const [keep, ...extras] = containers;
      // Dedupe before anything else — a leftover duplicate is the blank-preview
      // bug waiting to happen, whether or not we end up reusing `keep`.
      await Promise.all(
        extras.map((ctr) =>
          docker("DELETE", `/v1.43/containers/${ctr.Id}?force=true&v=true`).catch(() => undefined),
        ),
      );

      if (keep.Image && image && keep.Image !== image) return null;

      const id = keep.Id;
      if (keep.State !== "running") {
        progress("creating", "Waking the existing sandbox");
        const started = await docker("POST", `/v1.43/containers/${id}/start`);
        // 304 = already running, which is a race we are happy to lose.
        if (started.status >= 400 && started.status !== 304) return null;
      }

      // Prove the project survived. A container whose APP_DIR or node_modules
      // is gone (a failed earlier boot, a manual cleanup) has nothing to offer.
      const probe = await this.exec(
        id,
        `[ -d node_modules ] && [ -f package.json ] && echo LM_WARM`,
      );
      if (!probe.stdout.includes("LM_WARM")) return null;

      // Remove files the project no longer has.
      //
      // The cold path got this for free: a fresh container starts empty, so a
      // renamed or deleted file simply is not there. Reuse inherits the old
      // disk, and writeFiles only ever adds or overwrites — so without this, a
      // file the user renamed yesterday is still sitting in the container,
      // still being served, and still importable. That is the kind of
      // difference that makes a warm preview behave unlike a cold one, which
      // is exactly what nobody can debug.
      //
      // Safe here specifically because `files` is the project's COMPLETE file
      // set read from the database. Never do this from an incremental caller.
      await this.pruneRemovedFiles(id, files);

      progress("writing", "Syncing changed files");
      // Incremental by content hash — an unchanged project writes nothing, so
      // vite is not disturbed at all and HMR keeps whatever state it had.
      const { written } = await this.writeFiles(id, files);

      let logs = "";
      // Only reinstall when the dependency manifest itself moved. A source-only
      // edit needs no install, and running one anyway would hand back the very
      // cold-start cost this path exists to avoid.
      if (written.some((p) => p === "package.json" || p.endsWith("/package.json"))) {
        progress("installing", "Updating dependencies");
        const res = await this.exec(
          id,
          "npm install --no-audit --no-fund --prefer-offline --progress=false --loglevel=error",
        );
        logs += res.stdout + res.stderr;
        if (res.exitCode && res.exitCode !== 0) {
          // A broken install on a warm container is a real failure, but the
          // cold path may still succeed from a clean tree — let it try.
          return null;
        }
      }

      // The supervisor loop is an exec, and execs do not survive a container
      // stop — so a woken container needs one started, while a container that
      // was merely idle already has one.
      //
      // Which it is MUST be decided by looking, not by whether vite answers
      // right now. A supervisor whose vite is mid-restart answers nothing for a
      // second or two, and starting a second loop on that evidence gives the
      // container two of them, each stealing the port from the other on every
      // cycle. That flaps the preview indefinitely and is far worse than the
      // cold start being avoided.
      let up = await this.waitForLocalServer(id, innerPort, 1500);
      if (!up) {
        const running = await this.exec(
          id,
          `ps 2>/dev/null | grep -q "[${SUPERVISOR_TAG[0]}]${SUPERVISOR_TAG.slice(1)}" && echo LM_SUP_UP`,
          "/",
        );
        if (running.stdout.includes("LM_SUP_UP")) {
          // Someone is already supervising — give its restart loop the time it
          // needs rather than adding a competitor.
          up = await this.waitForLocalServer(id, innerPort, opts.readyBudgetMs);
        } else {
          const cmd = opts.startCommand ?? `npx vite --host 0.0.0.0 --port ${innerPort}`;
          progress("starting", cmd);
          await this.exec(id, supervisorCommand(cmd), APP_DIR, false, true);
          up = await this.waitForLocalServer(id, innerPort, opts.readyBudgetMs);
        }
      }

      const previewUrl = await this.getPreviewUrl(id);
      if (!previewUrl) return null;

      // Keep the GC's idle clock honest: this container was just used.
      void this.exec(id, "touch /tmp/.lm-keepalive", "/", false, true).catch(() => undefined);

      return { ok: true, sandboxId: id, previewUrl, ready: up, logs: trunc(logs, 4000) };
    } catch {
      return null;
    }
  }

  /**
   * Delete files present in the container's sync manifest but absent from the
   * project's current file set — renames and deletions, in other words.
   *
   * ONLY call this with a complete file set. Given a partial one it would read
   * every unsent file as deleted and empty the project.
   *
   * Deliberately conservative: it can only remove paths the manifest says WE
   * uploaded, so nothing the container generated (node_modules, .vite caches,
   * the manifest itself) is reachable, and a missing or unparseable manifest
   * removes nothing at all.
   */
  private async pruneRemovedFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    try {
      const read = await this.exec(
        sandboxId,
        `cat ${APP_DIR}/${SYNC_MANIFEST} 2>/dev/null || true`,
        "/",
      );
      const raw = read.stdout ?? "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) return;

      const prev = JSON.parse(raw.slice(start, end + 1)) as Record<string, string>;
      const gone = filesToPrune(Object.keys(prev), files.map((f) => f.path));
      if (gone.length === 0) return;

      // Single exec, quoted paths. Directories left behind are harmless; only
      // files are served.
      const quoted = gone.map((p) => `'${p.replace(/'/g, `'\\''`)}'`).join(" ");
      await this.exec(sandboxId, `rm -f -- ${quoted}`, APP_DIR);
    } catch {
      /* pruning is an optimisation of correctness, never a reason to fail a boot */
    }
  }

  /**
   * Poll the dev server from INSIDE the container until it answers.
   *
   * Each attempt is one `exec` over the Docker socket — a few tens of
   * milliseconds, no network egress — so this can poll tightly at first and
   * report readiness within a second of vite binding the port, rather than up
   * to a full poll interval late.
   *
   * `wget -q -O /dev/null -T 3` treats any HTTP response as success, including
   * a 404: the question is whether the server is accepting requests, and the
   * dev server answering *anything* proves that. Busybox wget ships in
   * node:*-alpine; on a Debian-based image `curl` is the fallback and the
   * `nc -z` third branch covers an image with neither.
   */
  private async waitForLocalServer(
    sandboxId: string,
    port: number,
    timeoutMs: number,
  ): Promise<boolean> {
    const probe =
      `wget -q -O /dev/null -T 3 http://127.0.0.1:${port}/ 2>/dev/null || ` +
      `curl -fsS -m 3 -o /dev/null http://127.0.0.1:${port}/ 2>/dev/null || ` +
      `nc -z 127.0.0.1 ${port} 2>/dev/null`;
    const deadline = Date.now() + timeoutMs;
    // Back off from 250ms to 2s: a warm boot answers almost immediately and
    // shouldn't pay a fixed poll interval, while a cold npm-install boot
    // shouldn't hammer the socket for two minutes.
    let delay = 250;
    while (Date.now() < deadline) {
      const res = await this.exec(sandboxId, `${probe} && echo LM_UP`);
      if (res.stdout.includes("LM_UP")) return true;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 2000);
    }
    return false;
  }

  /**
   * `workdir` defaults to the project dir. Pass "/" for anything that runs
   * BEFORE the project dir exists — exec fails outright if WorkingDir is
   * missing, so the bootstrap mkdir can't use the default.
   *
   * `detach`: run the command in the background and return immediately WITHOUT
   * attaching. This is the ONLY reliable way to leave a long-running process
   * (the dev server) alive: an attached exec (`Detach:false`) is torn down when
   * its main process returns, taking every descendant with it regardless of
   * nohup/setsid/&. Detached execs get no stdout and no exit code back.
   */
  async exec(
    sandboxId: string,
    command: string,
    workdir = APP_DIR,
    tty = true,
    detach = false,
  ): Promise<CommandResult> {
    const create = await docker("POST", `/v1.43/containers/${sandboxId}/exec`, {
      // A detached exec cannot attach streams; asking to would error.
      AttachStdout: !detach,
      AttachStderr: !detach,
      WorkingDir: workdir,
      Tty: detach ? false : tty,
      Cmd: ["sh", "-c", command],
    });
    if (create.status >= 400) {
      return { stdout: "", stderr: `exec create failed: ${create.text}`, exitCode: 1 };
    }
    const execId = (JSON.parse(create.text) as { Id: string }).Id;
    const run = await docker("POST", `/v1.43/exec/${execId}/start`, {
      Detach: detach,
      Tty: detach ? false : tty,
    });
    if (detach) {
      // Fire-and-forget: the daemon owns the process now. No output, no wait.
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    const inspect = await docker("GET", `/v1.43/exec/${execId}/json`);
    let exitCode = 0;
    try {
      exitCode = (JSON.parse(inspect.text) as { ExitCode: number }).ExitCode ?? 0;
    } catch { /* keep 0 */ }
    return { stdout: run.text, stderr: "", exitCode };
  }

  async getDevLogs(sandboxId: string, lines = 200): Promise<string> {
    const res = await this.exec(sandboxId, `tail -n ${lines} ${DEV_LOG} 2>/dev/null || true`);
    return trunc(res.stdout);
  }

  async writeFiles(
    sandboxId: string,
    files: SandboxFile[],
  ): Promise<{ written: string[] }> {
    // INCREMENTAL SYNC — upload only files whose CONTENT actually changed.
    //
    // Why this is load-bearing for a clean first paint: every editor open does
    // a full baseline sync. Uploading the whole project refreshes every file's
    // mtime — including vite.config.ts / tsconfig.json / .env — and vite's OWN
    // config watcher does a FULL SERVER RESTART on any config-file change event
    // (mtime alone is enough; identical content does not matter). So every
    // editor open knocked the dev server down for ~2-3s, and the preview
    // iframe's first paint landed exactly in that window → Bad Gateway / blank
    // until a manual refresh. Diffing against a content-hash manifest stored in
    // the container means an open with no edits writes NOTHING, vite never
    // restarts, and the first paint is clean. Real edits still upload and HMR.
    //
    // The manifest lives in the container (not the DB) so it always describes
    // THIS container's actual disk state: fresh containers have none (full
    // upload, correct), and out-of-band container changes at worst cause a
    // redundant re-upload (safe), never a skipped write of real changes.
    const norm = (p: string) => p.replace(/\\/g, "/");
    const hashes: Record<string, string> = {};
    for (const f of files) {
      hashes[norm(f.path)] = createHash("sha1").update(f.content ?? "").digest("hex");
    }

    let prev: Record<string, string> | null = null;
    try {
      // tty=true (default) keeps the output a single raw stream (no Docker
      // stream-multiplexing frame headers). The manifest is compact JSON on one
      // line, so tty CRLF translation cannot corrupt it. Any parse failure
      // falls back to a full upload — worst case is today's behavior.
      const read = await this.exec(
        sandboxId,
        `cat ${APP_DIR}/${SYNC_MANIFEST} 2>/dev/null || true`,
        "/",
      );
      const raw = read.stdout ?? "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        prev = JSON.parse(raw.slice(start, end + 1)) as Record<string, string>;
      }
    } catch {
      prev = null;
    }

    let toWrite = files;
    if (prev) {
      toWrite = files.filter((f) => prev![norm(f.path)] !== hashes[norm(f.path)]);
      // Nothing changed → write NOTHING. Even rewriting just the manifest is
      // pointless churn; skipping the upload entirely is what keeps vite quiet.
      if (toWrite.length === 0) return { written: [] };
    }

    const payload: SandboxFile[] = [
      ...toWrite,
      { path: SYNC_MANIFEST, content: JSON.stringify(hashes) },
    ];
    const res = await docker(
      "PUT",
      `/v1.43/containers/${sandboxId}/archive?path=${encodeURIComponent(APP_DIR)}`,
      undefined,
      buildTar(payload),
    );
    // Throw rather than swallow: this is how an AI edit reaches the running
    // preview. Ignoring the status makes a failed write look like a successful
    // one that Vite just didn't pick up — the user then chases a phantom
    // hot-reload bug while the container still holds the old code.
    if (res.status >= 400) {
      throw new Error(`sandbox writeFiles failed (${res.status}): ${trunc(res.text, 300)}`);
    }
    // Report what ACTUALLY landed so callers can gate side effects (npm
    // install, vite restart) on real changes instead of on what the client
    // happened to send — the editor's baseline sync sends the FULL file set.
    return { written: toWrite.map((f) => norm(f.path)) };
  }

  /**
   * Type-check the project in place, with its own installed dependencies.
   *
   * This is the only correctness check in the system that can distinguish a
   * real import from a plausible-looking one. Everything else — the ~580 lines
   * of `validateGeneratedFiles`, the export-contract scanner, the JSX balance
   * tokenizer — is a regex over source text, and no amount of regex can know
   * whether `@tanstack/react-router` actually exports `Body` at the version
   * this project installed. The compiler can, because it is reading the very
   * `.d.ts` files sitting in this container.
   *
   * Deliberately NOT on the boot critical path. `tsc` on a generated app takes
   * seconds, and blocking first paint on it would trade a real regression in
   * perceived speed for a check whose findings are just as useful ten seconds
   * later. Callers should fire this after the preview reports ready.
   */
  async typecheckProject(
    sandboxId: string,
    opts: { timeoutSec?: number } = {},
  ): Promise<TypecheckResult> {
    const timeoutSec = Math.max(10, Math.min(opts.timeoutSec ?? 90, 300));
    const started = Date.now();

    // `npx tsc` would try to DOWNLOAD TypeScript when the project has none,
    // which on a sandbox with no npm registry access hangs until the timeout
    // and on one with access silently installs a package the project never
    // asked for. Probe for the locally installed binary instead, and report
    // "unavailable" rather than inventing a toolchain.
    const probe = await this.exec(
      sandboxId,
      `[ -x node_modules/.bin/tsc ] && echo LM_TSC_OK`,
    );
    if (!probe.stdout.includes("LM_TSC_OK")) {
      return {
        available: false,
        diagnostics: [],
        durationMs: Date.now() - started,
        reason: "no local TypeScript in the project",
      };
    }

    // --pretty false is required, not cosmetic: the exec allocates a TTY, so
    // tsc's default pretty output would come back colour-escaped and split
    // across several lines per diagnostic, which is unparseable.
    // Exit code 124 is `timeout`'s signal that it killed the process.
    const res = await this.exec(
      sandboxId,
      `timeout ${timeoutSec} node_modules/.bin/tsc --noEmit --pretty false 2>&1; echo "LM_TSC_EXIT:$?"`,
    );

    const raw = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    const exitMatch = raw.match(/LM_TSC_EXIT:(\d+)/);
    const exitCode = exitMatch ? Number(exitMatch[1]) : undefined;
    const timedOut = exitCode === 124 || exitCode === 137;

    return {
      available: true,
      diagnostics: parseTscOutput(raw.replace(/LM_TSC_EXIT:\d+\s*$/, ""), {
        appDir: APP_DIR,
      }),
      durationMs: Date.now() - started,
      timedOut,
    };
  }

  async getPreviewUrl(sandboxId: string): Promise<string> {
    const c = cfg();
    const res = await docker("GET", `/v1.43/containers/${sandboxId}/json`);
    try {
      const info = JSON.parse(res.text) as {
        Config?: { Labels?: Record<string, string> };
        NetworkSettings?: { Ports?: Record<string, Array<{ HostPort: string }>> };
      };
      // Proxy mode publishes NO host ports — the hostname lives in the Traefik
      // router rule label set at create time. Without this branch, reconnect()
      // in production always returned "Could not resolve the container's port."
      // right after a successful boot, erroring the preview.
      if (c.routeViaProxy) {
        for (const [k, v] of Object.entries(info.Config?.Labels ?? {})) {
          if (!/^traefik\.http\.routers\..+\.rule$/.test(k)) continue;
          const m = v.match(/Host\(`([^`]+)`\)/);
          if (m) return `https://${m[1]}`;
        }
      }
      const first = Object.values(info.NetworkSettings?.Ports ?? {})[0]?.[0]?.HostPort;
      if (first) return `${c.scheme}://${c.publicHost}:${first}`;
    } catch { /* fall through */ }
    return "";
  }

  async reconnect(sandboxId: string): Promise<SandboxRunResult> {
    const res = await docker("GET", `/v1.43/containers/${sandboxId}/json`);
    if (res.status >= 400) {
      return { ok: false, error: "Container no longer exists." };
    }
    try {
      const info = JSON.parse(res.text) as { State?: { Running?: boolean } };
      if (!info.State?.Running) return { ok: false, error: "Container is not running." };
    } catch { /* treat as running */ }
    const previewUrl = await this.getPreviewUrl(sandboxId);
    if (!previewUrl) return { ok: false, error: "Could not resolve the container's port." };

    // "Running" is a statement about the container, not about the app. The
    // container's pid 1 is `sleep infinity`, so it stays Running through a vite
    // crash, an OOM of the dev server, and the entire cold-start window — every
    // one of which serves a 502 through Traefik. Reconnect is the editor's
    // FIRST call on every open, so answering ok:true here on that evidence
    // alone is a direct route to Bad Gateway in the pane.
    //
    // A short local probe settles it. It costs one exec (~100ms) when the app
    // is up, which is the common case; when it's down, waiting a beat is
    // exactly what the caller needs to know about.
    const innerPort = await this.portFor(sandboxId).catch(() => null);
    const ready =
      innerPort == null ? true : await this.waitForLocalServer(sandboxId, innerPort, 2500);

    return { ok: true, sandboxId, previewUrl, ready };
  }

  async keepAlive(
    sandboxId: string,
    opts?: { previewUrl?: string },
  ): Promise<{ alive: boolean; tunnelHealthy?: boolean; restarted?: boolean }> {
    const re = await this.reconnect(sandboxId);
    if (!re.ok) return { alive: false };

    // Activity marker for the host GC: the gc script reaps sandboxes whose
    // marker is stale (idle), NOT by creation age — reaping by age was cutting
    // off users mid-edit at the 6h mark ("preview goes blank after some time").
    // Detached fire-and-forget: never delays the heartbeat response.
    void this.exec(sandboxId, "touch /tmp/.lm-keepalive", "/", false, true).catch(
      () => undefined,
    );

    if (!opts?.previewUrl) return { alive: true };
    const healthy = await waitForServer(opts.previewUrl, 3000);
    if (healthy) return { alive: true, tunnelHealthy: true };

    // GRACE WINDOW — the tunnel being down while the container is alive almost
    // always means vite is mid-restart (config re-sync triggers a FULL vite
    // restart; the in-container supervisor loop revives it within ~1-2s).
    // Reporting tunnelHealthy:false immediately made the client declare the
    // sandbox dead and COLD-REBOOT a brand-new container — which, before the
    // one-per-project teardown, stacked duplicates behind one hostname and
    // caused the dual-React blank. Wait out the restart window and re-probe;
    // only report dead if the tunnel stays down.
    const recovered = await waitForServer(opts.previewUrl, 9000);
    if (recovered) {
      // The iframe may be stuck on a connection-reset page from the brief
      // outage — `restarted` tells the client to bump its reload nonce.
      return { alive: true, tunnelHealthy: true, restarted: true };
    }

    // The tunnel is not answering US. That is not the same as the app being
    // down, and the difference matters enormously: `tunnelHealthy: false`
    // makes the client tear down the container and cold-boot a replacement.
    // Right after a first boot the hostname's certificate may still be
    // mid-issuance (ACME HTTP-01), so an HTTPS probe from this server fails
    // while the user's browser — moments later, once the cert lands — would
    // have been served fine. Rebooting there is not just wasteful, it restarts
    // the same race and can loop.
    //
    // So before condemning the sandbox, ask the app directly. If it answers on
    // localhost the problem is the edge, and the right move is to leave the
    // container alone and let the next heartbeat re-probe.
    const innerPort = await this.portFor(sandboxId).catch(() => null);
    if (innerPort != null) {
      const localUp = await this.waitForLocalServer(sandboxId, innerPort, 4000);
      // `restarted` is set on purpose. We got here because the tunnel refused
      // us at least twice, which means the iframe may be sitting on a Bad
      // Gateway page — and browsers never retry those on their own. The client
      // reads this as "bump the reload nonce", which is exactly the recovery
      // needed, whereas tunnelHealthy:false would throw away a container whose
      // app is demonstrably serving.
      if (localUp) return { alive: true, tunnelHealthy: true, restarted: true };
    }
    return { alive: true, tunnelHealthy: false };
  }

  /** The port the dev server was started on, read back from the container. */
  private async portFor(sandboxId: string): Promise<number | null> {
    const res = await docker("GET", `/v1.43/containers/${sandboxId}/json`);
    if (res.status >= 400) return null;
    try {
      const info = JSON.parse(res.text) as {
        Config?: { ExposedPorts?: Record<string, unknown>; Labels?: Record<string, string> };
      };
      // Proxy mode records it on the Traefik service label; port mode exposes
      // exactly one port. Either way there is only ever one dev server.
      for (const [k, v] of Object.entries(info.Config?.Labels ?? {})) {
        if (/^traefik\.http\.services\..+\.loadbalancer\.server\.port$/.test(k)) {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
      }
      const exposed = Object.keys(info.Config?.ExposedPorts ?? {})[0];
      const n = Number((exposed ?? "").split("/")[0]);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  /**
   * Enforce ONE live sandbox per project. The preview hostname is STABLE PER
   * PROJECT (see previewHost), so a leftover sandbox from a prior run still
   * carries Traefik labels for the same Host() rule. Traefik then sees TWO (or
   * more) backends for that hostname and ROUND-ROBINS across them — the browser
   * loads `react.js` from one vite server and `react-dom.js` from another, so
   * the module graph ends up with two physical copies of React. That surfaces
   * as "Invalid hook call … more than one copy of React" → `useRef` of null in
   * <BrowserRouter> → a permanently BLANK preview, no matter what resolve.dedupe
   * the config sets (dedupe only collapses copies WITHIN one vite instance).
   *
   * Removing every existing container for the project before creating the new
   * one guarantees Traefik always points the hostname at a single vite server.
   */
  private async removeProjectContainers(projectId: string): Promise<void> {
    if (!projectId) return;
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`lifemark.project=${projectId}`] }),
    );
    const res = await docker("GET", `/v1.43/containers/json?all=1&filters=${filters}`);
    if (res.status >= 400) return;
    let list: Array<{ Id: string }> = [];
    try {
      list = JSON.parse(res.text) as Array<{ Id: string }>;
    } catch {
      return;
    }
    await Promise.all(
      list.map((ctr) =>
        docker("DELETE", `/v1.43/containers/${ctr.Id}?force=true&v=true`).catch(
          () => undefined,
        ),
      ),
    );
  }

  async kill(sandboxId: string): Promise<void> {
    // Free the port first so a crash mid-teardown doesn't leak the allocation.
    try {
      const url = await this.getPreviewUrl(sandboxId);
      const port = Number(url.split(":").pop());
      if (Number.isFinite(port)) claimedPorts.delete(port);
    } catch { /* ignore */ }
    await docker("DELETE", `/v1.43/containers/${sandboxId}?force=true&v=true`);
  }

  async runClaudeCode(): Promise<ClaudeCodeResult> {
    // Intentionally unimplemented: the in-app ReAct agent covers this, and
    // running Claude Code here would need an Anthropic key inside an untrusted
    // container. Return a clear error rather than a confusing silent failure.
    return { ok: false, error: "Claude Code is not supported on the self-hosted Docker provider." };
  }
}
