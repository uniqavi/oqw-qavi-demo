# LEVEL 2 DESIGN — "The Dashboard" (HUSH analytics backend)

> Finalized design for the next level, locked 2026-06-16. Read alongside
> `HANDOFF.md`. Building has NOT started — this is the agreed spec to build from.

---

## One-line pitch

You emerge from the tunnel into **HUSH's internal analytics dashboard** — the
room where they measure how well the propaganda is performing. The chart widgets
are the walls of a maze. Some of those charts are hostile. Sweep the maze with
your window (a live X-ray) to find hidden evidence docs, then escape before the
dashboard tears itself apart.

This is a deliberate genre shift from L1's runner/feed levels: a **top-down
Pac-Man-style maze** built out of UI components, with an **always-on X-ray
reveal** as the signature mechanic.

---

## Why a dashboard (the page choice)

We considered a Telegram/SPYGRAM mimic (the old `Level2Scene` scaffold) but chat
UI is one tall vertical list — no natural maze. A **dashboard/analytics page** is
made of rectangular chart widgets in a grid, which read instantly as *walls with
gaps*. The maze and the enemies become the **same objects** (a chart is both a
wall and, sometimes, a threat), which keeps the design self-consistent.

Thematic escalation: L1 = infiltrating HUSH's *public* sites. L2 = breaking into
the *backend* where they quantify the lies. The hidden docs = the real numbers
before they were massaged.

---

## Core mechanics

### 1. The maze
- Top-down play area. Chart widgets are solid collision rectangles (walls).
- The player navigates the **gaps/corridors** between widgets.
- Movement: WASD/arrows + SHIFT dash (reuse existing player movement + HP, as in
  HomeScene/GameScene). HP bar; 0 HP → "WINDOW CRASHED" → R to retry.
- **Inert widgets** (KPIs, line charts, area charts, histograms, tables in v1)
  are cover/walls only. **Hostile widgets** (pie, bars in v1) are threats.

### 2. The X-ray window (signature mechanic)
Inspired by the Mr. Bean X-ray gag: the **player window IS the X-ray screen**.

- **Passive (always on):** the entire region directly under the player window
  renders as a live blue-glass **wireframe** in real time as you move — charts and
  all (full X-ray of the region, not just docs). This is your radar: as you pass
  over a spot you may glimpse a hidden **doc skeleton** in the wireframe.
- **Active capture (hold SPACE):** when you spot/suspect a doc, park the window so
  the doc is fully *contained* inside the frame and **hold SPACE**. A capture
  progress bar fills; on completion the doc is collected.
- **The risk is holding still.** Capture does no damage itself, but you must stop
  moving to do it — that's the opening for the pie boulder to roll in or a bar to
  topple. The tension is emergent, no penalty mechanic needed.

Implementation note: this is a **clip-mask reveal** — draw the normal dashboard,
then clip a rectangle at the player's position and redraw that region in the
X-ray style (blue fill + white outlines) on top, every frame.

### 3. The docs
- **Required docs** are hidden in the **corridors/gaps you can walk** — so the
  level is always beatable by sweeping the maze. Collect all required → escape
  unlocks.
- **Bonus docs** are tucked **beneath hostile widgets** (under the pie, behind a
  bar) — optional risk/reward; not needed to finish.
- Docs are invisible on the normal page; only visible through the X-ray, only
  collectible via hold-SPACE capture.

---

## Hazards (all four BUILT)

All telegraph with a **red HUSH tint + a short wind-up** so deaths read as fair.
Implemented as bespoke logic in `DashboardScene.js` (the zoomed maze world is
different enough that fresh code was simpler than adapting the 960-space agents).

| Widget | Behavior |
|---|---|
| **Pie → rolling boulder** | Spins up, launches off the panel toward the player's side, then rolls under **gravity** — rolling across surfaces and **falling through corridor gaps**. Squashes on contact. (r < corridor width so it fits.) |
| **Bar → toppling bars** | A bar creaks, then drops into the corridor below to crush you, then retracts. |
| **Gauge → needle turret** | Needle eases toward you (dodgeable), locks, then fires one **heavy hitscan beam** along the locked angle. Re-arms on cooldown. |
| **Table → trip-mines** | Hidden mines in the corridor by the table. The **X-ray sensor reveals them ~95px out** (red spiky icon); detonation radius is tiny (~18px) so they're see-and-avoid. Blast on contact. |

## Theme & damage (updated)

- **Light theme** — light page, white panels, dark text. The **only dark layer is
  the X-ray** (dark-blue glass + cyan wireframe), seen only through the window.
- **Irregular maze** — panels span 1+ blocks of a coarse grid so they come out
  long/tall/thick; unused blocks + gaps form corridors with branches and dead
  ends (not a square grid). Connectivity BFS-verified (spawn → all docs + exit).
- **Damage** — base values divided by the difficulty mod (≈×0.45 on Easy) land
  ~20-29 per hit → **~5 hits = "WINDOW CRASHED."**
- **Crash popup** — a DOM "window.exe — Not Responding" dialog with **Restart
  level / Main menu** (replaces the old canvas fail text). R also restarts.

---

## Opening — emerge from the tunnel

Bookends L1.2's exit. In 1.2 you drag a suspicious comment, reveal a hole, and
slip through into a dark tunnel (`GameScene.js` escape; tunnel transition is
currently a placeholder around `GameScene.js:1180`).

L2 **opens with the window coming OUT of the tunnel exit** into the dashboard:
- Brief parallax tunnel-exit intro (window emerges, page resolves into the
  dashboard around it). Can start simple (fade/zoom out of a dark vignette) and
  get the full antivirus-tunnel art later.
- Toto re-establishes contact on arrival → short intro narration that gates the
  hazards (agents inert until dismissed, same pattern as HomeScene `this.started`).

---

## Escape — exfiltrate

- Collect all **required** docs → triggers **"EXPORTING…"** progress.
- As it fills, the **dashboard collapses**: widgets glitch/shrink, and a **wall
  falls away to open a new exit** that wasn't reachable during the hunt (the exit
  is earned by the chaos, not pre-placed).
- Dash to the exit. Reuse the **1.2 escape-immunity** window so the final sprint
  is fair.
- Exit → next level / transition (placeholder for now).

---

## Reuse map (why this is cheaper than it looks)

| Need | Existing |
|---|---|
| Player movement, dash, HP, "WINDOW CRASHED"/retry | HomeScene / GameScene + `combat.js` (`p.useHp`) |
| Pie boulder (chaser) | `agents/chasingRecs` |
| Toppling/crushing bars | `agents/crushingCookie`, `agents/fallingComment` |
| ESC pause + master volume | `pauseMenu.js` (already wired everywhere) |
| Toto narration / dialogue chips | existing narration system |
| X-ray look reference | `scan.js` (concept; new clip-mask draw for the lens) |

**New code:** top-down widget-wall collision maze; the live X-ray clip-mask
reveal; hold-SPACE capture; dashboard-collapse escape.

---

## Open implementation choices (decide at build start)

1. **Scene:** repurpose the existing `Level2Scene.js` (currently the SPYGRAM
   scaffold) into the dashboard, or add a new `DashboardScene` and retire SPYGRAM
   to a later slot? (SPYGRAM mechanics still live in
   `reference/operation_quiet_window_mission_02.html` either way.)
2. **Tunnel-exit intro fidelity** for v1: simple fade/zoom vs. full parallax art.
3. **Layout authoring:** hand-place widget rects in a `LAYOUT`/config table
   (like the current `Level2Scene`) vs. a small grid the maze is generated from.

---

## v1 build checklist (when we start)

- [ ] Dashboard layout: widget rects (walls) + corridor gaps, with KPIs/line/area
      as inert cover.
- [ ] Top-down player movement + dash + HP + collision against widget walls.
- [ ] Live X-ray clip-mask reveal under the window (full wireframe of the region).
- [ ] Hidden doc skeletons in corridors (required) + under hostiles (bonus).
- [ ] Hold-SPACE capture with progress bar; required-doc counter → unlock escape.
- [ ] Pie boulder hazard (chasingRecs re-skin) with wind-up tell.
- [ ] Toppling/crushing bars hazard (crushingCookie/fallingComment) with tell.
- [ ] Tunnel-exit opening + Toto intro narration gating hazards.
- [ ] Escape: EXPORTING bar → dashboard collapse → exit opens → dash out
      (escape immunity).
- [ ] ESC pause wired (carry over from scaffold).
- [ ] Verify in preview connector; build clean.
