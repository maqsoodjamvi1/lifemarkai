# Lovable-parity verification checklist

Use this after running `npm run dev` to confirm the six Lovable patterns from
the screenshots now render correctly in LifemarkAI. Each section maps 1:1 to
one of the original screenshots.

## Setup

```powershell
cd D:\Projects\lifemarkai
npm run dev
```

Open http://localhost:3000, sign in, and open any existing project's editor
(http://localhost:3000/editor/&lt;projectId&gt;). For the analytics panel to
have data, you'll want a project with at least a few `project_views` rows —
the easiest way to seed data quickly is to publish + visit your own deployed
URL a couple of times.

Apply migration 054 first (see
`supabase/migrations/054_visitor_ua_path.APPLY.md`); without it, the Source /
Page / Device tiles render the empty state.

---

## 1. Site analytics panel (replaces Lovable screenshot 1)

**Open it:** click the chart icon in the editor top bar, OR click the `…`
overflow menu in the center toolbar and choose Analytics.

**Expect to see:**

- Header line "Analytics" with a live `N current visitors` pill (green dot
  animating when N &gt; 0, grey when 0)
- A `Last 7 days / Last 30 days / Last 90 days` segmented picker — clicking
  any range refetches and updates the chart
- Five KPI tiles in a row: Visitors, Pageviews, Views Per Visit, Visit
  Duration, Bounce Rate
- The first two tiles (Visitors, Pageviews) are clickable — clicking switches
  the area chart's series
- A blue area chart underneath
- Four breakdown tiles at the bottom: Source / Page / Country / Device. Each
  row shows a horizontal blue-tinted bar proportional to that row's share.

**Old builder-KPI view** (AI Builds, Tokens, Files, Languages, Recent deploys)
is still available — it's now wired to the `activity` panel slot. Open it from
the overflow menu if you want to confirm nothing was deleted.

## 2. Share dropdown (Lovable screenshot 2)

**Open it:** click the Share button at the right of the editor top bar.

**Expect to see:**

- "Share project" header
- An "Add people by email…" input row
- A "Project access" section with: "People you invited" link, your user row
  with "Owner" label, and an "Invite link" row with an Enabled / Disabled pill
- **If invite link is Disabled**, an outline-style **Create invite link**
  button appears below the access list — clicking it auto-generates the public
  slug and flips the toggle to Enabled
- Bottom actions: black "Publish project" button and outline "Share preview
  link" button (the latter only appears when a slug already exists)

## 3. Publish dropdown (Lovable screenshot 3)

**Open it:** click the blue Publish button at the far right of the top bar.

**Expect to see:**

- Header: "Publish" / "Publishing…" / "Published" depending on state
- "Website URL" section showing the deployed URL with copy + open-in-new-tab
  buttons (or "Not published yet" before first deploy)
- "Add custom domain" inline link in the URL header
- "Who can see this website" tile with Public ↔ Private toggle
- Two outline action buttons side-by-side: **Review security** and
  **Edit settings**. The Review security button shows a **small red circular
  badge with the issue count** when `staticScan` finds any (matches Lovable's
  red "9" in the screenshot)
- Primary action button below: "Publish" / "Up to date" / "Publishing…"
- Netlify / Vercel provider chips

To trigger the red badge for testing, drop a string like `sk-aaaaaaaaaaaaaaaaaaaaaa`
into any file and re-open the publish dropdown. The badge should appear with a
count of 1.

## 4. Mode picker (Lovable screenshot 4)

**Open it:** in the chat compose box at the bottom of the left panel, click the
"Build ∨" pill.

**Expect to see:**

- Three rows: Build (with check), Plan, Agent — each with its short
  description ("Make changes directly", "Discuss before building",
  "Autonomous AI agent")
- A new row at the bottom: **"Toggle with [Alt] [P]"** with both keys rendered
  as `<kbd>` chips
- A divider, then the model selector list (Best / Fast / New badges)

**Test the shortcut:** close the dropdown and press `Alt+P` anywhere outside
an input/textarea. The mode badge in the compose pill should toggle between
Build and Plan. Pressing Alt+P while typing in the chat input is ignored
(intentional — so you don't accidentally toggle while writing).

## 5. Plus menu (Lovable screenshot 5)

**Open it:** click the `+` button to the left of the chat compose row.

**Expect to see, top to bottom:**

- Settings (Ctrl+.)
- History
- Knowledge
- GitHub
- Connectors  (with a right-chevron, indicating a sub-experience)
- divider
- Take a screenshot
- Add reference
- Add skill
- Attach
- divider
- A small footnote: **"Connectors have moved — Find the new connector
  experience on the homepage."** — this is the new piece.

## 6. Domains panel (Lovable screenshot 6)

**Open it:** from the publish dropdown click "Add custom domain", or from the
overflow menu pick Domains.

**Expect to see:**

- Header "Domains" with two new affordances on the right: an "Open docs"
  link with external-link icon, and a refresh button
- Project hosted URL card with `https://&lt;slug&gt;.lifemarkai.app` and an
  inline "Edit URL" button
- If a custom domain is connected, a card with two status rows (apex + www):
  - **Live** rows show a green check, "Your site is live on this domain."
  - **Not connected** rows show a red x, "Not connected.", and a new
    inline **Connect** button (re-runs DNS verification on click)
- DNS records table when status is pending
- Share & Embed card (unchanged)
- "Buy a new domain" and "Connect existing domain" cards at the bottom

## Smoke test for the static-scan helper

```powershell
node --test lib/security/static-scan.test.ts
```

Should print `# pass 16` / `# fail 0` in roughly 300 ms. No test-runner
dependency is required — uses Node 22's built-in `node:test`.

## Known limitations

- The site analytics panel polls every 15s for live-visitor updates. If you
  want to see the live counter change without waiting, hit the refresh icon
  in the panel header.
- Source / Page / Device tiles will be empty until migration 054 is applied
  AND new traffic hits the beacon endpoint (existing rows in `project_views`
  have NULL path / user_agent so they aggregate as "Unknown").
- Bounce rate and visit duration are session-approximated from the available
  per-pageview rows. They'll get more accurate as more traffic accumulates.
