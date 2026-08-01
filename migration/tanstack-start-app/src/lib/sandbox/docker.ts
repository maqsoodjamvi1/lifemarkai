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
} from "./index";
import { DEFAULT_TIMEOUT_MS, trunc, waitForServer } from "./shared";

const DEV_LOG = "/tmp/lifemark-dev.log";
/** Content-hash manifest for incremental writeFiles — lives in APP_DIR. */
const SYNC_MANIFEST = ".lm-sync-manifest.json";

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
        progress("installing", "Installing dependencies");
        const res = await this.exec(id, "npm install --no-audit --no-fund");
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
      const supervised =
        `while true; do ${cmd} >> ${DEV_LOG} 2>&1; ` +
        `echo "[supervisor] dev server exited ($(date -u +%H:%M:%S)); restarting" >> ${DEV_LOG}; ` +
        `sleep 1; done`;
      await this.exec(id, supervised, APP_DIR, false, true);

      const previewUrl = c.routeViaProxy
        ? `https://${previewHost}`
        : `${c.scheme}://${c.publicHost}:${hostPort}`;
      // Wait for a real response — returning before the server listens hands the
      // iframe a dead URL and paints a blank pane.
      //
      // When the Lifemark app itself runs in Docker and SANDBOX_PUBLIC_HOST is
      // localhost/127.0.0.1 (browser-reachable on the Docker Desktop host),
      // probing that URL from inside the app container hairpins to the app
      // container — not the published sandbox port. Probe via the host gateway
      // instead; still return the localhost URL to the browser.
      const probeHost =
        !c.routeViaProxy &&
        (c.publicHost === "localhost" || c.publicHost === "127.0.0.1")
          ? "host.docker.internal"
          : null;
      const probeUrl =
        probeHost && hostPort != null
          ? `${c.scheme}://${probeHost}:${hostPort}`
          : previewUrl;
      const ready = await waitForServer(probeUrl, Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000));

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
          `\n[preview] --- ${DEV_LOG} (tail) ---\n${devLog.stdout.trim() || "(empty)"}` +
          `\n[preview] --- processes ---\n${procs.stdout.trim() || "(none)"}`;
      }

      return {
        ok: true,
        sandboxId: id,
        previewUrl,
        logs: trunc(logs, 4000),
      };
    } catch (err) {
      claimedPorts.delete(hostPort);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
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
    return { ok: true, sandboxId, previewUrl };
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
    return { alive: true, tunnelHealthy: false };
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
