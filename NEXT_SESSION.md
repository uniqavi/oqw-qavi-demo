# Where we left off

Last session (2026-06-15) shipped three big things, all committed + pushed to
`demo/main` (live on Netlify) and mirrored to `origin/qavi-demo`:

1. **Level 1.1 reworked into a roaming-agent stealth level** (`HomeScene.js`).
   - Scanning removed. HP bar (0 HP → "WINDOW CRASHED", `R` to retry). WASD + SHIFT dash.
   - Three Mission-02 agents remapped onto the home feed: the **account avatar pulls
     a gun** (one lethal shot, rush it), **two grid cards chase** you, the **search bar
     fires shrapnel**. Agents stay inert until the intro narration is dismissed.
   - Collect **4 evidence docs** → the boosted video pulses → dive in → Level 1.2.
   - Enabled via small non-breaking edits: `combat.js` HP branch (`p.useHp`),
     `chasingRecs` homes to `a.slot`, `gunShooter` bullets bound to `state.worldW`.

2. **Audio master volume + in-game pause menu.**
   - `audio.js` owns the master volume (`oqw-volume`, default 0.7); music/sfx/voice
     scale by it. `wireVolumeControl()` shared widget.
   - **ESC pause menu** (`pauseMenu.js`) in all gameplay scenes — volume slider + mute
     + RESUME + MAIN MENU. Freezes game time, logic, AND narration while open.

3. **New opening: a Windows XP flow** (`MenuScene.js` + XP DOM/CSS).
   - **XP welcome** screen = main menu. Click Administrator → **type your name as the
     password** (= the codename Toto uses). Recreated in CSS to match the reference.
   - **XP desktop** — Bliss wallpaper, icons, taskbar, Start menu, live clock, tray.
   - **Toto incoming-call window** (anonymous avatar = a window inside the PFP) →
     Accept → the old-friends dialogue plays → open **Internet Explorer** → Tutorial.
   - Difficulty picker retired (defaults Easy). Only the browser advances the game;
     other icons give a polite XP error ding.

Everything verified in the preview connector (welcome → login → desktop → call →
browser → tutorial; pause/volume; 1.1 agents/docs/portal). Build clean.

---

# What's likely next (rough priority)

1. **XP opening polish**
   - Swap CSS-art icons for real XP icon PNGs (pixel-perfect) if assets are dropped in.
   - Rename the disabled "Guest" tile → "Tim" to match `windows-xp-lock-Screen.png`.
   - Remove the now-orphaned `settings-modal` / `help-modal` DOM (nothing opens them).
   - Optional: a short fade on the desktop → tutorial handoff.

2. **Desktop error-window cascade** — the "later" half of `Reference Home Screen.png`
   (the storm of HUSH error popups on the desktop). User said to add this after 1.1
   feels right. This is the originally-planned "escaping error windows" intro beat.

3. **Level 1.1 tuning** (playtest) — `DOCS_TARGET`, doc positions in `buildDocs()`,
   agent trigger ranges (chasers 380 / search 460 / gun 700 ×diff), `GUN_GRACE`,
   chaser card picks. The gun is one-shot; consider re-arm on cooldown.

4. **Tunnel transition (1.2 → 2.0)** — parallax antivirus tunnel, window-with-eyes
   character with state-driven expressions, then into Level 2. Art → `public/window/`
   + `public/tunnel/` (user will drop in).

5. **Level 2 (SPYGRAM)** — bring back the full Mission-02 mechanics (cookie jar,
   gaze/cursor, drag-comment, subscribe) PLUS the runner/scroller layer. User's plan:
   only after we're confident with 1.1. `reference/operation_quiet_window_mission_02.html`
   is the design reference for those mechanics.

---

# Critical context

- Branch **`local-progress`** tracks **`demo/main`** (`github.com/uniqavi/oqw-qavi-demo`).
- Deploy: `git push demo local-progress:main` → Netlify.
- Team mirror (non-destructive): `git push origin local-progress:qavi-demo`.
- **NEVER push `origin/dev`** — a teammate's redesign lives there; we keep it untouched.
- Verify visual changes in the Claude Preview connector before reporting done. The
  dev-only `window.__game` handle jumps scenes (snippet in HANDOFF.md).
- Build with `npx vite build`. Commit per logical change, lowercase verb start, end
  with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Full file map, tunables, conventions, gotchas → **`HANDOFF.md`** (read first).
