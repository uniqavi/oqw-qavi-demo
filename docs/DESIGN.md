# Operation Quiet Window — Design Doc

Living document. Edit freely. Last updated 2026-05-04.

---

## 1. Premise

**Year:** 2039. WW3 is **ongoing** (not ended).

**Player's belief:** The player is human. Their boss told them so.

**Player's mission (as told by boss):** Infiltrate enemy databases through public-facing web platforms (YouTube, Facebook, Discord/Telegram) and exfiltrate classified files that will reveal dark secrets — secrets that could shift the war.

**Player's actual identity:** A humanoid robot. They don't know this. The "enemy" they are stealing from is the AI/humanoid resistance. The "secrets" are evidence that humans started the war and have been using AI as a scapegoat.

**Hidden truth (revealed late):** The female mastermind boss (E.V.E.) is the leader of the humanoid faction, and the protagonist is her own creation — sent into human territory under cover, gradually fed counter-propaganda by what they're collecting.

---

## 2. Cast

| Character        | Role                                  | First seen           |
|------------------|---------------------------------------|----------------------|
| **Boss-1 (M)**   | Male handler. Gives the player missions over phone calls. Plays the role of a friendly authority figure. | Opening cutscene |
| **Boss-2 (F.) — E.V.E.** | Female mastermind. Revealed late (Level 3 / ending). Real architect of the player's existence. | Late game |
| **Enemy Boss**   | The "humanoid boss" the player is told to take down. Identity flips by the ending. | Final level / ending |

> **F.Boss-2 is the female (mastermind) — both Boss-1 and Boss-2 are technically "ours", but the player's loyalty pivots in the ending.**

---

## 3. Level structure

```
Opening cutscene  →  Level 1 YouTube  →  Level 2 Facebook  →  Level 3 Discord/Telegram  →  Ending
        (Boss-1 phone call)         (suspicious comment)    (3 keys to unlock chat)    (player chooses)
```

| # | Window         | Theme            | Key mechanic                                  | Status |
|---|----------------|------------------|-----------------------------------------------|--------|
| 1 | YouTube-like   | News / video     | Already built. Live-news video reveals clue 1/4 | DONE (needs difficulty pass + video update) |
| 2 | Facebook-like  | Social feed      | TBD — different enemies, different clue surface | DESIGN |
| 3 | Discord OR Telegram | Chat / DMs  | Locked chats, need 3 collected keys to unlock | DESIGN |

### Level transitions
- **L1 → L2:** A comment in the YouTube comments looks odd / out of place. Hover or click reveals a Facebook group link. Clicking transitions to Level 2.
- **L2 → L3:** TBD — likely an embedded link / DM screenshot in a Facebook post.

### Cross-level keys (1, 2, 3)
- Keys are hidden across Levels 1 and 2 (and possibly the start of L3).
- They appear disguised as **profile pictures, lock icons, suspicious comments, cookie-banner accept clicks, video clue, etc.**
- All 3 keys are required to unlock the **final chat** in Level 3 — which exposes the truth and gives the player the choice that triggers the ending.

---

## 4. Endings

The puzzle-pieces / keys mechanic gates which endings the player can reach. The exact tuning is open, but the framework:

| # | Working title | Trigger | Outcome |
|---|---------------|---------|---------|
| **A** | **HQ Blast (Robots Win)** | Player chooses to leak / detonate | Human HQ explodes. The HQ contained the formula to neutralise all humanoids. Robots win the war. |
| **B** | TBD | TBD | TBD |
| **C** | TBD | TBD | TBD |

> **Open question:** the team is still deciding endings B and C. Possible directions to explore (not committed):
> - **Humans win** — player betrays the humanoid resistance, hands data back to Boss-1.
> - **Stalemate / Reveal** — player exposes the truth publicly; both sides collapse; ambiguous future.
> - **Self-sacrifice** — player destroys themselves to keep both sides from learning the formula.
> - **No-key ending** — if player collected zero keys / didn't watch the video / never found the puzzle pieces, default "obey orders" ending where player remains a human-believing pawn forever.

---

## 5. Puzzle-piece / key mechanic — design discussion

The team is debating: *is the puzzle-piece-determines-ending mechanic a good idea?*

### My take (revise / strike out as needed)

**Pros**
- Rewards thorough play / exploration. People who watch the video, drag the cookie banner properly, find the odd profile picture, etc., feel smart.
- Gives replayability. Multiple endings = reason to play again.
- The "hidden in plain sight" gimmick fits the parody-page tone (everything looks normal until you click the wrong thing).
- Strong narrative payoff: the puzzle is *literally* a puzzle, and assembling it is the moment the player learns who they are.

**Cons / risks**
- If the keys are too well hidden, a player gets the "default / bad" ending without understanding why. Frustrating.
- The team has to design **3 distinct ending sequences**, which is non-trivial work.
- Risk of "completionist trap" — players feel obligated to find every key, but only one ending is "the real one". Avoid this.

**Recommendations**
1. **Make every ending feel intentional**, not "you missed the good one". Each should have a thematic point (Robots Win = vengeance is sweet but cold; Humans Win = ignorance is bliss; Truth = pyrrhic).
2. **Provide soft hints** for keys: a faint glow, an audio cue when the player walks past, or a hint in the HUD ("something feels off here…"). This lets observant players find them without a wiki.
3. **Don't gate Endings A/B by key count alone.** Use keys to unlock the *final choice* — but then the choice itself drives the ending. So a player with all 3 keys gets the full picture and chooses; a player with 0 keys gets a default "obey orders" path.
4. **Keep the count low.** 3 keys total across 3 levels is exactly right. Don't inflate to 7+ pieces — past 4-5, hidden-collectible fatigue sets in.

---

## 6. Opening scene — shot list

The opening is a short cinematic that doubles as menu transition.

### Scene A — Main menu (fixed shot)

- Camera looking over the player's shoulder in a dark room.
- Player is a silhouette at a desk with a glowing monitor.
- Monitor displays a faint static animation or paused news feed.
- Ambient sound: low hum, occasional distant siren.

**Menu UI (overlaid on the screen, looks like part of the OS):**
- `START NEW MISSION`
- `LOAD GAME`
- `SETTINGS`
  - Difficulty: **Easy / Normal / Hard**
  - Audio volume
- `HELP / CONTROLS`
- `QUIT`

### Scene B — The phone call (animated cutscene)

Same shot. After player clicks `START NEW MISSION`:

1. **Phone rings.** Cell phone vibrates on the desk.
2. Player picks up. Voice on the line = **Boss-1 (M)**.
3. Dialogue (rough draft — to be polished by team):
   > **BOSS-1:** "I need you on something. Tonight. Only you can do this."
   > **PLAYER:** "I'm done. I told you last time was the last time."
   > **BOSS-1:** "We both know that's not true. They have files. Files that change the war. You go in through their video site, you don't talk to anyone, you come out with what we need."
   > **PLAYER:** *(pause)* "Fine. One last job."
   > **BOSS-1:** "You're not just a soldier. You're the only one this works for. Open your browser."
4. Player turns to monitor.
5. **Camera zooms smoothly into the screen** (~800ms zoom).
6. Transition: world flips to the in-game YouTube page → Level 1 begins.

### Scene C — Level 1 starts

Already implemented (`Mission 02 / totallynormaltube`). The first thing the player sees on the page is the **video player playing live news** — a 4–5 second animated WW3 news segment. Watching it to the end reveals **clue 1/4** (a flash frame, a callout, or a number that becomes part of the keypad later).

### Ending scene (later concern)

- Setting: a "big headquarters". This is the human HQ that holds the formula.
- Depending on choice, the building either blasts (Ending A — Robots Win), is locked down peacefully, or some other resolution.

---

## 7. WW3 news video (the YouTube video player content)

Currently the video shows shifting color bars + a fake play UI. We need to replace it with an animated **live news** segment.

**Recommended composition (all canvas-drawn — no real video file needed):**

- **Top:** Red banner, "🔴 LIVE — WORLD WAR III · DAY 847" with a subtle pulsing dot.
- **Middle (main area):** Static / parallaxed background of a destroyed cityscape (or just an animated explosion silhouette + sirens). Smoke particle effect.
- **Lower-third graphic:** "HUMANS vs. HUMANOIDS · ENEMY ADVANCE NEAR SECTOR 7"
- **Ticker (bottom of video, scrolling left):** Headlines like:
  - `BREAKING: Humanoid offensive intensifies near Berlin`
  - `Government urges citizens to remain inside`
  - `New conscription deadline: Friday`
  - `[REDACTED]████ ████████ ████ ████ ███████ ███`
- **Anchor silhouette:** Bottom-right corner, a head + shoulders cutout (cycling between 2 mouth-open / mouth-closed frames for the talking-head look).
- **Hidden clue (1/4):** At a specific timestamp (~3 seconds in), one of the redacted ticker entries briefly resolves: e.g. for one frame the redacted line shows `KEY-ECHO-7` before snapping back to censor bars. Players who watch closely catch it. The clue is something like a 4-character code that unlocks a Level 3 keypad later.

**Implementation:** Replace the video player render block in `GameScene.render()` with a new helper, e.g. `drawNewsVideo(ctx, layout.video, state.time)` in `src/game/draw.js`. State.time drives all animation. The clue becomes part of `state.cluesFound` set.

---

## 8. Tasks for the week

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Make the opening scene (Scenes A + B) | TBD | PENDING |
| 2 | Storyline flowchart (this doc, section 9) | shared | DRAFT — refine |
| 3 | Mood-board all 3 levels in Figma | shared | TODO |
| 4 | Reduce difficulty for Level 1 | TBD | TODO |
| 5 | How to go to next level | — | DECIDED (suspicious comment → Facebook link) |

---

## 9. Storyline flowchart

```mermaid
flowchart TD
  start([Main menu / dark room]) --> call[Phone call from Boss-1]
  call --> accept{Accept mission?}
  accept -->|Refuse| start
  accept -->|Accept| zoom[Camera zooms into monitor]
  zoom --> L1[Level 1 — YouTube]

  L1 --> L1video[Watch live news video<br/>→ clue 1/4]
  L1 --> L1key[Find Key #1<br/>hidden as profile photo / cookie / etc.]
  L1 --> L1exfil[Reach SUBSCRIBE<br/>= exfiltrate]
  L1exfil --> L1comment[Suspicious comment<br/>→ Facebook link]

  L1comment --> L2[Level 2 — Facebook]
  L2 --> L2enemies[New enemies<br/>TBD]
  L2 --> L2key[Find Key #2]
  L2 --> L2link[Find link<br/>→ Discord / Telegram]

  L2link --> L3[Level 3 — Discord/Telegram]
  L3 --> L3key[Find Key #3]
  L3 --> L3unlock{Has all 3 keys?}
  L3unlock -->|No| defaultEnd[Default ending:<br/>obey orders]
  L3unlock -->|Yes| L3chat[Unlock final chat<br/>= meet E.V.E.]
  L3chat --> reveal[Truth revealed:<br/>player is humanoid]
  reveal --> choice{Player choice}
  choice -->|Detonate HQ| endA[Ending A — Robots Win]
  choice -->|Side with Boss-1| endB[Ending B — TBD]
  choice -->|Third option| endC[Ending C — TBD]
```

---

## 10. Open questions

1. Endings B and C — narrative + trigger.
2. Level 2 enemy roster — must feel different from Level 1's six.
3. Level 2 clue surface — what replaces "video with hidden frame"?
4. Level 3 unlock mechanic — keypad? combination of keys? voice-print?
5. Does Boss-1 reappear during gameplay (warning calls?), or only in cutscenes?
6. When does E.V.E.'s voice first appear? Subtle background hint in L1, or saved entirely for L3?
7. Difficulty levels — do they affect enemy speed, damage, or amount of hidden clues?

---

*End of doc.*
