# messiermusic

A browser-based guitar trainer that listens through your microphone and moves you along automatically, so you never touch the mouse while you're playing.

- **Tuner** – standard tuning (EADGBE), cent-accurate, auto string detection, guided 6→1 with automatic tick-off, reference tones, adjustable A4.
- **Chords** – flash-card style deck (open, 7ths, sus, barre, power chords). Play the chord shown; once it rings true it advances by itself. Live "which strings am I sounding" hints on the diagram.
- **Changes** – chord-change drills (G↔C, Am↔E, progressions, custom). 60-second changes-per-minute challenge with personal bests.
- **Strum** – pattern trainer with a metronome and count-in. Strums are timed against the beat; clean bars level you up (speed ladder, then next pattern). Optional chord check on every bar and an experimental up/down check.

Everything runs locally in the browser. No audio leaves the device.

## How the listening works

| Feature | Technique |
| --- | --- |
| Tuner | McLeod NSDF pitch detector (FFT autocorrelation) with multi-period refinement, then a long-window spectral fit that models string inharmonicity `f_h = h·f0·√(1+B·h²)`, so the true fundamental is recovered even when the mic hardly picks up the low fundamental. Tested at ≤ 0.3 ¢ error on synthetic strings. |
| Chords | Envelope-relative spectral peaks → pitch-class (chroma) vector → compared to a harmonic-aware template built from the exact voicing. The target must beat every other chord in the library, so Em ≠ Em7, C ≠ Cadd9, E5 ≠ Em, etc. |
| Strums | Log-compressed spectral-flux onset detector with adaptive thresholds, timed against the WebAudio clock; latency-compensated (auto estimate, speaker loop-back measurement, or manual). |

The DSP lives in `src/dsp` and `src/audio/core.ts` with no browser dependencies, and is covered by tests that synthesise plucked-string audio.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (microphone works on localhost)
npm test           # DSP tests (synthetic guitar)
npm run build
```

The microphone needs HTTPS or localhost. Deployed on Vercel it just works.

## Tips for best results

- Phone / laptop mic 20–50 cm from the soundhole, quiet room, no earbuds mic.
- If strum timing is consistently early/late, use **Settings → Timing offset → Measure with speakers** (Bluetooth headphones add a lot of delay).
- Chord detection too fussy or too lax? Settings → Chord detection (Forgiving / Normal / Strict).

## Extending to other instruments

Chord shapes (`src/music/chords.ts`), tunings (`src/music/notes.ts`) and strum patterns (`src/music/strum.ts`) are plain data. The audio core is instrument-agnostic.
