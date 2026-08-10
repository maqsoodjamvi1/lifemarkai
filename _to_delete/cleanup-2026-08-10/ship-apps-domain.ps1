# Real publishing: compile, store, serve by hostname.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-apps-domain-result.txt"
"=== SHIP APPS DOMAIN $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- `
  "supabase/migrations/160_project_builds.sql" `
  "docs/apps-domain-setup.md" `
  "migration/tanstack-start-app/src/lib/deploy/asset-kind.ts" `
  "migration/tanstack-start-app/src/lib/deploy/build-store.ts" `
  "migration/tanstack-start-app/src/lib/deploy/publish-build.ts" `
  "migration/tanstack-start-app/src/lib/deploy/apps-host.ts" `
  "migration/tanstack-start-app/src/lib/deploy/build-project.ts" `
  "migration/tanstack-start-app/src/routes/preview-by-slug/`$.ts" `
  "migration/tanstack-start-app/src/routes/api/deploy.ts" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(publish): actually build and serve published apps

Publishing was a simulation. provider 'lifemarkai' did this:

    await new Promise((r) => setTimeout(r, 2500));
    deployedUrl = lifemarkUrl();

It slept 2.5 seconds, wrote {app_slug}.apps.lifemarkai.com into
projects.deployed_url, reported success, and produced nothing.

Measured on the live database and over the public internet: 62 public projects,
0 reachable. 60 had no deployed_url, so /app/<slug> redirected to /preview/<id>
which answered 503 "Modal preview required" - naming Modal, which this project
no longer uses. The other 2 pointed at *.apps.lifemarkai.com, which had no DNS
record at all; the connection failed before TLS was even negotiated.

Publishing now compiles the project with a real vite build, stores the output
(migration 160: project_builds + projects.live_build_id), and serves those files
straight from the database. No container per published app, nothing kept warm,
no idle cost. On failure the deployment is marked failed with the reason in
build_log and NO URL is written - the old behaviour of always claiming success
is exactly how 62 dead links accumulated unnoticed.

Traefik can rewrite a path but cannot move the host into it, so the slug arrives
in the Host header. lib/deploy/apps-host.ts parses it and FAILS CLOSED: the bare
domain, nested labels (a.b.apps.*), suffix confusion
(evil.apps.lifemarkai.com.attacker.net) and invalid slug characters all return
null rather than a best guess. Serving one customer's app on another customer's
hostname is the failure that matters here, so every uncertain case refuses.

TWO BUGS FOUND WHILE BUILDING THIS.

Binary assets were being corrupted. build-project.ts read every artifact with
readFile(..., "utf-8"), and its comment argued generated apps "rarely ship
binaries - images come from URLs". But vite build emits a favicon, and any
imported image or font lands in dist/ regardless. Reading a PNG as utf-8 does
not throw: it returns a string with every invalid byte sequence replaced by
U+FFFD. The asset would have stored, served and rendered broken with nothing
logged anywhere. Now classified by extension and base64-encoded, with the
classification in ONE module rather than duplicated - two copies of a
text/binary list is how a font ends up base64 on write and utf-8 on read.

deployments.error does not exist. My first version of the failure handler wrote
to it. PostgREST rejects the whole update when a column is unknown, so a failed
deploy would have sat at "building" forever with nothing recorded - a bug whose
only symptom is silence. Caught by querying information_schema before shipping,
not after. Same class as the deploy_url/deployed_url bug found earlier today,
which is why I checked.

Verified: 20 assertions on host parsing, asset classification and path
normalisation, including path traversal and a negative control proving the suite
can fail. Migration applied to the live database and checked - table present,
RLS on, exactly one policy. That policy is scoped `TO authenticated` because
without it Postgres grants to `public`, which includes anon; it returned no rows
either way, but an anonymous REST read was run to confirm rather than assume.

NOT DONE, and it does not work until these happen: DNS has no *.apps record, and
Coolify's Traefik uses HTTP-01 which cannot issue a wildcard (50 certs per
domain per week - 62 apps exhausts it immediately). Traefik v3.6 bundles lego
v5.3.1, which does contain the Hostinger DNS-01 provider, so a wildcard is
reachable. Steps, with the token left blank, are in docs/apps-domain-setup.md.
ENABLE_SERVER_VITE_BUILD must also be set, and the 62 existing projects need
re-publishing - none has a stored build, and until then they honestly report as
unpublished instead of pretending.
'@

$f = "D:\Projects\lifemarkai\.git\APPS_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
