import { useState } from 'react'
import { motion } from 'framer-motion'
import jsPDF from 'jspdf'

export default function IncidentReportButton({ latest, aiSummary }) {
  const [generating, setGenerating] = useState(false)

  const handleExport = () => {
    if (!latest) return
    setGenerating(true)

    const doc = new jsPDF()
    const now = new Date()

    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('SAMADHAAN Mine Subsidence Monitoring', 14, 18)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Ministry of Coal - Coal India Limited | Structural Monitoring Incident Report', 14, 24)
    doc.line(14, 28, 196, 28)

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('Report generated:', 14, 38)
    doc.setFont(undefined, 'normal')
    doc.text(now.toLocaleString(), 60, 38)

    doc.setFont(undefined, 'bold')
    doc.text('Node ID:', 14, 46)
    doc.setFont(undefined, 'normal')
    doc.text(latest.node_id || 'NODE-01', 60, 46)

    doc.setFont(undefined, 'bold')
    doc.text('Risk Score:', 14, 54)
    doc.setFont(undefined, 'normal')
    doc.text(`${latest.risk_score ?? '--'} / 100`, 60, 54)

    doc.setFont(undefined, 'bold')
    doc.text('Pitch / Roll Deviation:', 14, 62)
    doc.setFont(undefined, 'normal')
    doc.text(`${(latest.pitch_dev ?? 0).toFixed(1)} deg / ${(latest.roll_dev ?? 0).toFixed(1)} deg`, 60, 62)

    doc.setFont(undefined, 'bold')
    doc.text('Acoustic Deviation:', 14, 70)
    doc.setFont(undefined, 'normal')
    doc.text(`${(latest.sound ?? 0).toFixed(0)}`, 60, 70)

    doc.setFont(undefined, 'bold')
    doc.text('Link Mode / RSSI:', 14, 78)
    doc.setFont(undefined, 'normal')
    doc.text(`${latest.link_mode || 'N/A'} / ${latest.rssi ?? 'N/A'} dBm`, 60, 78)

    doc.line(14, 86, 196, 86)

    doc.setFont(undefined, 'bold')
    doc.text('AI Risk Intelligence Summary', 14, 94)
    doc.setFont(undefined, 'normal')

    if (aiSummary) {
      doc.text(`Risk Level: ${aiSummary.risk_level}`, 14, 102)
      doc.text(`Failure Window Estimate: ${aiSummary.failure_window_estimate}`, 14, 109)
      doc.text(`Structural Stability Index: ${aiSummary.structural_stability_index}`, 14, 116)

      const narrativeLines = doc.splitTextToSize(aiSummary.narrative || '', 180)
      doc.text(narrativeLines, 14, 126)

      const recLines = doc.splitTextToSize(`Recommendation: ${aiSummary.recommendation || ''}`, 180)
      doc.text(recLines, 14, 126 + narrativeLines.length * 6 + 6)

      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(doc.splitTextToSize(aiSummary.note || '', 180), 14, 126 + narrativeLines.length * 6 + 6 + recLines.length * 6 + 10)
    } else {
      doc.text('No AI summary available at export time.', 14, 102)
    }

    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      'This is an automatically generated prototype report for SIH 2026 internal evaluation. Not a certified structural-safety document.',
      14,
      285
    )

    doc.save(`SAMADHAAN_Incident_Report_${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
    setGenerating(false)
  }

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={handleExport}
      disabled={!latest || generating}
      className="text-xs font-semibold px-3 py-1.5 rounded bg-sky-700 text-white hover:bg-sky-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {generating ? 'Generating...' : 'Export Incident Report (PDF)'}
    </motion.button>
  )
}
