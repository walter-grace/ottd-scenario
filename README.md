# Google Maps → OpenTTD Scenario

Generate real-world heightmaps and town data for [OpenTTD](https://www.openttd.org) from any Google Maps URL — runs entirely in the browser. No login, no uploads, no servers required.

**Live demo:** https://scenario-deploy-qiynublnc-waltgraces-projects.vercel.app

![screenshot](docs/screenshot.png)

## What it does

Paste a Google Maps URL like `https://www.google.com/maps/@34.0522,-118.2437,11z` and the page:

1. **Parses** the URL → extracts center latitude / longitude / zoom
2. **Computes** a viewport bounding box from those coordinates
3. **Fetches** AWS Mapzen [Terrarium](https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium) terrain tiles (free, no key, public S3)
4. **Decodes** the elevation in the browser using a `<canvas>`
5. **Resizes** to OpenTTD-legal dimensions (powers of 2, 1:1 / 1:2 / 1:4 / 1:8 aspect)
6. **Normalizes** to a grayscale PNG (0 = sea, 255 = peak)
7. **Fetches** towns in that bbox from OpenStreetMap via [Overpass API](https://overpass-api.de)
8. **Outputs** an OpenTTD-ready `.png` heightmap + `.json` town list ready to download

It also recommends an OpenTTD **climate** (Temperate / Sub-Tropical / Sub-Arctic) and **peak height** value based on the real elevation range of the area.

## Privacy + safety

- All processing happens **in your browser**. Nothing is uploaded to any server.
- Public APIs only: AWS Mapzen tiles + OpenStreetMap Overpass.
- No tracking, no analytics, no auth.
- Static site — deployable to Vercel, Netlify, GitHub Pages, Cloudflare Pages, or any static host.

## Local development

```bash
git clone <this-repo>
cd scenario-deploy
npm install
npm run dev
# open http://localhost:3002
```

## Production build

```bash
npm run build
npm start
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or fork the repo and click "Import" in the Vercel dashboard. Zero config required — it's a stock Next.js 16 static export.

## Deploy elsewhere (Netlify / Cloudflare Pages / GitHub Pages)

The build produces a static export. Any static host works.

## Project structure

```
app/
├── layout.tsx              # root layout (dark background, fonts)
├── page.tsx                # main UI: form, progress, results, downloads
└── lib/
    ├── gmaps.ts            # parse URL → center/bbox; climate heuristic
    ├── heightmap.ts        # fetch Mapzen tiles → grayscale PNG via canvas
    └── geo.ts              # fetch OSM towns → OpenTTD-ready JSON
```

## How to load the output in OpenTTD

1. Move the generated `*_heightmap.png` into `~/Documents/OpenTTD/scenario/heightmap/`
2. Open OpenTTD → "Play Heightmap" → select your file
3. Set the climate the page recommends (e.g. **Sub-Tropical** for Phoenix)
4. Set "Heightmap height (peak)" to the recommended value (e.g. 25 for mountainous regions)
5. The `*_towns.json` works with the [DLF Town Loader](https://github.com/dlf-flywheel/dlf-openttd) game script if you want pre-named real-world towns

## Limitations

- Mapzen Terrarium tiles cover roughly **60°S – 60°N** (no Antarctica or extreme Arctic)
- Town data comes from OSM `place=city|town` tags; densely-mapped regions like Western Europe / North America have great coverage; remote areas may have fewer
- Output dimensions are limited to OpenTTD-legal sizes: 64, 128, 256, 512, 1024, 2048, 4096
- Bbox area must fit within ~256 tiles at chosen zoom (very wide bboxes auto-lower the zoom)

## Attribution

Built on:
- [AWS Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (public S3, no key required)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) data via [Overpass API](https://overpass-api.de) (ODbL)
- [Next.js 16](https://nextjs.org) + React 19

## License

MIT — see [LICENSE](LICENSE).

Fork, modify, deploy — go for it.
