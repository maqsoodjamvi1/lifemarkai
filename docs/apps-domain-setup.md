# Serving published apps on `*.apps.lifemarkai.com`

Written 2026-08-01. Everything below was verified against the live system, not
assumed — where a fact was checked, the check is named.

## What was actually wrong

Publishing was a simulation. `routes/api/deploy.ts`, `provider: "lifemarkai"`:

```ts
await new Promise((r) => setTimeout(r, 2500));
deployedUrl = lifemarkUrl();
```

It slept, wrote `{app_slug}.apps.lifemarkai.com` into `projects.deployed_url`,
and built nothing. Measured on 2026-08-01: **62 public projects, 0 reachable.**

- 60 had no `deployed_url` at all, so `/app/<slug>` redirected to
  `/preview/<id>`, which answered **503 "Modal preview required"** — pointing at
  Modal, which this project no longer uses.
- The 2 that did have one pointed at `*.apps.lifemarkai.com`, which **had no DNS
  record** (`NXDOMAIN`). The connection failed before TLS.

Three independent gaps: no DNS, no certificate, and no content.

## 1. DNS (yours to do)

Hostinger → DNS zone for `lifemarkai.com`:

| Type | Name    | Value            |
|------|---------|------------------|
| A    | `*.apps`| `187.124.118.56` |

You already have exactly this shape for `*.preview` — confirmed by resolving two
random names (`aaa.preview…` and `zzz9.preview…`), both of which return the VPS.

## 2. Certificate (yours to do — it needs an API token)

**The constraint, in your own code** (`lib/sandbox/docker.ts:388`): Coolify's
Traefik uses the ACME **HTTP-01** challenge, which cannot issue wildcards. Every
hostname needs its own certificate and [Let's Encrypt allows 50 per registered
domain per week](https://letsencrypt.org/docs/rate-limits/). With 62 apps you
exhaust that immediately, and the failure surfaces as an opaque TLS error that
looks nothing like a rate limit.

So `*.apps` needs a **wildcard cert via DNS-01**. Verified this works on your
exact stack:

- Coolify proxy image is **`traefik:v3.6`** (read from the proxy compose file)
- `traefik v3.6` `go.mod` requires **`github.com/go-acme/lego/v5 v5.3.1`**
- lego **v5.3.1 contains `providers/dns/hostinger/`** (fetched the file; it
  returns 200 at v4.27.0 and v5.3.1, 404 at v4.26.0 — the provider landed in 4.27)
- The provider key is `hostinger`, and it reads **`HOSTINGER_API_TOKEN`**

In **Coolify → Servers → localhost → Proxy**, add to the `traefik` service:

```yaml
    environment:
      # Generate in Hostinger with DNS edit rights. Paste it here yourself —
      # it is a credential and does not belong in the repo or a chat log.
      - HOSTINGER_API_TOKEN=
    command:
      # …keep every existing --flag, then add:
      - '--certificatesresolvers.hostingerdns.acme.dnschallenge=true'
      - '--certificatesresolvers.hostingerdns.acme.dnschallenge.provider=hostinger'
      - '--certificatesresolvers.hostingerdns.acme.email=maqsoodjamvi@gmail.com'
      - '--certificatesresolvers.hostingerdns.acme.storage=/traefik/acme-dns.json'
```

Then a router for the wildcard, pointing at the main app container:

```yaml
      - 'traefik.http.routers.lifemark-apps.rule=HostRegexp(`^[a-z0-9-]+\.apps\.lifemarkai\.com$`)'
      - 'traefik.http.routers.lifemark-apps.entrypoints=https'
      - 'traefik.http.routers.lifemark-apps.tls=true'
      - 'traefik.http.routers.lifemark-apps.tls.certresolver=hostingerdns'
      - 'traefik.http.routers.lifemark-apps.tls.domains[0].main=apps.lifemarkai.com'
      - 'traefik.http.routers.lifemark-apps.tls.domains[0].sans=*.apps.lifemarkai.com'
      - 'traefik.http.routers.lifemark-apps.middlewares=lifemark-apps-prefix'
      - 'traefik.http.middlewares.lifemark-apps-prefix.addprefix.prefix=/preview-by-slug'
```

**Test with the Let's Encrypt staging directory first**
(`--certificatesresolvers.hostingerdns.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`).
A misconfigured DNS-01 resolver burns real quota on every retry, and staging
failures cost nothing. Remove the flag and delete `acme-dns.json` once it works.

## 3. Content (done — commits below)

### Why `addprefix`, and why the app reads the `Host` header

Traefik can rewrite a path but **cannot move the host into it**. The slug lives
in the hostname, so `addprefix` gets the request to the right route and
`preview-by-slug/$.ts` reads `Host` to learn which app it is. The browser's
address bar keeps the clean hostname because the prefix is internal.

`lib/deploy/apps-host.ts` does that parsing and **fails closed**: the bare
domain, nested labels (`a.b.apps.…`), suffix-confusion
(`evil.apps.lifemarkai.com.attacker.net`) and invalid slug characters all return
`null` rather than a guess. Serving one customer's app on another's hostname is
the failure this prevents, so every uncertain case refuses.

### What publishing does now

`lib/deploy/publish-build.ts` runs a real `vite build`, and
`lib/deploy/build-store.ts` stores the output (migration 160). Static sites skip
the compile. On failure the deployment is marked `failed` with the reason in
`build_log`, and **no URL is written** — the previous rule was "always claim
success", which is how 62 dead links accumulated.

Served straight from the database. No container per published app, nothing to
keep warm, no idle cost.

### Two bugs fixed on the way

**Binaries were being corrupted.** `build-project.ts` read every build artifact
with `readFile(..., "utf-8")`. That does not throw on a PNG — it returns a string
with every invalid byte replaced by U+FFFD. The old comment argued generated apps
"rarely ship binaries", but `vite build` emits a favicon, and any imported image
or font lands in `dist/`. Assets would have stored, served and rendered broken
with nothing logged. Now classified by extension and base64-encoded.

**`deployments.error` does not exist.** The first version of the failure handler
wrote to it. PostgREST rejects the entire update when one column is unknown, so
the row would have sat at `building` forever with nothing recorded. Caught by
querying `information_schema` before shipping — the same class as the
`deploy_url`/`deployed_url` bug found earlier the same day.

## Still to do after DNS and the certificate exist

- **`ENABLE_SERVER_VITE_BUILD=true`** in Coolify, or publishing refuses with a
  clear message. It is opt-in because `npm install` + `vite build` is heavy; the
  build runs in the web container, so watch memory before enabling it widely.
- **Re-publish the 62 existing projects.** None has a stored build; they were
  never built. Until re-published they correctly report as unpublished rather
  than pretending.
- **`/p/<username>/<slug>` is still broken** and unrelated to any of this: all 3
  profiles have `username = NULL`, so those links are literally `/p/null/…`.
  Either backfill usernames or drop that route.
