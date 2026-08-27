/**
 * Admin shell archetypes — "internal tool" is not one layout either.
 *
 * The design system shipped ONE operational language to all twelve app-shell
 * types: a `w-64` nav sidebar, "Data table — the core ERP surface", and
 * "compact paddings (p-4 cards, py-2 rows)". Read the blueprints underneath and
 * that is wrong for more than half of them — these are the PRIMARY screens each
 * blueprint actually asks for:
 *
 *   erp          Dashboard — KPI cards, charts, recent activity
 *   accounting   Dashboard — cash position, income vs expenses
 *   school       Dashboard — enrolment, attendance, fees outstanding
 *   hr           People directory — employee table + profile detail
 *   helpdesk     Ticket queue — filterable table + ticket detail
 *   crm          Pipeline — KANBAN board with draggable cards
 *   project      Board — KANBAN columns (Backlog → Done)
 *   logistics    Dispatch board — unassigned vs assigned shipments
 *   healthcare   Today's schedule — DAY VIEW of appointments
 *   hotel        Front desk — today's arrivals and departures
 *   pos          Register — product grid + CART SIDEBAR, checkout
 *
 * Three of them are board-first and were told a table is the core surface. POS
 * is the sharpest case: it needs large touch targets (a cashier taps, on a
 * counter terminal) while the shared block mandates compact density, and its
 * cart sidebar collides with the mandated `w-64` nav sidebar — two sidebars,
 * neither of which the model was told how to reconcile.
 *
 * Five archetypes, each derived from those primary screens. As with
 * site-archetype.ts, one spec drives the prompt language, and unmapped types
 * fall back to `records` — the historical shape — so nothing regresses.
 */

import type { BuildAppType } from "../ai/build-intent.ts";

export type AdminArchetype = "records" | "directory" | "board" | "schedule" | "terminal";

export interface AdminShellSpec {
  archetype: AdminArchetype;
  label: string;
  /** How the navigation sidebar behaves. */
  sidebar: string;
  /** The screen that defines the product — described as an acceptance rule. */
  primarySurface: string;
  /** How a single record is opened and edited. */
  detailPattern: string;
  /** Spacing/target sizing. Terminals invert the usual density rule. */
  density: string;
}

const RECORDS: AdminShellSpec = {
  archetype: "records",
  label: "Records / operations console",
  sidebar:
    "Fixed nav sidebar `w-64` (collapsible to `w-16`, drawer below `md`): logo row, uppercase `text-[11px] text-slate-500` group labels, items `flex gap-3 px-3 py-2 rounded-lg text-sm`, active `bg-violet-600/15 text-violet-300 border-l-2 border-violet-500`.",
  primarySurface:
    "**Dashboard first, tables behind it.** The landing screen is a row of 4 KPI cards over charts and a recent-activity feed; every entity then gets a dense data table — sticky header row (`text-xs uppercase text-slate-500`), row hover `bg-white/[0.03]`, `tabular-nums` right-aligned amounts, a per-row action menu (⋯), a toolbar above with search + filter dropdowns + primary action, a pagination footer (\"1–20 of 240\"), and selection checkboxes where bulk actions make sense.",
  detailPattern:
    "Create/edit in a right-side Sheet/drawer, never a full page navigation. Labelled inputs `bg-white/[0.04] border-white/[0.08]` with an error slot.",
  density:
    "Compact: `p-4` cards, `py-2` rows. No hero sections, no ambient blobs, no marketing CTAs.",
};

const DIRECTORY: AdminShellSpec = {
  archetype: "directory",
  label: "Directory / queue console",
  sidebar:
    "Fixed nav sidebar `w-64` (collapsible to `w-16`, drawer below `md`), same treatment as any operations console.",
  primarySurface:
    "**A list beside a detail, not a table alone.** The landing screen is a filterable queue — a left list pane (`w-80` to `w-96`, scrollable, each row showing the identifying fields plus a status badge) and a right detail pane showing the selected record in full. Selecting a row updates the detail pane WITHOUT a page navigation, and the selected row stays visibly active. Below `lg` the detail becomes a full-screen view with a back control. Put the queue filters (status, assignee, priority, date) in a toolbar above the list.",
  detailPattern:
    "The detail pane IS the record view — fields, history/activity timeline, and the actions for this record inline at the top. Edit in place or in a modal; do not send the user to a separate route.",
  density:
    "Compact: `p-4` cards, `py-2` list rows. No hero sections, no marketing CTAs.",
};

const BOARD: AdminShellSpec = {
  archetype: "board",
  label: "Board / pipeline console",
  sidebar:
    "Fixed nav sidebar `w-64` (collapsible to `w-16`, drawer below `md`), same treatment as any operations console.",
  primarySurface:
    "**A column board is the primary screen — a table is the secondary view, not the main one.** Render named stage columns side by side in a horizontally scrollable row (`overflow-x-auto`, each column `w-72` to `w-80` with its own vertical scroll), a header per column showing the stage name plus a count and, where it applies, a summed value. Cards carry the few fields that matter at a glance — title, owner/assignee avatar, a value or due date, priority or label chips. Moving a card between columns must update the record's stage in state. Offer a table/list toggle as an ALTERNATE view for the same data.",
  detailPattern:
    "Opening a card shows the full record in a modal or right-side drawer over the board — the board stays visible behind it, because the board is the context.",
  density:
    "Compact inside cards (`p-3`), generous gutters between columns (`gap-4`). No hero sections, no marketing CTAs.",
};

const SCHEDULE: AdminShellSpec = {
  archetype: "schedule",
  label: "Schedule / front-desk console",
  sidebar:
    "Fixed nav sidebar `w-64` (collapsible to `w-16`, drawer below `md`), same treatment as any operations console.",
  primarySurface:
    "**Time is the primary axis.** The landing screen is today: a day view with a time column and blocks positioned against it (or, for lodging-style products, today's arrivals / departures / in-house lists side by side). Include a visible date control (today / prev / next, and a day-week toggle) and colour-code by status — booked, checked-in, in progress, completed, cancelled — with a legend. An empty slot is a target: clicking it starts a new entry at that time. Always show the current-time marker on a day view.",
  detailPattern:
    "Selecting an entry opens it in a right-side drawer with the record's details and its status actions (check in, complete, cancel, reschedule) as buttons.",
  density:
    "Compact: `p-4` cards, `py-2` rows, readable time labels. No hero sections, no marketing CTAs.",
};

const TERMINAL: AdminShellSpec = {
  archetype: "terminal",
  label: "Point-of-sale terminal",
  sidebar:
    "Collapse navigation to an ICON RAIL (`w-16`, icon + tiny label) — never a `w-64` nav sidebar. The register screen already has a cart sidebar on the right, and two full sidebars leave no room for the product grid. Navigation is secondary here; the register is the product.",
  primarySurface:
    "**A register, operated by touch.** Two panes: a product grid on the left (category tabs above it, search, cards showing name, price and a stock badge) and a persistent cart panel on the right (`w-80` to `w-96`) with line items, quantity steppers, subtotal / tax / total, and a full-width checkout button pinned at the bottom of the panel. The cart must remain visible while browsing products — it never becomes a modal.",
  detailPattern:
    "Tender flow in a modal: payment method selection, amount tendered with a numeric keypad, change due, then a receipt view with print and email actions.",
  density:
    "GENEROUS, not compact — this is the one operational surface where density is wrong. Product cards and quantity controls need touch targets of at least 44×44px (`h-11 w-11` / `min-h-[44px]`), `p-4` or larger padding, and text no smaller than `text-sm`. A cashier taps this on a counter terminal, often quickly and sometimes with gloves; `py-2` rows and `text-xs` controls are a usability failure here even though they are correct elsewhere.",
};

export const ADMIN_SHELL_SPECS: Readonly<Record<AdminArchetype, AdminShellSpec>> = {
  records: RECORDS,
  directory: DIRECTORY,
  board: BOARD,
  schedule: SCHEDULE,
  terminal: TERMINAL,
};

/**
 * Archetype from the classifier's app type, mapped from each blueprint's own
 * primary screen (see the table at the top of this file). Anything unmapped
 * falls back to `records`, which is the language every app-shell type received
 * before this existed — so an unrecognised type is never made worse.
 */
export function adminArchetypeForAppType(appType?: BuildAppType | string): AdminArchetype {
  switch (appType) {
    case "pos":
      return "terminal";
    case "crm":
    case "project-management":
    case "logistics":
      return "board";
    case "healthcare":
    case "hotel":
      return "schedule";
    case "hr":
    case "helpdesk":
      return "directory";
    default:
      return "records";
  }
}

export function adminShellSpec(archetype: AdminArchetype): AdminShellSpec {
  return ADMIN_SHELL_SPECS[archetype];
}
