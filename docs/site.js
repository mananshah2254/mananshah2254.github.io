/* ═══════════════════════════════════════════════════════════
   MANAN SHAH — PORTFOLIO · THE PAGE
   Everything the content layer needs, in plain DOM APIs: scroll
   state, reveals, counters, navigation, the instrument strip.
   No animation library and no smooth-scroll library. The 3D
   world (world.js) and the score (audio.js) are separate modules
   that this file pulls in only when they are wanted.
   ═══════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const root = document.documentElement;
  const flight = (window.__flight = window.__flight || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
  const smooth = (t) => t * t * (3 - 2 * t);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const query = new URLSearchParams(location.search);

  window.__siteReady = true;

  /* ── scroll state ──
     One rAF-throttled reader. It feeds the progress hairline, decides how
     far the world has receded behind the content, and tells the world how
     close we are to the landing (which is what turns golden hour to dusk). */
  const nav = $("#nav");
  const contact = $("#contact");
  let queued = false;
  const readScroll = () => {
    queued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = Math.max(root.scrollHeight - vh, 1);
    const p = clamp(y / max);
    const recede = smooth(clamp(y / (vh * 0.78)));
    const finale = contact
      ? smooth(clamp((vh * 0.92 - contact.getBoundingClientRect().top) / (vh * 0.8)))
      : 0;
    flight.progress = p;
    flight.recede = recede;
    flight.finale = finale;
    root.style.setProperty("--p", p.toFixed(4));
    root.style.setProperty("--dim", (recede * (1 - finale * 0.93)).toFixed(3));
    nav.classList.toggle("is-stuck", y > 24);
  };
  const onScroll = () => {
    if (!queued) { queued = true; requestAnimationFrame(readScroll); }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  readScroll();

  /* ── reveals ── */
  const revealEls = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    // siblings arriving together stagger slightly instead of landing as a slab
    const io = new IntersectionObserver((entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty("--d", `${Math.min(i++ * 0.07, 0.35)}s`);
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ── counters ──
     The real number is already in the markup, so nothing reads as zero if
     this never runs. */
  if ("IntersectionObserver" in window && !reduceMotion) {
    const co = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        co.unobserve(e.target);
        const el = e.target;
        const to = parseFloat(el.dataset.count);
        const t0 = performance.now();
        const dur = 1100 + to * 30;
        const step = (now) => {
          const k = clamp((now - t0) / dur);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(step);
        };
        el.textContent = "0";
        requestAnimationFrame(step);
      }
    }, { threshold: 0.6 });
    $$("[data-count]").forEach((el) => co.observe(el));
  }

  /* ── sectors: active nav link + the instrument strip ── */
  const sectorEl = $("#stripSector");
  const lineEl = $("#stripLine");
  const navLinks = $$(".nav-links a");
  const navFor = { experience: "experience", work: "work", builds: "work", stack: "stack", approach: "stack", education: "stack", about: "about", contact: "contact" };
  let current = "";
  let swapTimer = 0;
  let chime = 0;
  const setSector = (sec) => {
    const name = sec.dataset.sector;
    if (name === current) return;
    current = name;
    const target = navFor[sec.id];
    navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${target}`));
    if (sectorEl) sectorEl.textContent = name;
    if (lineEl) {
      lineEl.classList.add("is-swapping");
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => {
        lineEl.textContent = sec.dataset.line || "";
        lineEl.classList.remove("is-swapping");
      }, 280);
    }
    if (flight.audio && flight.audio.on) flight.audio.bell(chime++);
  };
  if ("IntersectionObserver" in window) {
    // a section is "current" while it crosses a band just above mid-screen
    const so = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setSector(e.target);
    }, { rootMargin: "-42% 0px -52% 0px" });
    $$("[data-sector]").forEach((s) => so.observe(s));
  }

  // ALT / SPD come from the world once it is flying
  const altEl = $("#stripAlt");
  const spdEl = $("#stripSpd");
  if (altEl && spdEl) {
    setInterval(() => {
      if (!flight.ready || document.hidden) return;
      altEl.textContent = `ALT ${String(Math.round(flight.alt || 0)).padStart(4, "0")} FT`;
      spdEl.textContent = `SPD ${String(Math.round(flight.spd || 0)).padStart(3, "0")} KT`;
    }, 140);
  }

  /* ── mobile menu ── */
  const burger = $("#navBurger");
  const linksBox = $("#navLinks");
  const setMenu = (open) => {
    linksBox.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  burger.addEventListener("click", () => setMenu(!linksBox.classList.contains("is-open")));
  linksBox.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#nav")) setMenu(false);
  });

  /* ── copy email ── */
  const copyBtn = $("#copyEmail");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        copyBtn.textContent = "COPIED";
        copyBtn.classList.add("is-done");
      } catch (err) {
        copyBtn.textContent = "PRESS ⌘C";
      }
      setTimeout(() => {
        copyBtn.textContent = "COPY";
        copyBtn.classList.remove("is-done");
      }, 1800);
    });
  }

  /* ── local time in San Francisco ── */
  const clockEl = $("#sfClock");
  if (clockEl) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true,
    });
    const tickClock = () => { clockEl.textContent = `${fmt.format(new Date()).toUpperCase()} IN SF`; };
    tickClock();
    setInterval(tickClock, 30000);
  }

  /* ── the score: fetched on the first press, never before ── */
  const audioBtn = $("#audioToggle");
  const audioLabel = $("#audioLabel");
  const setAudioUI = (on) => {
    audioBtn.classList.toggle("is-on", on);
    audioBtn.setAttribute("aria-pressed", String(on));
    audioLabel.textContent = on ? "SOUND ON" : "SOUND OFF";
  };
  audioBtn.addEventListener("click", async () => {
    try {
      if (!flight.audio) {
        const mod = await import("./audio.js");
        flight.audio = new mod.AudioEngine();
      }
      if (flight.audio.on) { flight.audio.stop(); setAudioUI(false); }
      else { await flight.audio.start(); setAudioUI(true); }
    } catch (err) {
      audioLabel.textContent = "NO AUDIO";
    }
  });

  /* ── the world: loaded after the page is readable ──
     Skipped for reduced motion, for Save-Data, and when WebGL is missing.
     The CSS sky behind the canvas is the fallback in every one of those. */
  const hasWebGL = () => {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch (e) { return false; }
  };
  const saveData = navigator.connection && navigator.connection.saveData;
  const wantWorld = !reduceMotion && !saveData && !query.has("noworld") && hasWebGL();
  const worldOff = () => root.classList.add("world-off");
  if (wantWorld) {
    const boot = () => {
      import("./world.js")
        .then(() => { if (flight.failed) worldOff(); })
        .catch((err) => {
          // the page is complete without the world, but say why it is missing
          console.warn("[world] not started:", err);
          worldOff();
        });
    };
    const idle = () => ("requestIdleCallback" in window
      ? requestIdleCallback(boot, { timeout: 1500 })
      : setTimeout(boot, 200));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  } else {
    worldOff();
  }
})();
