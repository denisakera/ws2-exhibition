# MŮŽE HMOTA POČÍTAT? — design of the touchscreen station

The touchscreen is a **window into the processes the physical apparatus cannot show**. The
physical apparatus (samples of WS₂ nanotubes, oscilloscope, electronics) stands directly beside it.
The two are **not connected**: the screen never controls the apparatus and never claims to show
what the oscilloscope shows. They share a vocabulary instead: pulses, a material, a response, a trace.

## 1. Spatial layout

The screen is one fixed 1920 × 1080 composition, scaled to any 16:9 display. It is split in two
columns. The column that carries the **signal** (virtual oscilloscope + network of the material)
always sits on the side **next to the physical apparatus**. The human column (title, drawing,
pulses, verdict) sits on the far side, so a visitor drawing stands in front of the screen with the
real oscilloscope within reach of the eye.

```
 APPARATUS ON THE RIGHT (default)                  APPARATUS ON THE LEFT  (key L, or ?side=left)

 ┌───────────────────────────────────┐             ┌───────────────────────────────────┐
 │ MŮŽE HMOTA POČÍTAT?  [SIMULACE]CS│EN             │ MŮŽE HMOTA POČÍTAT?  [SIMULACE]CS│EN
 ├──────────────┬────────────────────┤             ├────────────────────┬──────────────┤
 │ HUMAN        │ SIGNAL             │             │ SIGNAL             │ HUMAN        │
 │ title        │ virtual oscilloscope│             │ virtual oscilloscope│ title        │
 │ drawing      │ (large, the centre) │             │                    │ drawing      │
 │ pulses       │                    │             │ network of nodes   │ pulses       │
 │ verdict      │ network of nodes   │             │ / reflection       │ verdict      │
 │              │ / reflection       │             │                    │              │
 ├──────────────┴────────────────────┤             ├────────────────────┴──────────────┤
 │ 3 · IMPULZY → ODEZVA HMOTY        │             │ ...                               │
 └───────────────────────────────────┘             └───────────────────────────────────┘
                                   ║                  ║
                       ┌───────────╨──────────────────╨───────────┐
                       │  physical sample + oscilloscope (not     │
                       │  connected to the screen)                │
                       └──────────────────────────────────────────┘
```

There are **no arrows, lines, glows or animations that cross from the screen toward the apparatus**.
The only pointer to it is words: "Vedle obrazovky si můžete prohlédnout…".

## 2. Arrangement on the touchscreen, by phase

| Phase | Human column | Signal column |
|---|---|---|
| **Idle** (autonomous) | Huge title, invitation, a small 8×8 picture of the digit now being simulated, "Na obrazovce je simulace. Vedle ní je skutečný materiál." | Scope and network run on their own, on real simulated runs of random MNIST test digits; earlier runs persist as faint ghosts |
| **Draw** | Large drawing surface (720 px), live 8×8 preview in the corner, two buttons | Scope at rest, labelled "bez vstupu · klid" (the model's honest response to no input) |
| **Run** (four stages, each waits for the visitor's **Dál**) | 1 the drawing dissolves into 8×8 points · 2 rows unfold into 8 pulse rails (K1–K8) · 3 the playhead sweeps the rails while the response plays (≈ 10 s) · 4 the reading; one sentence of narration per stage | Scope draws the response step by step, network lights up, eight input ticks follow the rails |
| **Result** | Giant digit, ten score bars, no extra buttons (navigation sits in the top bar) | Scope stays; the network gives way to the reflection text and "Zkusit znovu" |

**Relation to the installation.** The touchscreen accompanies *Námitka lady Lovelace* (Paleofuture
Lab, 2026), whose own text says: "Nic se tu nepředstírá, nic nedokresluje." The screen is the one
place that *is* modelled, which is why "INTERAKTIVNÍ SIMULACE" and "Rozmístění je výtvarné" are part of
the work and not small print. The word *rozhodnout* carries the same double meaning as in the
description ("materiál, který se ještě nerozhodl", "dřív, než o tom rozhodne někdo jiný"): the
readout layer decides, and we trained it; the material decides nothing.

**Finale "Budoucnost hmoty".** Fifteen cards in four chapters, each card shows its chapter and the chapter's
one-line logic: **I · PŘÍKAZ** (Lovelace: a machine does what we order; Beer and Pask's pond that was to run a
factory; the first pulsar, a clock no one ordered), **II · NASLOUCHÁNÍ** (this matter is not ordered, we only learn to read it: memory
without a chip; programmed or chance; tool or collaborator), **III · CO BY UMĚLA** (an eye without a camera;
radiation shield; matter that guards waste; armour, lubricant, fuel; true randomness), **IV · ODPOVĚDNOST** (the paper
question about twenty years; Aristotle and the bed in the ground; the last card is a short letter, "Claude to WS₂", from an AI to the nanotubes. Aristotle's coda: his definition of the artificial
thing by what it is not, set against nanotubes that are made and yet have their own dynamics). Each provocation
has two voices, **VÍME** (a checked statement, sources in `research.md`) and **DOMNĚNKA** (the guess beyond it).
The opening card (Lovelace) and the coda (Aristotle) can be read aloud: see README, "Voice". The signal column
keeps replaying the visitor's own run. Nothing the visitor types is kept; the archive of futures stays on paper.
The texts are drafts for the collective to rewrite.

**Advanced layer ("Co udělá světlo", "Jak se rozhoduje").** From the top-bar navigation one opens a second
level for curious and expert visitors, so the 30–60 s story stays simple. It shows the light
experiment of the paper on the simulation: a readout trained in the dark, tested under light (it
errs), retrained under light (it recovers), with a chart over six measured light levels, three large
numbers for the chosen level, and a pointer to the laboratory mode for those who want to tune the
model themselves (staff opens it; the public screen never links to it). The layer has two tabs:
*Světlo a přeučení* (a live dimmer: the visitor's own digit is re-run at the chosen light and read by the
old or by the retrained readout) and *Jak se čtecí vrstva rozhoduje* (each digit's score as eight
moments of votes plus an offset; tap a digit to see how its score is made up). The numbers are stored by
`tools/light_experiment.mjs` (`data/expo-light.json`); the page only draws them. At full light
(gain ×2) the dark-trained readout falls from 93.7 % to 59.7 % and the retrained one reaches 93.5 %.

A visitor passes through draw → send → run → result in about **45–90 seconds**, set by how fast they
press **Dál** (the animations themselves total about 15 s). Idle after 45 s without touch while drawing
or waiting at a **Dál**, or 50 s on the result.

## 3. What is data, what is aesthetics

| On screen | Source |
|---|---|
| Pulse levels on the rails | The 8×8 input after the dataset's own reduction; darker pixel = higher pulse (`js/reservoir.js`, 'row' mapping) |
| Scope: green curves | Fast state `x` of the six nodes that move most in this run, at every one of the 64 simulation steps |
| Scope: white curve | Mean magnitude of the slow state `s` over all 64 nodes ("memory") |
| Scope: time axis | Model time (10 ms per pulse slot); playback is slowed by a stated factor (≈ 120×) |
| Node brightness, filament brightness | Live \|state\| of that node |
| Which nodes are connected | The model's actual recurrent wiring |
| Digit, bars | Ridge readout scores (`data/expo-readout.json`) |
| "Unsure" | Score margin below 0.15; measured: below it the readout is right 58 % of the time, above 96.5 % (3 000 MNIST test digits) |
| **Aesthetic only** | Where nodes sit, filament curvature, colours, glow, grain, easing, playback speed, the choice of six traces. Stated on screen: "Rozmístění je výtvarné." |

Nothing is pre-rendered or looped. The idle animation is the same simulation as the interactive one,
fed with random test digits. Everything shown is **simulation**; the badge **INTERAKTIVNÍ SIMULACE**
is on screen in every phase.

Measured on the simulation (not on the physical sample): 93.66 % accuracy on 10 000 held-out MNIST
test digits; hand-drawn digits are less reliable than MNIST digits and the screen says so by
flagging "není jistá" when the margin is small.

## 4. Colour

| Token | Value | Use |
|---|---|---|
| Ink | `#050606` | background |
| Graphite | `#0c0f0d`, `#151a17` | panels, drawing surface |
| Line | `#24302a` | graticule, rules |
| Warm white | `#efe8d6` | title, digit, drawn stroke, memory curve |
| Warm dim / mute | `#a8a290` / `#6d756e` | secondary text, labels |
| Phosphor green | `#86ffa8` | signal, active pulses, the one button, the badge |
| Phosphor dim | `#2f8f52` | inactive bars, quiet signal |

Black, graphite, warm white, phosphor green: nothing else. The scope uses additive blending
(`lighter`) so overlapping traces brighten like a phosphor screen.

## 5. Typography

* **Instrument Serif** (title, the digit, narration in italic): a high-contrast serif with full Czech diacritics, for the human voice.
* **IBM Plex Mono** (labels, instrument text, buttons): for everything that belongs to the instrument.
* Fonts are local files in `fonts/` (SIL OFL); the page needs no network.
* Scale: digit 600 px · title 128 px · invitation 46 px · narration 42 px · buttons 22 px caps, tracking .2 em · instrument labels 15–19 px.

## 6. Vocabulary shared with the physical station

Use the same words on the screen, on the labels and in what staff say: **impuls · vzorek · materiál WS₂ ·
elektroda · odezva · osciloskop · stopa signálu · paměť**. The reservoir-computing term is always
written *rezervoárové počítání (reservoir computing)*. The screen's graticule (a division per pulse,
a time scale in ms) deliberately resembles an instrument screen but does **not** claim to match the
physical oscilloscope's settings.
