# Published apps must load their own assets.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-asset-paths-result.txt"
"=== SHIP ASSET PATHS $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- `
  "migration/tanstack-start-app/src/lib/deploy/build-store.ts" `
  "migration/tanstack-start-app/src/routes/preview-by-slug/`$.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(publish): rewrite asset URLs so a published app can actually load

`vite build` emits root-absolute asset paths: <script src="/assets/index-4f3c1b.js">.
Served at lifemarkai.com/preview-by-slug/my-app, the browser resolves that
against the ORIGIN and requests lifemarkai.com/assets/index-4f3c1b.js, which has
no route and returns the app's HTML 404 page. HTML arrives where JavaScript was
expected, the console says "Unexpected token '<'", and you go hunting for a
syntax error that does not exist. The document loads with an empty root and
nothing renders.

index.html now has its root-absolute src/href prefixed with the serving base, so
every asset lands back on the one route that exists. Works unchanged whether the
app is reached by path or later by hostname. Only the HTML is touched; assets are
served byte-for-byte.

Deliberately NOT rewritten: absolute URLs, protocol-relative (//cdn...), data:,
blob:, anchors and already-relative paths. Rewriting any of those breaks external
resources, so the regex requires a single leading slash.

THE REWRITER IS IDEMPOTENT, and it was not at first. My own assertion for the
second application failed: applying it twice produced
/preview-by-slug/app/preview-by-slug/app/assets/..., every asset 404s, page
renders blank - from a function that looks obviously correct read once. It does
not bite in today's flow because stored HTML is always pristine, but it is a trap
for the next caller. The guard is boundary-aware (/preview-by-slug-other/ is
still rewritten) rather than a substring match, and that case is asserted too.

VERIFIED AGAINST THE LIVE DATABASE, not just in unit tests: stored a build of
three files including a real 1x1 PNG, read it back, and compared sha256. The
bytes match exactly. The same test also demonstrates the corruption this guards
against is real rather than theoretical - that PNG read as utf-8 goes from 70
bytes to 94, because every invalid sequence becomes U+FFFD. It also confirms
live_build_id flips only AFTER the files are written, so a visitor can never
resolve a build id whose rows are still being inserted. All test data removed and
the removal verified.

9 rewriter assertions plus 6 database assertions, each suite with a negative
control.

Still not done: the *.apps.lifemarkai.com hostnames. DNS resolves; Traefik has no
router and no certificate (confirmed on the box - zero acme lines ever, only
httpchallenge flags, no HOSTINGER_API_TOKEN, acme.json untouched since Jul 29).
A CORRECTION: I previously said DNS-01 was required, citing the 50-certs-per-week
limit. Only FIVE projects are real - the other 57 public ones are lifemarkai-demo
seeds - so per-host HTTP-01 on the existing resolver is fine and no API token is
needed. I had carried over a comment written about sandbox previews, where
hostnames churn constantly, without checking the numbers were comparable.
'@

$f = "D:\Projects\lifemarkai\.git\ASSET_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
