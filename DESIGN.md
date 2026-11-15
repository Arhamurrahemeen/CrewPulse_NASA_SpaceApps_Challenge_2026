# CrewPulse design system

**Art direction: "Flight data, printed."** CrewPulse should read like a flight-data recorder printed into an aerospace
manual: hairline grids, crop marks, coordinate labels, and numerals big enough to read across a module. Every value is
set like an instrument reading (tabular, timestamped, sourced), so a tired crew member can trust it at a glance and a
flight surgeon can audit it later. Around it, the space context is live and in 3D: Earth, an orbiting station, an
astronaut, the Sun.

Art direction, tokens and the original vitals-field concept: **Abdul Awwal** (OmniteX design package, 2026-11-14).
Implementation in `frontend/src/`.

## Principles

1. **Calm is the brand.** The interface annotates; it never shouts. Motion eases out and settles.
2. **Status is a word and a shape, never hue alone.** ● In range, ▲ Check, ■ Attention, ○ No cited threshold.
3. **Colour only when cited.** A reading is coloured only if `backend/rules/thresholds.json` cites a source for it. Uncited readings stay grey with a hollow ring.
4. **Data is honest in 3D, too.** Every 3D element either encodes real data (vitals satellites, the vitals field, DONKI counts) or is labelled as an illustration.
5. **Offline first.** Fonts are bundled through npm (`@fontsource`), with no CDN. 3D code loads lazily and falls back gracefully when WebGL is unavailable.

## Colour

Proportion **60 / 30 / 10**: deep-space ink 60 %, warm greys 30 %, International Orange 10 %.

| Token | Hex | Role | Contrast on ink |
|---|---|---|---|
| `--ink` | `#0A0B0D` | Background, deep space | |
| `--raised` | `#111316` | Panels | |
| `--hair` / `--hair-2` | `#1E2126` / `#2C3036` | Rules, borders, grid | non-text |
| `--tx` | `#E8E6E1` | Primary text (warm white, like paper under cabin light) | 15.8 : 1 |
| `--tx-2` | `#8A8D93` | Secondary text, axis labels | 5.9 : 1 |
| `--tx-3` | `#5C6067` | **Non-text only:** crop marks, inactive bars | 3.1 : 1 |
| `--accent` | `#FF4F00` | International Orange: what is live or actionable (primary buttons, links, focus ring, selection) | 6.0 : 1 |
| `--data` | `#5FB3F9` | Earth-limb blue: data traces, simulated badges, the atmosphere | 8.7 : 1 |
| `--green` | `#3FB68B` | Status: in range | 7.8 : 1 |
| `--amber` | `#E8B23A` | Status: check · "unusual for you" | 10.2 : 1 |
| `--red` | `#E5484D` | Status: attention | 5.0 : 1 |

**Why these colours:**
- **Orange and blue are complements.** Orange means "act", blue means "data". They never compete, and either one stands out on the near-black ink.
- **International Orange** is the aerospace safety colour of pressure suits and rescue gear. Here it's reserved for interaction, and never used for a health status, so an orange element is never mistaken for an alert.
- **The status triad is separate from the accent.** The hero headline emphasis takes the status colour (green "in range"), not orange.
- **Warm whites** (`#E8E6E1`) instead of pure white keep long sessions comfortable on a dark screen.
- **DONKI event categories** use a separate categorical set: flare amber, CME blue, SEP red, storm violet `#B58CFF`.
- **WCAG:** all text colours pass AA (≥ 4.5 : 1) on ink and on raised panels. `--tx-3` is never used for text.

## Typography

| Role | Face | Use |
|---|---|---|
| Display and numerals | **Archivo** variable, width 75–80 %, weight 600–650, tight tracking | Headlines, instrument readings (`.big`) with tabular figures |
| Data labels | **JetBrains Mono**, uppercase, +0.08 em tracking | Codes, units, axes, buttons, status words |
| Guidance | **Newsreader** variable | Plain-English guidance and ledes: a human voice next to the instruments |

Scale: hero 2.6–5.6 rem (clamp) · h1 2.4–4.2 rem · instrument 3.4–3.6 rem · body 1 rem · mono labels 0.62–0.75 rem.

## Space · grid · shape

- 4 px base. Page margin 40 px (16 px on phones). A 12-column hairline grid is drawn faintly behind every page.
- **Radius 0.** Panels carry printed crop marks at the corners, not rounded cards.
- A left status bar (3 px) on each instrument card, in the status colour.

## Motion

| Name | Duration | Where |
|---|---|---|
| Page in | 600 ms, ease-out `cubic-bezier(.16,1,.3,1)` | Each route change |
| Reveal | 700 ms, staggered 60 ms per card | Instrument cards |
| Count-up | 900 ms, cubic ease-out | Every instrument numeral, the dose range |
| Trace draw | 1.2–1.4 s | Recharts lines, the 3D vitals field, the logo pulse |
| Ambient | 2–420 s loops | Starfield drift, link ping, scanner sweep, body-map scan line, symptom dots |

`prefers-reduced-motion: reduce` turns all of this off. 3D scenes stop rotating and drawing and render their final state.

## 3D scenes (three.js via @react-three/fiber, lazy-loaded)

| Scene | File | What it encodes |
|---|---|---|
| **Orbit hero** (Dashboard) | `components/OrbitScene.jsx` | Procedural Earth (noise-field land dots, graticule, fresnel atmosphere). A station on a **51.6° orbit**, the ISS inclination. An astronaut built from basic shapes with an International Orange chest patch. **Your latest vitals as satellites**, coloured by cited status; hover or tap to read value, status and source. |
| **Vitals field** (Dashboard) | `components/VitalsField.jsx` | Awwal's concept, wired to real data. One lane per indicator; height = σ from **your own** baseline mean and SD; x = real time over 30 days; dashed lines = ±2σ; amber squares = points outside the band (labelled "one point alone is not an alert"). Orbit, hover, isolate a channel. |
| **Space weather** (Radiation) | `components/SpaceWeather3D.jsx` | Sun → Earth, driven by the cached DONKI counts: flares flash on the Sun, CMEs travel as shells, SEP particles stream, a geomagnetic storm lights Earth's field lines. Labelled "illustration, not to scale". |

| **Body map** (Body map) | `components/Body3D.jsx` | An original figure built from basic shapes in a scan-hologram style (wireframe overlay, moving scan ring, floor rings). Front or back of the torso is decided by where the click lands. Hover labels show the region. Symptom dots carry the highest severity and hide behind the body (`Html occlude`). Front/Back buttons turn the figure. A Flat SVG view and a region `<select>` keep it keyboard-accessible. |

All four use zero textures and no network, and are wrapped in `Safe3D` (an error boundary). If WebGL fails, the page still works. The orbit hero's lit-planet gradient stays as a fallback.

## Components

- `StatusMark`: shape + word status, used in cards, guidance and the hero.
- `CountUp`: animates every number inside a value (`105/77`, `36.5`) and keeps its decimals.
- `Section`: numbered section header (`1.2 Vitals field`) with a mono aside.
- `StatusCard` / `StressHrvCard`: crop-mark panel, status bar, big numeral, guidance in Newsreader, baseline in mono, source link.
- Check-in **Scanner**: animated viewfinder (face brackets, forehead ROI, sweep, live pulse trace, 45 s progress ring). An illustration; the real camera runs in the backend's preview window.

## What we deliberately left out of the design package

These were in the design files but don't match the data or the safety rules, so they're not built:
- **Invented escalation rules:** "140/90 twice → contact flight surgeons", "severity 4–5 → contact flight surgeon".
- **Lifestyle advice:** salt, caffeine, screens.
- **Uncited colours:** caution at 37.6 °C, nominal SpO₂ and mood.
- **Dose figures:** 50–100 mSv per six months. Our cited NASA source says 80–160.
- **Overclaim:** rPPG described as "a good screening tool".

**Not built yet:** hazard index, check-in streak, mission-elapsed clock, ground sync, surgeon summary export, paper theme, 38-region body map (ours has 11 regions). These are candidates after the hackathon.

## No NASA branding

No NASA insignia, worm or other marks appear anywhere. NASA appears only as credited data sources (DONKI, NASA-STD-3001, the HRP hazards). Every space visual is original geometry.
