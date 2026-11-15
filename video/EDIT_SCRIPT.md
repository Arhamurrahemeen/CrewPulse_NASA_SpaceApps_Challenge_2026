# CrewPulse 30 s demo: editing script

Source: `public/raw.mp4` (1920×1080, 93.9 s screen recording, real footage only).
Output: 1920×1080, 30 fps, 30.0 s, no audio (voiceover recorded separately).

## Editing rules
- **Wide by default.** A shot plays at full frame unless it has a focus target.
- **Zoom only to direct the eye**: onto a click target, a result card, or text the caption talks about. One push-in per shot at most, never on a full-screen visual (globe, Sun–Earth scene).
- **Push-in:** about 0.9 s, ease-in-out (cubic-bezier 0.45, 0, 0.2, 1), up to 1.4–1.7×. The frame moves to centre the target, clamped so no edge of the screen recording ever shows.
- **Transitions:** every cut is a 0.2 s crossfade. No hard cuts, no whip zooms.
- **Clicks:** an orange ripple at the real click position, drawn in the zoomed layer so it stays on the target.
- **Captions:** a lower third that fades in 0.3 s after the shot starts, at most about 12 words, all claims true to the app.
- **Speed:** 1× where possible and never above 1.4×; the face shot is slowed to 0.55× because the camera only shows the face for about 1.7 s.

## Shot list
| # | Edit time (s) | Source (s) | Shows | Focus / zoom | Caption |
|---|---|---|---|---|---|
| 1 | 0.0–3.2 | 0.0–3.2 | Dashboard hero, globe | none, with the title card over it | (title card) |
| 2 | 3.0–5.6 | 7.4–10.0 | Click "Begin camera check-in" | push to the button (227, 830), 1.5× | Camera check-in: heart rate only, from a 30-second face scan |
| 3 | 5.4–8.6 | 15.2–16.95 (0.55×) | Live scan, face in frame (about 3 s) | push to the camera panel, 1.35× | Face tracking runs in the browser. Video never leaves the device |
| 4 | 8.4–11.6 | 22.0–25.2 | Real result card, 58 bpm | push to the heart-rate card, 1.7× | A real scan from earlier today: 58 bpm. Stress is self-reported |
| 5 | 11.4–15.0 | 41.0–45.3 (1.2×) | Crew-1 "Unusual for you" card and tooltip | push to the card and tooltip, 1.6× | Colour only from cited guidelines. "Unusual for you" = vs your own baseline |
| 6 | 14.8–17.8 | 48.5–51.5 | 30-day trend chart, hover tooltip | push to the heart-rate chart, 1.5× | 30-day trends, cited range shaded, simulated data labelled |
| 7 | 17.6–19.6 | 59.0–61.0 | Sun–Earth space-weather scene | none (wide visual) | NASA DONKI space weather, cached for offline use |
| 8 | 19.4–21.6 | 64.6–66.8 | Mission dose card | push to "39.5–78.9 mSv · ESTIMATE", 1.6× | Mission dose is an estimate, never a dosimeter reading |
| 9 | 21.4–24.0 | 68.2–70.8 | Click "Environment", cabin page | none, click ripple only | Cabin CO₂, temperature and humidity vs NASA-STD-3001 |
| 10 | 23.8–27.4 | 81.6–86.5 (1.36×) | 3D body map: click abdomen, pick severity | push to the body and panel, 1.3× | 3D body map: tap where it hurts to log a symptom |
| 11 | 27.2–30.0 | 90.2–93.0 | Dashboard hero | none, with the end card | (end card) |

The watermark "Screen recording · edited with AI assistance (Claude Code)" stays top-right for the whole video.
