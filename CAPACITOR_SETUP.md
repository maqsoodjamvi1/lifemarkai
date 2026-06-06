# Capacitor mobile shell — setup guide (Phase 1)

> **Status:** Phase 1 ships the wrapper config + dependencies + npm scripts. The
> actual `cap add ios` / `cap add android` scaffolding has to run on your
> machine because it generates platform-specific code that depends on local
> tooling (Xcode, Android Studio) and shouldn't be created in this sandbox.

## What phase 1 gives you

- `capacitor.config.ts` at the repo root pointing the native shell at
  `https://lifemarkai.com` in production and `http://10.0.2.2:3000` in dev.
- `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`
  in `devDependencies`.
- npm scripts: `cap:sync`, `cap:add:ios`, `cap:add:android`, `cap:open:ios`,
  `cap:open:android`, `cap:run:ios`, `cap:run:android`.

The strategy is deliberately **thin** — the shell is a packaged WebView
pointing at the live LifemarkAI site, so:

- API routes keep working unmodified.
- iOS/Android updates ship the moment you deploy the web.
- You don't need to re-submit to the App Store / Play Store for every change.

A future phase 2 can layer in:

- Mobile-first UI adaptations to the editor (bottom-sheet file tree,
  keyboard-aware chat composer, full-bleed preview).
- Capacitor plugins for native features (Push notifications, Filesystem
  for project export, Share for invite links).
- A bundled offline build if App Store review tightens around "web wrappers".

## Step 1 — Install dependencies

```powershell
cd D:\Projects\lifemarkai
npm install
```

This pulls down the four `@capacitor/*` packages that were just added.

## Step 2 — Scaffold the iOS project (macOS only)

iOS scaffolding requires macOS + Xcode 15+. From a Mac with the repo cloned:

```bash
cd lifemarkai
npm install            # if you haven't already
npm run cap:add:ios    # creates ios/ folder with the Xcode project
npm run cap:open:ios   # opens it in Xcode
```

In Xcode:
1. Select the **App** target.
2. Under **Signing & Capabilities**, pick your team and let Xcode generate
   a provisioning profile.
3. Set the **Bundle Identifier** if you want something other than
   `app.lifemarkai.editor`.
4. Plug in an iOS device or pick a simulator from the toolbar.
5. Click ▶ to build and launch. The app should load
   `https://lifemarkai.com` immediately.

## Step 3 — Scaffold the Android project (Windows / macOS / Linux)

Android scaffolding works on any host with Android Studio installed:

```powershell
cd D:\Projects\lifemarkai
npm run cap:add:android    # creates android/ folder with Gradle project
npm run cap:open:android   # opens it in Android Studio
```

In Android Studio:
1. Wait for Gradle sync to finish (first run takes a few minutes).
2. Create a virtual device via **Tools → Device Manager** or plug in a
   physical device with USB debugging enabled.
3. Pick the device from the toolbar and click ▶ to run.
4. The default `server.url` in dev mode is `http://10.0.2.2:3000` — that's
   the Android emulator's host-loopback address. Make sure `npm run dev` is
   running in another terminal.

## Step 4 — Verify the dev loop

With either platform open:

```powershell
# Terminal 1 — the Next.js dev server the shell loads from
npm run dev

# Terminal 2 — sync changes to the native project (only needed when you
# touch capacitor.config.ts; not for app code changes since the shell
# just re-loads the URL)
npm run cap:sync
```

Web UI changes are visible in the native shell the instant you reload —
just like a browser.

## Step 5 — Production builds

For App Store / Play Store submission you'll need:

- A signed IPA from Xcode → **Archive → Distribute App**.
- A signed AAB from Android Studio → **Build → Generate Signed Bundle**.

Signing certificates and store-listing assets (screenshots, descriptions,
privacy policy URL) are NOT in phase 1. Plan those when you have user
feedback that justifies the submission cost.

## What to expect during App Store review

Apple is increasingly strict about "web wrapper" apps (Guideline 4.2). Some
defensive choices already in `capacitor.config.ts`:

- `cleartext: false` in production — so reviewers can't flag HTTP traffic.
- `contentInset: "always"` — so the WebView respects the safe-area inset.
- `allowNavigation` is scoped to your own domains + OAuth callback hosts —
  prevents Apple from flagging the app as an open browser.

If review pushes back, the fastest fix is to add a couple of native screens
(a real settings page, a real onboarding flow) via Capacitor plugins so the
shell isn't 100% web — that's phase 2 territory.

## Conflicts with Electron

`electron/` and `capacitor.config.ts` coexist cleanly. The `cap:*` scripts
are name-scoped, the `electron:*` scripts are untouched. Both Electron and
Capacitor reference the same Next.js codebase as a remote URL, so there's no
build-output collision.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `cap: command not found` | `node_modules/.bin` not on PATH | Use `npx cap …` or rerun `npm install` |
| Android emulator can't reach localhost | Default uses `10.0.2.2`; physical devices need your LAN IP | Set `CAPACITOR_DEV_URL=http://192.168.x.x:3000` before `cap sync` |
| iOS WebView shows white screen | Server URL not reachable from device | Confirm the dev server is bound to `0.0.0.0` not `127.0.0.1` |
| Production build loads dev URL | Wrong `NODE_ENV` at sync time | Run `NODE_ENV=production npm run cap:sync` before opening Xcode/Studio |

## What ships in phase 1 vs. defers to phase 2

Phase 1 (now):
- Capacitor wrapper + dependencies + scripts
- Production loads https://lifemarkai.com; dev loads localhost:3000
- iOS + Android projects scaffold via the npm scripts above

Phase 2 (later, gated on PWA telemetry):
- Mobile-first UI adaptations
- Native Push notifications, Filesystem, Share plugins
- Bundled offline build target
- App Store / Play Store submission flow
