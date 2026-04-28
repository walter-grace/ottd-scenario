// Parse Google Maps URLs to (lat, lon, zoom) → bbox.
// Mirrors agent/sandbox/gmaps.py for client-side use.

export type Center = { lat: number; lon: number; zoom: number };
export type Bbox = [number, number, number, number]; // [s, w, n, e]

const AT_RE = /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/;
const DEST_RE = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;

export function parseCenter(url: string): Center | null {
  const m = url.match(AT_RE);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), zoom: parseFloat(m[3]) };
  const d = url.match(DEST_RE);
  if (d) return { lat: parseFloat(d[1]), lon: parseFloat(d[2]), zoom: 12 };
  return null;
}

export function bboxFromCenter(c: Center, vw = 1024, vh = 768): Bbox {
  if (c.zoom < 1 || c.zoom > 22) throw new Error(`zoom ${c.zoom} out of range`);
  const mpp = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** c.zoom;
  const lonSpan = (vw * mpp) / 111320;
  const latSpan = (vh * mpp) / 110540;
  return [
    c.lat - latSpan / 2,
    c.lon - lonSpan / 2,
    c.lat + latSpan / 2,
    c.lon + lonSpan / 2,
  ];
}

export type Climate = "sub-arctic" | "sub-tropical" | "temperate" | "toyland";

// Known arid/desert regions where the right OpenTTD climate is "sub-tropical"
// even though the latitude alone would say "temperate". Each entry is a
// rough lat/lon bbox: [latS, latN, lonW, lonE].
const ARID_REGIONS: Array<[number, number, number, number]> = [
  [29, 38, -120, -103], // SW USA + N Mexico (Arizona, Nevada, NM, W Texas)
  [12, 35, -18, 60],    // Sahara + Arabia + Iran
  [-35, -19, 113, 155], // Australian outback
  [-30, -15, -75, -65], // Atacama / dry Andes
  [35, 50, 50, 110],    // Central Asian steppes (Kazakhstan, Mongolia)
  [22, 40, 60, 100],    // Iran + Pakistan + W China deserts
];

export function climateFor(lat: number, lon: number, peakElevM = 0): Climate {
  // High mountains anywhere → sub-arctic (snow line)
  if (peakElevM > 3500) return "sub-arctic";
  // Polar / boreal latitudes
  if (Math.abs(lat) > 50) return "sub-arctic";
  // Tropics
  if (Math.abs(lat) < 24) return "sub-tropical";
  // Known arid mid-latitude regions
  for (const [latS, latN, lonW, lonE] of ARID_REGIONS) {
    if (lat >= latS && lat <= latN && lon >= lonW && lon <= lonE) {
      return "sub-tropical";
    }
  }
  return "temperate";
}

// Backwards-compat alias.
export function climateForLat(lat: number): Climate {
  return climateFor(lat, 0);
}
