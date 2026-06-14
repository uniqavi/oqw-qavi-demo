# Where we left off

The runner-rework iteration just shipped these fixes (committed `b75d2de`,
already pushed to `demo/main` → live on Netlify):

- Slower scroll baseline so SHIFT player-boost feels more impactful.
- SIZE+ powerup replaced with **HP+** (permanent +22 HP heal; floats
  "HP MAX" caption at the pickup point if the player is already full).
- **SHIELD** and **MAGNET** made rare (weighted spawn) but long-lasting
  (12s each). MAGNET is now a real runtime powerup, not just a dev toggle.
- Escape sequence (after collecting 5/5 docs) now grants damage immunity
  so leftover in-flight enemies can't chip your HP while the page is
  decelerating.

Everything verified in the preview connector; live on Netlify.

---

# What's likely next

In rough priority order, based on the conversation:

1. **Playtest the runner tuning** — Qavi may want to nudge:
   - `SCROLL.slowSpeed` / `fastSpeed` (currently 34 / 200)
   - `POWERUP.weights` (currently hp:6 speed:5 immune:1 magnet:1)
   - `POWERUP.durations` (shield/magnet 12s — could go longer or shorter)
   - `POWERUP.hpHeal` (currently 22)

2. **Tunnel-transition scene (1.2 → Level 2)** — this is the big one.
   Qavi has SVG art from a teammate of a Windows-style window with eyes
   and a set of expression SVGs (in love, confused, scared, neutral...).
   The plan we agreed:
   - Looping parallax tunnel background (Qavi to generate a tileable PNG
     in Gemini; prompt is in the chat history — ask if needed)
   - Window-with-eyes character floats through, expression swaps by
     game state
   - Antivirus hazards to dodge (reuse the runner's enemy art)
   - At the end → transition into `Level2Scene`
   Files needed before starting: SVGs in `public/window/`, tunnel PNG(s)
   in `public/tunnel/`. Qavi will drop them in.

3. **Gemini thumbnails for HomeScene** — the Shorts cards in 1.1 have
   placeholder white circles in the colored frames waiting for art.
   Featured + grid thumbnails are still solid-color rectangles. Once
   Qavi drops images into `public/thumbs/` we can swap them in.

4. **Level 2 (SPYGRAM)** — currently just a scaffold scene. Design notes
   in `docs/LEVEL2.md` (stale; uses old VEIL/Lattice/Warner naming
   instead of HUSH/SPYGRAM/Lewis — needs a pass before building).

---

# Critical context

- We work on branch **`local-progress`**, which tracks remote
  **`demo/main`** (`github.com/uniqavi/oqw-qavi-demo`).
- **Never** push to `origin/dev` — that's the team repo and was
  overwritten by a teammate's design pivot. Don't pull from it either.
- Deploy: `git push demo local-progress:main` → Netlify auto-builds.
- Verify visual changes in the Claude Preview connector before reporting
  done. The dev-only `window.__game` handle lets you jump between scenes.
- Full project background, file map, tunables, conventions, and gotchas
  are in **`HANDOFF.md`** — read that first.
