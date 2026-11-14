# SPHEREx Chrono-Sky Explorer

**NASA Space Apps Challenge 2026** · A bilingual (English / Español) web app that turns NASA's public SPHEREx
data into a multi-epoch "blink comparator", a motion-candidate validation queue, an all-sky epoch archive and a
102-channel spectral lab — all running in the browser on official open data.

> Community project. Not an official NASA website.

## High-level summary

SPHEREx (launched March 2025) maps the entire sky every six months in 102 infrared colours (0.75–5.0 µm).
Chrono-Sky Explorer lets anyone compare SPHEREx with earlier infrared surveys (2MASS ≈1999, AllWISE 2010) to spot
objects that move — nearby stars, cold brown dwarfs and near-Earth asteroids — and to read their infrared spectra
for ices (H₂O 3.05 µm, CO₂ 4.27 µm) and PAH emission (3.3 µm). Classifications are stored locally, and every view can
be exported as FITS/CSV for real analysis.

## Features

| Page | What it does | Data |
| --- | --- | --- |
| **Sky Explorer** | Blink / split / difference / mosaic comparator of 2MASS → AllWISE → SPHEREx on a common TAN projection, proper-motion reticles, 102-channel slider, spectral tracers, RGB composite, aperture photometry, pan/zoom, multi-epoch FITS export, citizen classification form | IRSA HiPS (SPHEREx DR1, 2MASS, AllWISE) |
| **Motion Candidates** | This week's near-Earth objects plus curated high proper-motion stars / brown dwarfs; filters, sorting, pagination, keyboard voting (1/2/Space), Keplerian orbit diagram and live ephemeris from orbital elements, CSV and FITS batch export | NASA NeoWs, IRSA HiPS |
| **Epoch Archive** | Real SPHEREx all-sky Mollweide map at any of the 102 wavelengths in ecliptic / galactic / equatorial frames, galactic plane & ecliptic overlays, current scan circle, survey calendar, A/B blink viewer with a real 102-channel spectral signature, FITS export | SPHEREx DR1 Allsky HiPS |
| **Spectra Lab** | Aperture spectrum extraction from the 102-frame cube, error bars, Planck + feature-template least-squares fit with auto-T, synthetic colours, per-detector cut-outs, full channel matrix, CSV and FITS (BINTABLE) export | SPHEREx DR1 cube |
| **Citizen Science** | Training quiz with real blink pairs, history (CSV/JSON export), achievements, links to NASA citizen-science projects | IRSA HiPS |
| **Spectral Diagnostics** | Per-channel median, MAD noise, coverage and saturation for the 6 LVF detector bands | SPHEREx DR1 cube |
| **Orbital Telemetry** | Live SGP4 position of SPHEREx, ground track, sub-solar point, day/night terminator, sunlit/eclipse, time warp | CelesTrak (NORAD 63182), NASA GIBS |
| **Calibration Queue** | In-browser processing queue (spectra, cut-outs, all-sky maps, per-band backgrounds) producing downloadable FITS | IRSA HiPS |
| **Transient Alerts** | Space-weather notifications and NEO close approaches with severity, filters and acknowledgement | NASA DONKI, NASA NeoWs |
| **Quick Guide** | How-to, shortcuts, data sources, official SPHEREx imagery, API key settings, AI disclosure | NASA Image and Video Library |

The whole UI switches between **English and Spanish** (top-right `ES | EN`), and the choice is remembered.

## NASA / open data used

- **SPHEREx DR1 spectral cube HiPS** — NASA/IPAC Infrared Science Archive (IRSA): `irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`
- **2MASS** and **AllWISE** HiPS — NASA/IPAC IRSA
- **NeoWs** (Near Earth Object Web Service) and **DONKI** (space weather) — `api.nasa.gov`
- **NASA Image and Video Library** — `images-api.nasa.gov`
- **GIBS** (Global Imagery Browse Services) — NASA Earthdata / EOSDIS
- **CelesTrak** GP elements for SPHEREx (NORAD 63182)

Notes: HiPS tiles are 8-bit visualisation products (asinh stretch, 0–40 MJy/sr); physical values are reconstructed
and approximate, and very bright regions saturate. 2MASS/AllWISE epochs are approximate mean epochs; curated proper
motions are literature values (SIMBAD / Gaia DR3). NEO positions use a two-body model. For publishable science use
the official IRSA L2/L3 products.

## Tech stack

React 18 + Vite 5, Tailwind CSS 3 (design tokens from the mockups), React Router (hash routing for static hosting),
satellite.js (SGP4). No backend: HEALPix/HiPS sampling, gnomonic & Mollweide projections, coordinate transforms,
FITS writing, spectral fitting and Kepler propagation are implemented in `src/lib/`.

```
src/
  lib/        healpix, hips, coords, orbit, spectrum, fits, nasa (API + cache), mission, colormap
  components/ Layout (sidebar/header/search/notifications/language), Sky (cut-outs), OrbitDiagram, ui
  pages/      Explorer, Candidates, Archive, SpectraLab, Citizen, Diagnostics, Telemetry, Queue, Alerts, Guide
  i18n/       ES/EN provider
  store/      local-first state (classifications, votes, jobs, notifications)
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

Optional: copy `.env.example` to `.env` and set the Supabase values (see below). Without a NASA key the
app uses `DEMO_KEY` (≈30 requests/hour) and caches responses in the browser; users can also paste a key in
*Quick Guide → Settings*.

## Accounts & cloud progress (Supabase)

Users can create a free account (email + password) on the **My account** page; their profile, level, classifications
and game progress are synced to Supabase and restored on any device. Without Supabase configured, progress is kept in
the browser and can be exported/imported as a JSON file.

1. Create a free project at https://supabase.com.
2. In *SQL Editor*, run [`supabase/schema.sql`](supabase/schema.sql) (table `user_progress` with row-level security:
   each user can only read/write their own row).
3. In *Authentication → URL Configuration*, set the Site URL to your deployed URL and add it to the redirect URLs.
4. Put the project URL and the **anon** public key in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and as
   repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the Pages build.

### Hidden NASA API key (Edge Function proxy)

The api.nasa.gov key is never shipped to the browser. Calls to NeoWs and DONKI go through the Supabase Edge Function
[`supabase/functions/nasa-proxy`](supabase/functions/nasa-proxy/index.ts), which only forwards the endpoints the app
uses and adds the key from a server-side secret:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set NASA_API_KEY=<your key>
npx supabase functions deploy nasa-proxy
```

Without Supabase the app falls back to `DEMO_KEY`; visitors can also paste their own key in *Quick Guide → Settings*.

## Simple mode

The site opens in **Simple mode** (larger text, plain-language names and step-by-step help boxes, technical controls
hidden) so it works for all ages. The `Simple / Expert` button in the header switches to the full scientific interface.

## Deploy

Pushing to `main` builds and publishes to **GitHub Pages** via `.github/workflows/deploy.yml`
(enable *Settings → Pages → Source: GitHub Actions*). The NASA key is not part of the build; see the Edge Function proxy below.

## AI disclosure

This project was developed with the help of an AI coding assistant (Claude, by Anthropic), as permitted by the NASA
Space Apps policy. No AI was used to generate scientific data: all data comes from the official services listed above.

---

## Resumen en español

Aplicación web bilingüe para el NASA Space Apps Challenge 2026 que usa datos abiertos oficiales (SPHEREx DR1, 2MASS y
AllWISE en NASA/IPAC IRSA; NeoWs, DONKI, Image Library y GIBS de NASA) para comparar épocas del cielo infrarrojo,
validar candidatos de movimiento, explorar el archivo de todo el cielo y analizar espectros de 102 canales.
Cambia de idioma con el selector `ES | EN` de la cabecera. Instrucciones de ejecución arriba (`npm install`,
`npm run dev`).

## License

MIT — see [LICENSE](LICENSE). Data products remain subject to the terms of their providers (NASA, IPAC/Caltech).
