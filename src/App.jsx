import React, { useState, useEffect } from 'react'
import LocalHotseatApp from './LocalHotseatApp.jsx'
import OnlineApp from './OnlineApp.jsx'
import { BACKGROUND_IMAGES } from './assets/index.js'

export default function App() {
  const [mode, setMode] = useState(null) // null | 'hotseat' | 'online'

  useEffect(() => {
    if (BACKGROUND_IMAGES.battaglia) {
      document.body.style.backgroundImage = `url(${BACKGROUND_IMAGES.battaglia})`
    }
  }, [])

  let content
  if (mode === 'hotseat') {
    content = <LocalHotseatApp />
  } else if (mode === 'online') {
    content = <div className="app-shell"><OnlineApp /></div>
  } else {
    content = (
      <div className="app-shell">
        <div className="card">
          <div className="eyebrow">Orlando alle Crociate</div>
          <h1>Come volete giocare?</h1>
          <button onClick={() => setMode('hotseat')}>Hotseat locale (un solo dispositivo)</button>
          <button className="secondary" onClick={() => setMode('online')}>Online (un dispositivo a testa)</button>
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em', marginTop: 14 }}>
            Per la modalita' online serve che il server (<code>npm run server</code>) sia acceso su un PC della rete locale.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-overlay" />
      {content}
    </>
  )
}
