# HANDOFF — Operation Quiet Window

> Catch-up doc for a fresh Claude chat. Read this end-to-end before touching
> code. Last updated: 2026-06-14.

---

## What this is

A Phaser 3 + Vite browser game. The player is a red browser window
infiltrating fake websites run by a megacorp called **HUSH** to expose
buried propaganda. Comedic, self-aware tone. Built to be playable by
non-gamers but rewarding for thorough players.

**Stack:** Phaser 3 + Vite. Most game visuals are **hand-coded 2D canvas
draws** to an overlay element (`#oqw`) layered above Phaser's canvas — not
Phaser GameObjects. Phaser handles input + scene lifecycle; everything else
is plain `ctx.fillRect(...)` etc.

**Viewport:** logical 1920×1080, CSS-scaled to fit the browser window.

---

## Repos and branches

| | URL | Used for |
|---|---|---|
| **Team repo** (origin) | `github.com/uniqavi/operation-quiet-window-web` | Other teammates push here. Local `dev` is stale; remote `dev` was overwritten by a teammate's redesign. **DO NOT pull or push origin/dev.** |
| **Qavi's personal demo** (demo) | `github.com/uniqavi/oqw-qavi-demo` | The runner-rework version. Public. Auto-deploys to Netlify. **THIS is what we work on.** |

**Local branch in use:** `local-progress` — tracks `demo/main`. All work
goes here. Use `git push demo local-progress:main` to deploy.

**Netlify live URL:** the Netlify site for `oqw-qavi-demo` (Qavi has the
exact subdomain). `netlify.toml` is committed — auto-build from `npm run
build`, publish `dist`.

---

## Scene flow (post-rework)

```
BootScene → MenuScene (cutscene with codename input)
          → TutorialScene (sandbox: move, scan, dodge)
          → HomeScene (LEVEL 1.1: take down 5 propaganda videos)
          → GameScene (LEVEL 1.2: runner — collect 5 evidence, escape)
          → Level2Scene (SPYGRAM scaffold, not built into the flow yet)
HUDScene runs alongside GameScene.
```

`src/main.js` registers all scenes. Dev-only `window.__game` handle is
exposed in dev builds (`import.meta.env.DEV`) for jump-to-scene testing.

---

## Where things live

```
src/
  config.js              — ALL tunables (PLAYER, SCROLL, WAVE, POWERUP, SCAN, etc.)
  main.js                — Phaser game + scene registration
  style.css              — DOM UI (dialog, HUD frames, test panel, modals)
  scenes/
    BootScene.js         — boot stub
    MenuScene.js         — main menu + cutscene (codename input)
    TutorialScene.js     — sandbox teaching scene
    HomeScene.js         — LEVEL 1.1 (fake YT home, scan-to-takedown)
    GameScene.js         — LEVEL 1.2 (auto-scroll runner)
    Level2Scene.js       — SPYGRAM scaffold (not in flow)
    HUDScene.js          — empty stub (HUD is DOM)
  game/
    state.js             — central game state factory + reset
    layout.js            — page chrome layout
    waveEnemies.js       — runner enemy spawn/update/draw (rec, ad, virus)
    powerups.js          — runner powerups (HP+, FAST, SHIELD, MAGNET)
    hiddenDocs.js        — runner collectible docs (proximity-revealed)
    playerSize.js        — shared effectiveSize(p) helper (HP-scaled)
    scan.js              — shared X-ray scan coverage logic
    audio.js             — beep/noise helpers (WebAudio synth)
    music.js             — track loader + crossfade
    voice.js             — voice clip loader (drop-in mp3s)
    draw.js              — drawHandRect / drawRecCard / drawComment
    physics.js           — wob (jitter) + dist helpers
    endSequence.js       — old L1 ending FX (mostly unused in runner)
    agents/              — OLD agents (chasingRecs, gunShooter, etc.)
                            disabled in runner (config L1 flags all false)
                            kept in tree so the discovery design can come back
  game/menuEffects.js    — dust/rain/twinkles for the menu room
public/                  — static assets (menu-bg.png, hole.png, music, voice)
index.html               — DOM (browser-chrome frame, menus, dialogs, HUD frames)
netlify.toml             — build config (npm run build → dist)
```

---

## Levels — current state

### Tutorial — `TutorialScene.js`
- Wireframe "dev sandbox" page; teaches WASD → scan (X-ray reveal) →
  collect doc → chaser enemy → gun avatar → INFILTRATE exit.
- Spotlight pause when each enemy first activates.
- Toto narration. After exit → goes to `HomeScene`.

### Level 1.1 — `HomeScene.js` ("Take Down the Feed")
- Fake YouTube home page, hand-drawn aesthetic. WASD + scrolls vertically
  with the window (camera follows).
- Several videos are viral propaganda with insane view counts (1.8B+);
  rest are normal traffic.
- **HOLD SPACE on a video to scan it down** (~3.5s). Hover shows view
  count + `HOLD SPACE` prompt.
- Take down 4 propaganda → go for the 5th (buried "What They Don't Want
  You To See", 6.9B views) → it **fights back** → drops into 1.2.
- **Scanning a normal video → EXPOSED → retry (R)**.
- Narration: Toto + YOU exploring together; Toto loses connection on the
  5th; YOU solo from there.

### Level 1.2 — `GameScene.js` (runner)
- Infinite auto-scroll. Camera descends; player moves freely within
  viewport (WASD); SHIFT = player-speed boost (does NOT affect scroll).
- Enemies (3 types: small square `rec`, scam `ad` popup, fake `virus`
  popup) spawn below the viewport and fly UP at the player. Constant
  slow speed; brief X-homing then straight. Blast + vanish on hit.
- 4 powerups:
  - **HP+** (common) — permanent +22 HP. Shows floating "HP MAX" if full.
  - **FAST** (common) — 5s player-speed buff.
  - **SHIELD** (rare) — 12s damage immunity.
  - **MAGNET** (rare) — 12s doc pull.
- **Hidden docs** (5 to collect): spawn rarely from below, proximity-
  revealed, deeper-gold tile so they're easy to spot on the white page.
- Collecting 5th doc → **escape sequence**: scroll decelerates, a
  weird grey `@hush_compliance` comment scrolls into frame, player
  drags it aside → broken hole revealed → window enters → win flow.
- During escape: damage is disabled (no enemy chip).
- Win currently lands on the legacy "won" overlay — **placeholder** for
  the tunnel-to-Level-2 transition the user is planning.

### Level 2 — `Level2Scene.js`
- Telegram-style SPYGRAM scaffold. **Not** in the flow yet.
- Will be the destination of the tunnel transition (planned).

---

## Key tunables (`src/config.js`)

| | Value | Notes |
|---|---|---|
| `PLAYER.startSize` | 56 | base window size |
| `PLAYER.baseSpeed` | 360 | player WASD speed |
| `PLAYER.boostMul` | 1.9 | SHIFT player-only boost |
| `PLAYER.maxHp` | 100 | runner HP |
| `SCROLL.slowSpeed` | 34 | px/sec initial scroll (calm) |
| `SCROLL.fastSpeed` | 200 | px/sec ramped max |
| `SCROLL.slowDuration` | 16s | calm phase before ramp |
| `SCROLL.rampDuration` | 32s | linear ramp slow → fast |
| `WAVE.speed` | 85 | constant enemy upward speed |
| `WAVE.startInterval` | 3.0s → 1.1s | spawn rate by depth |
| `POWERUP.startInterval` | 10s ± 4s | spawn cadence |
| `POWERUP.weights` | hp:6 speed:5 immune:1 magnet:1 | rarity |
| `POWERUP.durations` | hp:0 speed:5 immune:12 magnet:12 | per-type buff length |
| `POWERUP.hpHeal` | 22 | HP+ heal amount |
| `SCAN.coverThreshold` | 0.85 | sweep coverage to latch |

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

Player codename is entered at runtime, stored in `localStorage` under
`oqw-name`. Dialog uses `{name}` placeholders, resolved at render time.

Per-speaker chip colors: TOTO red, YOU blue, SYSTEM green, MAX purple, PHONE grey.

---

## Conventions

- **Edits, not new files.** Don't add new modules unless really needed.
- **Tunables in `config.js`.** No magic numbers in scenes.
- **Hand-drawn aesthetic.** Use `drawHandRect` for wobbly rectangles.
- **No emojis in rendered text.** User is replacing thumbnails with Gemini
  art. Page chrome is intentionally text-only / placeholder circles.
- **Local commits ok, NEVER push to `origin/dev`.** Push to `demo/main`
  only: `git push demo local-progress:main`.
- **Commit messages:** lowercase verb start, then short body, end with
  the Co-Authored-By trailer.
- **Verify in the preview connector before reporting "done"** —
  build-clean alone isn't proof. The dev-only `window.__game` handle is
  exposed for this.

---

## Dev-mode jump-to-scene snippet

Paste in the browser console (after Vite dev server is running) to skip
the menu/cutscene:

```js
['main-menu','diff-menu','intro','name-prompt'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
document.body.classList.remove('menu-mode');
__game.scene.scenes.forEach(s => { if (s.scene.isActive() && s.scene.key !== 'BootScene') __game.scene.stop(s.scene.key); });
// pick one:
__game.scene.start('HomeScene', { difficulty: 'easy' });       // Level 1.1
// __game.scene.start('GameScene', { difficulty: 'easy' });    // Level 1.2 runner
// __game.scene.launch('HUDScene');                            // only for GameScene
```

There's also a 🧪 TEST panel (top-right under the HP frame in GameScene)
with IMMUNE / BIG SIZE / DOC MAGNET toggles for the dev demo.

---

## Pending / planned (priority order)

1. **Tunnel transition between 1.2 and 2.0** — Qavi has SVG art of a
   "window with eyes + expressions" from a teammate. Plan: parallax-
   scrolling tunnel background (Gemini PNG), window-with-eyes character
   floats through with state-driven expression swaps, antivirus hazards
   to dodge, then arrive at Level 2.
2. **Gemini-generated thumbnails for HomeScene** — replace the
   color-block placeholders with real art. The Shorts cards already
   have placeholder circles where the art goes.
3. **Level 2 (SPYGRAM) gameplay** — currently just a scaffold. Design
   notes still in `docs/LEVEL2.md` (uses old names: needs HUSH/SPYGRAM
   pass).
4. **Music + voice assets** — drop-in tracks/clips for menu, levels,
   intro cutscene. README in `public/music/` + `public/voice/`.
5. **Polish / playtest tuning** — scan time (1.1), powerup balance,
   enemy spawn weights.

---

## Recent commits (newest first)

```
b75d2de Runner tuning: slower scroll, HP+ powerup, rare-long shield/magnet, escape immunity
df88b21 1.1 polish: move HUD off the logo, manual scan, Toto+YOU narration
1c91b19 Level 1.1 playable: take down viral propaganda by view count
417c95f Add Level 1.1 home-page base layout + disable stale onboarding tips
3febddd Add netlify.toml for one-click deploy
bc70a59 Runner polish: enemy redesign, dev test panel, escape fixes, UI cleanup
8375099 Infinite comment feed + scripted escape sequence after 5 docs
95255d5 Runner tuning pass: slower start, slower enemies, smaller window, UI spacing
8ee4dcc Runner rework: vertical shmup loop, HP-scaled size, task/HP HUD, hidden docs
48ec9c9 Cutscene + dialog rework: codename, old-friends script, chip speakers
```

---

## Known quirks / gotchas

- `PH` in `config.js` is `1e9` — the runner page is effectively infinite.
  Don't loop from `0` to `PH` anywhere (`for (let i=0; i<=PH; ...)`
  will hang the renderer). Bound grid draws to the current viewport.
- `state.player.test.{immune,size,magnet}` flags are dev-panel only.
  Don't hide them — Qavi uses them while demoing.
- `docs/DESIGN.md`, `LEVEL1.md`, `LEVEL2.md` are stale (deleted in
  working tree) and describe the older discovery-mode design. The
  runner rework supersedes most of it; reference for vibe only.
- Linux line endings on save → Git complains about CRLF. Harmless.
- Preview connector's `requestAnimationFrame` is throttled when the
  preview tab is backgrounded. Many test eval loops won't progress unless
  you screenshot (which forces a frame).

---

## Quick build / dev commands

```bash
npm install                   # one-time
npm run dev                   # start Vite dev server (port 5173)
npx vite build                # production build → dist/
git push demo local-progress:main   # deploy to Netlify via personal repo
```

**Netlify build settings** are read from `netlify.toml` — no manual
config needed when connecting the repo.
