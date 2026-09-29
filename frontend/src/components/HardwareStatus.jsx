export default function HardwareStatus({ latest, heartbeatLossPct, latencyMs }) {
  const rssi = latest?.link_mode === 'WiFi' && latest?.rssi ? `${latest.rssi} dBm` : 'N/A (USB link)'
  const battery =
    latest?.battery_sensing_ok && latest?.battery_pct != null && latest.battery_pct >= 0
      ? `${latest.battery_pct}%`
      : 'N/A (no battery wired)'

  const row = (label, value, valueClass = '') => (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${valueClass || 'text-slate-800'}`}>{value}</span>
    </div>
  )

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="font-semibold text-sm">Hardware Ingestion Status</h2>
        <p className="text-xs text-slate-500">ESP32 edge device link health</p>
      </div>
      <div className="p-4 space-y-3 text-sm">
        {row('Ingestion Latency', latencyMs != null ? `${Math.round(latencyMs)} ms` : '--')}
        {row('Packet Loss Ratio', heartbeatLossPct !== null ? `${heartbeatLossPct.toFixed(1)}%` : '--')}
        {row('WiFi Signal (RSSI)', rssi)}
        {row('Edge Battery', battery)}
        {row('Transport', latest?.link_mode || '--', latest?.link_mode === 'USB-Serial' ? 'text-slate-700' : 'text-sky-600')}
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Ingestion Endpoint</span>
          <span className="font-mono text-[11px] text-slate-500">/api/v1/telemetry/esp32</span>
        </div>
      </div>
    </div>
  )
}
