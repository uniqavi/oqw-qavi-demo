# Intro Sequence — "The Window That Wouldn't Close"

> **Status:** PROPOSAL — not yet built. Pending team agreement.
> Author: qavi · Drafted: 2026-06-13
>
> This replaces the current text-narration intro (the phone-call cutscene that
> playtesters found boring). It is an **animated** sequence — not interactive —
> that plays after the player starts a new mission and leads directly into the
> existing Level 1 (TotallyNormalTube) gameplay. **No mechanics change.**

---

## 1. Why we're doing this

Feedback from the last presentation:
- The opening narration is the most boring part — nobody wants to read it.
- The team has been "circling" for ~3 weeks. Direction from review: **don't
  throw away the current build — extend it.**
- Gameplay is too short → we need more levels.

This intro addresses all three at once:
1. **Kills the narration.** The premise is shown, not read.
2. **Reuses everything.** Same engine, same canvas-UI rendering approach, same
   chasing-enemy + player-window concept already in the game.
3. **Sets up a level engine.** The premise — *a window/process that escaped
   deletion and fled into the internet* — turns "every website is a level"
   into the natural story spine. New levels = new sites you flee through. This
   is how we grow the game's length without inventing new lore each time.

**Core reframe:** today the story (spy/robot/war) doesn't match the mechanic
(you're a little window dodging things). This intro makes the premise MATCH the
mechanic — *you literally are a window that refused to be deleted.* That's the
whole motivation. No exposition required.

---

## 2. The concept (one line)

A Windows XP desktop. A cursor tries to open a file; error windows spam-multiply
across the screen. One of those windows is **us** — and it doesn't want to be
deleted. It breaks free, the desktop turns hostile and tries to catch/delete it,
so it dives into the browser and lands on our YouTube page → Level 1 begins.

---

## 3. Beat-by-beat shot list

Target total length: **~20–35 seconds.** Keep it tight — the failure mode is
replacing a boring *read* with a boring *watch*. Every beat should move.

| # | Beat | What the viewer sees | Audio cue |
|---|------|----------------------|-----------|
| 1 | **Desktop boot** | Classic XP "Bliss" wallpaper fades in. Taskbar slides up from the bottom. A few desktop icons settle in (see §5). Calm. | soft XP-ish startup chime / hum |
| 2 | **The cursor acts on its own** | Cursor glides to a file icon (e.g. `truth.exe` / `DO_NOT_OPEN.exe`) and double-clicks it. | click |
| 3 | **First error** | A single "Something went wrong" dialog pops. Cursor clicks **OK / ✕** to close it. | classic XP error *ding* |
| 4 | **The spam cascade** | Closing it spawns 2, then 4, then a diagonal cascade of duplicated error windows marching across the screen (see reference image). Accelerating, comedic, overwhelming. | dings stacking into a rising swarm |
| 5 | **We are revealed** | Among the identical error windows, ONE is different — **our window** (the red browser-window protagonist). It stops mimicking the others; a small "no" / shake; it refuses to close. | swarm ducks; a single distinct tone for "us" |
| 6 | **The chase** | The cursor + other windows/desktop elements turn on our window and lunge to delete/catch it. Our window dodges across the desktop. (Animated — scripted dodge, not player-controlled.) | tension sting kicks in |
| 7 | **The escape** | Our window makes a break for the browser (taskbar browser button or an open browser frame). It dives IN. Camera/zoom pushes into the browser screen (reuse the planned "zoom into monitor" move). | whoosh / dive |
| 8 | **Hard cut to Level 1** | We're now the red window on the TotallyNormalTube YouTube page. Existing GameScene takes over unchanged. | level1 music starts |

**Skippable:** include a `SKIP ↗` button (top-right) like the current cutscene,
in case players replay.

---

## 4. Visual direction

- **Base:** real XP wallpaper already in repo → `public/windows-xp-Wallpaper.jpg`.
- **Everything else is hand-built to match OUR game's art style** (not pixel-
  perfect XP — stylized to fit our existing flat/terminal aesthetic). To build:
  - **Taskbar** (bottom): Start button, quick-launch, a few fake running-app
    buttons, clock. Classic XP green/blue but in our palette.
  - **Desktop icons** (top-left grid): a handful of fake files/folders —
    play up the comedy (e.g. `Coins2`, `WGAPlugin`, `CDCheck.exe`, a "Welcome
    to Hightech" icon, and the bait file the cursor opens).
  - **Error dialogs:** XP-style title bar + body + OK/✕, restyled to our look.
    Title text variations for comedy: `Something went wrong`,
    `LEAVE_THE_LIGHTS_ON.exe`, `Memory error`, fake EULA gag
    ("…We now own your house!"), etc. (see reference image for the vibe).
  - **Our window:** the existing red protagonist window, visually consistent
    with how it looks in-game so the player recognizes "that's me" instantly.
- **Reference image:** the cascade-of-error-windows screenshot qavi shared —
  match that density/diagonal-march feel for beat 4. *(Save the reference into
  `docs/refs/` or `reference/` when we start building.)*

---

## 5. Implementation notes (for when we build)

**Framework: stays within current stack. No new dependencies. No raw WebGL.**

- Phaser already runs on WebGL under the hood (`Phaser.AUTO`). For 2D sliding
  windows + cursor, a **2D canvas overlay** (consistent with the rest of the
  game's `#oqw` canvas rendering) OR an **HTML/CSS DOM layer** (window chrome
  is literally UI — arguably easier) are both fine. Recommendation: pick one
  and keep it consistent with the menu's existing DOM-over-canvas pattern.
- Build as a **new scene**, e.g. `IntroScene.js`, slotted in `src/main.js`
  scene order BEFORE `GameScene` (likely replacing / merging the current
  cutscene step). Follow the `Level2Scene.js` scene pattern.
- It's a **scripted timeline** (no gameplay input): drive everything off a
  single `state.time` / tween timeline. Error windows = array of objects with
  `{x, y, spawnAt, title}` drawn each frame; the cascade is just staggered
  spawn times + a diagonal offset.
- **Transition out:** zoom/push into the browser, then `scene.start` into the
  existing Level 1 (GameScene). Reuse the camera-zoom idea already noted in the
  old design doc.
- **Audio hooks** already exist (`src/game/music.js`, `audio.js`) — wire the
  error dings + tension sting + dive whoosh through them. (qavi is preparing
  the audio files.)

**Scope guardrails:**
- Keep it under ~35s. Time-box the build — this is a polish/onboarding piece,
  not a new gameplay system.
- It is **animation only** for now (decided). No player control during intro.
- Do NOT touch existing mechanics — this is purely a front-door swap.

---

## 6. Open questions for the team

1. Approve replacing the phone-call narration cutscene with this entirely, or
   keep a trimmed line or two of flavor text on top?
2. Does this intro also absorb the separate Tutorial scene later, or do we keep
   the tutorial as-is after the intro? (Out of scope for now — note for later.)
3. How much of the old lore (HUSH / EVE / Toto) survives the reframe? Proposal:
   drop the heavy plot, keep the light self-aware comedic tone; seed any bigger
   mystery later through gameplay, not front-loaded text.
4. Music/SFX: which cues does qavi's audio set cover? (TBD next.)

---

*This is a planning doc only. Nothing here is built yet.*
