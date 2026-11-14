import { useEffect, useState } from 'react';
import * as satellite from 'satellite.js';
import { spherexOMM } from './nasa.js';

let satrecPromise = null;
function getSatrec() {
  if (!satrecPromise) {
    satrecPromise = spherexOMM().then(({ omm, live }) => ({ satrec: satellite.twoline2satrec(omm.line1, omm.line2), omm, live }));
  }
  return satrecPromise;
}

export function propagateAt(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv.position) return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height,
    speed: Math.hypot(v.x, v.y, v.z),
    eci: pv.position,
  };
}

/** Live SPHEREx position from the CelesTrak OMM (SGP4). Updates every `interval` ms. */
export function useSpherexOrbit(interval = 1000) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer;
    getSatrec().then((s) => {
      const tick = () => {
        if (!alive) return;
        const now = new Date();
        setState({ ...s, now, pos: propagateAt(s.satrec, now) });
      };
      tick();
      timer = setInterval(tick, interval);
    });
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [interval]);
  return state;
}
