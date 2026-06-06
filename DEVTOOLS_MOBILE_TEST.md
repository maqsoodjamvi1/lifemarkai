# Testing the mobile-readiness CSS without a real device

The Phase 1.5 CSS changes only activate under specific conditions:

- **Tap-target expansion** (`@media (pointer: coarse)`) — requires a touch
  input device, not a mouse. Plain "Responsive design mode" in devtools
  does NOT trigger it because your mouse is still attached.
- **Safe-area insets** (`env(safe-area-inset-*)`) — only have non-zero
  values on devices with notches, dynamic islands, or curved edges. Flat
  rectangular emulators report 0px.
- **`100svh` height** — works in any modern browser, but you only see
  the difference vs `100vh` on iOS Safari with the URL bar visible.

This document is the cheat sheet for triggering each one in devtools.

## Chrome / Edge / Brave

1. Open the page you want to test (e.g. `http://localhost:3000/editor/<id>`).
2. **F12** to open devtools, then **Ctrl+Shift+M** (Cmd+Shift+M on macOS)
   to enable the device toolbar.
3. Pick "Responsive" or a notched phone (iPhone 14 Pro, Pixel 7 Pro, etc.)
   from the dropdown at the top.

### Enable `pointer: coarse` emulation

4. In devtools click the **⋮** (three-dot) menu in the top-right → **More
   tools → Rendering**.
5. Scroll the Rendering panel until you see **Emulate CSS media feature
   `prefers-reduced-motion` / `pointer`**.
6. Set **Emulate CSS media feature pointer** to `coarse`.
7. Reload the page. The 28-pixel buttons in the editor top bar now have
   `::after` pseudo-elements adding an 8px hit margin — the visual size is
   unchanged, but if you Inspect any of those buttons you'll see a roughly
   44×44px hit box highlighted on hover.

### Verify the safe-area insets

Picking a notched device in the device-toolbar dropdown automatically
sets non-zero `safe-area-inset-top` (and `bottom` for the home indicator).

8. With "iPhone 14 Pro" selected, navigate to the editor.
9. The top bar should sit BELOW the simulated notch — there's a visible
   ~50px gap between the top edge of the viewport and the first button.
10. The chat composer's bottom action row should sit ABOVE the home
    indicator — a ~25px gap at the bottom.

### `svh` vs `vh` check

11. Stay in "iPhone 14 Pro" mode and toggle the simulated URL bar (the
    small "↻" reload icon in the device chrome's top-right doesn't help;
    the URL bar emulation is automatic in Chrome).
12. Confirm the editor's `h-screen` containers fill the *visible* viewport
    only — they don't slide under the URL bar.

## Firefox

Firefox doesn't expose pointer-media-feature emulation in devtools as
directly. Easiest workaround:

1. Open the page, then **F12** → **Responsive Design Mode** (Ctrl+Shift+M).
2. Pick a notched device.
3. In the Responsive toolbar, click the **touch simulation** icon (a hand
   pointing). This sets `pointer: coarse` AND maps mouse clicks to touch
   events.
4. Reload — same verification as Chrome above.

Firefox doesn't simulate safe-area-insets even for notched device presets,
so step 8-10 has to be tested in Chrome or on a real device.

## Safari (macOS only)

1. Enable the Develop menu: Safari → Settings → Advanced → "Show features
   for web developers".
2. **Develop → Enter Responsive Design Mode** (Ctrl+Cmd+R).
3. Pick "iPhone 14 Pro" or similar.
4. Safari's responsive mode automatically reports `pointer: coarse` AND
   sets the safe-area insets. No extra toggling required.
5. Reload.

Safari is the most accurate emulator for the safe-area insets because it
shares its WebView engine with the real iOS Safari.

## Verification checklist

Run through this once after applying Phase 1.5:

- [ ] Editor top bar pushed below the simulated notch
- [ ] Chat composer bottom row sits above the home indicator
- [ ] Buttons inspect as roughly 44×44 hit boxes in coarse-pointer mode
- [ ] No 300ms tap delay on buttons (test with touch-event simulation —
      a click should fire immediately, not after a brief pause)
- [ ] Scroll lock works: open the "Analyze data" or "Save as skill"
      modal, then try to scroll the page behind it — it shouldn't move
- [ ] Selection color is brand violet (`#7c3aed` at 35% alpha) in
      `display-mode: standalone`. Easiest test: install the PWA via
      Chrome's address-bar install icon, open it, and select some text.

## Common gotchas

- **"Inspect the button shows 28px height, not 44px"** — that's expected.
  The visible button is still 28px; the 16px of extra hit area lives in
  the `::after` pseudo-element which only appears as a hover overlay or
  when you toggle "Show user agent shadow DOM" in devtools settings.
- **"Safe-area insets show as 0 even on a notched preset"** — Firefox
  doesn't simulate them. Switch to Chrome or Safari.
- **"`pointer: coarse` selectors don't fire"** — make sure you reloaded
  the page after toggling the emulation; the media query is evaluated at
  document-load time in some browsers.
- **"`h-screen` looks the same as before"** — `100svh` only differs from
  `100vh` when the browser chrome (URL bar, toolbars) is taking up part
  of the viewport. Desktop browsers without dynamic chrome won't show a
  difference.

## Real-device testing

When you do get to a phone:

- iOS: open the dev server via your LAN IP (`http://192.168.x.x:3000`),
  then add to Home Screen for the truest standalone test. Safari's URL
  bar disappears in standalone mode and the safe-area becomes visible.
- Android: same — but Chrome on Android keeps a small persistent toolbar
  even in PWA mode. Capacitor's WebView removes it entirely.
- For the Capacitor shell specifically: follow `CAPACITOR_SETUP.md` steps
  2-4 to launch the native shell on a connected device.
