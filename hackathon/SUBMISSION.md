# NASA Space Apps Challenge 2026 — Project submission

Team **Binary orbit** · Local Event **San Salvador, El Salvador** · Challenge **Planet X and SPHEREx**
Deadline: **Sunday, November 15, 2026, 11:59 p.m.** (local event time). Everything in the form must be in English.

Copy each block below into the matching field of the team's **Project** tab (Profile → My Team → Project → Edit).

---

## Project Name

SPHEREx Chrono-Sky Explorer

## High-Level Project Summary

SPHEREx Chrono-Sky Explorer is a free, bilingual (English/Spanish) web app that lets anyone see how the sky changes over time using NASA's public SPHEREx data. It lines up real SPHEREx DR1 images with the same patch of sky observed by 2MASS (≈1999) and AllWISE (2010) and blinks them, so nearby stars, cold brown dwarfs and near-Earth asteroids visibly "jump". Users can vote on motion candidates (including this week's near-Earth objects from NASA NeoWs), explore the real SPHEREx all-sky map at any of its 102 infrared wavelengths, and read 102-channel spectra to look for water ice, CO₂ ice and organic (PAH) features. A Simple mode with plain language and step-by-step help makes it usable by people of all ages, while an Expert mode adds coordinates, photometry and FITS/CSV exports for researchers. It addresses the challenge directly: SPHEREx returns images of more than a billion objects every six months, far too many for professionals alone, and this tool turns that flood of data into something anyone can look at, understand and help classify.

## Link to Project Demo

https://lilitbeth.github.io/spherex-chrono-sky-explorer/demo/

(7-slide deck. PDF version: https://lilitbeth.github.io/spherex-chrono-sky-explorer/demo/SPHEREx-Chrono-Sky-Explorer-demo.pdf)

## Link to Final Project

https://lilitbeth.github.io/spherex-chrono-sky-explorer/

(Source code: https://github.com/lilitbeth/spherex-chrono-sky-explorer)

## Detailed Project Description

**What it does**

- **Sky Explorer (blink comparator):** shows the same field from 2MASS (≈1999), AllWISE (2010) and SPHEREx DR1 (2025) on one common pixel grid, in blink, split-slider, difference and mosaic views. Users can pick any of the 102 SPHEREx channels, follow a proper-motion track, measure aperture photometry and export multi-epoch FITS files.
- **Motion Candidates:** a validation queue that combines this week's near-Earth objects from NASA NeoWs with the fastest-moving known stars and brown dwarfs. Each candidate has epoch thumbnails, an orbit diagram and live ephemeris computed from its orbital elements. Users vote "real" or "artefact" and can export the list as CSV/FITS.
- **Epoch Archive:** the real SPHEREx all-sky map at any wavelength (0.75–5 µm) in equatorial, ecliptic or galactic coordinates, with the Milky Way, the ecliptic and the current scan path. Clicking a region opens an A/B comparison.
- **Spectra Lab:** extracts a 102-channel spectrum at any position from the SPHEREx DR1 spectral cube and fits a temperature (Planck) curve plus water-ice, CO₂-ice, CO and PAH features. Results can be downloaded as CSV or FITS.
- **Citizen Science:** a training quiz with real image pairs, a classification history, points, levels and achievements.
- **Expert tools:** spectral diagnostics (saturation and empty channels), live SPHEREx orbit tracking over NASA GIBS Earth maps, a background processing queue, and space-weather/NEO alerts from NASA DONKI and NeoWs.
- **For everyone:** Simple mode (larger text, plain words, help boxes on every screen) and Expert mode; full English/Spanish interface; works on phones (pinch-to-zoom) and desktops; optional free accounts save points, votes and progress across devices.

**How it works**

All imaging comes from NASA/IPAC IRSA HiPS services. The browser downloads the HEALPix tiles and re-projects them (gnomonic/TAN for cut-outs, Mollweide for the all-sky map) so every survey shares the same pixel grid. The spectral cube's 102 frames are sampled pixel by pixel to build spectra, which are fitted with weighted least squares. Near-Earth-object positions are propagated with a two-body (Kepler) model from NeoWs orbital elements; the SPHEREx spacecraft position uses SGP4 with CelesTrak orbital elements. Requests to api.nasa.gov go through a small server-side proxy (Supabase Edge Function) so the API key is never exposed in the browser.

**Benefits and goals**

It makes a brand-new NASA mission accessible to students, families and amateur astronomers, especially Spanish speakers, without installing anything. It shows motion and composition visually instead of in tables. And it provides real, downloadable data so that interesting candidates can be checked by experts. Our goal is to turn many eyes into a ranked list of new brown-dwarf and moving-object candidates as more SPHEREx surveys are released, and to bring real discovery into classrooms in El Salvador and beyond.

**Tools and languages**

JavaScript, React 18, Vite, Tailwind CSS, React Router, satellite.js (SGP4), Supabase (authentication, Postgres with row-level security, Edge Function in TypeScript/Deno), GitHub Actions and GitHub Pages. HEALPix sampling, projections, coordinate transforms, FITS writing, spectral fitting and orbit propagation were implemented from scratch in JavaScript.

## Use of Super Intelligence (SI)

Yes. We used an AI coding assistant (Claude, by Anthropic) to help write and debug the application code, translate interface text between English and Spanish, and draft documentation. The project idea, the requirements and the visual design (our own mockups) came from our team, and we reviewed and tested all generated code. No SI was used to generate scientific data, images or results: every image, spectrum and number in the app and in the demo comes from the NASA and partner data services listed below, and the demo slides use real screenshots of the app. The use of AI is also disclosed in the app's Quick Guide and in the repository README.

## NASA Data

- **SPHEREx DR1 spectral cube (HiPS, 102 channels, 0.75–5 µm)** — NASA/IPAC Infrared Science Archive (IRSA): images, spectra and the all-sky map. https://irsa.ipac.caltech.edu/Missions/spherex.html
- **2MASS (J, Ks) and AllWISE (W1, W2) HiPS** — NASA/IPAC IRSA: earlier reference epochs (≈1999 and 2010) for detecting motion. https://irsa.ipac.caltech.edu/
- **NeoWs (Near Earth Object Web Service)** — api.nasa.gov: this week's near-Earth objects, orbital elements and statistics. https://api.nasa.gov/
- **DONKI (Space Weather Database Of Notifications, Knowledge, Information)** — api.nasa.gov / CCMC: space-weather alerts. https://kauai.ccmc.gsfc.nasa.gov/DONKI/
- **NASA Image and Video Library** — official SPHEREx mission imagery in the Quick Guide. https://images.nasa.gov/
- **GIBS (Global Imagery Browse Services)** — NASA Earthdata: Blue Marble and VIIRS Earth maps under the SPHEREx ground track. https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api

## Space Agency Partner Data and Other References

Data and services:
- CelesTrak GP orbital elements for SPHEREx (NORAD 63182) — https://celestrak.org/
- SIMBAD (CDS, Strasbourg) and VizieR (CDS) — external catalogue links for cross-checking objects; literature proper motions and distances for curated stars (SIMBAD / Gaia DR3) — https://simbad.cds.unistra.fr/ , https://vizier.cds.unistra.fr/
- HiPS standard (IVOA) and HEALPix (Górski et al. 2005) — tiling scheme used to read the surveys.

Software and libraries (open source):
- React, React DOM, React Router — MIT
- Vite, Tailwind CSS, PostCSS, ESLint — MIT
- satellite.js (SGP4) — MIT
- @supabase/supabase-js and Supabase platform (auth, database, Edge Functions)
- Google Fonts: Sora, Inter, Space Grotesk; Material Symbols icons — SIL OFL / Apache 2.0
- GitHub Pages and GitHub Actions for hosting and deployment

Images: all app and demo images are real data from the services above or screenshots of our app. No NASA logos or branding are used.

Our code is released under the MIT License.

---

## Optional: 30-second video script (if you prefer a video instead of slides)

Record your screen on https://lilitbeth.github.io/spherex-chrono-sky-explorer/ (Windows: Win+Alt+R with Xbox Game Bar, or OBS). Keep it ≤ 30 s. If you speak Spanish, add **English subtitles**. Do not show anyone under 18.

| Time | Screen | Voice / subtitle (English) |
| --- | --- | --- |
| 0:00–0:03 | Home page | "Hi, we're Esmeralda and Adrián, team Binary orbit from San Salvador." |
| 0:03–0:07 | Home → Moving stars | "NASA's SPHEREx maps the whole sky every six months — a billion objects, too many to check alone." |
| 0:07–0:10 | Title on screen | "So we built SPHEREx Chrono-Sky Explorer: see the sky move." |
| 0:10–0:20 | Blink on Proxima Centauri → Nearby asteroids → Whole-sky map → Spectra | "Real SPHEREx images blink against 1999 and 2010 surveys, so moving stars and asteroids jump out. Vote on candidates, explore 102 infrared colours, and find ice and dust in spectra." |
| 0:20–0:30 | Toggle Simple/Expert and ES/EN, show phone | "Simple for kids, expert for scientists, in English and Spanish. With every new survey, anyone can help discover what's moving out there." |

Upload to YouTube (Unlisted or Public) or Google Drive (Anyone with the link) and test the link in a private window.
