// Effetti sonori delle schermate di transizione tra le fasi, sintetizzati con la Web
// Audio API (nessun file audio esterno da procurarsi, nessun problema di licenze).
let sharedCtx = null
function getCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

function metallicClang(ctx, offset) {
  const t = ctx.currentTime + offset
  const bufferSize = Math.floor(ctx.sampleRate * 0.3)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.12))
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const bandpass = ctx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 2400 + Math.random() * 900
  bandpass.Q.value = 5
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.55, t)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
  noise.connect(bandpass).connect(noiseGain).connect(ctx.destination)
  noise.start(t); noise.stop(t + 0.32)
  ;[1900, 3200, 4700].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq + (Math.random() * 40 - 20)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12 / (i + 1), t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.connect(g).connect(ctx.destination)
    osc.start(t); osc.stop(t + 0.3)
  })
}

function trumpetNote(ctx, freq, start, dur, gainPeak) {
  const t = ctx.currentTime + start
  const osc1 = ctx.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.value = freq
  const osc2 = ctx.createOscillator()
  osc2.type = 'square'
  osc2.frequency.value = freq * 2.005
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.04)
  g.gain.setValueAtTime(gainPeak, t + dur - 0.06)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 3200
  osc1.connect(filter); osc2.connect(filter)
  filter.connect(g).connect(ctx.destination)
  osc1.start(t); osc1.stop(t + dur)
  osc2.start(t); osc2.stop(t + dur)
}

const FANFARES = {
  fanfare: [[261.6, 0.0, 0.22, 0.18], [392.0, 0.24, 0.22, 0.18], [523.3, 0.48, 0.55, 0.20]],
  fanfareGrand: [
    [261.6, 0.0, 0.2, 0.18], [329.6, 0.22, 0.2, 0.18], [392.0, 0.44, 0.2, 0.18],
    [523.3, 0.66, 0.9, 0.16], [659.3, 0.66, 0.9, 0.13], [784.0, 0.66, 0.9, 0.11],
  ],
  fanfareSolo: [[293.7, 0.0, 0.25, 0.16], [349.2, 0.28, 0.25, 0.16], [440.0, 0.56, 0.6, 0.18]],
}

export function playPhaseAudio(kind) {
  const ctx = getCtx()
  if (kind === 'clash') {
    metallicClang(ctx, 0)
    metallicClang(ctx, 0.55)
    return
  }
  const notes = FANFARES[kind]
  if (notes) notes.forEach(([freq, start, dur, peak]) => trumpetNote(ctx, freq, start, dur, peak))
}
