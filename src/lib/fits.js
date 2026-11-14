// Minimal FITS writer (primary image HDU, image extensions and binary tables).
// Spec: FITS Standard 4.0 — 2880-byte blocks, 80-char header cards, big-endian data.

function card(key, value, comment = '') {
  let v;
  if (typeof value === 'string') v = `'${value.replace(/'/g, "''").padEnd(8, ' ')}'`.padEnd(20, ' ');
  else if (typeof value === 'boolean') v = (value ? 'T' : 'F').padStart(20, ' ');
  else if (Number.isInteger(value)) v = String(value).padStart(20, ' ');
  else v = Number(value).toExponential(10).toUpperCase().padStart(20, ' ');
  let s = `${key.padEnd(8, ' ')}= ${v}`;
  if (comment) s += ` / ${comment}`;
  return s.slice(0, 80).padEnd(80, ' ');
}

function header(cards) {
  const lines = [...cards, 'END'.padEnd(80, ' ')];
  let text = lines.join('');
  const rem = text.length % 2880;
  if (rem) text += ' '.repeat(2880 - rem);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0x7f;
  return bytes;
}

function padData(buf) {
  const rem = buf.byteLength % 2880;
  if (!rem) return new Uint8Array(buf);
  const out = new Uint8Array(buf.byteLength + (2880 - rem));
  out.set(new Uint8Array(buf));
  return out;
}

function floatData(arr) {
  const buf = new ArrayBuffer(arr.length * 4);
  const dv = new DataView(buf);
  for (let i = 0; i < arr.length; i += 1) dv.setFloat32(i * 4, Number.isFinite(arr[i]) ? arr[i] : NaN, false);
  return padData(buf);
}

/** FITS row order is bottom-to-top; our images are top-to-bottom. */
function flipRows(values, w, h) {
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j += 1) out.set(values.subarray((h - 1 - j) * w, (h - j) * w), j * w);
  return out;
}

export function wcsCards({ ra, dec, scaleDeg, w, h }) {
  return [
    card('CTYPE1', 'RA---TAN'),
    card('CTYPE2', 'DEC--TAN'),
    card('CRVAL1', ra, 'deg'),
    card('CRVAL2', dec, 'deg'),
    card('CRPIX1', w / 2 + 0.5),
    card('CRPIX2', h / 2 + 0.5),
    card('CDELT1', -scaleDeg, 'deg/pix (east left)'),
    card('CDELT2', scaleDeg, 'deg/pix'),
    card('RADESYS', 'ICRS'),
    card('EQUINOX', 2000.0),
  ];
}

/**
 * planes: [{ values: Float32Array(w*h), name, extra: [cards] }]
 * The first plane goes in the primary HDU, others as IMAGE extensions.
 */
export function buildImageFits({ w, h, planes, wcs, meta = [] }) {
  const parts = [];
  planes.forEach((p, k) => {
    const cards = [];
    if (k === 0) cards.push(card('SIMPLE', true, 'conforms to FITS standard'));
    else cards.push(card('XTENSION', 'IMAGE', 'image extension'));
    cards.push(card('BITPIX', -32, 'IEEE single precision'));
    cards.push(card('NAXIS', 2));
    cards.push(card('NAXIS1', w));
    cards.push(card('NAXIS2', h));
    if (k === 0) cards.push(card('EXTEND', true));
    else {
      cards.push(card('PCOUNT', 0));
      cards.push(card('GCOUNT', 1));
    }
    if (p.name) cards.push(card('EXTNAME', p.name));
    if (wcs) cards.push(...wcsCards({ ...wcs, w, h }));
    if (k === 0) cards.push(...meta.map(([kk, v, c]) => card(kk, v, c)));
    if (p.extra) cards.push(...p.extra.map(([kk, v, c]) => card(kk, v, c)));
    parts.push(header(cards));
    parts.push(floatData(flipRows(p.values, w, h)));
  });
  return new Blob(parts, { type: 'application/fits' });
}

/** Binary table with float32 columns. columns: [{ name, unit, values: number[] }] */
export function buildTableFits({ columns, meta = [], extname = 'SPECTRUM' }) {
  const nrows = columns[0].values.length;
  const rowBytes = columns.length * 4;
  const primary = header([
    card('SIMPLE', true),
    card('BITPIX', 8),
    card('NAXIS', 0),
    card('EXTEND', true),
    ...meta.map(([k, v, c]) => card(k, v, c)),
  ]);
  const cards = [
    card('XTENSION', 'BINTABLE', 'binary table extension'),
    card('BITPIX', 8),
    card('NAXIS', 2),
    card('NAXIS1', rowBytes),
    card('NAXIS2', nrows),
    card('PCOUNT', 0),
    card('GCOUNT', 1),
    card('TFIELDS', columns.length),
    card('EXTNAME', extname),
  ];
  columns.forEach((c, i) => {
    cards.push(card(`TTYPE${i + 1}`, c.name));
    cards.push(card(`TFORM${i + 1}`, 'E'));
    if (c.unit) cards.push(card(`TUNIT${i + 1}`, c.unit));
  });
  const buf = new ArrayBuffer(nrows * rowBytes);
  const dv = new DataView(buf);
  for (let r = 0; r < nrows; r += 1) {
    columns.forEach((c, i) => {
      const v = c.values[r];
      dv.setFloat32(r * rowBytes + i * 4, Number.isFinite(v) ? v : NaN, false);
    });
  }
  return new Blob([primary, header(cards), padData(buf)], { type: 'application/fits' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}
