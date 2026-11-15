# CrewPulse: 7-minute pitch script
Team OmniteX · NASA Space Apps 2026 Karachi · local judging Sun 15 Nov, 4–6 pm
Deck: `CrewPulse-Pitch-Deck.pptx` (this folder) · 7 min talk + 3 min Q&A

**Speakers:** **ARHAM** (lead, built the app) and **AWWAL** (design, problem, NASA data).
Swap any part you like, but decide before the slot and rehearse with a timer.
At about 140 words a minute, each block below fits its time. Words in *italics* are stage directions.

> This repo copy of the deck has the 7 judging slides. A local-only version, `CrewPulse Pitch Deck v4 (with video).pptx`, adds a 94 s screen-recording slide after slide 4 (about 1.5 min): use it instead of the live demo, or skip it if the judges hold to 7 slides.

| Time | Slide | Speaker |
|---|---|---|
| 0:00–0:30 | 1 Title | Arham |
| 0:30–1:30 | 2 Problem | Awwal |
| 1:30–2:30 | 3 Solution | Arham |
| 2:30–4:00 | 4 User experience + live demo | Arham |
| 4:00–5:10 | 5 How it decides | Arham |
| 5:10–6:10 | 6 NASA data | Awwal |
| 6:10–7:00 | 7 Where we are + close | Awwal |

---

## 0:00 · Slide 1: Title (ARHAM, 30 s)
Good afternoon. We're team OmniteX: I'm Muhammad Arham, and this is Abdul Awwal.
We took the challenge *Create Health Monitoring Software for Astronauts on Space Missions*.
Our answer is **CrewPulse**: an app that lets an astronaut check their own health, notice what has changed for *them*, and know when to contact the flight surgeons, with no internet connection at all.
What you see behind me is the real app, not a mock-up. You'll see it running live in two minutes.

## 0:30 · Slide 2: The problem (AWWAL, 60 s)
Picture a crew on the way to Mars. A radio message takes up to **20 minutes each way**, so a question to a doctor and its answer can take **40 minutes**, and sometimes there's no link at all.
NASA's Human Research Program groups the risks of spaceflight into **five hazards**: radiation, isolation, distance from Earth, changed gravity, and a hostile closed environment.
Every one of them shows up first in the astronaut's own body, or in the air they breathe.
So the crew can't wait for Earth. They need to check themselves, see what's changed, and know when it's time to call for help.
*Point at the table.* On the right you can see how CrewPulse watches each hazard.

## 1:30 · Slide 3: Our solution (ARHAM, 60 s)
CrewPulse is a self-health monitor that runs on **one laptop, with no internet**. Three ideas make it different.
**One: offline-first.** The data, the camera processing, even the fonts and API docs stay on the laptop. NASA space-weather data is cached for when there's no link.
**Two: colour only when cited.** Green, amber and red come from published guidelines (the American Heart Association, the ADA, the CDC and NASA's own standard), and the source is on every card. If we couldn't find a source, the reading stays uncoloured. We never guess a medical threshold.
**Three: unusual for you.** Textbook ranges are built for the average person on Earth. CrewPulse also learns each astronaut's own normal and flags a change that lasts two days in a row.
It's decision support. It tells you when to contact the flight surgeons; it never diagnoses.

## 2:30 · Slide 4: The user experience + LIVE DEMO (ARHAM, 90 s)
The flow is simple: **log, scan, see, act.**
*Switch to the app (crew-1 dashboard). If the laptop fails, play the 30-second video instead.*
- *(Check-in page)* An astronaut can type their vitals, or do a **30-second webcam scan** that reads **heart rate only**. Face tracking runs in the browser; the video never leaves the laptop. If the signal is weak, it refuses to guess and asks for a re-scan.
- *(After the scan)* It then asks how stressed you feel, on a 0-to-10 scale. That's self-reported on purpose, because a camera can't measure stress reliably.
- *(Dashboard cards)* Every reading becomes an instrument card: the value, the colour, plain-English guidance and the source. Look at heart rate: **83 is green** by the American Heart Association, but this astronaut is usually around 68, and it's been high two days running, so CrewPulse adds **"Unusual for you."**
- *(Body map, if time allows)* There's also a 3D body map: tap where it hurts to log a symptom.

Everything simulated is labelled "Simulated" in the app.
*Back to the slides.*

## 4:00 · Slide 5: How it decides (ARHAM, 70 s)
Every reading goes through **two checks**.
**First, a published guideline.** 83 bpm sits inside the AHA's 60 to 100, so the card is green.
**Second, the astronaut's own baseline.** We take the mean and spread of the previous 28 days. This astronaut is usually **68.6, plus or minus 1.8**, so today is almost **8 standard deviations high**, and yesterday was too. Two days in a row, same direction: **"Unusual for you."**
Why two days? Flagging a single day would give a false alarm about once in 22 checks. Requiring two brings it to about **once in 970**, so crews don't learn to ignore alerts. Truly dangerous single readings, like a fever, still turn red immediately.
*Point at the 3D field.* This view shows exactly that: each line is one indicator over 30 days, and heart rate jumps at the end.
And it's **rules and statistics only, with no machine learning**, so a flight surgeon can check every decision.

## 5:10 · Slide 6: NASA data (AWWAL, 60 s)
NASA data is what makes CrewPulse space-ready.
The radiation page pulls solar flares, coronal mass ejections, geomagnetic storms and particle events from NASA's **DONKI** space-weather database: **103 events in the last 30 days**. It caches them, so they still show offline, with the age of the data on screen.
The cabin checks use NASA's own human-spaceflight standard, **NASA-STD-3001**: CO₂ at or below **3 mmHg**, plus temperature and humidity limits.
The **600 mSv career dose limit** comes from the same standard, and the mission dose is an estimate from NASA's published ISS averages, clearly labelled **"Estimate"**.
We also reviewed the Inspiration4 data in NASA's OSDR, but it holds blood and microbiome samples, not daily vitals, so we didn't use it.

## 6:10 · Slide 7: Where we are + close (AWWAL, 50 s)
Everything you saw **works today, offline**, with **136 automated tests** passing.
We want to be honest about the limits. CrewPulse is decision support, **not a medical device**. The camera heart rate hasn't been validated against an oximeter on real faces yet. Camera heart rate is known to be less accurate on darker skin, so that study needs a range of skin tones. And most thresholds are written for people on Earth; where NASA gives a spaceflight value, we use it.
**Next:** run that validation study, read the onboard sensors and dosimeter directly, and add a multi-crew view with encrypted sync to the ground.
*Point at the QR code.* You can open the live demo on your phone right now.
**Thank you. We'd love your questions.**

---

## Q&A prep (3 min): who answers what
| Likely question | Answer (short) | Who |
|---|---|---|
| How does the camera get heart rate? | Forehead colour over 30 s, POS method, filtered to 0.7–4 Hz; the strongest frequency is the pulse. Weak signal means a re-scan, never a number. | Arham |
| How accurate is it? | Not validated yet; that's our first next step. The validation tool (camera vs oximeter: error, bias, Bland–Altman plot) is already built. | Arham |
| Why no HRV or stress from the camera? | Published work doesn't support reliable HRV or stress from a webcam yet. HRV is typed in from a chest strap, and stress is self-reported. | Arham |
| Why not use AI / machine learning? | No crew data to train on, and rules can be checked by a flight surgeon. Every threshold has a cited source. | Arham |
| Do thresholds apply in space? | Mostly Earth guidelines; NASA-STD-3001 where it has a value. Your own baseline adapts to spaceflight changes. | Arham |
| What data did you use? | Simulated 90-day crew history (labelled), live NASA DONKI, NASA-STD-3001. | Awwal |
| Why is dose higher at solar minimum? | A quiet Sun shields less against galactic cosmic rays. | Awwal |
| Privacy? | Video never leaves the laptop; only three colour numbers per frame go to the local backend. The public demo stores entries only in your own browser. | Arham |
| Did you reuse code? | Signal-processing parts from Arham's own open-source VitalSense project, with the Local Lead's permission, attributed in the README. | Arham |
| How was AI used? | Built with Claude Code as a coding assistant; idea, design and decisions are ours. | Arham |

**Rules for Q&A:** keep answers to about 20 seconds. If a question is outside your part, hand it to your teammate rather than guess. "We don't know yet, and here's how we'd find out" is a good answer.

## Before you go on
- Laptop: backend and frontend running, crew-1 dashboard open, camera allowed, good light. Close other apps (screen recording slows the camera).
- Backup: the 30 s video on the desktop, plus the live demo link.
- Rehearse twice with a timer. If you're over time, cut the body-map line on slide 4 and the OSDR line on slide 6.
