# PROJECT STATUS — Operation Quiet Window

> Catch-up file for a fresh session. Read this + `docs/LEVEL1.md` +
> `docs/LEVEL2.md` to get fully oriented. Last updated: 2026-06.

---

## What this is

A Phaser 3 stealth/puzzle game. You play a **red browser window** ("a
75-pixel rectangle") infiltrating fake websites run by megacorp **HUSH** to
uncover buried files. Comedic, self-aware tone (Direction A). Built to be
accessible — a discovery game, not a reflex game.

- **Path:** `D:\EVE2\operation-quiet-window-web`
- **Working branch:** `dev` (deploys to Netlify automatically on push)
- **Stable branch:** `master` (rarely touched)
- **Stack:** Phaser 3 + Vite. Rendering is a **vanilla 2D canvas overlay**
  (`#oqw`) drawn on top of Phaser's canvas — most game visuals are hand-coded
  `ctx` draws, not Phaser GameObjects.
- **Verify with:** `npx vite build` (don't start a dev server unless asked).
- **Viewport:** locked 1920×1080, CSS-scaled to fit.

---

## Cast & naming (locked)

| Role | Name |
|---|---|
| Megacorp | **HUSH** (slogan: "shh") |
| Handler (ally, phone calls) | **Toto** |
| Enemy boss (L2 climax) | **Max** (Director of Engagement) |
| Stolen identity (L2) | **Lewis** |
| Video site (L1) | **TotallyNormalTube** |
| Chat app (L2) | **SPYGRAM** |
| F1-driver names | used for L2 chat NPCs (charles, oscar, lando, fernando, george) |

---

## Scene flow

```
BootScene → MenuScene → (cutscene) → TutorialScene → GameScene (L1)
                                                        └→ Level2Scene (SPYGRAM, scaffold)
HUDScene runs alongside gameplay.
```

Registered in `src/main.js`.

---

## What's BUILT

### Menu (`MenuScene.js`, `index.html`, `style.css`)
- Projected "ink terminal" main menu over a hand-drawn hacker-room
  background image (`public/menu-bg.png`), with perspective tilt, canvas
  particle effects (`menuEffects.js` — dust/rain/steam/twinkles), and
  matching difficulty / settings / help screens (all `.ink-layer` style).
- Intro cutscene: trimmed phone call with Toto (typewriter, portraits,
  SKIP button). Ends by "deploying to a sandbox" → bridges to tutorial.

### Tutorial (`TutorialScene.js`)
- Wireframe "dev sandbox" website (header/hero/grid/footer) the player
  descends while Toto narrates. Teaches: move → scan (X-ray reveal) →
  collect → chaser enemy → gun enemy (each with a "waking" beat + spotlight
  pause) → INFILTRATE exit (with Toto's farewell + confirm).
- Non-lethal. Anti-softlock failsafe (escalating hints → auto-complete).
  Fade-from-black entry. SKIP / ESC bypass.

### Level 1 (`GameScene.js`) — TotallyNormalTube
- Full fake-YouTube page rendered to canvas (header, video player,
  recs sidebar, comments, etc.).
- **X-ray mechanic** (teammate-built): docs/cookies live in a hidden
  under-layer revealed only inside the player window (live, not yet
  persistent per the LEVEL1.md design).
- **Hole exit** (new): a grey "suspicious comment" sits inline in the
  comment column; dragging it aside reveals a broken-wall passage
  (`public/hole.png`) + plays the intel memo. Escaping = slip through the
  hole once docs+cookie collected. SUBSCRIBE is now decorative, sits in the
  action row beside SHARE with a 🔔 bell.
- **Difficulty pass:** L1 reduced to 2 active enemies (gun + 1 chaser); rest
  disabled via `config.L1` toggles. Gaze/cursor disabled in L1. EASY is the
  default and gentle. End sequence = top-to-bottom "short-circuit sweep" with
  cinematic camera.

### Level 2 (`Level2Scene.js`) — SPYGRAM
- Scaffold only: Telegram-style dark chat UI, player movable, suspicion bar
  + credential timer HUD, one placeholder @mention hazard. Reachable via the
  unlocked tab after L1. Full design in `docs/LEVEL2.md` (not built).

### Drop-in asset systems (teammates fill these; missing files no-op)
- `public/music/` (`music.js`) — menu/level1/level2/hale/tension tracks
- `public/voice/` (`voice.js`) — per-line dialogue clips
- `public/portraits/` — toto/max/lewis/you + F1 NPC avatars
- READMEs in each folder have AI-generation prompts.

---

## What's PENDING (priority order)

1. **Persistent evidence + dossier** — upgrade the live-only X-ray to
   persistent reveals + an auto-connecting evidence board (LEVEL1.md §1-2).
2. **Hidden-text X-ray on the real page** — reveal alternate text under
   visible page text (titles, view counts, etc.) — LEVEL1.md §2 has the list.
3. **Home page (L1.1)** + cursor→window origin/transformation mini-puzzle.
4. **Channel page (L1.3)** → whistleblower trail → SPYGRAM handoff.
5. **Level 2 build** from `docs/LEVEL2.md` (Lattice/SPYGRAM, Hale encounter).
6. **Three-endings system** driven by accumulated evidence.
7. Asset generation (music, voice, portraits, AI news video for L1 player).

---

## Known issues / cleanup

- **`public/hole.png` is ~5 MB** — should be compressed (tinypng) to ~100-300KB.
- **`public/menu-bg.png` is ~5 MB** — same, could be optimized.
- **Voice README is stale** — the cutscene lines were trimmed/rewritten, so
  the `intro-*` voice line list in `public/voice/README.md` no longer matches.
  Refresh before recording voice.
- **`docs/DESIGN.md`** still references the old WW3/VEIL storyline — needs a
  rewrite for the HUSH direction (low priority).
- X-ray reveal is **live-only** (vanishes when window moves) — the design
  calls for **persistent**; not yet changed.

---

## Conventions

- Each enemy/agent lives in `src/game/agents/<name>.js`, Phaser-free, imports
  only from `src/game/` modules. Update + draw functions called from scenes.
- Tunables in `src/config.js` (PLAYER, CAMERA, AGENTS, DAMAGE, DIFFICULTY, L1).
- New scenes follow the `Level2Scene.js` pattern: grab `#oqw`, own resize +
  camera, reuse shared draw/audio modules.
- Commit messages end with the Co-Authored-By trailer. Commit per logical
  change; push to `dev`; Netlify auto-deploys (~60-90s).
- `.claude/` is gitignored (local agent data).

---

## Git state

Branch `dev`, recent commits (newest first):
- Replace SUBSCRIBE exit with hidden hole behind suspicious comment
- Address playtest feedback: trim cutscene, fix tutorial softlock + transition
- Add Level 1.0 tutorial scene
- L1 accessibility pass: reduce enemies + soften difficulty
- Add Level 1 design spec + gitignore

**Uncommitted at handoff:** the hole.png image-swap in `drawHole()` and the
SUBSCRIBE-beside-SHARE + bell change (both in `GameScene.js`/`layout.js`).
Commit these early in the next session.
