// Minimal HEALPix (NESTED scheme) utilities, enough to sample HiPS tiles.
// Based on the reference algorithm in Gorski et al. (2005) / healpix_base.

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

// Interleave the low 16 bits of v into even bit positions.
export function spreadBits(v) {
  let x = v & 0xffff;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  return x >>> 0;
}

/**
 * Returns {face, ix, iy} for HEALPix order `order` (nside = 2^order).
 * theta = colatitude [0, PI], phi = longitude [0, 2PI).
 */
export function ang2xyf(order, theta, phi) {
  const nside = 2 ** order;
  const z = Math.cos(theta);
  const za = Math.abs(z);
  let p = phi % TWO_PI;
  if (p < 0) p += TWO_PI;
  const tt = p / HALF_PI; // [0,4)
  let face;
  let ix;
  let iy;
  if (za <= 2 / 3) {
    const temp1 = nside * (0.5 + tt);
    const temp2 = nside * (z * 0.75);
    const jp = Math.floor(temp1 - temp2);
    const jm = Math.floor(temp1 + temp2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    if (ifp === ifm) face = ifp | 4;
    else if (ifp < ifm) face = ifp;
    else face = ifm + 8;
    ix = jm & (nside - 1);
    iy = nside - (jp & (nside - 1)) - 1;
  } else {
    const ntt = Math.min(3, Math.floor(tt));
    const tp = tt - ntt;
    const tmp = nside * Math.sqrt(3 * (1 - za));
    let jp = Math.floor(tp * tmp);
    let jm = Math.floor((1 - tp) * tmp);
    jp = Math.min(jp, nside - 1);
    jm = Math.min(jm, nside - 1);
    if (z >= 0) {
      face = ntt;
      ix = nside - jm - 1;
      iy = nside - jp - 1;
    } else {
      face = ntt + 8;
      ix = jp;
      iy = jm;
    }
  }
  return { face, ix, iy };
}

/** Nested pixel index for small orders (index < 2^31). */
export function xyf2nest(order, face, ix, iy) {
  const nside2 = 4 ** order;
  return face * nside2 + spreadBits(ix) + 2 * spreadBits(iy);
}

/**
 * Locate the HiPS tile and the pixel inside that tile for a sky position.
 * tileOrder: HiPS order; tileBits: log2(tile width) (9 for 512 px, 6 for 64 px Allsky).
 * Returns { npix, x, y } where x,y are image column / row inside the tile.
 */
export function locateInTile(tileOrder, tileBits, raDeg, decDeg) {
  const theta = HALF_PI - (decDeg * Math.PI) / 180;
  const phi = (raDeg * Math.PI) / 180;
  const { face, ix, iy } = ang2xyf(tileOrder + tileBits, theta, phi);
  const tix = ix >> tileBits;
  const tiy = iy >> tileBits;
  const w = 1 << tileBits;
  const lx = ix & (w - 1);
  const ly = iy & (w - 1);
  const npix = xyf2nest(tileOrder, face, tix, tiy);
  return { npix, ...orient(lx, ly, w) };
}

// HiPS tile image orientation. Variant 4 (column = local x bits, row = local y bits after
// the HEALPix x/y swap) was validated by centring Betelgeuse, Vega, Sirius, Antares and Arcturus
// in 2MASS, AllWISE and SPHEREx cutouts.
let ORIENT = 4;
export function setOrientation(v) {
  ORIENT = v;
}
function orient(lx, ly, w) {
  const m = w - 1;
  switch (ORIENT) {
    case 1: return { x: lx, y: m - ly };
    case 2: return { x: m - lx, y: ly };
    case 3: return { x: m - lx, y: m - ly };
    case 4: return { x: ly, y: lx };
    case 5: return { x: ly, y: m - lx };
    case 6: return { x: m - ly, y: lx };
    case 7: return { x: m - ly, y: m - lx };
    default: return { x: lx, y: ly };
  }
}

/** Angular size (degrees) of one tile pixel at given HiPS order and tile width bits. */
export function tilePixelSizeDeg(order, tileBits = 9) {
  const nside = 2 ** (order + tileBits);
  return (Math.sqrt((4 * Math.PI) / (12 * nside * nside)) * 180) / Math.PI;
}
