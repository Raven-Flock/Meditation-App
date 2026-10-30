# Sound credits — Stillpoint

Stillpoint has two kinds of file beds: **original music** by Raven Flock (the Soft chip) and **CC0 nature field recordings** (Rain, Deep rain, Beach, Nature). Hush is generated in the browser by `sounds.js`, and the begin/end chimes are Web Audio sines; neither uses a file.

---

## Originals — Raven Flock, made in Aerie

The three Soft beds are original compositions written for Stillpoint in [Aerie](https://github.com/Raven-Flock/Aerie) and rendered by Aerie's own audio engine. No samples, loops, or free-licensed material are used. The Aerie project files are in [`source/`](./source/).

| File | Title (ID3) | Practice | Loop | Key / mode | Project |
|------|-------------|----------|------|------------|---------|
| `stillpoint-sit.mp3` | Stillpoint Sit | Timed sit | ~27.83 s (32 beats @ 69 BPM, "Tend") | C major | `source/stillpoint-sit.aerie.json` |
| `stillpoint-box.mp3` | Stillpoint Box | Box breathing (4-4-4-4) | 64 s (4 squares) | A minor (Aeolian) | `source/stillpoint-box.aerie.json` |
| `stillpoint-wind.mp3` | Stillpoint Wind-down | Wind-down (4-7-8) | 76 s (4 cycles) | E♭ major, low register | `source/stillpoint-wind.aerie.json` |

- **Artist:** Raven Flock. Composition in Aerie: Raven Flock Sound Design. Calm target cards, loudness spec and measurements: Raven Flock Brain Researcher.
- **Render:** Aerie offline `renderWav` (44.1 kHz, 16-bit, stereo), exported at 3× the loop length; the middle repetition is cut sample-exact so reverb tails wrap into the loop start. Wind-down uses a 500 ms crossfade built only from Aerie output to smooth the seam; Sit (Tend, Aerie main `4eb58974`) is a sample-exact wrap from Aerie #2 (1,227,130 samples) and needs no crossfade.
- **Loudness:** two-pass `loudnorm` (linear gain only), −16 LUFS integrated, true peak ≤ −3.5 dBTP, LRA 1.2–2.6 LU. Seam head/tail within ±1.5 dB of the loop body. Sit's peaks are caught by a transparent limiter before the linear loudnorm. Its LRA is ~17 LU because Tend is sparser.
- **Encode:** MP3 128 kbps CBR, 44.1 kHz, joint stereo. Tags: `artist=Raven Flock`, `title=Stillpoint <Bed>`, `comment=Original composition (Aerie). Consider the ravens.`
- Box/Wind are pulse-free on a 60 BPM grid; Sit (Tend) is at 69 BPM, a slow 32-beat loop. These are design choices, not health claims.

---

## Nature field recordings — CC0 1.0 (not Raven Flock compositions)

All four are **CC0 1.0 Universal** (public domain dedication). Attribution is not required; it is given here for honesty. ID3 tags on each file name the real recordist and source.

### Rain — `stillpoint-rain.mp3` (chip `rain`)

| Field | Value |
|-------|-------|
| **Title** | Summer Rain on Terrace |
| **Recordist** | Joseph Sardin (BigSoundBank / La Sonothèque) |
| **Source** | BigSoundBank **#1019** — https://bigsoundbank.com/summer-rain-on-terrace-s1019.html |
| **License** | CC0 1.0 Universal |
| **Processing** | First 75 s; two-pass `loudnorm` (I −16, TP −3); 1.5 s fade in/out; stereo 44.1 kHz MP3 128 kbps |

### Deep rain — `stillpoint-fall.mp3` (chip `fall`)

| Field | Value |
|-------|-------|
| **Title** | Big rain on car roof |
| **Recordist** | Joseph Sardin (BigSoundBank / La Sonothèque) |
| **Source** | BigSoundBank **#1294** — https://bigsoundbank.com/big-rain-on-car-roof-s1294.html |
| **License** | CC0 1.0 Universal |
| **Processing** | Full ~82 s; mono source to dual-mono stereo; two-pass `loudnorm` (I −16, TP −3); 1.5 s fade in/out; 44.1 kHz MP3 128 kbps |

### Beach — `stillpoint-shore.mp3` (chip `shore`)

| Field | Value |
|-------|-------|
| **Title** | Calm ocean waves (Whidbey Island, WA) |
| **Recordist** | SamsterBirdies |
| **Source** | Freesound **#578524** — https://freesound.org/people/SamsterBirdies/sounds/578524/ (HQ preview) |
| **License** | CC0 1.0 Universal |
| **Processing** | First 75 s; two-pass `loudnorm` (I −16, TP −3); 1.5 s fade in/out; stereo 44.1 kHz MP3 128 kbps |

### Nature — `stillpoint-wild.mp3` (chip `wild`)

| Field | Value |
|-------|-------|
| **Title** | Forest and Stream #1 (brook and birds, Signy-l'Abbaye, Ardennes) |
| **Recordist** | Joseph Sardin (BigSoundBank / La Sonothèque); the page also lists Pierre SIBANARCO |
| **Source** | BigSoundBank **#2713** — https://bigsoundbank.com/forest-and-stream-1-s2713.html |
| **License** | CC0 1.0 Universal |
| **Processing** | First 75 s; two-pass `loudnorm` (I −16, TP −3); 1.5 s fade in/out; stereo 44.1 kHz MP3 128 kbps |

The app plays these files from this repo only. It never streams audio from BigSoundBank, Freesound, or any other remote host.

---

## Formerly used (CC0, retired)

The Soft beds used these CC0 tracks from OpenGameArt until the Aerie originals replaced them:

| File | Track | Author | Source |
|------|-------|--------|--------|
| `stillpoint-sit.mp3` | First Light Particles (retired; sit is now Raven Flock 'Tend') | Yoiyami | https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track |
| `stillpoint-box.mp3` | The Budding of Consciousness (Yoiyami Blue Series No. 4) | Yoiyami | https://opengameart.org/content/the-budding-of-consciousness-%E2%80%93-cc0-ambient-minimalist-theme-yoiyami-blue-series-%E2%80%93-no4 |
| `stillpoint-wind.mp3` | Cosmic Navigation (loop) | Synth-thetic | https://opengameart.org/content/cosmic-navigation |

The Ogg copies of Beach and Nature (`stillpoint-shore.ogg`, `stillpoint-wild.ogg`) were never loaded by the app and have been removed.

---

*Consider the ravens.*
