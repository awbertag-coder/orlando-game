import React, { useState } from 'react'
import LocalHotseatApp from './LocalHotseatApp.jsx'
import OnlineApp from './OnlineApp.jsx'
import { BoardCalibrationTool } from './shared/ui.jsx'

export default function App() {
  const [mode, setMode] = useState(null) // null | 'hotseat' | 'online' | 'calibration'

  if (mode === 'hotseat') return <LocalHotseatApp />
  if (mode === 'online') return <div className="app-shell"><OnlineApp /></div>
  if (mode === 'calibration') {
    return (
      <div className="app-shell">
        <BoardCalibrationTool />
        <button className="secondary" onClick={() => setMode(null)}>&larr; Torna indietro</button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="card">
        <div className="eyebrow">Orlando alle Crociate</div>
        <h1>Come volete giocare?</h1>
        <button onClick={() => setMode('hotseat')}>Hotseat locale (un solo dispositivo)</button>
        <button className="secondary" onClick={() => setMode('online')}>Online (un dispositivo a testa)</button>
        <button className="secondary" onClick={() => setMode('calibration')}>Calibrazione tabellone (strumento)</button>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em', marginTop: 14 }}>
          Per la modalita' online serve che il server (<code>npm run server</code>) sia acceso su un PC della rete locale.
        </p>
      </div>
    </div>
  )
}
