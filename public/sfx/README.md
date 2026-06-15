# Sound-effects drop-in folder

One-shot sound effects (not looping music — that lives in `../music/`).
Loaded by `src/game/sfx.js`. Drop a file with the exact name below and it
just works. Missing files fail silently (no console errors).

## Files + where they fire

| File | Plays when | Wired in |
|---|---|---|
| `player-hit.mp3` | player's window takes damage from an enemy | `src/game/waveEnemies.js` |
| `game-over.mp3`  | a level is failed (any death cause) | `src/scenes/GameScene.js` (`showOverlay` loss) |
| `heal.mp3`       | player collects a powerup pickup (SIZE / FAST / SHIELD) | `src/game/powerups.js` |
| `gun-shot.mp3`   | the account-avatar gun enemy fires its single shot | `src/game/agents/gunShooter.js` |
| `burst-fire.mp3` | the search-bar enemy fires a volley | `src/game/agents/shootingSearch.js` |

> Note: `gun-shot` and `burst-fire` only play where those ranged enemies are
> active. They're **disabled in Level 1** (the runner), so you'll hear them in
> the tutorial and future levels, not on the YouTube page.

## Format
- MP3 (or OGG). Keep them short and small — these are already 24–46 KB each.
- No need for high bitrate; one-shots are brief.

## Adding a new SFX
1. Drop the file here.
2. Add a key + path to the `SFX` map in `src/game/sfx.js`.
3. Call `playSfx('yourKey')` at the event site.
