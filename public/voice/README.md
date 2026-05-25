# AI voice-over drop-in folder

Drop MP3 files here with the filenames listed below. The game auto-loads
them — missing files fail silently (no broken-audio errors).

## How to generate

**Recommended: ElevenLabs** (https://elevenlabs.io/)
- Best voice quality
- Lets you pick a stable voice and generate every line of one character
  with the same voice — critical for consistency

**Alternatives**: PlayHT, Murf, OpenAI's TTS API

## Character voice profiles

Pick one voice per character and use it for every line of that character.

| Character | Suggested voice | Notes |
|---|---|---|
| **TOTO** | Tired American man, 40s-50s, low energy, slightly dry. Think "guy who's been doing freelance hacking from a one-room apartment for too long." | The handler. Should sound resigned but warm. |
| **YOU** (player) | Younger adult, gender-neutral or pick what fits, deadpan, slightly sarcastic. | Player avatar. Doesn't get excited about anything. |
| **MAX** | Polished corporate exec, 50s, smooth, never raises his voice, vaguely menacing. | Enemy boss. Heard in the L1 memo (reading his own words). |
| **INTERCEPT** | Cold computer/announcer voice. Can be straight TTS without much character. | The "system" framing the memo reveal. |

## File naming convention

`<scene>-<speaker>-<##>.mp3`

Example: `intro-toto-01.mp3` is Toto's first line in the intro.

---

## Required files — INTRO CUTSCENE

Each line below is a separate MP3 file. Generate, drop in, done.

| File | Speaker | Line |
|---|---|---|
| `intro-toto-01.mp3` | TOTO | Hey. Don't hang up. |
| `intro-you-01.mp3`  | YOU  | I literally just opened my browser. |
| `intro-toto-02.mp3` | TOTO | Yeah. That's why I'm calling. Heard of HUSH? |
| `intro-you-02.mp3`  | YOU  | The company whose slogan is just "shh"? |
| `intro-toto-03.mp3` | TOTO | That's the one. Search, social, every video site you've ever visited. All theirs. |
| `intro-toto-04.mp3` | TOTO | They're hiding something. We want it. |
| `intro-you-03.mp3`  | YOU  | Define "we." |
| `intro-toto-05.mp3` | TOTO | People who'd rather not have one company telling the entire internet to shut up. Name's Toto, by the way. |
| `intro-you-04.mp3`  | YOU  | ...like the dog? |
| `intro-toto-06.mp3` | TOTO | Like the band. But yes, also the dog. |
| `intro-toto-07.mp3` | TOTO | There's a file. They buried it on their own video site. A whole document, hidden in a youtube page. They thought that was clever. |
| `intro-you-05.mp3`  | YOU  | It is a little clever. |
| `intro-toto-08.mp3` | TOTO | Get in, find the file, plant something so we can get back in later, get out. Don't get noticed. The page will fight you. |
| `intro-you-06.mp3`  | YOU  | The page will fight me. |
| `intro-toto-09.mp3` | TOTO | Ads, comments, the recommendation algorithm. They're all HUSH. |
| `intro-you-07.mp3`  | YOU  | I'm a 75-pixel rectangle. Watching me back is the only thing I do. |
| `intro-toto-10.mp3` | TOTO | That's the spirit. |
| `intro-you-08.mp3`  | YOU  | Pay? |
| `intro-toto-11.mp3` | TOTO | Enough to upgrade you to 200 pixels. |
| `intro-you-09.mp3`  | YOU  | Send the address. |

---

## Required files — L1 INTEL MEMO

Played when the player uncovers the redacted comment in L1. The INTERCEPT
lines are computer/announcer voice. The MEMO lines are Max reading his
own memo (cold, contemptuous).

| File | Speaker | Line |
|---|---|---|
| `memo-intercept-01.mp3` | INTERCEPT | From: Max, Director of Engagement — Q1 2039. |
| `memo-max-01.mp3` | MAX | Engagement is down. Our analysts think users are getting suspicious. |
| `memo-max-02.mp3` | MAX | Our analysts are wrong. Users aren't suspicious. They're bored. |
| `memo-max-03.mp3` | MAX | Bored is fine. Bored people don't organize. |
| `memo-max-04.mp3` | MAX | Cancel the next news cycle. Boring people stay quiet. |
| `memo-intercept-02.mp3` | INTERCEPT | Rest didn't load. The full version is on HUSH's internal chat — they call it SPYGRAM. Of course they do. |

---

## Tips

- Generate at **24kHz or 22kHz mono** — keeps file size small. These are short clips.
- **Trim leading/trailing silence** before exporting. Game cues them tightly.
- For ElevenLabs: lock the voice's "Stability" and "Similarity" sliders to the same values across all of a character's lines so the voice doesn't drift.
- If a line sounds wrong on first try, regenerate — TTS isn't deterministic.
- The "..." in lines like *"...like the dog?"* should produce a brief pause. If the TTS ignores it, manually trim silence in.

That's it. Drop files, reload, the cutscene comes alive.
