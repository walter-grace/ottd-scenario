// QA: exercise each sample URL through the same logic the browser does.
// Tests URL parsing, bbox math, Overpass fetch, and Mapzen tile availability.

const SAMPLES = [
  { label: "Los Angeles", url: "https://www.google.com/maps/@34.0522,-118.2437,11z" },
  { label: "Tokyo",       url: "https://www.google.com/maps/@35.6762,139.6503,11z" },
  { label: "Paris",       url: "https://www.google.com/maps/@48.8566,2.3522,12z" },
  { label: "Sydney",      url: "https://www.google.com/maps/@-33.8688,151.2093,11z" },
];

const AT_RE = /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/;

function parseCenter(url) {
  const m = url.match(AT_RE);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), zoom: parseFloat(m[3]) };
}

function bbox(c, vw = 1024, vh = 768) {
  const mpp = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** c.zoom;
  const lonSpan = (vw * mpp) / 111320;
  const latSpan = (vh * mpp) / 110540;
  return [c.lat - latSpan / 2, c.lon - lonSpan / 2, c.lat + latSpan / 2, c.lon + lonSpan / 2];
}

function climate(lat) {
  const a = Math.abs(lat);
  if (a > 50) return "sub-arctic";
  if (a < 24) return "sub-tropical";
  return "temperate";
}

function chooseZoom(box, outputPx) {
  const [s, w, n, e] = box;
  const span = Math.max(e - w, n - s);
  const targetTiles = (outputPx * 2) / 256;
  const z = Math.log2((targetTiles * 360) / span);
  return Math.max(2, Math.min(13, Math.round(z)));
}

function tileXy(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return [Math.floor(x), Math.floor(y)];
}

async function testOverpass(box) {
  const [s, w, n, e] = box;
  const q = `[out:json][timeout:30];( node["place"~"^(city|town)$"]["name"](${s},${w},${n},${e}); ); out;`;
  // Node's default UA gets 406 from overpass-api.de; use kumi mirror with explicit UA.
  const r = await fetch("https://overpass.kumi.systems/api/interpreter?data=" + encodeURIComponent(q), {
    headers: { "User-Agent": "ottd-scenario-deploy/1.0 (browser-side QA)" },
  });
  if (!r.ok) throw new Error(`overpass ${r.status}`);
  const data = await r.json();
  return data.elements?.length || 0;
}

async function testMapzenTile(box, zoom) {
  const [s, w, n, e] = box;
  const [x, y] = tileXy((s + n) / 2, (w + e) / 2, zoom);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
  const r = await fetch(url);
  return { ok: r.ok, status: r.status, bytes: r.ok ? (await r.arrayBuffer()).byteLength : 0 };
}

async function main() {
  let pass = 0, fail = 0;
  for (const s of SAMPLES) {
    const t0 = Date.now();
    try {
      const c = parseCenter(s.url);
      if (!c) throw new Error("parseCenter returned null");
      const b = bbox(c);
      const z = chooseZoom(b, 1024);
      const cl = climate(c.lat);
      const towns = await testOverpass(b);
      const tile = await testMapzenTile(b, z);
      const dur = Date.now() - t0;
      const ok = tile.ok && towns > 0;
      console.log(
        `${ok ? "✅" : "❌"} ${s.label.padEnd(14)} center=(${c.lat},${c.lon}) z=${c.zoom} climate=${cl} bbox=${b.map((n) => n.toFixed(3)).join(",")} towns=${towns} tile=${tile.status} (${tile.bytes}B) z${z} ${dur}ms`,
      );
      ok ? pass++ : fail++;
    } catch (e) {
      console.log(`❌ ${s.label.padEnd(14)} ERROR: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
