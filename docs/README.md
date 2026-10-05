# Manan Shah — Portfolio

Clean, editorial portfolio over a dusk coastal-metropolis world flown
third-person with a chase camera. An original world (no game assets):
mainland waterfront skylines on BOTH shores tiling the full loop, with neon
crowns on the facades and palms leaning over the beaches; a channel of city
and grass islands between them; PBR materials (MeshStandard); REAL planar
water reflections (three.js Reflector, desktop only); a 360° ring of layered
mountain ranges (textured rock-to-snow near ridges); an airliner-style
aircraft with a lathe-turned fuselage, swept wings, winglets, engine nacelles
with spinning fans, cabin window strips and a livery stripe; suspension
bridge with traffic; helicopter; boats with wakes; balloons with burner
flames; bird flocks; lighthouse with a sweeping beam. The scroll drives BOTH
the throttle and a flight arc: high in the sky → deck level mid-page → back
into the sunset by the contact section (the ALT readout tracks it). Every
model is procedural (canvas textures + primitives) — zero asset downloads.
Coast buildings are merged per material bucket (BufferGeometryUtils) so both
shores run the whole loop at a handful of draw calls per chunk.

Notes on motion:
- `wrapZ` moves the world toward the camera (+Z) as `travel` grows — that is
  what makes scrolling read as flying FORWARD. Don't flip it.
- The altitude arc is `targetAlt = 3.6 + (22-3.6) * (cos(scroll*2π)+1)/2`;
  plane pitch follows the climb rate.
- Work/Skills/Education sections sit behind frosted panels because mid-dive
  they ride directly over the bright sun reflection.

## Cinematic pass (2026-07-18)
GTA-trailer finishing layer on top of the base world:
- **IBL**: a tiny sky+sea probe baked through PMREM feeds `scene.environment`,
  so every PBR surface gets real sky reflections (hemisphere/ambient were
  dialed down to 0.85/0.24 to compensate; don't raise both back up).
- **Live hull reflections**: a 256px CubeCamera rides the plane, refreshed
  every 3rd frame. During the refresh the Reflector water is swapped for a
  flat teal proxy (`envWaterProxy`) so it doesn't re-render 6 extra times.
- **Hero plane detail**: 48-seg lathe hull with a canvas-baked livery
  (cabin windows, orange cheatline, panel seams, rivet rows via bump map,
  exhaust grime, painted MS-26), cockpit frames + panel, cooling gills,
  pitot, spray rails, water rudders, float cross-braces, twisted prop
  blades inside a streaked blur disc.
- **Live control surfaces**: ailerons follow bank, elevators follow pitch,
  rudder follows yaw (`userData.ctrl`, animated only on ourPlane).
- **Shadows**: cast shadows plus a GTA-style soft contact blob on the sea
  that slides along the sun line and tightens as the plane drops.
- **Grade pass** (`CinematicGradeShader`, last in the composer): a 1.16x
  exposure lift (tone mapping does NOT run inside the composer chain, so
  the final pass owns brightness — `renderer.toneMappingExposure` is a
  no-op here), light orange/teal split-tone, saturation 1.08, soft
  vignette, whisper grain, edge chromatic fringe. Color-tuned WITH this
  pass on, tuned LIGHT on user request: no heavy vignette, no dark grade.
- **Calm pacing (user request, don't regress)**: bloom is constant 0.12
  (never throttle-pulsed — it flashed over the text), travel is
  `scroll * WORLD_LEN * 1.05 + t * 1.6` (a slow cruise, not a race),
  Lenis duration 1.75, gentle FOV/buffet, mouse lerp 0.085 with plane
  x-follow 0.09 so the stick feels connected.
- **Extras**: lens-flare ghost train off the sun, puff-cluster clouds,
  two high jets dragging contrails, float spray at deck level.

## Content rebuild + readability rebuild (2026-10-04)

The page had drifted from the resume and the text was still hard to read.
Both were fixed in one pass.

### Content: `Manan_Resume.pdf` is the source of truth
Positioning moved from "SDE, distributed systems" to **AI Engineer**, and
every claim now traces to the resume:
- PayPal, **Software Engineer**, Apr 2025 to present. The bullets describe
  the real work (a Python/FastAPI service for merchant-dispute analysis,
  Bedrock embeddings + Pinecone retrieval, document processing, Kafka
  indexing, Docker/K8s/CloudWatch) instead of the previous payment
  tokenization and fraud-latency story.
- Duck Creek dates corrected: **Mar 2021** to Jul 2023 (the page said 2020).
- **Every invented metric is gone.** The old copy claimed 30% latency, 35%
  fraud-detection latency, 25% manual review, 40% deploy cycles, 45% faster
  reporting and 30% MTTR. None of those appear in the resume. The telemetry
  strip now counts things anyone can verify: years, domains, builds, live
  domains. Do not reintroduce a number that is not on the resume.
- Stack section mirrors the resume's seven skill categories verbatim.
- The resume PDF ships at `assets/Manan_Shah_Resume.pdf` and is linked from
  the nav, the hero and the contact section.

Kept deliberately even though this resume does not list them: the two prior
degrees and the three achievements. A portfolio may hold more than a
one-page resume. They came from the earlier version of the site.

### Projects: the full history, and only links that resolve
Nine projects plus a CTA card. Live domains (trailmails.com, dialdo.com,
gitpixelpush.com) and public repos (`trailmail`, `gitpixelpush`,
`OutreachOS`) were each checked for a 200 before being linked. Relay,
ConnectPilot and the voice POC are private, so they carry a status label
instead of a dead link. **Verify before adding a link here.**

### Readability: the world recedes
The real cause was never contrast on the text, it was that the canvas never
got out of the way. The old ramp dimmed it to 0.82 at most, so every
section composited over a bright, moving, high-contrast world.
- The canvas now fades to **0.32** over the first 16% of the scroll, and
  `.world-dim` lays a scrim to 0.82 on top of what is left. The hero keeps
  the full spectacle; everything below it reads on a quiet backdrop.
- **One surface system.** Every text-bearing section sits on `.sheet`
  (`rgba(10,11,22,0.94)`). Cards and skill blocks are a single raised tier
  on top of it. No more glass-on-glass, no more per-element scrims.
- **The pinned horizontal project gallery is gone.** It hijacked the
  scroll, clipped cards at the viewport edge and could not hold nine
  projects. It is a plain responsive grid now.
- **The custom cursor is gone**, and with it `cursor: none` on the body.
  Replacing a pointer the OS already draws well with a lagging div is a
  cost with no readability benefit.
- **No `-webkit-box-reflect` on the big titles.** It painted a mirrored
  copy of the headline exactly where the hero paragraph and the contact
  email sit; the ghost text read as a rendering bug.
- Body type is 17px/1.72, paragraphs are capped at 64ch, and mono tracking
  came down to 0.14-0.20em. Nothing on the page is below 0.6rem.
- Added a skip link, visible `:focus-visible` rings, and `scroll-margin-top`
  so anchors clear the fixed nav.

### Performance
Measured with a WebGL draw-call counter, same machine, same scroll
positions, software rasterizer:

| | draw calls / frame |
|---|---|
| mid-page, before | 7278 |
| mid-page, after | 1890 |

A 74% cut, because once the world is dimmed the page renders every other
frame, parks the planar water reflection (a full extra scene render from
the mirror's viewpoint) and skips the plane's cube-camera probe (six more).
A hidden tab renders nothing at all. Also: pixel ratio capped at 1.75
instead of 2, and the film grain no longer animates a full-viewport
repaint four times a second. Hero cost is unchanged.

### Soundtrack
Rewritten. The old bed was a sawtooth engine drone over a static A-major
pad, which sat on one chord forever. It is now an actual piece: a slow
four-chord dusk progression in A minor (Am9, Fmaj9, Cmaj9, Gmaj6) at 7.4s
per chord, a sparse bell voice that walks the current chord's voicing on an
eighth-note grid into a long delay, filtered pink-ish noise as airflow in
place of the engine, and a breathing sub. Notes are scheduled 250ms ahead
of the audio clock on a `setInterval`, not on the render loop, so a 40ms
frame spent drawing a city cannot make the music stutter. Scroll opens the
airflow and the pad filter; it no longer bends the pitch, which is why fast
scrolling stopped sounding like a siren.

## Design system
- **Type**: Instrument Sans (display) + Instrument Serif italics (accent words)
  + Inter (body) + Geist Mono (labels/flight HUD: ALT / SPD / sector)
- **Color**: dusk navy `#0a0b16`, sheet `rgba(10,11,22,.94)`, warm off-white
  ink, amber accent `#ffab70`
- Photo: `assets/manan.jpg` (Brooklyn Bridge, cropped 4:5, web-compressed)

## Stack
- Vanilla HTML/CSS/JS, no build step (drops straight onto GitHub Pages)
- Three.js r0.160 (importmap) + UnrealBloomPass (gentle, 0.38)
- GSAP + ScrollTrigger (scrub reveals, staggered card entrances, counters)
- Lenis smooth scroll
- **Generative WebAudio score** — a four-chord A-minor progression, a bell
  voice walking the current chord, airflow noise and a breathing sub.
  Synthesized in-browser, zero audio files. See the 2026-10 pass above.

## Run locally
```bash
cd portfolio
python3 -m http.server 8899   # then open http://localhost:8899
```

## Deploy (GitHub Pages, same as trailmails.com)
1. Create a repo, push these files to `main`.
2. Settings → Pages → Deploy from branch `main` / root.
3. Optional: add a `CNAME` file for a custom domain.

## Notes
- `?autoenter` query param skips the enter gate (useful for testing/sharing).
- Audio starts only after the user clicks ENTER (browser autoplay policy).
- `prefers-reduced-motion` gets a static, readable page; WebGL failure falls
  back to a CSS gradient; CDN failure has a 9s preloader failsafe.
- Hero and contact have radial scrims so type always beats the world. Don't
  add text-shadow to the word-masked titles (hero/contact): the overflow-hidden
  word spans clip the shadow into visible boxes.
- Everything else is on `.sheet`. If you add a section, give it one.
- Copy style: no em-dashes in prose.
