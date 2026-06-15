# HANDOFF — Operation Quiet Window

> Catch-up doc for a fresh Claude chat. Read this end-to-end before touching
> code. Last updated: 2026-06-15.

---

## What this is

A Phaser 3 + Vite browser game. The player is a red browser window
infiltrating fake websites run by a megacorp called **HUSH** to expose
buried propaganda. Comedic, self-aware tone. Built to be playable by
non-gamers but rewarding for thorough players.

**Stack:** Phaser 3 + Vite. Most game visuals are **hand-coded 2D canvas
draws** to an overlay element (`#oqw`) layered above Phaser's canvas — not
Phaser GameObjects. Phaser handles input + scene lifecycle; everything else
is plain `ctx.fillRect(...)` etc. The **opening (menu) and some UI are plain
DOM/CSS** overlays (see XP opening below), shown while `body.menu-mode`.

**Viewport:** logical 1920×1080, CSS-scaled to fit the browser window.

---

## Repos and branches

| | URL | Used for |
|---|---|---|
| **Team repo** (origin) | `github.com/uniqavi/operation-quiet-window-web` | Other teammates push here. **`origin/dev` was overwritten by a teammate's redesign — DO NOT push/force/pull it.** Our work now also lives on a **new branch `origin/qavi-demo`** (safe, doesn't touch dev). |
| **Qavi's personal demo** (demo) | `github.com/uniqavi/oqw-qavi-demo` | The runner-rework version. Public. Auto-deploys to Netlify. **THIS is what we deploy.** |

**Local branch in use:** `local-progress` — tracks `demo/main`. All work
goes here.
- Deploy: `git push demo local-progress:main` (→ Netlify).
- Team mirror (non-destructive): `git push origin local-progress:qavi-demo`.
- **Never** `git push origin …:dev` (would clobber the teammate's redesign).

---

## Scene flow (current)

```
BootScene → MenuScene  (XP OPENING — DOM/CSS, see below)
          → TutorialScene  (sandbox: move, scan, dodge)
          → HomeScene   (LEVEL 1.1: roaming-agent stealth — collect docs, dive into the video)
          → GameScene   (LEVEL 1.2: runner — collect 5 evidence, escape)
          → Level2Scene (SPYGRAM scaffold, not wired into the flow yet)
HUDScene runs alongside GameScene.
```

`src/main.js` registers all scenes. Dev-only `window.__game` handle is
exposed in dev builds (`import.meta.env.DEV`) for jump-to-scene testing.

---

## Where things live

```
src/
  config.js              — ALL tunables (PLAYER, SCROLL, WAVE, POWERUP, SCAN, AGENTS, etc.)
  main.js                — Phaser game + scene registration
  style.css              — DOM UI (XP opening, dialog, HUD frames, pause menu, modals)
  scenes/
    BootScene.js         — boot stub
    MenuScene.js         — XP OPENING controller (welcome login → desktop → Toto call → IE → tutorial)
    TutorialScene.js     — sandbox teaching scene
    HomeScene.js         — LEVEL 1.1 (roaming agents on the home feed, HP, collect docs, portal)
    GameScene.js         — LEVEL 1.2 (auto-scroll runner)
    Level2Scene.js       — SPYGRAM scaffold (not in flow)
    HUDScene.js          — empty stub (HUD is DOM)
  game/
    state.js             — central game state factory + reset (the ported Mission-02 watch page)
    layout.js            — page chrome layout + recSlots/commentSlots (960-space watch page)
    combat.js            — damagePlayer; supports BOTH size-shrink and HP models (p.useHp)
    waveEnemies.js       — runner enemy spawn/update/draw (rec, ad, virus)
    powerups.js          — runner powerups (HP+, FAST, SHIELD, MAGNET)
    hiddenDocs.js        — runner collectible docs (proximity-revealed)
    playerSize.js        — shared effectiveSize(p) helper (HP-scaled)
    scan.js              — shared X-ray scan coverage logic (used by Tutorial; 1.1 no longer scans)
    audio.js             — beep/noise (WebAudio) + MASTER VOLUME source of truth (oqw-volume)
    music.js / sfx.js / voice.js — track/clip/voice loaders, all scaled by master volume
    pauseMenu.js         — reusable ESC pause/volume overlay + wireVolumeControl() helper
    draw.js              — drawHandRect / drawRecCard / drawComment
    physics.js           — wob / dist / aabb / playerBox(player) helpers
    endSequence.js       — old L1 ending FX (mostly unused in runner)
    agents/              — Mission-02 agents (chasingRecs, shootingSearch, gunShooter,
                            fallingComment, explodingLike, crushingCookie). Phaser-free.
                            Re-used by HomeScene (1.1); disabled in GameScene runner via L1 flags.
  game/menuEffects.js    — dust/rain/twinkles for the OLD projector menu (now unused)
public/                  — static assets:
    windows-xp-Wallpaper.jpg          — desktop Bliss wallpaper (used by .xp-desktop)
    windows-xp-lock-Screen.png        — reference only (the welcome screen is recreated in CSS)
    Reference Home Screen.png         — reference only (XP desktop incl. the error-window cascade)
    music/ sfx/ voice/ portraits/ ... — drop-in audio + art
index.html               — DOM (browser-chrome frame, XP opening, HUD frames, pause menu, dialogs)
netlify.toml             — build config (npm run build → dist)
```

---

## The XP opening (MenuScene) — NEW this session

Replaces the old "projector dark-room" main menu + codename modal + cutscene.
Pure DOM/CSS (in `index.html` + `style.css`), driven by `MenuScene.js`.

Flow:
1. **XP welcome screen** (`#xp-welcome`) = the main menu. Click **Administrator** →
   a password box appears with the hint **"type your name."** Whatever you type is
   stored as the codename (`localStorage 'oqw-name'`) Toto uses all game. Guest tile
   is disabled (deny ding). "Turn off computer" = deny ding.
2. **XP desktop** (`#xp-desktop`) — Bliss wallpaper, desktop icons (My Computer,
   Recycle Bin, My Documents, readme.txt, Internet), taskbar (green Start, quick
   launch, task buttons, system tray with live clock + volume + shield), Start menu.
3. **Toto incoming-call window** (`#xp-call`) pops up after the desktop settles —
   anonymous avatar = a little red browser window inside the profile picture.
   **Accept** → the old-friends dialogue (`CALL_LINES` in MenuScene, reused from the
   old cutscene) plays. After the call, the Internet path pulses.
4. **Internet Explorer** (`#xp-browser`, desktop icon / Start / quick-launch) opens,
   "loads," then → `TutorialScene`.

Design choices (locked for now): only the browser advances the game; other
icons/Start items give a polite XP error ding. **Difficulty picker retired —
defaults to Easy** (`oqw-difficulty='easy'`). Pre-game volume is reachable from the
system-tray speaker; in-game from the ESC pause menu. The desktop error-window
cascade (see `Reference Home Screen.png`) is intentionally **NOT built yet**.

Gotcha: the XP layers are DOM overlays, NOT tied to `menu-mode`, so MenuScene
explicitly hides them on `enterTutorial()` / SHUTDOWN or they linger over the game.

---

## Audio + pause system — NEW this session

- **Master volume** (0..1) lives in `audio.js` (`getMasterVolume`/`setMasterVolume`/
  `onMasterVolumeChange`, persisted as `oqw-volume`, default 0.7). The synth routes
  through a master `GainNode`; `music.js`/`sfx.js`/`voice.js` multiply by it and
  live-apply. The old per-channel `oqw-audio` mute flag is retired (forced unmuted).
- **`wireVolumeControl({slider,val,mute})`** (in `pauseMenu.js`) binds any
  slider+%+mute widget to the master volume. Used by the XP tray popup and the
  in-game ESC pause menu (and previously the menu settings).
- **ESC pause menu** (`#pause-menu`, controller in `pauseMenu.js`): master-volume
  slider + mute + RESUME + MAIN MENU. Wired into **HomeScene, GameScene,
  TutorialScene, Level2Scene**. While open, the scene **freezes game time + logic,
  and narration is frozen** (no click/key advance, typewriter halts). `isPauseOpen()`
  gates scene `update()`; `resetPauseMenu()` on shutdown.

---

## Levels — current state

### Tutorial — `TutorialScene.js`
- Wireframe "dev sandbox" page; teaches WASD → scan → collect doc → chaser →
  gun avatar → INFILTRATE exit. Toto narration. After exit → `HomeScene`.

### Level 1.1 — `HomeScene.js` ("Hidden Agents") — REWORKED this session
- **Scanning removed.** The fake-YouTube home feed is now a hostile-UI playground.
  WASD move + **SHIFT dash**; **HP bar** (same model as 1.2) — at 0 HP "WINDOW
  CRASHED" → press `R` to retry.
- Three re-enabled Mission-02 agents, remapped onto the 1920-wide feed:
  - **gunShooter** = the account avatar — pulls a gun, aims (laser), fires ONE
    lethal shot. Rush it to dodge. One-shot per level (then `spent`). `GUN_GRACE 4s`.
  - **chasingRecs** = two grid cards (`videos[3]`, `videos[8]`) tear off and chase.
  - **shootingSearch** = the top search bar fires autocomplete shrapnel near the top.
  - Agents stay inert until the intro narration is dismissed (`this.started`).
- **Collect 4 evidence docs** (`DOCS_TARGET`, `buildDocs()` positions) → the boosted
  video ("What They Don't Want You To See") pulses green → move onto it → Toto loses
  contact → drops into 1.2 (`GameScene`, `fromHomePage:true`).
- Agents are the existing `src/game/agents/*` modules. Enabling edits made this
  session: `combat.js` HP branch (`p.useHp`), `chasingRecs` homes to `a.slot`,
  `gunShooter` bullets bound to `state.worldW`.

### Level 1.2 — `GameScene.js` (runner)
- Infinite auto-scroll shmup. Collect 5 hidden docs → escape sequence → win.
  Unchanged this session except the ESC pause wiring. (See git history for runner
  tuning: slower scroll, HP+ powerup, rare-long shield/magnet, escape immunity.)

### Level 2 — `Level2Scene.js`
- Telegram-style SPYGRAM scaffold. Not in the flow yet. Now has ESC pause wired.

---

## Key tunables

`src/config.js` holds runner/agent tunables (`PLAYER`, `SCROLL`, `WAVE`, `POWERUP`,
`AGENTS`, `DAMAGE`, etc.). **Level 1.1 specifics live in `HomeScene.js`:**
`DOCS_TARGET=4`, `GUN_GRACE=4`, doc positions in `buildDocs()`, agent trigger ranges
(chasers 380 / search 460 / gun 700, ×difficulty mult), chaser card picks
(`videos[3]`, `videos[8]`).

---

## Naming (locked, do not change)

| Role | Name |
|---|---|
| Megacorp | **HUSH** (slogan: "shh") |
| Player handler | **Toto** |
| Enemy boss (planned L2 climax) | **Max** |
| Stolen identity (planned L2) | **Lewis** |
| Video site (L1) | **TotallyNormalTube** |
| Chat app (L2) | **SPYGRAM** |

Player codename entered at the XP login, stored in `localStorage 'oqw-name'`.
Dialog uses `{name}` placeholders, resolved at render time.
Per-speaker chip colors: TOTO red, YOU blue, SYSTEM green, MAX purple, PHONE grey.

---

## Conventions

- **Edits, not new files** unless really needed.
- **Tunables in `config.js`** (or clearly at the top of the scene for level-specific).
- **Hand-drawn aesthetic** for canvas — use `drawHandRect` for wobbly rectangles.
- **No emojis in canvas-rendered game text** (DOM UI may use them).
- **Local commits ok.** Deploy: `git push demo local-progress:main`. Team mirror:
  `git push origin local-progress:qavi-demo`. **NEVER push origin/dev.**
- **Commit messages:** lowercase verb start, short body, end with the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- **Verify in the preview connector before reporting "done."** Use the dev-only
  `window.__game` handle to jump scenes.

---

## Dev-mode jump-to-scene snippet

Paste in the browser console (Vite dev server running) to skip the opening:

```js
['xp-welcome','xp-desktop'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
document.body.classList.remove('menu-mode');
__game.scene.scenes.forEach(s => { if (s.scene.isActive() && s.scene.key !== 'BootScene') __game.scene.stop(s.scene.key); });
// pick one:
__game.scene.start('HomeScene', { difficulty: 'easy' });       // Level 1.1
// __game.scene.start('GameScene', { difficulty: 'easy' });    // Level 1.2 runner
// __game.scene.launch('HUDScene');                            // only for GameScene
```

There's also a 🧪 TEST panel (GameScene) with IMMUNE / BIG SIZE / DOC MAGNET toggles.

---

## Pending / planned (priority order)

1. **XP opening polish** — real XP icon PNGs (vs current CSS art); rename Guest→Tim
   to match the reference; remove the now-orphaned `settings-modal`/`help-modal`
   DOM (nothing opens them); optional fade on the desktop→tutorial handoff.
2. **Desktop error-window cascade** — the "later" part of `Reference Home Screen.png`
   (the storm of HUSH error popups). Not built yet.
3. **Level 1.1 tuning** — playtest doc positions, agent trigger ranges, gun grace,
   chaser picks. The gun is currently one-shot; could re-arm on a cooldown.
4. **Tunnel transition 1.2 → 2.0** — SVG window-with-eyes char floating through a
   parallax antivirus tunnel, then into Level 2. (Art to be dropped in
   `public/window/` + `public/tunnel/`.)
5. **Level 2 (SPYGRAM) gameplay** — currently a scaffold. Bring back the full
   Mission-02 mechanics (cookie jar, gaze/cursor, drag-comment, subscribe) +
   the runner/scroller layer. (User's stated plan: confident-on-1.1 first.)
6. **Gemini thumbnails for HomeScene** cards.

---

## Recent commits (newest first)

```
77a4090 remove stale design docs; add intro-sequence notes
5ec17a4 replace opening with a windows xp welcome + desktop flow
056676c rework level 1.1 into a roaming-agent stealth level; add in-game pause menu
1aba9aa add audio system: master volume, sfx module, music/voice integration
d93e95f Add HANDOFF.md + NEXT_SESSION.md for cross-chat continuity
```

(All pushed to `demo/main` → live on Netlify, and mirrored to `origin/qavi-demo`.)

---

## Known quirks / gotchas

- **XP overlays are DOM, not tied to `menu-mode`** — hide them explicitly on scene
  handoff or they cover the game canvas. (MenuScene does this in `enterTutorial`.)
- **The Mission-02 agents are 960-space.** `layout.js`/`state.js`/`combat.js`/
  `agents/*` are the ported old watch page. HomeScene drives a subset on the wider
  1920 feed by overriding agent coords + setting `player.size=120` so the shared
  `playerBox()` hitbox matches the 120×90 window.
- `PH` in `config.js` is `1e9` — the runner page is effectively infinite. Don't loop
  `0..PH`.
- `state.player.test.{immune,size,magnet}` flags are dev-panel only (GameScene).
  `combat.damagePlayer` now also respects `p.test.immune`.
- Preview connector throttles `requestAnimationFrame` when backgrounded — screenshot
  to force a frame when an eval loop won't progress.
- Linux line endings → Git CRLF warnings on save. Harmless.

---

## Quick build / dev commands

```bash
npm install                          # one-time
npm run dev                          # start Vite dev server (port 5173)
npx vite build                       # production build → dist/
git push demo local-progress:main    # deploy to Netlify
git push origin local-progress:qavi-demo   # mirror to team repo (NOT dev)
```
