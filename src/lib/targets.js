// Curated real targets. Positions are ICRS; proper motions (mas/yr, µα* includes cos δ) are
// approximate literature values (SIMBAD / Gaia DR3). Always verify with the SIMBAD link in the UI.

export const MOVING_TARGETS = [
  {
    id: 'proxima-cen', name: 'Proxima Centauri', type: 'hpm', spt: 'M5.5 Ve',
    ra: 217.42895, dec: -62.67949, epoch0: 2000.0, pmRA: -3781.3, pmDec: 769.8, kmag: 4.38, dist: 1.30,
    desc: { es: 'Estrella más cercana al Sol; enana roja fulgurante con planetas.', en: 'Closest star to the Sun; flaring red dwarf hosting planets.' },
  },
  {
    id: 'barnard', name: "Barnard's Star", type: 'hpm', spt: 'M4 V',
    ra: 269.452083, dec: 4.693364, epoch0: 2000.0, pmRA: -801.6, pmDec: 10362.4, kmag: 4.52, dist: 1.83,
    desc: { es: 'Mayor movimiento propio conocido (~10.4″/año).', en: 'Largest known proper motion (~10.4″/yr).' },
  },
  {
    id: 'kapteyn', name: "Kapteyn's Star", type: 'hpm', spt: 'sdM1',
    ra: 77.91912, dec: -45.01844, epoch0: 2000.0, pmRA: 6506.0, pmDec: -5731.4, kmag: 5.05, dist: 3.93,
    desc: { es: 'Subenana de halo con alta velocidad.', en: 'High-velocity halo subdwarf.' },
  },
  {
    id: 'groombridge-1830', name: 'Groombridge 1830', type: 'hpm', spt: 'G8 Vp',
    ra: 178.24489, dec: 37.71867, epoch0: 2000.0, pmRA: 4003.7, pmDec: -5813.0, kmag: 4.38, dist: 9.2,
    desc: { es: 'Estrella pobre en metales del halo galáctico.', en: 'Metal-poor galactic-halo star.' },
  },
  {
    id: '61-cyg-a', name: '61 Cygni A', type: 'hpm', spt: 'K5 V',
    ra: 316.72475, dec: 38.74942, epoch0: 2000.0, pmRA: 4164.2, pmDec: 3249.6, kmag: 2.68, dist: 3.49,
    desc: { es: 'Primera paralaje estelar medida (Bessel, 1838).', en: 'First stellar parallax measured (Bessel, 1838).' },
  },
  {
    id: 'lacaille-9352', name: 'Lacaille 9352', type: 'hpm', spt: 'M0.5 V',
    ra: 346.46683, dec: -35.85308, epoch0: 2000.0, pmRA: 6768.2, pmDec: 1327.5, kmag: 3.5, dist: 3.29,
    desc: { es: 'Enana roja brillante con planetas super-Tierra.', en: 'Bright red dwarf with super-Earth planets.' },
  },
  {
    id: 'teegarden', name: "Teegarden's Star", type: 'hpm', spt: 'M7 V',
    ra: 43.25354, dec: 16.88147, epoch0: 2000.0, pmRA: 3429.1, pmDec: -3805.5, kmag: 7.58, dist: 3.83,
    desc: { es: 'Enana ultrafría descubierta en 2003 por movimiento propio.', en: 'Ultracool dwarf discovered in 2003 through proper motion.' },
  },
  {
    id: 'eps-indi', name: 'Epsilon Indi A', type: 'hpm', spt: 'K5 V',
    ra: 330.84023, dec: -56.78598, epoch0: 2000.0, pmRA: 3966.7, pmDec: -2536.2, kmag: 2.24, dist: 3.64,
    desc: { es: 'Acompañada por un par de enanas marrones T1+T6.', en: 'Accompanied by a T1+T6 brown-dwarf pair.' },
  },
  {
    id: 'luhman-16', name: 'Luhman 16 AB', type: 'bd', spt: 'L7.5 + T0.5',
    ra: 162.31488, dec: -53.31836, epoch0: 2010.5, pmRA: -2762.0, pmDec: 354.0, kmag: 8.84, dist: 2.0,
    desc: { es: 'Binaria de enanas marrones más cercana, descubierta con WISE.', en: 'Nearest brown-dwarf binary, discovered with WISE.' },
  },
  {
    id: 'wise-0855', name: 'WISE J085510.83−071442.5', type: 'bd', spt: 'Y4',
    ra: 133.79513, dec: -7.24514, epoch0: 2010.5, pmRA: -8118.0, pmDec: 673.0, kmag: null, dist: 2.28,
    desc: { es: 'Enana marrón más fría conocida (~285 K); casi invisible en 2MASS.', en: 'Coldest known brown dwarf (~285 K); nearly invisible in 2MASS.' },
  },
  {
    id: 'wise-1828', name: 'WISEPA J182831.08+265037.8', type: 'bd', spt: '≥Y2',
    ra: 277.12950, dec: 26.84383, epoch0: 2010.5, pmRA: 1024.0, pmDec: 174.0, kmag: null, dist: 9.9,
    desc: { es: 'Enana Y prototípica, fuerte absorción de CH₄ y H₂O.', en: 'Prototypical Y dwarf with strong CH₄ and H₂O absorption.' },
  },
];

// Extended / calibration fields useful for spectra and the epoch archive.
export const FIELDS = [
  { id: 'nep', name: 'NEP Deep Field', type: 'field', ra: 270.0, dec: 66.56071, fov: 1.0,
    desc: { es: 'Polo Norte Eclíptico: máxima redundancia de SPHEREx (cientos de visitas).', en: 'North Ecliptic Pole: maximum SPHEREx redundancy (hundreds of visits).' } },
  { id: 'sep', name: 'SEP Deep Field', type: 'field', ra: 90.0, dec: -66.56071, fov: 1.0,
    desc: { es: 'Polo Sur Eclíptico, cerca de la Gran Nube de Magallanes.', en: 'South Ecliptic Pole, near the Large Magellanic Cloud.' } },
  { id: 'orion', name: 'Orion Nebula (M42)', type: 'field', ra: 83.82208, dec: -5.39111, fov: 0.8,
    desc: { es: 'Región de formación estelar; emisión PAH 3.3 µm.', en: 'Star-forming region; PAH 3.3 µm emission.' } },
  { id: 'horsehead', name: 'Horsehead Nebula', type: 'field', ra: 85.24583, dec: -2.45833, fov: 0.6,
    desc: { es: 'Nube oscura con hielos y PAH en el borde iluminado.', en: 'Dark cloud with ices and PAHs on the illuminated rim.' } },
  { id: 'rho-oph', name: 'Rho Ophiuchi Cloud', type: 'field', ra: 246.79, dec: -24.54, fov: 1.0,
    desc: { es: 'Nube molecular cercana con hielos de H₂O y CO₂.', en: 'Nearby molecular cloud with H₂O and CO₂ ices.' } },
  { id: 'gc', name: 'Galactic Center (Sgr A*)', type: 'field', ra: 266.41683, dec: -29.00781, fov: 1.0,
    desc: { es: 'Centro galáctico: extinción extrema por polvo.', en: 'Galactic Center: extreme dust extinction.' } },
  { id: 'carina', name: 'Carina Nebula', type: 'field', ra: 161.265, dec: -59.6844, fov: 1.0,
    desc: { es: 'Gran complejo HII alrededor de Eta Carinae.', en: 'Giant HII complex around Eta Carinae.' } },
  { id: 'm31', name: 'Andromeda Galaxy (M31)', type: 'field', ra: 10.68471, dec: 41.26875, fov: 1.5,
    desc: { es: 'Galaxia espiral vecina; población estelar evolucionada.', en: 'Neighbouring spiral galaxy; evolved stellar population.' } },
  { id: 'm82', name: 'Cigar Galaxy (M82)', type: 'field', ra: 148.96846, dec: 69.67970, fov: 0.4,
    desc: { es: 'Galaxia con brote estelar; fuerte emisión PAH.', en: 'Starburst galaxy; strong PAH emission.' } },
  { id: '30dor', name: '30 Doradus (LMC)', type: 'field', ra: 84.67667, dec: -69.10083, fov: 0.8,
    desc: { es: 'Nebulosa de la Tarántula en la Gran Nube de Magallanes.', en: 'Tarantula Nebula in the Large Magellanic Cloud.' } },
];

export const ALL_TARGETS = [...MOVING_TARGETS, ...FIELDS];

export function findTarget(id) {
  return ALL_TARGETS.find((t) => t.id === id);
}

export function totalPM(t) {
  return Math.hypot(t.pmRA || 0, t.pmDec || 0);
}

/** Position angle of motion (deg, east of north). */
export function pmPA(t) {
  let pa = (Math.atan2(t.pmRA, t.pmDec) * 180) / Math.PI;
  if (pa < 0) pa += 360;
  return pa;
}

export function simbadUrl(ra, dec, radiusArcmin = 1) {
  return `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${ra.toFixed(5)}+${dec >= 0 ? '%2B' : ''}${dec.toFixed(5)}&Radius=${radiusArcmin}&Radius.unit=arcmin`;
}
export function vizierUrl(ra, dec, radiusArcsec = 60) {
  return `https://vizier.cds.unistra.fr/viz-bin/VizieR?-c=${ra.toFixed(5)}+${dec >= 0 ? '%2B' : ''}${dec.toFixed(5)}&-c.rs=${radiusArcsec}`;
}
export function irsaViewerUrl(ra, dec) {
  return `https://irsa.ipac.caltech.edu/irsaviewer/?__action=table.search&request=${encodeURIComponent(
    JSON.stringify({ id: 'IpacTableFromSource' }),
  )}#ra=${ra}&dec=${dec}`;
}
export function irsaFinderUrl(ra, dec) {
  return `https://irsa.ipac.caltech.edu/applications/finderchart/?locstr=${ra.toFixed(5)}+${dec.toFixed(5)}`;
}
