# LEVEL 2 — LATTICE

> Design spec for Operation Quiet Window, Mission 2.
> Status: design locked, build pending. Owner: TBD.

---

## 1. Premise

The L1 malware did more than short-circuit the YouTube page — it scraped
the credentials of a low-profile VEIL employee, **Evelyn Warner**
(`e.warner`), a night-shift analyst. The player logs in as her into
**Lattice**, VEIL's internal chat platform.

Objective: retrieve a pinned file called `PROJECT WHITEWASH` from a
restricted channel called `vault-leaks`, send it out, and log out before
the real Warner clocks back in.

Catch: everyone on Lattice is a VEIL employee. If they realize "Warner"
is being impersonated, the session is burned.

---

## 2. Page Layout

Telegram-inspired dark-mode UI, adapted to fit a 1920×1080 game frame.

```
┌─────────────────────────────────────────────────────────────┐
│ ☰  Search...                  │  # vault-leaks · 4 members  │  ~50px
├──┬────────────────────────────┼─────────────────────────────┤
│  │ 📌 ANNOUNCEMENTS    [12]   │                             │
│■ │ 🔒 vault-leaks      [ ! ]  │   ACTIVE PANEL              │
│  │ 👥 ops-channel      [ 3 ]  │   (playable area)           │
│■ │ 👤 m.haas                  │                             │
│  │ 👤 r.castellanos    [ 1 ]  │                             │
│■ │ 🔒 internal-audit          │                             │
│  │ 📁 archive                 │                             │
│■ │                            │                             │
│  │                            │  ┌──────────────────────┐   │
│  │                            │  │ 📎  Write a message  │   │
└──┴────────────────────────────┴──┴──────────────────────┴───┘
   ↑     ↑                          ↑
   rail  chat list                  active panel
   ~60px ~520px                     ~1340px
```

### Dimensions

| Region | Size | Notes |
|---|---|---|
| Top bar | 1920 × 50 | Search + channel header |
| Left icon rail | 60 × 1030 | 4-5 dots, decorative |
| Chat list | 520 × 1030 | 6-8 chats, ~80-90px row height |
| Active panel | 1340 × 970 | **Main playable area** |
| Composer | 1340 × 60 | Bottom of active panel |

### Color Palette

```
BG main         #17212b
BG sidebar      #0e1621
Chat hover      #2b5278
Text primary    #ffffff
Text muted      #7d8e98
Accent (link)   #3390ec
Outgoing bubble #2b5278
Incoming bubble #182533
VEIL red (hazard) #E63946
```

### Chat List Contents

Roughly 6-8 chats, ~5 visible at once. Examples (writers can revise):

- 📌 `ANNOUNCEMENTS` — locked / read-only
- 🔒 `vault-leaks` — restricted, **objective lives here**
- 👥 `ops-channel` — busy, sends @mentions
- 👤 `m.haas` — DMs you mid-level
- 👤 `r.castellanos` — silent
- 🔒 `internal-audit` — locked, decoration
- 📁 `archive`

The chat row Warner is "in" (`vault-leaks`) shows a small unread pulse
to guide first-time players.

---

## 3. Gameplay

L2 inherits L1's "collect while dodging" DNA but trades L1's spatial
chase for **vertical reading + decision-making**.

### Player

- Same red rectangle, same WASD/arrow controls
- Spawns at bottom of active panel
- Movement is constrained to the active panel — cannot drag into sidebar

### Objective Flow

1. Spawn in `# general` (empty channel)
2. Click `vault-leaks` in chat list → channel opens, messages stream in
3. **Read messages** to find context clues (foreshadowing for Hale call)
4. Locate and grab the **PROJECT WHITEWASH** file (highlighted yellow,
   similar to L1 docs)
5. Drag file to composer → click send → **download begins (0% → 100%)**
6. At 70%, download freezes — Hale DM interrupts (see §5)
7. Survive the Hale conversation → download completes → log out → win

### Hazards (new enemy set)

| Hazard | Behavior | Damage |
|---|---|---|
| **Typing indicator** | "...is typing" pulses; if player is within 100px when it resolves, they're "seen" | suspicion +10% |
| **Voice-note bomb** | Purple bubble pulses 2s then explodes radially | size -10 |
| **@mention** | Red bubble fires from top, chases player for 4s | size -15 on hit |
| **Group-add ambush** | "X joined the group" banner slides down from top every ~20s, damages anything near top of panel | size -10 |
| **Pinned message crush** | Slides down from top, parks at top of channel — solid wall | blocks movement |
| **Read receipts** | If player lingers on a message > 4s, blue checkmarks appear; if they stay another 2s, alarm | suspicion +15% |

### Suspicion Bar

Replaces L1's "gaze" mechanic for L2. Single bar at top of HUD.
Fills from:
- Triggered hazards (above)
- Ignored DMs (see §4)
- Wrong reply choices (see §4 and §5)

Bar = 100% → instant fail (LEVEL FAILED).

### Credential-Check Timer

Visible countdown in HUD corner: starts at **4:00**, ticks down.
Hits 0:00 → instant fail ("Warner clocked back in").

Difficulty scaling:
- EASY: 5:00
- NORMAL: 4:00
- HARD: 3:00

---

## 4. DM Interruption Mechanic

Minor VEIL employees DM "Warner" mid-level. Gameplay pauses; player
picks from 2-3 canned replies.

### Trigger
- Random intervals, ~1-2 DMs per level (not counting Hale climax)
- Sender appears as a notification slide-in on the right

### UI
- Game pauses (movement freezes, timers pause)
- DM bubble at center, reply options listed below
- 10-second response timer (visible bar) — letting it expire = ignore

### Outcomes
| Choice | Effect |
|---|---|
| Correct reply | No suspicion change, sender goes quiet |
| Plausible-wrong | Suspicion +20%, sender goes quiet |
| Obvious-wrong | Suspicion +40%, sender pings again later |
| Ignore (timer expires) | Suspicion +20% |

### Example

```
m.haas (DM):   ev you still up? did you push the q3 logs?

   [A] "yeah, give me a sec"     ← correct
   [B] "not yet, swamped"        ← plausible-wrong
   [C] [ignore]                   ← suspicion penalty
```

---

## 5. Climax — The Hale Encounter

The signature scene of L2. Triggers when download bar hits 70%.

### Antagonist: Marcus Hale

- VEIL Director of Internal Security
- Mid-50s, ex-intelligence, polite-but-sharp
- Talks in short sentences. Tests "Warner" with probing small-talk
- Returns in L3 as a primary antagonist

### Encounter Rules

| Rule | Value |
|---|---|
| Format | Chat DM in Lattice (NOT phone call — phone is reserved for L3 boss) |
| Questions | **4 fixed** (expandable later) |
| Options per question | 3 (one correct, one plausible-wrong, one obvious-wrong) |
| Time per question | 10s (visible bar) |
| **Strikes allowed** | EASY = 3 · NORMAL = 2 · HARD = 1 (ties to difficulty selector) |
| Failure result | Session terminated → LEVEL FAILED |
| Success result | Download resumes → win sequence |

### Reading Reward

Some correct answers require info the player can only know from
reading the chat earlier in the level. Examples:
- Knowing Warner's shift ends at 06:00 (not now)
- Knowing Reyes is out sick today
- Knowing Warner calls Hale "sir," not by first name

This rewards exploration of the chat history — directly addresses the
reviewer feedback about onboarding clarity and YouTube-style "feels real"
UX.

### Dialogue Script

See **§8 Dialogue Scripts → Scene D**.

---

## 6. Tab System

Browser frame shows **3 tabs** from game start:

```
[● youtube.veil ×]  [🔒 ??? ×]  [🔒 ??? ×]   [+]
```

- Tab 1 (`youtube.veil`): L1 — active at game start
- Tab 2 (`lattice.veil`): L2 — locked until L1 completed
- Tab 3 (`???`): L3 — locked until L2 completed

Locked tabs:
- Grayed out
- Padlock icon
- Hover tooltip: `ACCESS DENIED — TIER-IV CLEARANCE REQUIRED`
- Not clickable

When L1 ends (short-circuit cutscene), Tab 2 unlocks with a subtle
pulse animation. URL bar becomes clickable. Player clicks → L2 loads
with CRT flicker → Lattice page populates row-by-row.

### Returning to L1 from L2

Clicking the YouTube tab from inside L2:
- L1 page loads with slow CRT power-on
- Page is dimmed/desaturated (~60% saturation)
- Faint `[SECURED]` watermark in corner
- Enemies present as broken husks (sparking occasionally, never attack)
- News video still plays (the AI-generated asset) — with mild static overlay
- Player can walk around freely; no objectives, no threats
- Can return to L2 at any time via tab click

---

## 7. HUD Additions for L2

```
┌──────────────────────────────────────────────────────────────┐
│ LOGGED IN AS: e.warner    SUSPICION: ▓▓░░░░░░░░  CHECK: 02:47│
└──────────────────────────────────────────────────────────────┘
```

- `LOGGED IN AS:` — static badge, reinforces the disguise
- `SUSPICION:` — bar, fills 0–100%
- `CHECK:` — countdown to credential check (Warner clocking back in)

Reuse `SIZE` (health) from L1.
Hide `GAZE`, `DOCS`, `🍪` — L2 doesn't use these.

---

## 8. Dialogue Scripts

### Scene A — Post-L1 Phone Call

```
SFX: Faint hum of broken page. Phone vibrates twice.

BOSS-1:    You there?

YOU:       I'm here. Something just shorted out the whole page.

BOSS-1:    That malware did more than I told you. It scraped
           credentials. We have a way in.

YOU:       In where?

BOSS-1:    Lattice. VEIL's internal chat. Check your tabs.

YOU:       Yeah. New one just opened. "lattice.veil"

BOSS-1:    You're logging in as one of their people. Name's
           Evelyn Warner. Night-shift analyst. Boring job,
           which is good — nobody pays her attention.

YOU:       And if someone messages me thinking I'm her?

BOSS-1:    Stay quiet. Reply only if you have to. We've
           pulled her chat history — I'll feed you canned
           responses through this line if it gets hot.

YOU:       What am I looking for?

BOSS-1:    A file marked "PROJECT WHITEWASH." Should be
           pinned in a channel called vault-leaks. Get the
           file, exit the session, and don't say a word
           on that platform unless I tell you to.

YOU:       How long do I have?

BOSS-1:    Warner clocks back in at 06:00 her time. That
           gives you four minutes, real-time. Move.

SFX: Click.

SYSTEM:    > spoofing credentials...
SYSTEM:    > logged in as: e.warner
```

### Scene B — Lattice Load

```
[Page fades in. Chat list populates row by row with ping sounds.]
[Active panel shows: # general — empty placeholder.]

SYSTEM:    > session active. credential check in 04:00.

HUD:       LOGGED IN AS: e.warner
HUD:       INFILTRATE vault-leaks  ·  RETRIEVE: PROJECT WHITEWASH
HUD:       SUSPICION: ░░░░░░░░░░  0%
```

### Scene C — First Incoming DM (~60s into level)

```
m.haas (DM):   ev you still up? did you push the q3 logs?

   [A] "yeah, give me a sec"        ← correct (vague + non-committal)
   [B] "not yet, swamped"           ← plausible-wrong
   [C] [ignore]                     ← +20% suspicion
```

### Scene D — Hale Climax (4-question encounter)

```
[Download bar at 70%. Freezes. Chat auto-switches to new DM from m.hale.]

SYSTEM:    > incoming priority message — m.hale

BOSS-1 (phone vibrate, brief):
           Heads up. Hale just pinged Warner. He's her
           director. Stay calm. Answer like her. You've got
           [N] strikes before they pull her access.
           [N = 3 / 2 / 1 by difficulty]
```

**Q1**
```
m.hale:    Evelyn. You're up late.

   [A] "Couldn't sleep. Figured I'd catch up."     ← correct
   [B] "Yeah, busy night here."                    ← plausible-wrong
   [C] "Just finishing my shift."                  ← obvious-wrong
        (Warner's shift ends at 06:00 — clue earlier in chat)
```

**Q2**
```
m.hale:    Good. While I've got you — did Reyes send you
           the Q3 audit notes yet?

   [A] "Not yet. I'll chase him in the morning."   ← correct
        (clue: earlier message — "Reyes: out sick today")
   [B] "Yeah, got them this afternoon."            ← plausible-wrong
   [C] "Who's Reyes?"                              ← obvious-wrong
```

**Q3**
```
m.hale:    One more thing. There was unusual activity on
           the vault-leaks pin queue tonight. Did you touch
           anything in there?

   [A] "No, I haven't been in that channel."       ← obvious-wrong
        (system logs would contradict — obvious lie)
   [B] "Briefly. Was looking for an old policy doc.
        Didn't open anything sensitive."           ← correct
        (plausible cover that matches logs partially)
   [C] "Yeah, I downloaded the WHITEWASH file."    ← obvious-wrong
```

**Q4**
```
m.hale:    Mm. Flag it next time. Even routine pulls from
           that channel need a ticket.

m.hale:    Alright. Get some rest, Evelyn.

   [A] "You too, sir."                             ← correct
   [B] "Will do, Marcus."                          ← plausible-wrong
        (Warner calls him "sir" in older messages, never first name)
   [C] "Goodnight."                                ← neutral
```

**Pass:**
```
[Hale goes idle. Download resumes from 70%.]

BOSS-1:    Good. He bought it. Get out, now.

SYSTEM:    > download resuming... 71%... 84%... 100%
SYSTEM:    > logging out e.warner
```

### Scene E — Win

```
[Same short-circuit / glitch wipe as L1 ending. Lattice goes dark.
 Chat list empties row by row. Page closes.]

SFX: Phone vibrates.

BOSS-1:    Clean exit. They won't know it was there until
           someone audits Warner's session log. By then
           you're a ghost again.

YOU:       What's the third tab?

BOSS-1:    Not yet. Get some sleep.

SFX: Click. Third tab pulses faintly but stays locked.
```

### Scene F — Lose (strikes exhausted, suspicion 100%, or timer hit 0)

```
m.hale:    Evelyn.

m.hale:    You're not Evelyn.

[Screen flashes red. All chat windows close violently.]

SYSTEM:    > SESSION TERMINATED
SYSTEM:    > ACCOUNT FLAGGED — e.warner
SYSTEM:    > TRACE INITIATED — DISCONNECT IMMEDIATELY

[LEVEL FAILED screen.]
```

---

## 9. Stat Tracking for Results Screen

L2 should track its own metrics for the grade screen.

| Stat | Description | Stars |
|---|---|---|
| TIME | Time taken vs credential timer | < 50% used = 3★, < 75% = 2★, < 100% = 1★ |
| STEALTH | Final suspicion bar value | < 25% = 3★, < 50% = 2★, < 75% = 1★ |
| SOCIAL | Hale Q&A correct answer rate | 4/4 = 3★, 3/4 = 2★, 2/4 = 1★ |
| INFO | Optional intel collected (messages read fully) | 8+ = 3★, 5-7 = 2★, 3-4 = 1★ |

Replaces L1's `DOCS` stat with `SOCIAL` + `INFO` for L2.

---

## 10. Build Checklist

### New code modules
- [ ] `src/scenes/Level2Scene.js` — main scene
- [ ] `src/game/lattice/layout.js` — chat list, active panel, channels
- [ ] `src/game/lattice/state.js` — L2 state (suspicion, timer, channel)
- [ ] `src/game/lattice/draw.js` — Telegram-style rendering
- [ ] `src/game/lattice/agents/typingIndicator.js`
- [ ] `src/game/lattice/agents/voiceNoteBomb.js`
- [ ] `src/game/lattice/agents/mention.js`
- [ ] `src/game/lattice/agents/groupAddAmbush.js`
- [ ] `src/game/lattice/agents/pinnedCrush.js`
- [ ] `src/game/lattice/dmReply.js` — reply-choice popup
- [ ] `src/game/lattice/haleEncounter.js` — climax dialogue logic
- [ ] `src/game/lattice/dialogue/hale.json` — 4 questions, 3 options each

### Reuses from L1
- Phone-call cutscene system (already in `MenuScene.js` — extract to shared module)
- Glitch / short-circuit ending animation (build in L1, reuse here)
- Results / grade screen
- HUD framework
- Audio helpers

### Tab system (cross-cutting)
- [ ] Tab bar component — render 3 tabs with locked state
- [ ] Tab click handler — switch active scene
- [ ] Tab unlock animation (pulse + URL fade-in)
- [ ] Post-mission L1 state (desaturated, husks)
- [ ] Scene state persistence (so L1 stays "done" when returning from L2)

### Assets needed
- 6-8 chat avatars (Telegram-style circle icons, can be CSS-rendered)
- Lattice logo / favicon
- VEIL employee names list (writer task)
- Hale "incoming message" alert sound
- Notification ping sounds (subtle, 3 variations)

---

## 11. Difficulty Tuning Reference

| Setting | EASY | NORMAL | HARD |
|---|---|---|---|
| Credential timer | 5:00 | 4:00 | 3:00 |
| Hale strikes | 3 | 2 | 1 |
| Hazard frequency | 0.7× | 1.0× | 1.3× |
| Suspicion drain when idle | yes (-5%/sec) | no | no |
| DM reply timer | 15s | 10s | 7s |

---

## 12. Open / Deferred Decisions

- **Lattice replay value:** Should we randomize WHICH 4 of a larger
  Hale question pool play? Defer until base 4 are working.
- **Voice acting:** Hale and Boss-1 are currently text-only. Voice
  would be huge but expensive. Deferred to post-MVP.
- **More chats with VEIL personnel:** Currently 6-8 chats, ~2 DM
  interrupts per level. Could scale up if level feels too quiet.
- **L3 platform:** Undecided. Hale returns in L3, format = phone call
  (per locked-in decision).

---

## 13. Cross-References

- `docs/DESIGN.md` — overall game design (needs VEIL/megacorp update)
- `src/scenes/MenuScene.js` — phone-call dialogue system to extract
- `src/scenes/GameScene.js` — L1 reference for state/render patterns
- `src/config.js` — central tuning constants
