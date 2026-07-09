# Credits photo drop-in folder

Developer photos for the KiloGram credits scene (src/game/kilogram.js).
Drop the files in with these exact names — the scene picks them up
automatically (both the circular profile icon and the square post image).
Until a file exists, a styled placeholder card is shown instead.

| File | Post |
|---|---|
| `qavi.jpg`      | Post 1 — @qavi "Gimme your Tokens" |
| `afifa.jpg`     | Post 2 — @afifa "You may call me HAL" |
| `ray.jpg`       | Post 3 — @ray "Bug? No, that's an undocumented feature." |
| `yongliang.jpg` | Post 4 — @yongliang "WFH King" |

- Square-ish photos work best (the post card is 1:1, `object-fit: cover`)
- JPG required at these exact names; ~1080×1080 max is plenty
- TOTO's post uses his in-game avatar — no file needed
