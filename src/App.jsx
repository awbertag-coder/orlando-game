import React, { useState, useEffect } from 'react'
import LocalHotseatApp from './LocalHotseatApp.jsx'
import OnlineApp from './OnlineApp.jsx'
import TutorialApp from './TutorialApp.jsx'
import { BACKGROUND_IMAGES } from './assets/index.js'

export default function App() {
  const [mode, setMode] = useState(null) // null | 'hotseat' | 'online' | 'tutorial'

  useEffect(() => {
    if (BACKGROUND_IMAGES.battaglia) {
      document.body.style.backgroundImage = `url(${BACKGROUND_IMAGES.battaglia})`
    }
  }, [])

  let content
  if (mode === 'hotseat') {
    content = <LocalHotseatApp />
  } else if (mode === 'online') {
    content = <div className="app-shell"><OnlineApp onExitToMenu={() => setMode(null)} /></div>
  } else if (mode === 'tutorial') {
    content = <div className="app-shell"><TutorialApp onExit={() => setMode(null)} /></div>
  } else {
    content = (
      <div className="app-shell">
        <div className="card">
          <div className="eyebrow">Orlando alle Crociate</div>
          <h1>Come volete giocare?</h1>
          <button onClick={() => setMode('hotseat')}>Hotseat locale (un solo dispositivo)</button>
          <button className="secondary" onClick={() => setMode('online')}>Online (un dispositivo a testa)</button>
          <button className="secondary" onClick={() => setMode('tutorial')}>Tutorial guidato (impara giocando)</button>
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em', marginTop: 14 }}>
            Liberamente ispirato all'<em>Orlando Furioso</em>: sotto le mura di Parigi, Cristiani e Saraceni si fronteggiano mentre Durindana passa di mano in mano.
            Ogni cavaliere veste in segreto i panni di un personaggio del poema, fedele a una delle due fazioni &mdash; o a nessuna, come Isabella, il cui unico
            amore e' Zerbino. Tra inganni, alleanze sussurrate e colpi di scena, solo l'astuzia e la fortuna decideranno quale fazione trionfera' negli scontri,
            e chi restera' fedele solo a se stesso fino alla fine.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a
            href="/regolamento.pdf"
            download="Orlando_alle_Crociate_Regolamento.pdf"
            className="btn-link"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.7)' }}
          >
            &#128214; Scarica il regolamento (PDF)
          </a>
          <div style={{ marginTop: 8 }}>
            <a
              href="/regolamento.docx"
              download="Orlando_alle_Crociate_Regolamento.docx"
              style={{ color: '#fff', fontSize: '0.8em', textDecoration: 'underline' }}
            >
              versione Word (.docx)
            </a>
          </div>
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
