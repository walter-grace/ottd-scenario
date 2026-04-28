// Browser-side OSM town fetch + transform to OpenTTD JSON.
// Mirrors agent/sandbox/geo.py.

import type { Bbox } from "./gmaps";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

export type Town = {
  name: string;
  lat: number;
  lon: number;
  population: number;
  city: boolean;
};

export type OttdTown = {
  name: string;
  population: number;
  real_population: number;
  city: boolean;
  x: number;
  y: number;
};

export async function fetchOsmTowns(
  bbox: Bbox,
  minPop = 500,
  includeVillages = false,
): Promise<Town[]> {
  const [s, w, n, e] = bbox;
  const places = "city|town" + (includeVillages ? "|village" : "");
  const query =
    `[out:json][timeout:60];\n` +
    `( node["place"~"^(${places})$"]["name"](${s},${w},${n},${e}); );\n` +
    `out;`;
  let lastErr: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      // GET form: overpass-api.de blocks POST from some clients with 406.
      const r = await fetch(url + "?data=" + encodeURIComponent(query));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return parseOverpass(data, minPop);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("all Overpass endpoints failed: " + String(lastErr));
}

function safeName(name: string): string {
  if (!name) return "";
  for (const sep of [",", "/", ";", " - ", " | ", " (", "—", "–"]) {
    const i = name.indexOf(sep);
    if (i > 0) name = name.slice(0, i);
  }
  const drop = new Set("'`\"()[]{}<>:!?*&^%$#@~|\\.");
  name = [...name].filter((c) => !drop.has(c)).join("");
  name = name.split(/\s+/).filter(Boolean).join(" ");
  if (name.length > 30) {
    const cut = name.slice(0, 30);
    const lastSp = cut.lastIndexOf(" ");
    name = lastSp > 0 ? cut.slice(0, lastSp) : cut;
  }
  return name.trim();
}

function asciiName(tags: Record<string, string>): string {
  const candidates = [tags["name:en"], tags["int_name"]];
  for (const [k, v] of Object.entries(tags)) {
    if (k.startsWith("name:en") && v && !candidates.includes(v)) candidates.push(v);
  }
  const native = tags["name"] || "";
  if (native && [...native].every((c) => c.charCodeAt(0) < 128)) {
    candidates.push(native);
  }
  let chosen = "";
  for (const c of candidates) {
    if (c && c.trim()) {
      chosen = c;
      break;
    }
  }
  if (!chosen) chosen = native;
  return safeName(chosen);
}

function parseOverpass(data: any, minPop: number): Town[] {
  const out: Town[] = [];
  for (const el of data.elements || []) {
    if (el.type !== "node") continue;
    const tags = el.tags || {};
    const name = asciiName(tags);
    if (!name) continue;
    const place = tags.place || "";
    const popRaw = tags.population;
    const pop = typeof popRaw === "string" ? parseInt(popRaw, 10) || 0 : 0;
    if (pop < minPop && place !== "city") continue;
    out.push({
      name,
      lat: el.lat,
      lon: el.lon,
      population: pop,
      city: place === "city",
    });
  }
  return out;
}

export function toOttdJson(
  towns: Town[],
  bbox: Bbox,
  swapXy = true,
  popScale = 1 / 100,
  popFloor = 200,
  popCap = 50000,
): OttdTown[] {
  const [s, w, n, e] = bbox;
  const latSpan = n - s;
  const lonSpan = e - w;
  if (latSpan <= 0 || lonSpan <= 0) throw new Error("degenerate bbox");
  const out: OttdTown[] = [];
  for (const t of towns) {
    const xImg = (t.lon - w) / lonSpan;
    const yImg = (n - t.lat) / latSpan;
    if (xImg < 0 || xImg > 1 || yImg < 0 || yImg > 1) continue;
    const [xOut, yOut] = swapXy ? [yImg, xImg] : [xImg, yImg];
    let pop = Math.floor(t.population * popScale);
    pop = Math.max(popFloor, Math.min(popCap, pop || popFloor));
    out.push({
      name: t.name,
      population: pop,
      real_population: Math.floor(t.population),
      city: t.city,
      x: Math.round(xOut * 1e6) / 1e6,
      y: Math.round(yOut * 1e6) / 1e6,
    });
  }
  out.sort((a, b) => {
    if (a.city !== b.city) return a.city ? -1 : 1;
    if (a.population !== b.population) return b.population - a.population;
    return a.name.localeCompare(b.name);
  });
  return out;
}
