# Gap #5 - make the mobile shell buildable.
#
# capacitor.config.ts and the @capacitor/* deps have been in the repo since May, but
# `cap add` was never run, so there are no ios/ or android/ folders and nothing to
# build. CAPACITOR_SETUP.md says as much. This is the step that has to happen on a
# machine with the native toolchains - it cannot be done from a Linux sandbox.
#
# WHAT YOU NEED FIRST
#   Android : Android Studio (or the command-line tools) + a JDK 17+, with
#             ANDROID_HOME set. Works on Windows.
#   iOS     : Xcode + CocoaPods. macOS only - the ios step below will be skipped
#             on Windows, which is expected, not a failure.
#
# Safe to re-run: `cap add` is a no-op when the platform folder already exists.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\setup-mobile-result.txt"
"=== MOBILE SHELL SETUP $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

if (-not (Test-Path ".\capacitor.config.ts")) {
  Log "capacitor.config.ts not found at the repo root - wrong directory?"
  exit 1
}

Log "Installing Capacitor CLI + platform packages (idempotent)..."
npm install --save-dev @capacitor/cli 2>&1 | Out-File $log -Append -Encoding ascii
npm install @capacitor/core @capacitor/android @capacitor/ios 2>&1 | Out-File $log -Append -Encoding ascii

# Capacitor copies a web build into the native shell. The config points webDir at a
# build output; make sure it exists before adding platforms, or `cap add` warns and
# produces an empty shell.
Log ""
Log "Building the web app so there is something to copy..."
npm run build 2>&1 | Out-File $log -Append -Encoding ascii
if ($LASTEXITCODE -ne 0) {
  Log "WEB BUILD FAILED - stopping. Fix the build first; a native shell around a"
  Log "broken build is worse than no shell, because it looks like it works."
  exit 1
}

Log ""
Log "Adding Android platform..."
npx cap add android 2>&1 | Out-File $log -Append -Encoding ascii

if ($IsMacOS) {
  Log ""
  Log "Adding iOS platform..."
  npx cap add ios 2>&1 | Out-File $log -Append -Encoding ascii
} else {
  Log ""
  Log "SKIPPED iOS: requires macOS with Xcode. Run this same script on a Mac to add it."
}

Log ""
Log "Syncing web assets + plugins into the native projects..."
npx cap sync 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log "=== RESULT ==="
if (Test-Path ".\android") { Log "android/ exists - open with: npx cap open android" }
else { Log "android/ MISSING - check the log above for the cap add error" }
if (Test-Path ".\ios") { Log "ios/ exists - open with: npx cap open ios" }
else { Log "ios/ absent (expected on Windows)" }

Log ""
Log "NEXT: commit the new platform folders, or add them to .gitignore if you would"
Log "rather regenerate them in CI. Do not half-commit them - a partially tracked"
Log "native project is the kind of thing that builds locally and fails everywhere else."
Log "DONE"
