# Manan Shah — Portfolio

Live at https://mananshah2254.github.io/ (GitHub Pages serves `main:/docs`).

A content-first portfolio with a procedural 3D bay behind it. The page is plain
HTML and CSS and is readable in the first paint. A Three.js world (golden hour
over the hero, dusk over the contact section) loads afterwards and is optional.

## Files

| File | What it is |
|---|---|
| `index.html` | All content. No templating, no build step. |
| `styles.css` | The whole design system. First paint needs only this and the HTML. |
| `site.js` | Page behaviour in plain DOM APIs: scroll state, reveals, counters, nav, instrument strip. Lazy-loads the two modules below. |
| `world.js` | The 3D scene. Imported by `site.js` after `load`, when idle. |
| `audio.js` | The generative WebAudio score. Imported only when the sound toggle is pressed. |
| `assets/` | `manan.webp`, `og.jpg`, the résumé PDF, and `work/*.webp` (real screenshots of the five live products). |

## Rebuild of 2026-11-10

### Load: content first, world second
- **No preloader and no "enter" gate.** The old page held everything behind a
  counter and an ENTER WITH SOUND button. Now the text paints immediately over a
  CSS sky, and the WebGL scene fades in when its first frame is ready
  (about 1.5 s on a laptop). Sound is opt-in from the nav.
- **GSAP, ScrollTrigger and Lenis are gone.** Reveals use IntersectionObserver
  and CSS transitions, the hero entrance is a CSS animation, and scrolling is
  native. `site.js` is about 9 KB unminified.
- **Three.js loads lazily and minified** (`three.module.min.js` from jsDelivr,
  about 165 KB compressed, down from the 1.27 MB unminified build). The post
  processing chain (EffectComposer, bloom, grade pass, lens flare, Reflector)
  is no longer imported at all.
- The world is skipped for `prefers-reduced-motion`, Save-Data, and missing
  WebGL. `?noworld` forces that path for testing. In all of those cases the CSS
  sky stays and the sound toggle and gauges hide.
- If `site.js` never arrives, an inline timeout un-hides the reveal targets, so
  the content can never be stuck invisible.

### The world: realism from light, not from polygons
The old scene was a bright midday low-poly bay. The geometry was fine; the
light was what made it read as a toy. Same models, new everything around them:
- **Sky**: the three.js `Sky` addon (Preetham atmospheric scattering) with the
  sun about 3 degrees above the horizon, plus a drawn sun disc and halo, since
  the model extinguishes the disc that close to the horizon.
- **Ocean**: the three.js `Water` addon (planar reflection distorted by a
  normal map, fresnel, sun glitter). Its normal map is generated at boot from
  44 sine swells with integer wave numbers, so it tiles exactly and replaces
  the 250 KB JPEG the stock example ships. The shader is patched with a `flow`
  uniform because the world is a treadmill and the water has to slide with it.
  The mirror target is half-float so the bright sky does not clip.
- **Image-based lighting** baked once from that same sky through PMREM. Glass,
  paint and aluminium reflect the actual sunset.
- **Facades**: each building style has a colour map, an emissive map of lit
  windows, and a roughness/metalness map, so glass is a mirror and masonry is
  matte. UVs are in whole bays and storeys, so every tower shares one window
  scale. Roofs are separate matte caps.
- **Golden hour to dusk**: `applyDusk(d)` moves only cheap things (sun
  direction, light levels, fog colour, exposure, window emissive, environment
  intensity). `site.js` drives it from how far the contact section has entered
  the viewport. The baked environment map is turned down, not re-baked.
- **Layout**: the mountain ring is left open ahead so the sun sets over clear
  water, and a suspension bridge in international orange closes the mouth of
  the bay (a nod to the one outside the window). The camera uses a view offset
  on wide screens so the aircraft and the sun sit right of the hero copy.
- Removed as toy-like or invisible: checkpoint rings, daytime stars, painted
  smear clouds, turquoise island halos, foam blobs, rooftop pools, cloud-shadow
  discs, water glint points, air dust, channel lanterns.

### Performance
`bake(root)` statically batches each finished model: every still mesh is baked
into its parent's space and merged per material, and still glow sprites become
one point cloud. Moving parts are flagged `userData.dynamic` and left alone.
Shadows, the live cube-camera probe and the whole composer chain were removed.

Measured with a WebGL draw-call counter in headless Chrome on the same machine
(Apple M2, 1440x900 at 2x):

| | old | new |
|---|---|---|
| hero, draw calls per frame | 9,575 | 1,746 |
| hero, frames per second | 19 | 61 |
| mid-page, draw calls per frame | 2,042 | 287 |

Mid-page the world sits behind `.world-dim`, so it renders every third frame
and skips the mirror pass. A hidden tab renders nothing.

### Content
- **Five live products** as featured work, each with a real screenshot of its
  site: DialDo, Reporun, Remote Window, TrailMail, GitPixelPush.
- **Ten more builds** as cards: AirBridge, PickUp, Relay for iPhone, Sentinel,
  OutreachOS, Relay, Agentic Voice System, Email Research Engine, ConnectPilot,
  and this site. Private work carries a status label instead of a link.
- A system sketch of the PayPal dispute assistant, drawn only from the résumé
  bullets above it. A "How I work" section, each habit tied to a project.
- Experience and skills still mirror `Manan_Resume.pdf`. **No invented
  metrics.** The four stats count things anyone can check: years, live
  domains, builds on the page, platforms.
- Every external link was checked for a 200 before it went in. Verify before
  adding one.

### Fixed along the way
- The checkpoint toast and the four HUD corners used to float over the content
  and the footer. They are now one instrument strip on the bottom edge.
- There was no navigation at all below 900 px. There is now a menu.
- The About copy said "three years" at Duck Creek. The dates are Mar 2021 to
  Jul 2023, so it now says two-plus.
- Canvas colour textures are tagged sRGB (they were being read as linear).

## Design system
- **Type**: Instrument Sans (display), Instrument Serif italic (accent words),
  Inter (body), Geist Mono (labels and instruments).
- **Colour**: dusk navy `#0a0b16`, sheet `rgba(11,12,24,.94)`, warm off-white
  ink, amber accent `#ffab70`.
- **Surfaces**: every text-bearing section sits on `.sheet`. Cards and skill
  blocks are one raised tier on top. If you add a section, give it a sheet.
- Hero and contact use a left-to-right scrim instead of a sheet. Those are the
  two places the world is allowed to win.
- Copy style: no em-dashes in prose.

## Run locally
```bash
cd docs
python3 -m http.server 8899   # then open http://localhost:8899
```
ES modules need http, so opening `index.html` from disk will not start the world.

## Deploy
Push to `main`. Pages rebuilds from `/docs` in about a minute.

## Regenerating assets
- `assets/work/*.webp`: 1440x900 screenshots of the live sites, cover-cropped
  to 1120x700, WebP quality 0.8.
- `assets/og.jpg`: the hero at 1200x630.
- `assets/manan.webp`: 720x900, WebP quality 0.8.
