# Handover Documentation - Operation Quiet Window Web

This file contains the current project state, recent code modifications, and folder structure. It is designed to quickly onboard the next Antigravity AI agent in a new chat.

---

## Project Overview
A web-based Phaser 3 arcade game built with Next.js/Vite, simulating browser/OS window physics and hazard-avoidance mechanics. The player controls a `SCAN.exe` window trying to retrieve evidence documents while evading antivirus hazards.

---

## Current Status & Completed Work

### 1. Level 1.1 (Dashboard & Spreadsheet Minefield)
* **10-Row Grid Puzzle**: The spreadsheet is configured to **10 rows and 8 columns** (A to H, 1 to 10).
* **Stealth Grid & Persistent Progress**: All cells look completely normal/white initially. Walking onto a cell reveals its state:
  * **Safe Path**: Turns **green** (`#2ca55c`) on step and stays green.
  * **Mine**: Turns **red** (`#e63946`) on step and stays red.
  * **Retries History**: The revealed grid color map (`this.revealedGrid`) is preserved across restarts/deaths, giving the player a true trial-and-error path mapping experience.
* **Safe Path Configuration**: Follows the exact layout:
  * `A4 -> B4 -> B5 -> C5 -> D5 -> E5 -> E4 -> E3 -> D3 -> D2 -> D1 -> E1 -> F1 -> G1 -> G2 -> G3 -> G4 -> G5 -> G6 -> G7 -> F7 -> E7 -> E8 -> D8 -> D9 -> D10 -> E10 -> F10 -> G10 -> H10 -> H9`.
* **Bonus Docs**: Placed 3 evidence documents along the safe path: `D5` `(3, 4)`, `G1` `(6, 0)`, and `E7` `(4, 6)`.
* **AABB Bounding Box Checks**: Standardized overlap checks against the entire cell width/height so players cannot slip past mines by walking on cell boundaries.
* **Detonation Sequence**:
  * **Phase 1 (0.6s)**: Player window freezes in place, warning sound triggers, cell flashes red with a thick border.
  * **Phase 2 (0.4s)**: Explosion boom sound triggers, fire sparks spawn, and a smooth yellow/red blast wave ring expands and fades.
  * **Phase 3**: Vaporization death screen appears.
* **Guide Arrows**: Added one lime-green direction guide arrow pointing UP in the vertical gap, and one pointing RIGHT below COMPLIANCE (leading to entrance cell `4A`).
* **Physics Fix**: Excluded the spreadsheet from collision solids so the player can enter and walk inside it freely.

### 2. Level 1.2 (Endless Scroller & YouTube Page)
* **Initial Setup**: The player window spawns at the top-left corner `(80, 80)`.
* **Action Density**: Endless scrolling speed starts at a fast scroll speed (`90` pixels/second).
* **Repositioned Sniper**: The account button in the header is moved next to the search bar and aims a hand-drawn 2D sniper rifle at the player window.
* **Search Projectiles**: Volley attacks from the autocomplete search bar fire high-quality transparent flip-flop sprites.
* **Road Spike Invulnerability**: Touching road spikes inflicts damage but grants a **0.85s invulnerability period** with zero knockback, allowing the player to pass through freely.
* **Mortar Comments**: Every 3rd comment (indices `i % 3 === 1`) in the scrolling feed shoots cannonballs targeting the player.
* **Alternate Spike Cards**: Exactly two non-chasing cards (indices 3 and 6) show road spikes; chasing thumbnails never show spikes.
* **Instant Phase B Transition**: Transition to Phase B triggers immediately upon collecting the 5th document (eliminates the cookie banner interaction).
* **Objective BG Resets**: Properly removes warning classes from the HUD container when transitioning and restarting.

---

## File Architecture

* **[`src/scenes/DashboardScene.js`](file:///d:/EVE2/operation-quiet-window-web/src/scenes/DashboardScene.js)**: Holds the Level 1.1 logic, grid rendering, detonation animations, guide arrows, and state persistence.
* **[`src/scenes/GameScene.js`](file:///d:/EVE2/operation-quiet-window-web/src/scenes/GameScene.js)**: Holds the Level 1.2 scroller, mortar comments, flip-flop projectiles, card setup, and scroller transitions.
* **[`src/game/combat.js`](file:///d:/EVE2/operation-quiet-window-web/src/game/combat.js)**: Damage player logic.
* **[`src/game/audio.js`](file:///d:/EVE2/operation-quiet-window-web/src/game/audio.js)** & **[`src/game/sfx.js`](file:///d:/EVE2/operation-quiet-window-web/src/game/sfx.js)**: Synth audio `beep` and preloaded sound assets.

---

## Next Steps for the Next Agent
1. Review the git history (all edits have been committed and pushed to `feature-desktop`).
2. Implement any new levels, UI visual polishes, or gameplay balances requested by the user.
