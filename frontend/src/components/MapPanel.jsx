import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Polygon, LayersControl } from 'react-leaflet'
import { fetchNodes } from '../hooks/useTelemetry'
import { severityMeta } from '../utils/severity'

const { BaseLayer } = LayersControl

// Illustrative approximate lease-boundary polygon around the node, for
// visual context only -- NOT a surveyed mining-lease boundary. Honestly
// labeled in the popup/legend rather than presented as authoritative.
function boundaryAround(lat, lng) {
  const d = 0.006
  return [
    [lat + d, lng - d * 1.3],
    [lat + d * 1.1, lng + d * 0.8],
    [lat - d * 0.3, lng + d * 1.4],
    [lat - d * 1.1, lng + d * 0.2],
    [lat - d * 0.6, lng - d * 1.2],
  ]
}

// Radius scales with live composite risk so the "hazard footprint" visibly
// grows as risk climbs -- illustrative visual scaling, not a surveyed
// subsidence-influence radius.
function riskRadiusMeters(score) {
  return 90 + (Math.max(0, Math.min(100, score)) / 100) * 260
}

export default function MapPanel({ riskScore = 0, severity = 'SAFE' }) {
  const [nodes, setNodes] = useState(null)
  const [failed, setFailed] = useState(false)
  const mapRef = useRef(null)

  useEffect(() => {
    fetchNodes()
      .then(setNodes)
      .catch(() => setFailed(true))
  }, [])

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 p-4 text-center bg-slate-50">
        Map data unavailable (backend unreachable). Node position: 23.6693, 86.9425
      </div>
    )
  }

  const center = [23.6693, 86.9425]
  const color = severityMeta(severity).color
  const radius = riskRadiusMeters(riskScore)

  return (
    <div className="relative w-full h-full">
      {/*
        NOTE ON TILE PROVIDERS: CartoDB's free "dark_all" / "voyager" raster
        basemaps now require an API key/account for anonymous use, which is
        why they previously rendered as "API KEY REQUIRED" watermarked
        tiles. Both layers below (OpenStreetMap standard + Esri World
        Imagery) remain genuinely free and keyless, so the map always
        renders regardless of any API credentials.
      */}
      <MapContainer ref={mapRef} center={center} zoom={14} className="w-full h-full" zoomControl={true} scrollWheelZoom={true} dragging={true} touchZoom={true} doubleClickZoom={true} boxZoom={true} keyboard={true} whenReady={(e) => { setTimeout(() => e.target.invalidateSize(), 100) }}>
        <LayersControl position="topright">
          <BaseLayer checked name="Street">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </BaseLayer>
          <BaseLayer name="Satellite">
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; World Imagery"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </BaseLayer>
        </LayersControl>

        {(nodes || []).map((n) => (
          <div key={n.node_id}>
            <Polygon
              positions={boundaryAround(n.lat, n.lng)}
              pathOptions={{ color: '#0A2540', weight: 1.4, fillColor: '#1A365D', fillOpacity: 0.06, dashArray: '5 4' }}
            >
              <Popup>
                <span className="text-[11px] text-slate-500">
                  Illustrative lease-area outline (approximate) &mdash; not a surveyed boundary
                </span>
              </Popup>
            </Polygon>

            {/* Dynamic risk radial footprint -- radius + color scale live
                with composite risk score. Illustrative visual scaling, not
                a surveyed subsidence-influence radius. */}
            <Circle
              center={[n.lat, n.lng]}
              radius={radius}
              pathOptions={{
                color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: severity === 'DANGER' ? 0.22 : severity === 'CAUTION' ? 0.14 : 0.08,
              }}
            />

            <CircleMarker
              center={[n.lat, n.lng]}
              radius={9}
              pathOptions={{ color: '#FFFFFF', fillColor: color, fillOpacity: 0.95, weight: 2 }}
            >
              <Popup>
                <b>{n.node_id}</b> &mdash; {n.label}
                <br />
                Depth (installation config): {n.depth_m ?? 'not configured'}
                <br />
                <span className="text-[11px] text-slate-500">Live risk score: {riskScore}/100</span>
              </Popup>
            </CircleMarker>
          </div>
        ))}
      </MapContainer>

      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <button
          type="button"
          onClick={() => mapRef.current?.setView(center, 14, { animate: true })}
          className="bg-white/95 border border-slate-200 rounded px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-white pointer-events-auto"
          title="Reset map view"
        >
          Reset
        </button>
      </div>

      <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded px-2 py-1.5 text-[10px] text-slate-600 leading-tight z-[1000] pointer-events-none shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} /> Live risk footprint ({riskScore}/100)
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-3 h-1.5 border border-dashed border-navy inline-block" /> Illustrative lease area
        </div>
      </div>

      <div className="absolute top-2 left-2 z-[1000] pointer-events-none flex items-center gap-1.5 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[9px] font-mono text-emerald-700 bg-white/95 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
          Green &middot; Normal
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-[9px] font-mono text-amber-700 bg-white/95 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
          Amber &middot; Moderate strain
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span className="text-[9px] font-mono text-red-700 bg-white/95 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
          Red &middot; Subsidence hazard
        </span>
      </div>
    </div>
  )
}
