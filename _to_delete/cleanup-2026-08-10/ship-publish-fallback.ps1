# Publish must not claim a hostname that cannot serve HTTPS.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-publish-fallback-result.txt"
"=== SHIP PUBLISH FALLBACK $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "migration/tanstack-start-app/src/lib/deploy/branded-deploy-url.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(publish): stop claiming a hostname that cannot serve HTTPS

buildLifemarkDeployUrl always returned {slug}.apps.lifemarkai.com. That is why
62 projects carried deploy URLs and not one loaded: the pretty hostname was
written unconditionally while DNS had no *.apps record and Traefik had neither a
router nor a certificate for it. The publish reported success and handed the user
a dead link, which is the worst possible combination because nothing anywhere
said otherwise.

A hostname works only when THREE things are true: DNS resolves, the proxy routes
it, and a valid certificate exists. Measured tonight, in order: DNS was added and
now resolves (a1.apps and zz9.apps both reach the VPS), but Traefik still answers
404 for that Host and still presents TRAEFIK DEFAULT CERT. Two of three. The
pretty URL would still be dead.

So the apps host is now behind an explicit LIFEMARK_APPS_DOMAIN_READY=true, off
by default. Deliberately NOT inferred from a DNS lookup: DNS is the part people
fix first and the part that proves least, and inferring readiness from it would
have produced dead links again tonight with the flag doing nothing.

Until that flag is set, publishing returns https://lifemarkai.com/preview-by-slug/
<slug> - unglamorous, and it actually works: that certificate is already valid and
the route serves the stored build directly rather than redirecting. It points at
/preview-by-slug and NOT at /app/:slug, because /app/:slug reads deployed_url and
redirects to whatever it finds, so aiming it back at itself would spin forever.

On using *.preview instead, which was suggested: it does not help. DNS was never
the blocker for either domain. I probed probe123.preview.lifemarkai.com and
Traefik serves the same default self-signed certificate there. Sandboxes get
valid certs on that domain only because each container registers its own router
with a certresolver - one cert per hostname, against a 50-per-week ceiling.
Published apps would need exactly the same. Swapping the domain moves nothing.

Verified with 11 assertions covering both flag states, the branded host (which
still wins and is untouched), the no-slug path, and a negative control. Five of
those check that "", "false", "1", "yes" and "TRUE" all leave the apps host
DISABLED - the flag fails closed on anything that is not exactly "true", because
a truthy-looking value silently enabling a dead hostname is the whole bug again.
'@

$f = "D:\Projects\lifemarkai\.git\PUBFB_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
