// Internal severity keys (SAFE / CAUTION / DANGER) stay the same throughout
// the codebase for threshold logic -- only the DISPLAYED wording changes
// here, to a more professional, official-advisory tone rather than a
// game-style "DANGER" banner.
export function severityFromRisk(risk) {
  if (risk >= 85) return 'DANGER'
  if (risk >= 60) return 'CAUTION'
  return 'SAFE'
}

export const SEVERITY_DISPLAY = {
  SAFE: { label: 'Nominal', short: 'NOMINAL', color: '#388E3C' },
  CAUTION: { label: 'Advisory', short: 'ADVISORY', color: '#F57C00' },
  DANGER: { label: 'Critical Alert', short: 'CRITICAL ALERT', color: '#D32F2F' },
}

export function severityMeta(severity) {
  return SEVERITY_DISPLAY[severity] || SEVERITY_DISPLAY.SAFE
}
