// Browser-side heightmap generator: AWS Mapzen terrarium tiles → grayscale
// PNG sized to OpenTTD-legal dimensions. Mirrors agent/sandbox/heightmap.py.

import type { Bbox } from "./gmaps";

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TILE_PX = 256;
const LEGAL_DIMS = [64, 128, 256, 512, 1024, 2048, 4096] as const;

function latLonToTileXy(lat: number, lon: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return [x, y];
}

export function chooseZoom(bbox: Bbox, outputPx: number): number {
  const [s, w, n, e] = bbox;
  const span = Math.max(e - w, n - s);
  if (span <= 0) return 12;
  const targetTiles = (outputPx * 2) / TILE_PX;
  const zFloat = Math.log2((targetTiles * 360) / span);
  return Math.max(2, Math.min(13, Math.round(zFloat)));
}

function legalDimsForBbox(bbox: Bbox, target: number): [number, number] {
  const [s, w, n, e] = bbox;
  let aspect = (e - w) / Math.max(n - s, 1e-9);
  const midLatRad = (((n + s) / 2) * Math.PI) / 180;
  aspect = aspect / Math.max(Math.cos(midLatRad), 0.01);
  const legalAspects = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
  const chosen = legalAspects.reduce((a, b) =>
    Math.abs(Math.log(a) - Math.log(aspect)) <
    Math.abs(Math.log(b) - Math.log(aspect))
      ? a
      : b,
  );
  const wDim = chosen >= 1 ? target : Math.max(64, Math.round(target * chosen));
  const hDim = chosen >= 1 ? Math.max(64, Math.round(target / chosen)) : target;
  const snap = (d: number) =>
    LEGAL_DIMS.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  return [snap(wDim), snap(hDim)];
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("tile fetch failed: " + url));
    img.src = url;
  });
}

export type HeightmapResult = {
  blob: Blob;
  width: number;
  height: number;
  zoom: number;
  tileCount: number;
  elevMin: number;
  elevMax: number;
};

export async function generateHeightmap(
  bbox: Bbox,
  size = 1024,
  seaLevelM = 0,
  zoomOverride: number | null = null,
  onProgress?: (msg: string, pct: number) => void,
): Promise<HeightmapResult> {
  const zoom = zoomOverride ?? chooseZoom(bbox, size);
  const [s, w, n, e] = bbox;
  const [xa, ya] = latLonToTileXy(n, w, zoom); // NW
  const [xb, yb] = latLonToTileXy(s, e, zoom); // SE
  const xMin = Math.floor(xa);
  const yMin = Math.floor(ya);
  const xMax = Math.floor(xb);
  const yMax = Math.floor(yb);
  const cols = xMax - xMin + 1;
  const rows = yMax - yMin + 1;
  if (cols * rows > 256) {
    throw new Error(
      `too many tiles (${cols}x${rows}=${cols * rows}) at zoom ${zoom}; bbox too wide`,
    );
  }
  onProgress?.(`fetching ${cols}x${rows} tiles @ z${zoom}`, 5);
  // Fetch tiles in parallel.
  const tilePromises: Promise<{ r: number; c: number; img: HTMLImageElement }>[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tilePromises.push(
        loadImage(TILE_URL(zoom, xMin + c, yMin + r)).then((img) => ({ r, c, img })),
      );
    }
  }
  const tiles = await Promise.all(tilePromises);
  onProgress?.("stitching", 30);

  // Stitch into one big canvas.
  const stitched = document.createElement("canvas");
  stitched.width = cols * TILE_PX;
  stitched.height = rows * TILE_PX;
  const sctx = stitched.getContext("2d", { willReadFrequently: true })!;
  for (const { r, c, img } of tiles) {
    sctx.drawImage(img, c * TILE_PX, r * TILE_PX);
  }
  // Crop to bbox.
  const pxLeft = Math.round((xa - xMin) * TILE_PX);
  const pxTop = Math.round((ya - yMin) * TILE_PX);
  const pxRight = Math.round((xb - xMin) * TILE_PX);
  const pxBottom = Math.round((yb - yMin) * TILE_PX);
  const cropW = pxRight - pxLeft;
  const cropH = pxBottom - pxTop;
  if (cropW <= 0 || cropH <= 0) throw new Error("crop dimensions invalid");
  onProgress?.("decoding elevation", 50);

  const cropImg = sctx.getImageData(pxLeft, pxTop, cropW, cropH);
  const data = cropImg.data;
  // Decode terrarium → elevation in meters; track min/max.
  const elev = new Float32Array(cropW * cropH);
  let elevMin = Infinity;
  let elevMax = -Infinity;
  for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
    const m = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
    elev[i] = m;
    if (m < elevMin) elevMin = m;
    if (m > elevMax) elevMax = m;
  }
  onProgress?.("normalizing", 70);

  // Build grayscale crop image at native crop resolution.
  const peak = elevMax;
  const span = Math.max(1, peak - seaLevelM);
  const grayCanvas = document.createElement("canvas");
  grayCanvas.width = cropW;
  grayCanvas.height = cropH;
  const gctx = grayCanvas.getContext("2d")!;
  const grayImg = gctx.createImageData(cropW, cropH);
  for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
    const m = elev[i];
    let v = 0;
    if (m > seaLevelM) {
      v = Math.max(1, Math.min(255, Math.round(((m - seaLevelM) / span) * 254 + 1)));
    }
    grayImg.data[p] = v;
    grayImg.data[p + 1] = v;
    grayImg.data[p + 2] = v;
    grayImg.data[p + 3] = 255;
  }
  gctx.putImageData(grayImg, 0, 0);

  // Resize to OpenTTD-legal dimensions via lanczos-ish high-quality scaling.
  const [outW, outH] = legalDimsForBbox(bbox, size);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(grayCanvas, 0, 0, outW, outH);
  onProgress?.("encoding PNG", 90);

  const blob: Blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob fail"))), "image/png");
  });
  onProgress?.("done", 100);
  return {
    blob,
    width: outW,
    height: outH,
    zoom,
    tileCount: cols * rows,
    elevMin,
    elevMax,
  };
}
