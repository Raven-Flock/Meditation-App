<p align="center">
  <img src="brand/logo-c.png" alt="Raven Flock" width="280" />
</p>

<p align="center"><strong>Raven Flock — Consider the ravens.</strong></p>

---

# Stillpoint

A quiet meditation PWA from **Raven Flock**. Timed sits, box breathing (4-4-4-4), and a 4-7-8 wind-down. No accounts. Tips optional.

**Live:** [web](https://raven-flock.github.io/Meditation-App/) · [itch.io](https://dust2ash7.itch.io/stillpoint)

Tip jar: [buymeacoffee.com/nrsteward](https://www.buymeacoffee.com/nrsteward)

## Practice

- **Timed sit** — a 4 / 6 breath guide. Watch the orb, let time pass.
- **Box breathing** — inhale, hold, exhale, hold, four seconds each. Phase names are announced with `aria-live`.
- **Wind-down** — 4-7-8 cadence for the edge of sleep.

Lengths: **5, 10, 15, 20 minutes**, **open** (counts up until you stop), or a **custom minutes** field.

During a sitting you can pause, switch soundscapes, mute, or stop. A soft Web Audio chime marks a completed sit. Sittings of 15 seconds or longer are stored in history.

## Sound

Pick a bed on the home screen or mid-sit:

| Chip | What you hear | Source |
|------|----------------|--------|
| **Soft** | Mode bed for the practice: sit, box, or wind-down | Original Raven Flock music, made in Aerie (`audio/stillpoint-{sit,box,wind}.mp3`) |
| **Hush** | Soft brown-noise bed | Generated in the browser by `sounds.js` |
| **Rain** | Light rain on a terrace | CC0 field recording, BigSoundBank #1019 (`audio/stillpoint-rain.mp3`) |
| **Deep rain** | Heavier, closer rain | CC0 field recording, BigSoundBank #1294 (`audio/stillpoint-fall.mp3`) |
| **Beach** | Calm ocean waves | CC0 field recording, Freesound #578524 (`audio/stillpoint-shore.mp3`) |
| **Nature** | Forest brook and birds | CC0 field recording, BigSoundBank #2713 (`audio/stillpoint-wild.mp3`) |

All beds are files in this repo (or, for Hush, generated locally); nothing streams from a third-party host. Sources, licenses, and the Aerie project files: [`audio/CREDITS.md`](./audio/CREDITS.md).

Playback starts from the **Begin** click so browsers allow it. Mute silences the bed and chimes without ending the session.

## What is stored locally

History, streak, total minutes, mute, soundscape on/off, and the selected sound live in `localStorage` under `stillpoint-v1`. Nothing is sent anywhere.

Streaks count consecutive calendar days with at least one completed sitting. Missing today still keeps yesterday’s streak until midnight.

## Progressive web app

`manifest.json` uses local `icon.svg` (Raven Flock mark). The service worker is `./sw.js` so GitHub Pages under `/Meditation-App/` works. Cached paths are relative. Static HTML, CSS, and JavaScript — no build step.

## Accessibility and comfort

- Skip link, labels, and `:focus-visible` rings
- Contrast on a dark restful palette, with safe-area insets for notched phones
- `aria-live` for breath phases and periodic time updates
- `prefers-reduced-motion` freezes the orb and atmosphere (phase text still changes)
- Switching away from the tab pauses the session and the audio; returning resumes if it was running

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. A service worker needs HTTP(S), not `file://`.

## Stack

Plain HTML, CSS, and JavaScript. Fonts: Fraunces and Figtree, self-hosted in `fonts/` (SIL Open Font License 1.1; see [`fonts/CREDITS.md`](./fonts/CREDITS.md)), with metric-matched fallbacks.

---

Raven Flock — quiet tools.  
*Consider the ravens.* · A reminder you are not forgotten.
