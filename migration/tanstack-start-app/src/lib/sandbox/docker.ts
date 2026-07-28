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
import type {
  ClaudeCodeResult,
  CommandResult,
  SandboxFile,
  SandboxProvider,
  SandboxRunResult,
} from "./index";
import { DEFAULT_TIMEOUT_MS, trunc, waitForServer } from "./shared";

const DEV_LOG = "/tmp/lifemark-dev.log";

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
      await this.exec(id, `nohup sh -c '${cmd}' > ${DEV_LOG} 2>&1 &`);

      const previewUrl = c.routeViaProxy
        ? `https://${previewHost}`
        : `${c.scheme}://${c.publicHost}:${hostPort}`;
      // Wait for a real response — returning before the server listens hands the
      // iframe a dead URL and paints a blank pane.
      const ready = await waitForServer(previewUrl, Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000));

      return {
        ok: true,
        sandboxId: id,
        previewUrl,
        logs: trunc(logs + (ready ? "" : "\n[preview] dev server slow to start — give it a moment.")),
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
   */
  async exec(sandboxId: string, command: string, workdir = APP_DIR): Promise<CommandResult> {
    const create = await docker("POST", `/v1.43/containers/${sandboxId}/exec`, {
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workdir,
      Cmd: ["sh", "-c", command],
    });
    if (create.status >= 400) {
      return { stdout: "", stderr: `exec create failed: ${create.text}`, exitCode: 1 };
    }
    const execId = (JSON.parse(create.text) as { Id: string }).Id;
    const run = await docker("POST", `/v1.43/exec/${execId}/start`, { Detach: false, Tty: true });
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

  async writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    const res = await docker(
      "PUT",
      `/v1.43/containers/${sandboxId}/archive?path=${encodeURIComponent(APP_DIR)}`,
      undefined,
      buildTar(files),
    );
    // Throw rather than swallow: this is how an AI edit reaches the running
    // preview. Ignoring the status makes a failed write look like a successful
    // one that Vite just didn't pick up — the user then chases a phantom
    // hot-reload bug while the container still holds the old code.
    if (res.status >= 400) {
      throw new Error(`sandbox writeFiles failed (${res.status}): ${trunc(res.text, 300)}`);
    }
  }

  async getPreviewUrl(sandboxId: string): Promise<string> {
    const c = cfg();
    const res = await docker("GET", `/v1.43/containers/${sandboxId}/json`);
    try {
      const info = JSON.parse(res.text) as {
        NetworkSettings?: { Ports?: Record<string, Array<{ HostPort: string }>> };
      };
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
  ): Promise<{ alive: boolean; tunnelHealthy?: boolean }> {
    const re = await this.reconnect(sandboxId);
    if (!re.ok) return { alive: false };
    if (!opts?.previewUrl) return { alive: true };
    const healthy = await waitForServer(opts.previewUrl, 3000);
    return { alive: true, tunnelHealthy: healthy };
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
