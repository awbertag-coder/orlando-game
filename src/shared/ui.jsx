import React, { useState } from 'react'
import { CHARACTER_IMAGES, CHARACTER_FULL_IMAGES, BOARD_IMAGES, PHASE_IMAGES, TABLE_IMAGES } from '../assets/index.js'
import { playPhaseAudio } from './phaseAudio.js'

// Metadati delle schermate di transizione tra le fasi (immagine, testo, audio opzionale).
// La chiave e' quella che l'app calcola in base a game.phase/stage (vedi transitionKeyFor* in
// LocalHotseatApp.jsx / OnlineApp.jsx).
export const PHASE_TRANSITIONS = {
  assegnazione: {
    image: 'assegnazione_fazioni', eyebrow: 'Assegnazione Fazioni', title: 'Le fazioni sono pronte',
    rules: "A ciascun giocatore viene assegnato in segreto un personaggio, di fazione Cristiana o Saracena (tranne Isabella, che non ne ha nessuna). Uno dei giocatori riceve anche Durindana, la spada che ogni round decidera' chi va in battaglia. Nessuno conosce l'identita' degli altri, a meno che il proprio personaggio non la riveli espressamente."
  },
  rivelazione: {
    image: 'rivelazione', eyebrow: 'Fase 1 \u2014 Rivelazione', title: 'Uno scambio silenzioso',
    rules: "Si gioca solo con 8 o piu' giocatori. Nessuna scelta da fare: Orlando e Agramante vedono l'elenco dei propri alleati di fazione; Angelica scopre chi e' Medoro; Ruggero scopre chi e' Bradamante."
  },
  alavventura: {
    image: 'alavventura', eyebrow: "Fase 2 \u2014 All'avventura", title: 'Ogni cavaliere gioca la propria carta',
    rules: "Si giocano le carte equipaggiamento, in giro di tavolo a partire da Durindana: prima le istantanee (si rivelano da sole), poi le volontarie (puoi scegliere se giocarle o tenerle coperte). Se qualcuno ti elimina dalla battaglia e hai Parata o Orrilo, puoi rispondere subito, anche fuori dal tuo turno. Chi possiede Il Palazzo di Atlante puo' ridirigere un'eliminazione appena avvenuta su un bersaglio diverso."
  },
  chiamata: {
    image: 'chiamata_alle_armi', eyebrow: 'Fase 3 \u2014 Chiamata alle armi', title: "Durindana sceglie chi andra' in battaglia",
    rules: "Il possessore di Durindana sceglie chi scende in battaglia: base 2 partecipanti, modificata da Olifante (+1) e Argalia (-1). Non puo' scegliere se stesso, tranne se e' Orlando o Agramante, che possono aggiungersi di nascosto come partecipanti in piu'."
  },
  scontro: {
    image: 'scontro', eyebrow: 'Fase 4 \u2014 Scontro', title: 'Le lame si incrociano', audio: 'clash',
    rules: "Ogni partecipante rivela in privato quale tessera favore vuole giocare, ed eventuali carte da battaglia possedute vengono rivelate ora. Un Fantasma presente puo' bloccare un partecipante a sua scelta, azzerandone il favore senza vederlo."
  },
  risoluzione: {
    image: 'risoluzione', eyebrow: 'Fase 5 \u2014 Risoluzione', title: "L'araldo proclama chi ha vinto", audio: 'fanfare',
    rules: "L'Ariosto somma i favori di ciascuna fazione e decreta il vincitore di questo assalto, senza mai rivelare i numeri esatti -- solo quale fazione ha vinto, o se e' pareggio. Si posiziona la tessera vittoria, si attivano gli eventuali poteri della casella raggiunta, e Durindana passa al vicino di sinistra."
  },
  vittoria_cristiana: {
    image: 'vittoria_cristiana', eyebrow: 'Fase 6 \u2014 Vittoria', title: 'La fazione Cristiana ha vinto', audio: 'fanfareGrand',
    rules: "La fazione Cristiana ha completato il proprio tracciato di caselle (o ha vinto per Fendente Mortale su Agramante): la partita finisce qui."
  },
  vittoria_saracena: {
    image: 'vittoria_saracena', eyebrow: 'Fase 6 \u2014 Vittoria', title: 'La fazione Saracena ha vinto', audio: 'fanfareGrand',
    rules: "La fazione Saracena ha completato il proprio tracciato di caselle (o ha vinto per Fendente Mortale su Orlando): la partita finisce qui."
  },
  vittoria_isabella: {
    image: 'vittoria_isabella', eyebrow: 'Fase 6 \u2014 Vittoria', title: 'Isabella vince da sola, in solitaria', audio: 'fanfareSolo',
    rules: "Isabella e' stata colpita da un Fendente Mortale: la partita finisce immediatamente e lei vince da sola, in solitaria."
  },
}

// Hook di gating: mostra la transizione UNA volta per ciascuna "chiave" (es. tutte le
// istantanee+volontarie di un round condividono 'alavventura'), e non si ripresenta finche'
// la chiave non cambia davvero (es. al round successivo, o passando a una fase diversa).
export function usePhaseTransitionGate(currentKey) {
  const [shownFor, setShownFor] = useState(null)
  const showTransition = !!currentKey && currentKey !== shownFor
  const dismiss = () => setShownFor(currentKey)
  return { showTransition, dismiss }
}

// Descrive in italiano l'ultimo effetto giocato, per le schermate di Anello di
// Angelica/Palazzo di Atlante (che ora possono reagire anche a effetti diversi da una
// semplice eliminazione dalla battaglia).
export function describeEffect(eff, players) {
  if (!eff) return "l'ultimo effetto giocato"
  switch (eff.effect) {
    case 'eliminate': {
      const t = players.find(p => p.id === eff.targetId)
      return `l'eliminazione dalla battaglia di ${t?.name || '???'}`
    }
    case 'move_durindana':
      return 'lo spostamento di Durindana'
    case 'faction_bonus':
      return `il bonus di fazione per ${eff.faction === 'cristiana' ? 'i Cristiani' : 'i Saraceni'}`
    case 'participants_delta':
      return 'la modifica al numero di partecipanti richiesti'
    default:
      return "l'ultimo effetto giocato"
  }
}

export function PhaseTransition({ phaseKey, onContinue }) {
  const meta = PHASE_TRANSITIONS[phaseKey]
  React.useEffect(() => {
    if (!meta) onContinue()
  }, [phaseKey])
  if (!meta) return null
  const image = PHASE_IMAGES[meta.image]
  return (
    <div>
      <div className="phase-transition-stage">
        {image && <img className="phase-transition-bg" src={image} alt={meta.title} />}
        <div className="phase-transition-overlay" />
        <div className="phase-transition-caption">
          <div className="eyebrow">{meta.eyebrow}</div>
          <div className="phase-transition-title">{meta.title}</div>
        </div>
      </div>
      <div className="phase-transition-actions">
        {meta.audio && (
          <button
            type="button"
            className="phase-transition-btn phase-transition-btn-secondary"
            onClick={() => playPhaseAudio(meta.audio)}
          >
            &#128266; Ascolta
          </button>
        )}
        <button type="button" className="phase-transition-btn phase-transition-btn-main" onClick={onContinue}>
          Continua &#9654;
        </button>
      </div>
    </div>
  )
}

// Pulsante "regole di questa fase": chi conosce gia' il gioco lo ignora, chi e' alle prime
// armi puo' aprirlo per un promemoria rapido senza dover andare a cercare il regolamento.
// Riusa la stessa chiave di PHASE_TRANSITIONS, cosi' il testo resta coerente con quello
// mostrato nella schermata di passaggio tra una fase e l'altra.
export function PhaseRulesButton({ phaseKey }) {
  const [open, setOpen] = useState(false)
  const meta = PHASE_TRANSITIONS[phaseKey]
  if (!meta) return null
  return (
    <div style={{ margin: '10px 0' }}>
      <button type="button" className="secondary" onClick={() => setOpen(o => !o)}>
        &#128214; {open ? 'Nascondi regole' : 'Regole di questa fase'}
      </button>
      {open && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="eyebrow">{meta.eyebrow}</div>
          <p style={{ margin: '6px 0 0' }}>{meta.rules}</p>
        </div>
      )}
    </div>
  )
}

export function Divider({ symbol = '\u2726' }) {
  return (
    <div className="divider">
      <span className="divider-symbol">{symbol}</span>
    </div>
  )
}

export function FactionBadge({ faction }) {
  return <span className={`badge ${faction}`}>{faction === 'cristiana' ? '\u271D Cristiana' : '\u262A Saracena'}</span>
}

// Come FactionBadge, ma pensato per la "fazione attuale/identita'" di un giocatore:
// gestisce Isabella, che non appartiene a nessuna delle due fazioni.
export function IdentityBadge({ player }) {
  if (player.isIsabella) {
    return <span className="badge" style={{ color: '#2e7d32', borderColor: '#2e7d32' }}>&#127808; Suora di clausura</span>
  }
  if (!player.faction) {
    return <span className="badge" style={{ color: 'var(--ink-soft)', borderColor: 'var(--ink-soft)' }}>Nessuna fazione</span>
  }
  return <FactionBadge faction={player.faction} />
}

// Pulsante "tieni premuto": mostra le info segrete del proprio personaggio
// solo finche' il dito/mouse resta premuto, per non doversele ricordare a memoria.
export function HoldToPeekCharacter({ player }) {
  const [peeking, setPeeking] = useState(false)
  const show = (e) => { e.preventDefault(); setPeeking(true) }
  const hide = () => setPeeking(false)

  return (
    <div style={{ marginTop: 16 }}>
      <button
        className="secondary"
        style={{ touchAction: 'none', userSelect: 'none' }}
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
      >
        &#128065; Tieni premuto per rivedere il tuo personaggio
      </button>
      {peeking && (
        <div className="card" style={{ marginTop: 10, background: '#f2e8d0' }}>
          {(CHARACTER_IMAGES[player.characterId] || CHARACTER_FULL_IMAGES[player.characterId]) && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {CHARACTER_IMAGES[player.characterId] && (
                <img
                  className="character-portrait"
                  style={{ width: '45%', maxWidth: '170px' }}
                  src={CHARACTER_IMAGES[player.characterId]}
                  alt={player.characterName}
                />
              )}
              {CHARACTER_FULL_IMAGES[player.characterId] && (
                <img
                  className="character-portrait"
                  style={{ width: '45%', maxWidth: '170px' }}
                  src={CHARACTER_FULL_IMAGES[player.characterId]}
                  alt={`${player.characterName} (figura intera)`}
                />
              )}
            </div>
          )}
          <h3 className={player.faction ? `faction-${player.faction}` : ''} style={{ textAlign: 'center', marginBottom: 4 }}>{player.characterName}</h3>
          {player.description && <p style={{ textAlign: 'center', fontSize: '0.9em', margin: '0 0 10px' }}>{player.description}</p>}
          <div className="eyebrow" style={{ textAlign: 'center' }}>Fazione attuale</div>
          <div style={{ textAlign: 'center', marginBottom: 14, fontSize: '1.15em' }}><IdentityBadge player={player} /></div>
          <div className="eyebrow" style={{ textAlign: 'center' }}>Tessere favore in battaglia</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {player.favorTiles.map((t, i) => (
              <li key={i}><FactionBadge faction={t.faction} /> &nbsp; valore <span className="value-pill">{t.value}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Accetta un oggetto con almeno { board, boardTrack } -- va bene sia lo stato locale
// completo (hotseat) sia lo stato "redatto" ricevuto dal server (online).
// Caselle misurate con precisione (in pixel, su un'immagine di riferimento 1152x648,
// la stessa dimensione di entrambi i tabelloni) e convertite in percentuali:
// {left, top, width, height} = il rettangolo esatto dove deve entrare la tessera.
function boxFromPixels(x1, y1, x2, y2, W = 1152, H = 648) {
  return {
    left: (x1 / W) * 100,
    top: (y1 / H) * 100,
    width: ((x2 - x1) / W) * 100,
    height: ((y2 - y1) / H) * 100
  }
}

export const BOARD_POSITIONS = {
  cristiana: [
    boxFromPixels(44, 1, 178, 199),
    boxFromPixels(278, 1, 412, 199),
    boxFromPixels(510, 1, 644, 199),
    boxFromPixels(744, 1, 878, 199),
    boxFromPixels(978, 1, 1112, 199)
  ],
  saracena: [
    boxFromPixels(44, 450, 178, 646),
    boxFromPixels(278, 450, 412, 646),
    boxFromPixels(510, 450, 644, 646),
    boxFromPixels(744, 450, 878, 646),
    boxFromPixels(978, 450, 1112, 646)
  ]
}

export function BoardView({ game, positions = null }) {
  const track = game.boardTrack
  const is9Plus = track.some(p => Array.isArray(p))
  const boardImg = is9Plus ? BOARD_IMAGES.tabellone_9_full : BOARD_IMAGES.tabellone_6_8_full
  const boxes = positions || BOARD_POSITIONS

  return (
    <div>
      <div className="eyebrow">Percorso verso la Gloria</div>
      <div style={{ position: 'relative', width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--parchment-dark)' }}>
        {boardImg
          ? <img src={boardImg} alt="Percorso verso la Gloria" style={{ width: '100%', display: 'block' }} />
          : <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}>(grafica del tabellone non trovata)</div>}
        {['cristiana', 'saracena'].map(faction => (
          track.map((power, i) => {
            const filled = game.board[faction] > i
            if (!filled) return null
            const tokenImg = BOARD_IMAGES[`vittoria_${faction}_${i + 1}`]
            const box = boxes[faction][i]
            return (
              <div
                key={faction + i}
                style={{
                  position: 'absolute',
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                {tokenImg
                  ? <img src={tokenImg} alt="tessera vittoria" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
                  : <div style={{ fontSize: '2em', color: faction === 'cristiana' ? 'var(--crimson)' : 'var(--saracen)' }}>{faction === 'cristiana' ? '\u271D' : '\u262A'}</div>}
              </div>
            )
          })
        ))}
      </div>
    </div>
  )
}

// Anteprima delle caselle misurate con precisione, utile per verificare a colpo
// d'occhio che le tessere cadano nel posto giusto su entrambi i tabelloni.
const POWER_LABELS = {
  spie_a_palazzo: 'Spie a palazzo',
  cercare_amore: "Cercare l'amore",
  fendente_mortale: 'Fendente Mortale',
  vittoria: 'Vittoria di fazione'
}

function powerNames(power) {
  if (!power) return 'Nessun potere'
  const list = Array.isArray(power) ? power : [power]
  return list.map(p => POWER_LABELS[p] || p).join(' + ')
}

// Tabellone con, sotto, l'elenco scritto dei poteri presenti su ciascuna casella dei
// due tracciati -- con una spunta su quelli gia' superati/attivati in questa partita.
export function BoardPowersPanel({ game }) {
  const track = game.boardTrack
  return (
    <div className="card">
      <BoardView game={game} />
      <Divider />
      <div className="eyebrow">Poteri sui tracciati</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {['cristiana', 'saracena'].map(faction => (
          <div key={faction} style={{ flex: 1, minWidth: 160 }}>
            <div style={{ marginBottom: 6 }}><FactionBadge faction={faction} /></div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {track.map((power, i) => {
                const activated = game.board[faction] > i
                return (
                  <li key={i} style={{ color: activated ? 'var(--ink-soft)' : 'var(--ink)' }}>
                    {activated ? '\u2713 ' : ''}Casella {i + 1}: {powerNames(power)}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LogPanel({ log }) {
  return (
    <div className="log-panel">
      {log.slice(-6).map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )
}

export const CHARACTER_OPTIONS = [
  { id: 'orlando', name: 'Orlando' },
  { id: 'agramante', name: 'Agramante' },
  { id: 'angelica', name: 'Angelica' },
  { id: 'ruggero', name: 'Ruggero' },
  { id: 'bradamante', name: 'Bradamante' },
  { id: 'medoro', name: 'Medoro' },
  { id: 'astolfo', name: 'Astolfo' },
  { id: 'rodomonte', name: 'Rodomonte' },
  { id: 'gano', name: 'Gano' },
  { id: 'marfisa', name: 'Marfisa' },
  { id: 'rinaldo', name: 'Rinaldo' },
  { id: 'ferrau', name: "Ferrau'" },
  { id: 'brandimarte', name: 'Brandimarte' },
  { id: 'gradasso', name: 'Gradasso' },
  { id: 'isabella', name: 'Isabella' }
]

// Tavolo con i nomi dei giocatori disposti in cerchio, puramente visivo.
// `viewerId` e' opzionale: se presente, quel giocatore viene evidenziato in oro
// (utile online, dove sai chi sei; in hotseat/monitoraggio si puo' omettere).
export function TableView({ state, viewerId = null }) {
  const n = state.players.length
  const tableImage = TABLE_IMAGES.tavolo
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '75%', margin: '10px 0 20px' }}>
      {tableImage ? (
        <img
          src={tableImage}
          alt="Tavolo"
          style={{ position: 'absolute', inset: '4%', width: '92%', height: '92%', objectFit: 'contain' }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: '12%', borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, #8a6a3a 0%, #6b4f28 70%, #4a3820 100%)',
          border: '4px solid var(--ink)', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)'
        }} />
      )}
      {state.players.map((p, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        const cx = 50 + 46 * Math.cos(angle)
        const cy = 50 + 46 * Math.sin(angle)
        const isSelf = viewerId && p.id === viewerId
        return (
          <div key={p.id} style={{
            position: 'absolute', left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -50%)',
            background: isSelf ? 'var(--gold)' : '#f7f0dd',
            border: `2px solid ${p.hasDurindana ? 'var(--crimson)' : 'var(--ink)'}`,
            borderRadius: 6, padding: '4px 8px', fontSize: '0.75em', fontFamily: "'Cinzel', serif",
            whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
          }}>
            {p.name}{p.hasDurindana ? ' \u2694' : ''}
          </div>
        )
      })}
    </div>
  )
}

// Le proprie ipotesi su fazione/identita' degli altri: dati puramente personali,
// salvati solo su questo dispositivo. `viewerId` opzionale: se assente (es. in
// hotseat/monitoraggio), mostra il tavolo e i menu per tutti, self incluso.
export function SuspicionBoard({ state, viewerId = null, storageKeySuffix = '' }) {
  const storageKey = `orlando_guesses_${viewerId || 'shared'}${storageKeySuffix}`
  const [guesses, setGuesses] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  })
  const others = viewerId ? state.players.filter(p => p.id !== viewerId) : state.players

  const updateGuess = (playerId, field, value) => {
    setGuesses(g => {
      const next = { ...g, [playerId]: { ...g[playerId], [field]: value } }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="card">
      <div className="eyebrow">Tavolo e sospetti {viewerId ? '(solo tuoi, privati)' : ''}</div>
      <TableView state={state} viewerId={viewerId} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {others.map(p => {
          const g = guesses[p.id] || {}
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ minWidth: 90 }}>{p.name}</strong>
              <select value={g.faction || ''} onChange={e => updateGuess(p.id, 'faction', e.target.value)} style={{ fontFamily: 'inherit', padding: '6px 8px' }}>
                <option value="">Fazione?</option>
                <option value="cristiana">Cristiana</option>
                <option value="saracena">Saracena</option>
              </select>
              <select value={g.character || ''} onChange={e => updateGuess(p.id, 'character', e.target.value)} style={{ fontFamily: 'inherit', padding: '6px 8px' }}>
                <option value="">Chi e'?</option>
                {CHARACTER_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Tabella "vista completa": mostra tutto di tutti (personaggio, fazione, equipaggiamento,
// stato). Usata dal supervisore online e dalla modalita' di monitoraggio in hotseat.
export function FullPlayersTable({ players, equipmentById }) {
  return (
    <div className="card">
      <div className="eyebrow">Tutti i giocatori (vista completa)</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)' }}>
              <th style={{ padding: 6 }}>Nome</th>
              <th style={{ padding: 6 }}>Personaggio</th>
              <th style={{ padding: 6 }}>Fazione</th>
              <th style={{ padding: 6 }}>Equipaggiamento</th>
              <th style={{ padding: 6 }}>Stato</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--parchment-dark)' }}>
                <td style={{ padding: 6 }}>{p.name}{p.hasDurindana ? ' \u2694' : ''}</td>
                <td style={{ padding: 6 }}>{p.characterName}</td>
                <td style={{ padding: 6 }}><IdentityBadge player={p} /></td>
                <td style={{ padding: 6 }}>{p.hand ? equipmentById[p.hand]?.name : '—'}{p.hand ? (p.handPublic ? ' (pubblica)' : ' (privata)') : ''}</td>
                <td style={{ padding: 6 }}>{p.isGhost ? 'Fantasma' : p.eliminatedPermanently ? 'Eliminato' : p.eliminatedFromBattle ? 'Fuori da questa battaglia' : 'In gioco'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
