# DerJ — DJ · Licht · Raum

Single-page Three.js website for DerJ — DJ, Licht-Designer & Veranstalter from München.

## Structure

```
index.html         — main page (Three.js, GSAP, Web Audio glitch effects)
impressum.html     — Impressum (§5 TMG / §18 MStV)
datenschutz.html   — Datenschutzerklärung (DSGVO)
fonts/             — self-hosted woff2 fonts (no Google CDN)
  fonts.css        — @font-face declarations
  anton/
  archivoblack/
  blackopsone/
  chakrapetch/
  inter/
  majormonodisplay/
  orbitron/
  spacegrotesk/
  synemono/
  vt323/
  wallpoet/
```

## Features

- **Three.js scene** — particle hero, tunnel flythrough, beam lights, projection grid, volumetric fog
- **GSAP ScrollTrigger** — scroll-driven camera, section-linked effects
- **Text glitch system** — hover + idle font/colour chaos on all `.gx` elements
- **Vault** — SHA-256 password gate, sunrise animation, newsletter signup
- **Self-hosted fonts** — 11 font families, 40 woff2 files (~792 KB)
- **DSGVO-compliant** — no external font CDN, no tracking, no cookies
- **Responsive** — mobile burger nav, quality auto-downgrade, fallback mode

## Tech Stack

- Three.js (importmap, WebGL2 with fallback)
- GSAP + ScrollTrigger
- Web Crypto API (SHA-256 for vault)
- Vanilla JS, no build step needed

## Local Preview

Open `index.html` in a browser, or serve with any static server:

```bash
python -m http.server 8000
# → http://localhost:8000
```

## TODO

- [ ] Fill in real Impressum data (name, address, phone, USt-IdNr.)
- [ ] Graffiti photo gallery (DerJ preparing image folder)
- [ ] Video showreel integration
- [ ] Contact form → Formspree/Web3Forms (currently mailto:)
- [ ] Cookie banner for SoundCloud embed (TTDSG §25)
- [ ] DE/EN language switch
- [ ] Replace placeholder venue URLs for Lusatia, Masters of Sound, DNA Club, Milde Möhre, Zur Gruam, Club 4e
