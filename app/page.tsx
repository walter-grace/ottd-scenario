"use client";

import { useState } from "react";
import { parseCenter, bboxFromCenter, climateFor, type Climate } from "./lib/gmaps";
import { generateHeightmap } from "./lib/heightmap";
import { fetchOsmTowns, toOttdJson } from "./lib/geo";

type Status = "idle" | "running" | "done" | "error";

function recommendPeakHeight(elevMaxM: number): { peak: number; note: string } {
  // OpenTTD's "Heightmap height (peak)" setting caps the tallest tile.
  // Default is 15. We map real-world peak elevation to a reasonable
  // OpenTTD value so coastal flats stay flat and mountains stay imposing.
  if (elevMaxM < 200) return { peak: 6, note: "mostly flat — coastal/lowland" };
  if (elevMaxM < 500) return { peak: 10, note: "rolling hills" };
  if (elevMaxM < 1500) return { peak: 15, note: "varied terrain (default)" };
  if (elevMaxM < 3000) return { peak: 25, note: "mountainous" };
  if (elevMaxM < 5000) return { peak: 40, note: "alpine — extreme relief" };
  return { peak: 60, note: "Himalayan / Andean — clip carefully" };
}

const SAMPLE_URLS = [
  { label: "Los Angeles", url: "https://www.google.com/maps/@34.0522,-118.2437,11z" },
  { label: "Tokyo", url: "https://www.google.com/maps/@35.6762,139.6503,11z" },
  { label: "Paris", url: "https://www.google.com/maps/@48.8566,2.3522,12z" },
  { label: "Sydney", url: "https://www.google.com/maps/@-33.8688,151.2093,11z" },
];

export default function Page() {
  const [url, setUrl] = useState("");
  const [size, setSize] = useState(1024);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  async function generate(targetUrl?: string) {
    const u = (targetUrl ?? url).trim();
    if (!u) return;
    setUrl(u);
    setStatus("running");
    setError("");
    setResult(null);
    setProgress(0);
    setProgressMsg("Parsing URL");
    try {
      const center = parseCenter(u);
      if (!center)
        throw new Error("Could not find a center in that Google Maps URL. Use a URL containing @lat,lon,zoom.");
      const bbox = bboxFromCenter(center);
      // Defer climate calc until we know peak elevation (high mountains override)
      const fileBase =
        "ottd_" + Math.round(center.lat * 1000) + "_" + Math.round(center.lon * 1000);

      setProgressMsg("Fetching OSM towns");
      setProgress(2);
      const towns = await fetchOsmTowns(bbox, 500, false);
      const ottdTowns = toOttdJson(towns, bbox);

      const hm = await generateHeightmap(bbox, size, 0, null, (msg, pct) => {
        setProgressMsg(msg);
        setProgress(pct);
      });

      const climate = climateFor(center.lat, center.lon, hm.elevMax);
      const pngUrl = URL.createObjectURL(hm.blob);
      const townsJson = JSON.stringify(ottdTowns, null, 2);
      setResult({
        fileBase,
        pngUrl,
        pngBlob: hm.blob,
        townsJson,
        towns: ottdTowns,
        width: hm.width,
        height: hm.height,
        zoom: hm.zoom,
        elevMin: hm.elevMin,
        elevMax: hm.elevMax,
        climate,
        center,
        bbox,
      });
      setStatus("done");
    } catch (e: any) {
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  function download(name: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #0a0a0f; color: #e7e7ee; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInSlow { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes countUp { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        .fade-in-slow { animation: fadeInSlow 0.6s ease-out backwards; }
        .pulse-dot { animation: pulseGlow 2s infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, #fff 0%, #a5b4fc 25%, #fff 50%, #a5b4fc 75%, #fff 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 6s linear infinite;
        }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        .float { animation: float 3s ease-in-out infinite; }
        .stat-pop { animation: countUp 0.5s ease-out backwards; }
        .progress-fill-animated {
          background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
          background-size: 200% 100%;
          animation: shimmer 2s linear infinite;
        }
        .btn-primary {
          background-size: 200% auto;
          background-image: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
          animation: gradientShift 5s ease infinite;
          background-size: 200% 200%;
        }
        .hero-gradient {
          background:
            radial-gradient(at 25% 0%, rgba(29,78,216,0.25) 0%, transparent 50%),
            radial-gradient(at 75% 100%, rgba(124,58,237,0.25) 0%, transparent 50%),
            #0a0a0f;
        }
        .glass {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .input {
          width: 100%;
          padding: 16px 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          font-family: ui-monospace, monospace;
          transition: all 0.2s;
        }
        .input:focus {
          outline: none;
          border-color: #6366f1;
          background: rgba(99,102,241,0.06);
        }
        .btn-primary {
          padding: 16px 28px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 24px -8px rgba(99,102,241,0.5);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 32px -8px rgba(99,102,241,0.6); }
        .btn-primary:disabled { opacity: 0.5; cursor: wait; }
        .btn-ghost {
          padding: 8px 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #c8c8d0;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-download {
          padding: 14px 22px;
          border-radius: 10px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          border: none;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 6px 20px -8px rgba(16,185,129,0.5);
        }
        .btn-download:hover { transform: translateY(-1px); box-shadow: 0 10px 28px -8px rgba(16,185,129,0.6); }
        .progress-bar {
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          transition: width 0.3s;
          box-shadow: 0 0 12px #8b5cf6;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 999px;
          font-size: 12px;
          color: #c8c8d0;
        }
        .stat-card {
          padding: 18px;
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .stat-label { font-size: 11px; color: #8b8b95; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .stat-value { font-size: 24px; font-weight: 700; color: #fff; }
        a { color: #818cf8; }
        @media (max-width: 600px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          h1 { font-size: 36px !important; }
        }
      `}</style>

      <main className="hero-gradient" style={{ minHeight: "100vh", padding: "60px 24px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          {/* Hero */}
          <header style={{ textAlign: "center", marginBottom: 56 }}>
            <div className="pill fade-in-slow" style={{ marginBottom: 20, animationDelay: "0s" }}>
              <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: 4, background: "#10b981" }}></span>
              100% browser-side · zero uploads
            </div>
            <h1
              className="shimmer-text fade-in-slow"
              style={{
                fontSize: 56,
                fontWeight: 800,
                margin: "0 0 16px",
                lineHeight: 1.1,
                animationDelay: "0.1s",
              }}
            >
              Google Maps → OpenTTD
            </h1>
            <p
              className="fade-in-slow"
              style={{ fontSize: 19, color: "#a8a8b3", margin: "0 auto", maxWidth: 600, lineHeight: 1.5, animationDelay: "0.25s" }}
            >
              Paste any Google Maps URL. Get a real-world heightmap and town
              data, ready to play in OpenTTD. No login, no uploads — runs entirely
              in your browser from public terrain data.
            </p>
          </header>

          {/* Form card */}
          <div className="glass" style={{ borderRadius: 20, padding: 32, marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14, color: "#c8c8d0" }}>
              Google Maps URL
            </label>
            <input
              className="input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.google.com/maps/@34.0522,-118.2437,11z"
              disabled={status === "running"}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: "#8b8b95", alignSelf: "center" }}>Try:</span>
              {SAMPLE_URLS.map((s) => (
                <button
                  key={s.label}
                  className="btn-ghost"
                  onClick={() => generate(s.url)}
                  disabled={status === "running"}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 28 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  fontSize: 14,
                  color: "#c8c8d0",
                }}
              >
                <span style={{ fontWeight: 600 }}>Map size</span>
                <span style={{ fontFamily: "ui-monospace, monospace", color: "#fff" }}>
                  {size} × auto
                </span>
              </div>
              <input
                type="range"
                min={256}
                max={4096}
                step={256}
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "#8b5cf6" }}
                disabled={status === "running"}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7a7a85", marginTop: 4 }}>
                <span>256</span><span>1024</span><span>2048</span><span>4096</span>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={() => generate()}
              disabled={status === "running" || !url.trim()}
              style={{ marginTop: 28, width: "100%" }}
            >
              {status === "running" ? <><span className="spinner"></span>Generating…</> : "Generate Scenario"}
            </button>

            {/* Progress */}
            {status === "running" && (
              <div className="fade-in" style={{ marginTop: 24 }}>
                <div className="progress-bar">
                  <div className="progress-fill progress-fill-animated" style={{ width: `${progress}%` }}></div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13, color: "#a8a8b3" }}>
                  <span>{progressMsg}</span>
                  <span>{progress}%</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              className="fade-in"
              style={{
                padding: 16,
                marginBottom: 24,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 12,
                color: "#fca5a5",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="fade-in">
              <div className="glass" style={{ borderRadius: 20, padding: 32, marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Heightmap ready</h2>
                  <span className="pill">
                    {result.center.lat.toFixed(3)}, {result.center.lon.toFixed(3)} · z{result.center.zoom}
                  </span>
                </div>

                <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
                  <div className="stat-card stat-pop" style={{ animationDelay: "0s" }}>
                    <div className="stat-label">Map size</div>
                    <div className="stat-value">{result.width}×{result.height}</div>
                  </div>
                  <div className="stat-card stat-pop" style={{ animationDelay: "0.06s" }}>
                    <div className="stat-label">Towns</div>
                    <div className="stat-value">{result.towns.length}</div>
                  </div>
                  <div className="stat-card stat-pop" style={{ animationDelay: "0.12s" }}>
                    <div className="stat-label">OpenTTD climate</div>
                    <select
                      value={result.climate}
                      onChange={(e) => setResult({ ...result, climate: e.target.value as Climate })}
                      style={{
                        marginTop: 4,
                        width: "100%",
                        padding: "4px 6px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      <option value="temperate">Temperate (green)</option>
                      <option value="sub-tropical">Sub-Tropical (desert)</option>
                      <option value="sub-arctic">Sub-Arctic (snow)</option>
                      <option value="toyland">Toyland (candy)</option>
                    </select>
                    <div style={{ fontSize: 11, color: "#8b8b95", marginTop: 4 }}>
                      {result.climate === "temperate" && "fields, forests, mild seasons"}
                      {result.climate === "sub-tropical" && "desert, savanna, sand"}
                      {result.climate === "sub-arctic" && "snow, tundra, conifers"}
                      {result.climate === "toyland" && "candy + sweets (joke climate)"}
                    </div>
                  </div>
                  <div className="stat-card stat-pop" style={{ animationDelay: "0.18s" }}>
                    <div className="stat-label">Elevation</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>
                      {Math.round(result.elevMin)}–{Math.round(result.elevMax)}m
                    </div>
                  </div>
                  <div className="stat-card stat-pop" style={{ animationDelay: "0.24s", background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))", borderColor: "rgba(139,92,246,0.3)" }}>
                    <div className="stat-label" style={{ color: "#a5b4fc" }}>Peak height ⭐</div>
                    <div className="stat-value">{recommendPeakHeight(result.elevMax).peak}</div>
                    <div style={{ fontSize: 11, color: "#8b8b95", marginTop: 4 }}>
                      {recommendPeakHeight(result.elevMax).note}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 20,
                    background: "#000",
                  }}
                >
                  <img
                    src={result.pngUrl}
                    alt="Heightmap preview"
                    style={{ display: "block", width: "100%", imageRendering: "pixelated" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    className="btn-download"
                    onClick={() => download(result.fileBase + "_heightmap.png", result.pngBlob)}
                  >
                    ↓ Download Heightmap PNG
                  </button>
                  <button
                    className="btn-download"
                    onClick={() =>
                      download(
                        result.fileBase + "_towns.json",
                        new Blob([result.townsJson], { type: "application/json" }),
                      )
                    }
                  >
                    ↓ Download Towns JSON
                  </button>
                </div>
              </div>

              <details className="glass" style={{ borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 15 }}>How to load in OpenTTD</summary>
                <ol style={{ marginTop: 14, paddingLeft: 20, lineHeight: 1.7, color: "#c8c8d0" }}>
                  <li>Move the PNG into <code>~/Documents/OpenTTD/scenario/heightmap/</code></li>
                  <li>Open OpenTTD → Play Heightmap → select your file</li>
                  <li>Set climate: <strong>{result.climate}</strong></li>
                  <li>Set <strong>Heightmap height (peak)</strong> to <strong>{recommendPeakHeight(result.elevMax).peak}</strong> — {recommendPeakHeight(result.elevMax).note}</li>
                  <li>Towns JSON works with the DLF Town Loader game script</li>
                </ol>
              </details>

              <details className="glass" style={{ borderRadius: 14, padding: 20 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
                  Top {Math.min(15, result.towns.length)} towns
                </summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 14, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                  {result.towns.slice(0, 15).map((t: any) => (
                    <div key={t.name} style={{ padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      <span style={{ color: t.city ? "#fbbf24" : "#8b8b95" }}>{t.city ? "★" : "·"}</span>{" "}
                      {t.name} <span style={{ color: "#6b7280" }}>{t.population}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <footer style={{ marginTop: 80, textAlign: "center", color: "#6b7280", fontSize: 13 }}>
            Built on AWS Mapzen terrain tiles + OpenStreetMap. Privacy-first: nothing leaves your browser.
          </footer>
        </div>
      </main>
    </>
  );
}
