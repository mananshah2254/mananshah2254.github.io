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

## Readability pass (2026-08-31)
Text sits over a live, moving world, so contrast was measured against the
WORST case: a panel composited over sun glare on water (treat the backdrop
as white, not as the navy). Under that test the old values failed WCAG AA:
`--ink-faint` was 2.06:1 and `--ink-dim` 3.70:1. Now 5.45:1 and 8.59:1.
- `--ink-dim` `#bcbacb` → `#d4d2e0`, `--ink-faint` `#8a88a3` → `#a9a7bd`.
- Content panels (.card/.stat/.skill-block/.achievement/.about-facts) went to
  0.86–0.88 alpha, and the work/skills/edu scrim to 0.82, so bright water
  cannot punch through the frosting. Don't drop these back toward 0.7.
- Hero and contact radial scrims now reach ~88% instead of fading out at
  76–78%, so long titles don't run off the edge of the scrim.
- Mono labels were 0.55rem (~8.8px), too small to read regardless of
  contrast; they are 0.62rem now.
- Still no `text-shadow` on the word-masked titles, for the clipping reason
  in Notes below. Scrims do the work instead.

## Polish pass (2026-08-31)
Type scale and color ramp, done after the contrast work above.
- **Type floor.** 36 declarations were under 16px and a whole label tier sat
  at 8.0-9.6px, too small to read over a moving world at any contrast. The
  label tier moved up ~2.7px (floor is now 11.2px) and the body tier to
  15.2-16.3px. Don't reintroduce sizes below `0.7rem`.
- **Tracking follows size.** The 0.32-0.42em letter-spacing was calibrated
  for 8px type; at 11-12px it made words fall apart, so it came down to
  0.24-0.30em. If you resize a label, move its tracking the opposite way.
- **One text hue.** `--ink` is warm (42 deg) but the dim tiers were lavender
  (~247 deg, the opposite side of the wheel), which read as muddy rather
  than deliberate. The ramp is now warm throughout: `--ink-dim` `#dad5cd`
  (9.30:1 over glare), `--ink-faint` `#aca69b` (5.62:1). Warm ink + amber
  accent + dusk navy ground is the intended pairing.
- `--line` went from `rgba(255,255,255,0.08)` to `rgba(246,243,236,0.14)`;
  at 0.08 the card edges were invisible and panels read as smudges.

## Design system
- **Type**: Instrument Sans (display) + Instrument Serif italics (accent words)
  + Inter (body) + Geist Mono (labels/flight HUD: ALT / SPD / sector)
- **Color**: dusk navy `#0d0e1d`, warm off-white ink, amber accent `#ffab70`
- Photo: `assets/manan.jpg` (Brooklyn Bridge, cropped 4:5, web-compressed)

## Stack
- Vanilla HTML/CSS/JS, no build step (drops straight onto GitHub Pages)
- Three.js r0.160 (importmap) + UnrealBloomPass (gentle, 0.38)
- GSAP + ScrollTrigger (pinned horizontal project gallery, scrub reveals, counters)
- Lenis smooth scroll
- **Generative WebAudio soundtrack** — wind through the airframe, a low engine
  that answers the scroll throttle, a warm A-major pad, and soft pentatonic
  chimes on section changes. Synthesized in-browser, zero audio files.

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
- Copy style: no em-dashes in prose.
