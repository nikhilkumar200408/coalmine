// Voice + alert-tone system. Uses the browser's native Web Speech and Web
// Audio APIs -- no external service, no API key, works fully offline once
// the page is loaded. Wrapped defensively so a browser without
// speech-synthesis support (or blocked autoplay policy) never crashes the
// app; it just silently skips the audio.

let audioCtx = null
let announcementInterval = null

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      return null
    }
  }
  return audioCtx
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel() // don't stack overlapping announcements
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.95
    utter.pitch = 1.0
    window.speechSynthesis.speak(utter)
  } catch (e) {
    console.warn('Speech synthesis unavailable', e)
  }
}

// Two-tone "attention" chime -- the same paced ding-dong pattern used by
// airport/rail public-announcement systems before a spoken message, rather
// than a continuous harsh siren wail. Meant to read as an official safety
// system, not an alarm klaxon.
function playAttentionChime() {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const notes = [660, 523] // descending two-tone, classic PA chime interval
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.42
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.09, start + 0.03)
      gain.gain.linearRampToValueAtTime(0, start + 0.38)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch (e) {
    console.warn('Attention chime unavailable', e)
  }
}

// Short two-tone "notification" chime used for non-blocking toast alerts
// (sudden tilt-rate change, acoustic spike) -- brief and quiet.
export function playChime(kind = 'info') {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const freqs = kind === 'warn' ? [740, 988] : [523, 659]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0, now + i * 0.11)
      gain.gain.linearRampToValueAtTime(0.05, now + i * 0.11 + 0.02)
      gain.gain.linearRampToValueAtTime(0, now + i * 0.11 + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.11)
      osc.stop(now + i * 0.11 + 0.2)
    })
  } catch (e) {
    console.warn('Chime unavailable', e)
  }
}

// Replaces the old continuous sine-wave siren. Plays a professional
// attention chime every few seconds -- paced, not a wailing alarm -- meant
// to sound like an official monitoring-system alert rather than a game
// sound effect. announcementText (if provided) is spoken once per cycle.
export function startSiren(announcementText) {
  if (announcementInterval) return
  playAttentionChime()
  if (announcementText) speak(announcementText)

  announcementInterval = setInterval(() => {
    playAttentionChime()
    if (announcementText) {
      setTimeout(() => speak(announcementText), 900)
    }
  }, 8000)
}

export function stopSiren() {
  if (announcementInterval) {
    clearInterval(announcementInterval)
    announcementInterval = null
  }
  try {
    window.speechSynthesis?.cancel()
  } catch (e) {
    /* noop */
  }
}
