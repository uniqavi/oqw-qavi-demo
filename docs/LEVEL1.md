# LEVEL 1 — TOTALLYNORMALTUBE

> Design spec for Operation Quiet Window, Level 1 (the full multi-page rework).
> Status: design locked, build in progress.
> Sister doc: `docs/LEVEL2.md` (SPYGRAM). Read `## Design Philosophy` first.

---

## 0. Design Philosophy (read this first)

**Operation Quiet Window is a discovery game, not a reflex game.**

- The challenge is *seeing what's hidden*, not *twitch dodging*.
- Enemies are seasoning that adds tension — they are never the main course.
- A non-gamer should be able to finish it. A thorough player earns the best ending.
- When something is too hard, cut it. When something is obtuse, simplify it.
- Protect: the discovery, the satire, the mystery.

Every decision below flows from this.

---

## 1. The Core Mechanic — X-Ray Scanning

The player IS a browser window. Moving the window over page content reveals
the **hidden truth** beneath the innocent-looking surface. The window is an
inspector that bypasses HUSH's content filters.

### How it works
- Page elements have two layers: a **visible** (lie) layer and a **hidden**
  (truth) layer.
- When the window's bounds overlap a hidden-text element, the truth shows
  *inside the window only* — like an X-ray / magnifying glass.
- Once an element has been **fully scanned** (window covered it for a brief
  moment), its reveal becomes **persistent** — it stays visible on the page
  even after the window moves away. The page visibly transforms as you strip
  away its lies.

### Rules
- **Free** — scanning costs nothing. Encourages exploration.
- **Persistent** — revealed truth stays revealed (key difference from a
  live-only scanner). The end-state page is covered in exposed truths.
- **No precision required** — you don't aim; you just move over things.

### Visual treatment (polish)
- Faint **scanline effect** inside the window while scanning.
- Hidden text appears with a brief **typewriter reveal** (~0.3s) on first scan.
- **Glow on the window border** when it's over un-scanned hidden content
  ("there's something here").
- Soft **decoding/clicking sound** when a new fragment is revealed.
- Track revealed elements so the sound + typewriter only fire once each.

---

## 2. Evidence & The Dossier (accessibility core)

Scanning reveals **evidence fragments**. They collect into a **DOSSIER** —
an auto-connecting log inspired by Outer Wilds' ship log.

### The dossier
- Corner HUD element showing `DOSSIER [ n / N FOUND ]`.
- As fragments are found, they appear as nodes.
- The game **auto-draws connections** between related fragments — the player
  never has to deduce anything manually.
- When a cluster completes, a **CONCLUSION** lights up automatically.
- Click/hotkey opens a full dossier view (pauses game) to read everything.

### Why auto-connecting
The satisfaction is in *reading* the assembled truth, not *solving* a puzzle.
That's the accessibility unlock — detective-game payoff without detective-game
frustration. A confused player is never stuck; they just keep scanning.

### Fragment example (Level 1.2)
| Hidden in | Visible text | Revealed fragment |
|---|---|---|
| Video title | `What They Don't Want You To See` | `PROJECT WHITEWASH` |
| View count | `847K views` | `engagement metrics: FALSIFIED` |
| Uploader name | `UnknownUploader` | `authorized by: M. HALE` |
| Top comment | `who else watching in 19██?` | `they cancelled the news cycle` |
| Description | `posted ████████` | `the public stays bored, stays quiet` |

Assembled conclusion:
> **PROJECT WHITEWASH** — M. Hale authorized falsifying engagement metrics
> and cancelling news cycles. *The public stays bored. Bored stays quiet.*
> Trail leads to → THE UPLOADER.

---

## 3. The Exit — "Follow the Lead" (no SUBSCRIBE button)

Progression is clue-driven. There is **no "press X to win" button.**

### Flow
1. Scan all key fragments → dossier completes.
2. The conclusion ends with a **lead** — a destination hidden on the page.
3. That element goes **live** (starts glowing).
4. Player moves the window **onto** the live element.
5. Prompt: `▸ FOLLOW LEAD`.
6. Page navigates → next sub-level loads.

### Rules
- The lead only activates **after** the dossier completes. Before that the
  element is inert (cannot leave early, cannot get lost).
- Navigation reuses the window-move motion the player already knows.
- Diegetic: you uncovered a hyperlink by exposing the truth; you follow it.

### Page transition (signature touch)
**The window (player) persists across the page change. The page reloads
around it.**
- URL bar types the new address.
- Old page glitches/fades out.
- New page renders.
- The red window stays on screen the whole time.

You are the constant; the world reloads around you. Reinforces "you ARE the
browser."

---

## 4. Sub-Level Structure

```
1.0  TUTORIAL        — learn to move, scan, dodge (safe, no fail)
1.1  HOME PAGE       — find the buried video + origin/transformation
1.2  VIDEO PAGE      — scan, discover Project Whitewash + M. Hale
1.3  CHANNEL PAGE    — trace the leak to a HUSH insider → SPYGRAM door
          ↓
   (hand off to LEVEL 2 — SPYGRAM)
```

### The narrative arc
**Find the lie → understand the lie → find who exposed it → become them.**

| Sub-level | You investigate | Lead points to | Evidence gained |
|---|---|---|---|
| 1.1 Home | Which video did HUSH bury? | the buried video | "this video is shadow-hidden" |
| 1.2 Video | What's in it? Who made it? | the uploader | Project Whitewash, M. Hale |
| 1.3 Channel | *Who* leaked it? | SPYGRAM access | an insider whistleblower + a way in |

**Why 1.3 matters:** it answers how you get into SPYGRAM. You trace the leak
back to a HUSH insider; their compromised account is the door into L2 (the
Lewis identity you steal). The L1→L2 handoff becomes a story beat, not a
convenience:
> You followed the truth back to the person who leaked it. They're inside
> HUSH. And they left a way in.

---

## 5. The Origin / Transformation (Level 1.1)

The player's "why am I a window" is answered through gameplay, not a cutscene.

### Flow on the Home page
1. Player arrives controlling a **cursor** (not the rectangle yet).
2. They browse the wobbly YouTube-style grid. Most thumbnails are **locked**
   (dim, ⊘ on hover). ONE is the target — found by scanning (its hidden text
   reveals `[BURIED]` / `[TARGET]` while decoys reveal `[BOT TRAFFIC]` etc.).
3. Click the target → a **mini "compile" puzzle** (keep simple: click EXECUTE
   on 3 steps in order — compile / obfuscate / inject).
4. **Transformation:** cursor flickers → red rectangle materializes at the
   cursor position, boots up (blink → fill → solid).
5. Toto: *"There you are."*
6. Page navigates to 1.2. Player is now the window.

Lore: Toto wrote a stealth browser agent disguised as normal traffic. You ARE
that agent. The window is the hacking tool — that's why you can read what
HUSH hides.

---

## 6. Tutorial (Level 1.0)

A stripped-down **wireframe placeholder page** — gray generic component cards
(image-block + text-bars), distinct from the real game so players feel safe.
"You're training in a dev placeholder before going live."

### Layout — 5 vertical zones, player descends top→bottom
```
ZONE 1  decorative placeholder cards (atmosphere)
ZONE 2  draggable gray block + CLASSIFIED rect      (teach cover)
ZONE 3  first scan target                            (teach scanning)
ZONE 4  chasing-rec enemy + gun avatar               (teach dodge, spotlight)
ZONE 5  [ INFILTRATE → ]                             (exit)
```

### Steps (Toto narrates each)
1. **Move** — WASD/arrows. ✓ after moving >100px.
2. **Cover** — drag the gray block over the CLASSIFIED rect.
3. **Scan** — slide the window over a placeholder; hidden text revealed.
   Toto: *"That's what the page actually says. The visible part is
   decoration. Every page on HUSH lies like this — scan everything."*
4. **Dodge + Spotlight** — see §6.1.
5. **Infiltrate** — walk into the `INFILTRATE →` button to finish.

### 6.1 The Spotlight Pause (teaching enemies)
When the player first nears an enemy, it activates (pulsing red outline) and
the game **spotlights** it:
- Game freezes (time, enemies, player all stop).
- Dark overlay fades in (`rgba(0,0,0,0.7)`), leaving a "hole" around the enemy.
- Camera smoothly zooms in (~1.5x) and centers the enemy.
- Toto dialogue box slides up from the bottom.
- Click / SPACE → camera zooms back, overlay fades, game resumes.
- Each enemy type spotlights **once** per tutorial.

Tutorial enemies: **chasing rec** + **gun avatar** (both shown via spotlight).

Toto lines:
- Chasing rec: *"These wake up when you get close. They chase. Avoid contact."*
- Gun avatar: *"This one's worse. The avatar pulls a gun. If it's aiming,
  don't run — RUSH IT. Get close, break the aim."*

### Tutorial safety (cannot die)
| Setting | Tutorial value |
|---|---|
| Chasing rec speed | 220 (slow) |
| Chasing rec damage | 5 (nibble) |
| Gun aim duration | 3.0s (lots of reaction time) |
| Gun damage | 25 (hurts, non-lethal) |
| Player invuln after hit | 1.5s |
| Death floor | size auto-clamped above death threshold |

---

## 7. The Universal Red Activation Outline

Every enemy, in tutorial AND real levels, gets a **pulsing red outline** the
moment it enters an active/awake state.
- 3–4px red border around the enemy's bounding box, pulsing ~2x/sec.
- Tutorial: amplified (brighter, thicker, glow).
- Real levels: subtler but still clearly visible.

This directly addresses prior reviewer feedback ("enemy actions not clear
visually").

---

## 8. Difficulty — Big Reduction

L1 currently throws all 6 enemy types at once. Too hostile for a
discovery-driven, non-gamer-friendly game.

### Cut active enemies in L1 from 6 → 2
| Enemy | L1 (new) | Deferred to |
|---|---|---|
| Gun shooter (avatar) | KEEP (signature threat) | — |
| 1 chasing rec | KEEP (teaches dodge) | — |
| 2nd chasing rec | remove | later sub-level |
| Shooting search | remove | Level 2+ |
| Falling comment | remove | Level 2+ |
| Exploding like | remove | Level 2+ |
| Crushing cookie | remove | Level 2+ |

Each later level introduces 1–2 NEW enemy types, so difficulty escalates
naturally.

### Soften the survivors (L1 / EASY default)
| Setting | Current | New |
|---|---|---|
| Enemy trigger range | full | −40% (wake only when very close) |
| Enemy speed | 380 | ~200 |
| Gun aim time (reaction window) | 1.6s | 3.5s |
| Gun damage | 60 (lethal) | non-lethal in L1 (knocks size, no one-shot) |
| Telegraph before attack | short | long + obvious red outline |
| Default difficulty | Normal | **Easy** |

### Remove the cursor / gaze enforcer from L1
The gaze cursor is the most stressful mechanic — defer it to L2 as an
escalation. L1 = safe exploration + light dodging.
- (Idea considered + rejected for now: "cursor appears after scanning 2+
  things." Punishing the player the moment they succeed discourages
  engagement. Debut the hunter in L2 instead.)

---

## 9. The Three-Endings Connection

The X-ray evidence mechanic is the **collection method** for the
three-endings system (long-standing design goal).

```
scan → reveal evidence → persists → accumulates across ALL levels →
total + which pieces → determines ending
```

| Evidence collected | Ending |
|---|---|
| All / most (thorough scanner) | **Full exposure** — bring HUSH down. Best ending. |
| Core only (did the minimum) | **Partial leak** — HUSH spins it. Bittersweet. |
| Bare minimum (rushed) | **Cover-up** — buried, you vanish. Worst ending. |

Accessibility win: a casual player who scans lightly still **finishes** (gets
an ending). A thorough player earns the best one. Nobody is gated; mastery is
rewarded.

---

## 10. Win Condition (per page)

```
scan all key fragments → dossier completes → lead activates on the page →
move window onto the lead → follow the lead → next page
```

Same loop every page. Escalating mystery. No buttons. Fully clue-driven.

---

## 11. Art Style

Keep the existing hand-drawn wobbly-rectangle aesthetic (`drawHandRect`).
Pages should look like **sketches/wireframes** of real sites, not clones.

Reuse existing palette: red `#E63946`, yellow `#F4D35E`, blue `#4A7BC8`,
green `#2D8659`, purple `#9b59b6`.

### Direction A satire (write hidden + visible text in this voice)
- Channel names: `@verified_truth`, `@u/anonymous`, `@████████`,
  `@LiterallyNothingToSeeHere`, `@hush_compliance`.
- Decoy video titles: `the boring document — 4 views`, `[REDACTED] (don't
  watch)`, `IGNORE THIS ONE thanks`.
- Visible→hidden gags: `Like and subscribe!` → `Comply and consent`;
  `847K views` → `[BOT TRAFFIC] views`; `SUBSCRIBE` → `INSTALL MALWARE`.

---

## 12. References (what we borrow)

| Game | What we steal |
|---|---|
| Return of the Obra Dinn | a tool reveals hidden truth from fragments |
| Hypnospace Outlaw | browsing a lying web, uncovering buried content |
| Outer Wilds (ship log) | auto-connecting evidence board — never feel lost |
| Orwell | snippets assemble into a bigger picture; surveillance tone |
| Papers, Please | deadpan corporate-evil dystopian tone |
| Unpacking / A Short Hike | cozy, low-stakes, anyone can finish |

Synthesis: **Obra Dinn's reveal tool + Outer Wilds' auto-connecting log +
Unpacking's gentleness.**

---

## 13. Build Order

1. **Difficulty reduction** (quick, immediate QoL — do first).
2. **X-ray reveal rendering** (window shows hidden text — core new tech).
3. **Persistent evidence + dossier UI** (auto-connecting).
4. **Follow-the-lead exit** + window-persists page transition.
5. **Tutorial** (teaches scanning + spotlight enemies).
6. **Home page + origin/transformation** (cursor → window).
7. **Channel page (1.3)** + SPYGRAM handoff.

---

## 14. Open Decisions (confirmed)

- [x] Win = scan all fragments → dossier completes → follow lead. No SUBSCRIBE.
- [x] Window persists across page transitions.
- [x] 1.3 = uploader's channel page (whistleblower trail → SPYGRAM door).
- [x] Evidence drives the three endings.
- [x] L1 enemies cut to 2 (gun + 1 chaser).
- [x] Cursor/gaze removed from L1, debuts in L2.
- [x] Default difficulty = Easy.
- [x] Evidence board = auto-connecting dossier (no manual deduction).

## 15. Still To Decide
- Exact fragment count per page (suggest 5 for 1.2; 3–4 for 1.1 and 1.3).
- Mini "compile" puzzle final form (suggest: click EXECUTE on 3 ordered steps).
- Dossier hotkey + whether opening it pauses the game (suggest: yes, pauses).
- 1.3 alternative still on the table: comments-section page (find the one
  human voice among the bots) — poetic but a bigger build than channel page.

---

## 16. Cross-References
- `docs/LEVEL2.md` — SPYGRAM (the handoff target).
- `src/scenes/GameScene.js` — current 1.2 video page (the base to extend).
- `src/game/state.js` — add evidence/dossier state here.
- `src/config.js` — difficulty multipliers (DIFFICULTY) live here.
- `src/game/endSequence.js` — top-to-bottom sweep (still the level-clear FX).
