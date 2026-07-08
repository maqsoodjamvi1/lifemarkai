# Desktop App Release Runbook

Everything **in code** for the LifemarkAI desktop apps is done:
`electron/main.js` (window + menu + external-link handling), `electron/preload.js`
(contextBridge), `electron/electron-builder.yml` (mac dmg/zip x64+arm64, win nsis/portable,
linux AppImage/deb/rpm, GitHub publish), `electron/assets/entitlements.mac.plist`,
`capacitor.config.ts` (mobile shell), app icons, and the CI pipeline
`.github/workflows/desktop-release.yml`.

What remains is **operational** — it needs paid developer accounts and secrets that can't
live in the repo. This runbook covers exactly that.

## 1. One-time setup

### Releases repo
`electron-builder.yml` publishes to `github: lifemarkai/desktop`. Create that repo (or change
the `publish.owner/repo`) and mint a token with `contents:write` on it → save as the
**`GH_TOKEN`** secret on the main repo.

### macOS signing + notarization (Apple Developer Program, $99/yr)
1. In Apple Developer, create a **Developer ID Application** certificate; export it as `.p12`.
2. Base64-encode it: `base64 -i cert.p12 | pbcopy`.
3. Add repo secrets:
   - `CSC_LINK` = the base64 `.p12`
   - `CSC_KEY_PASSWORD` = the `.p12` password
   - `APPLE_ID` = your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` = an app-specific password (appleid.apple.com)
   - `APPLE_TEAM_ID` = your 10-char team id
   electron-builder notarizes automatically when these are present + `hardenedRuntime: true`.

### Windows signing (code-signing cert — OV/EV from a CA)
- `WIN_CSC_LINK` = base64 of the `.pfx`
- `WIN_CSC_KEY_PASSWORD` = the `.pfx` password
- (EV certs on hardware tokens need a self-hosted runner; OV `.pfx` works in CI.)

Without these the CI still builds **unsigned** artifacts — installable for testing, but macOS
Gatekeeper / SmartScreen will warn, and stores will reject them.

## 2. Cut a release
```bash
# bump version in package.json, commit, then:
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```
The `Desktop Release` workflow fans out to macOS/Windows/Linux runners, packages with
electron-builder, and (when `GH_TOKEN` is set) publishes signed installers to the
`lifemarkai/desktop` GitHub Release. Artifacts are also uploaded to the workflow run.

Manual dry-run: Actions → Desktop Release → Run workflow (leave "publish" off to just build).

## 3. Download links (site)
Point the site's download UI at the latest release, e.g.:
- macOS (Apple Silicon): `…/releases/latest/download/LifemarkAI-<ver>-arm64.dmg`
- macOS (Intel): `…/LifemarkAI-<ver>-x64.dmg`
- Windows: `…/LifemarkAI-Setup-<ver>.exe`
- Linux: `…/LifemarkAI-<ver>.AppImage`

The editor already has the `NativeDistributionPanel`; a public `/download` page can link the
same latest-release assets.

## 4. Mobile (Capacitor) — separate track
`capacitor.config.ts` loads the live URL (thin shell). To ship:
```bash
npm run cap:add:ios && npm run cap:add:android
npm run cap:sync
npm run cap:open:ios      # → Xcode: sign with your Apple team, Archive, upload to App Store Connect
npm run cap:open:android  # → Android Studio: signed bundle → Play Console
```
App-store submission (screenshots, review, listing) is manual per store.

## What I could NOT do from here
- Run electron-builder to actually produce installers (no build machine / signing certs).
- Create Apple/Windows/store accounts or hold signing certificates.
- Submit to the App Store / Play Store / Microsoft Store.
These are account- and identity-bound by design; the code + CI are ready for them.
