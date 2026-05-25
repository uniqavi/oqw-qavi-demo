# Character portrait drop-in folder

Drop PNG/JPG files here matching the filenames below. They'll appear in
cutscenes + dialogues automatically. Missing files just don't show (no
broken-image icons).

## Required portraits

| File | Character | Shows when |
|---|---|---|
| `toto.png`   | **TOTO** — your tired handler | his lines in intro cutscene + phone calls |
| `you.png`    | **THE PLAYER** (silhouette / hooded figure) | your own lines |
| `max.png`    | **MAX** — HUSH enemy boss | his DMs in L2 climax |
| `lewis.png`  | **LEWIS** — your stolen identity | L2 HUD badge + Spygram avatar |
| `phone.png`  | (optional) generic phone icon | for *BRRRT.* lines |

## Size

- 512×512 minimum (gets scaled down for display)
- Square aspect ratio preferred — portraits render as circles
- Transparent background or solid dark works equally well

## Style direction

Style suffix to append to every prompt:

> *photoreal portrait, cold cinematic lighting, muted desaturated palette,
> slightly off / uncanny, 2039 corporate dystopia aesthetic, subtly
> absurdist mood, sharp focus, dark background, --ar 1:1*

### Per-character prompts

**TOTO** — your handler:
> close-up portrait of a tired man in his 50s sitting at a messy desk in
> a dim apartment, illuminated by a phone screen from below, faint
> sardonic smirk, stubble, wrinkled polo shirt, glasses pushed up on
> forehead, empty takeout containers in background

**MAX** — enemy boss (Director of Engagement at HUSH):
> corporate executive portrait, middle-aged man in expensive charcoal
> suit, very neat hair, professional smile that doesn't quite reach the
> eyes, polished glassy office in background, the kind of LinkedIn
> headshot with something quietly wrong about it

**LEWIS** — the stolen identity:
> corporate ID badge style headshot, exhausted office worker in their
> early 30s, flat lighting, slight forced smile, plain beige office
> background, looks like they haven't slept properly in weeks

**YOU** (the player, silhouette only):
> silhouette of a hooded figure at a keyboard from behind, lit only by
> monitor glow, faceless, dark messy room, soda cans on desk, a tiny red
> rectangle visible on the monitor screen

## Extra (for L2 Spygram chat avatars)

Generate 6 anonymous corporate headshots, save with these names. Used as
random employee avatars in the chat list. Any style/age/gender mix.

- `charles.png`
- `oscar.png`
- `lando.png`
- `fernando.png`
- `george.png`
- `carlos.png`

All should be generic ID-badge-style headshots — these are NPCs the player
won't interact with much, just sees in the chat list.
