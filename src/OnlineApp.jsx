import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { EQUIPMENT_BY_ID } from './engine/equipment.js'
import { EQUIPMENT_IMAGES } from './assets/index.js'
import { Divider, FactionBadge, HoldToPeekCharacter, BoardView, BoardPowersPanel, LogPanel, TableView, SuspicionBoard, FullPlayersTable, PhaseTransition, usePhaseTransitionGate, PhaseRulesButton, describeEffect } from './shared/ui.jsx'

function getServerUrl() {
  // In produzione (Render, Netlify, ecc.) frontend e backend vivono su domini diversi:
  // in quel caso va impostata a build-time la variabile VITE_SERVER_URL (es. nel file .env
  // o nelle impostazioni del sito) con l'URL pubblico del server Socket.io.
  // In locale/LAN, senza questa variabile, si comporta come prima (stesso host, porta 3001).
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL
  return `http://${window.location.hostname}:3001`
}

function useSocket() {
  const socketRef = useRef(null)
  if (!socketRef.current) {
    socketRef.current = io(getServerUrl(), { autoConnect: true })
  }
  return socketRef.current
}

export default function OnlineApp({ onExitToMenu }) {
  const socket = useSocket()
  const [connError, setConnError] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [joined, setJoined] = useState(false)
  const [lobby, setLobby] = useState(null)
  const [state, setState] = useState(null)
  const [secretInfo, setSecretInfo] = useState(null)
  const [supervising, setSupervising] = useState(false)
  const [supervisorState, setSupervisorState] = useState(null)
  const [supervisorPassword, setSupervisorPassword] = useState('')
  const [supervisorError, setSupervisorError] = useState(null)
  const [openRooms, setOpenRooms] = useState([])

  const [name, setName] = useState(() => localStorage.getItem('orlando_name') || '')
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('orlando_room') || '')
  const [playerCount, setPlayerCount] = useState(6)
  const [useEquipment, setUseEquipment] = useState(true)

  useEffect(() => {
    socket.on('connect_error', () => setConnError('Impossibile raggiungere il server. Controlla che sia acceso e che tu sia sulla stessa rete.'))
    socket.on('joined', ({ token, roomCode: rc, name: n }) => {
      localStorage.setItem('orlando_token', token)
      localStorage.setItem('orlando_room', rc)
      localStorage.setItem('orlando_name', n)
      setJoined(true)
      setJoinError(null)
    })
    socket.on('joinError', (msg) => setJoinError(msg))
    socket.on('lobby', (payload) => setLobby(payload))
    socket.on('state', (payload) => setState(payload))
    socket.on('secretInfo', (payload) => setSecretInfo(payload))
    socket.on('supervisorJoined', () => setSupervising(true))
    socket.on('supervisorJoinError', (msg) => setSupervisorError(msg))
    socket.on('supervisorState', (payload) => setSupervisorState(payload))
    socket.on('openRooms', (payload) => setOpenRooms(payload))
    socket.on('roomClosed', () => {
      localStorage.removeItem('orlando_token')
      localStorage.removeItem('orlando_room')
      setJoined(false)
      setLobby(null)
      setState(null)
      onExitToMenu && onExitToMenu()
    })

    const savedToken = localStorage.getItem('orlando_token')
    const savedRoom = localStorage.getItem('orlando_room')
    const savedName = localStorage.getItem('orlando_name')
    if (savedToken && savedRoom && savedName) {
      socket.emit('join', { roomCode: savedRoom, name: savedName, token: savedToken })
    }

    return () => {
      socket.off('connect_error')
      socket.off('joined')
      socket.off('joinError')
      socket.off('lobby')
      socket.off('state')
      socket.off('secretInfo')
      socket.off('supervisorJoined')
      socket.off('supervisorJoinError')
      socket.off('supervisorState')
      socket.off('openRooms')
      socket.off('roomClosed')
    }
  }, [socket])

  const act = (type, payload = {}) => socket.emit('action', { type, payload })
  const setVoiceLink = (url) => socket.emit('setVoiceLink', { url })
  const closeRoomAndExit = () => socket.emit('closeRoom')

  if (connError) {
    return <div className="card"><div className="eyebrow">Connessione</div><p>{connError}</p></div>
  }

  if (supervising) {
    return <SupervisorScreen state={supervisorState} roomCode={roomCode} />
  }

  if (!joined) {
    return (
      <JoinScreen
        name={name} setName={setName}
        roomCode={roomCode} setRoomCode={setRoomCode}
        playerCount={playerCount} setPlayerCount={setPlayerCount}
        useEquipment={useEquipment} setUseEquipment={setUseEquipment}
        joinError={joinError}
        supervisorPassword={supervisorPassword} setSupervisorPassword={setSupervisorPassword}
        supervisorError={supervisorError}
        openRooms={openRooms}
        onJoin={() => socket.emit('join', { roomCode: roomCode.trim().toUpperCase(), name: name.trim(), playerCount, useEquipment })}
        onSupervise={() => {
          const rc = roomCode.trim().toUpperCase()
          setRoomCode(rc)
          setSupervisorError(null)
          socket.emit('joinSupervisor', { roomCode: rc, password: supervisorPassword })
        }}
      />
    )
  }

  if (!state) {
    return (
      <LobbyScreen
        lobby={lobby}
        roomCode={roomCode}
        onSetVoiceLink={setVoiceLink}
        onLeave={() => {
          socket.emit('leaveRoom')
          localStorage.removeItem('orlando_token')
          localStorage.removeItem('orlando_room')
          setJoined(false)
          setLobby(null)
          setRoomCode('')
        }}
      />
    )
  }

  return <GameScreen state={state} act={act} secretInfo={secretInfo} clearSecretInfo={() => setSecretInfo(null)} onSetVoiceLink={setVoiceLink} onCloseRoom={closeRoomAndExit} />
}

function SupervisorScreen({ state, roomCode }) {
  if (!state) {
    return <div className="card"><div className="eyebrow">Supervisore &mdash; stanza {roomCode}</div><p>In attesa che la partita inizi&hellip;</p></div>
  }
  return (
    <div>
      <div className="card">
        <div className="eyebrow">Supervisore &mdash; stanza {roomCode}</div>
        <h2>Round {state.round} {state.durindanaHolderId && <>&mdash; Durindana: {state.players.find(p => p.id === state.durindanaHolderId)?.name}</>}</h2>
        <BoardView game={state} />
      </div>
      <FullPlayersTable players={state.players} equipmentById={EQUIPMENT_BY_ID} />
      <LogPanel log={state.log} />
    </div>
  )
}

function JoinScreen({ name, setName, roomCode, setRoomCode, playerCount, setPlayerCount, useEquipment, setUseEquipment, joinError, supervisorPassword, setSupervisorPassword, supervisorError, openRooms, onJoin, onSupervise }) {
  const canJoin = name.trim().length > 0 && roomCode.trim().length > 0
  return (
    <div className="card">
      <div className="eyebrow">Orlando alle Crociate &mdash; online</div>
      <h1>Entra in una stanza</h1>
      <Divider />
      <input type="text" placeholder="Il tuo nome" value={name} onChange={e => setName(e.target.value)} />
      <input type="text" placeholder="Codice stanza (es. CROCIATA)" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />

      {openRooms.length > 0 && (
        <div style={{ margin: '10px 0' }}>
          <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Stanze aperte in questo momento</label>
          <div className="player-list" style={{ marginTop: 6 }}>
            {openRooms.map(r => (
              <button
                key={r.roomCode}
                type="button"
                className={roomCode === r.roomCode ? '' : 'secondary'}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
                onClick={() => setRoomCode(r.roomCode)}
              >
                <span>{r.roomCode}</span>
                <span>{r.playerCount}/{r.requiredPlayers} &middot; {r.useEquipment ? 'esperti' : 'novizi'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ margin: '10px 0' }}>
        <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Numero di giocatori (usato solo se sei tu a creare la stanza)</label>
        <select value={playerCount} onChange={e => setPlayerCount(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', marginTop: 6 }}>
          {[6, 7, 8, 9, 10, 11, 12, 13].map(n => <option key={n} value={n}>{n} giocatori</option>)}
        </select>
      </div>
      <div style={{ margin: '10px 0' }}>
        <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Modalita' (usata solo se sei tu a creare la stanza)</label>
        <select value={useEquipment ? 'esperti' : 'novizi'} onChange={e => setUseEquipment(e.target.value === 'esperti')} style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', marginTop: 6 }}>
          <option value="esperti">Esperti (con carte equipaggiamento)</option>
          <option value="novizi">Novizi (senza carte equipaggiamento)</option>
        </select>
      </div>
      {joinError && <p style={{ color: 'var(--crimson)' }}>{joinError}</p>}
      <button disabled={!canJoin} onClick={onJoin}>Entra come giocatore</button>
      <Divider />
      <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Modalita' amministratore (solo monitoraggio, richiede password)</label>
      <input
        type="password"
        placeholder="Password amministratore"
        value={supervisorPassword}
        onChange={e => setSupervisorPassword(e.target.value)}
        style={{ marginTop: 6 }}
      />
      {supervisorError && <p style={{ color: 'var(--crimson)' }}>{supervisorError}</p>}
      <button className="secondary" disabled={!roomCode.trim() || !supervisorPassword} onClick={onSupervise}>Entra come supervisore (monitoraggio, non gioco)</button>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em', marginTop: 14 }}>
        Tutti i giocatori devono usare lo <strong>stesso codice stanza</strong>, lo stesso numero di giocatori e la stessa modalita', connessi alla stessa rete (o via Tailscale).
        La partita parte automaticamente non appena si raggiunge il numero scelto.
      </p>
    </div>
  )
}

// Link facoltativo per una chat vocale (Google Meet, Discord, ecc.), sincronizzato in
// tempo reale con tutti quelli nella stanza. "Apri una nuova Google Meet" usa la scorciatoia
// ufficiale meet.new: crea all'istante una riunione nuova per chi clicca (richiede di essere
// gia' loggati con un account Google in quella scheda) -- va poi incollata qui per condividerla
// con gli altri, dato che ogni click su meet.new genera una riunione diversa.
function VoiceLinkPanel({ voiceLink, onSetVoiceLink, compact }) {
  const [draft, setDraft] = useState('')
  return (
    <div className={compact ? 'card' : 'card'} style={compact ? { margin: '10px 0', padding: '12px 16px' } : undefined}>
      <div className="eyebrow">Chat vocale (facoltativa)</div>
      {voiceLink ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <a href={voiceLink} target="_blank" rel="noopener noreferrer">
            <button type="button">&#127908; Entra nella chat vocale</button>
          </a>
          <button type="button" className="secondary" onClick={() => onSetVoiceLink('')}>Rimuovi link</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
          <a href="https://meet.new" target="_blank" rel="noopener noreferrer">
            <button type="button" className="secondary">Apri una nuova Google Meet</button>
          </a>
          <input
            type="text"
            placeholder="...poi incolla qui il link per condividerlo"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button type="button" disabled={!draft.trim()} onClick={() => { onSetVoiceLink(draft.trim()); setDraft('') }}>Condividi con tutti</button>
        </div>
      )}
    </div>
  )
}

// Il "Consiglio dei cavalieri" lato online: pannello persistente durante la Fase 2,
// non una fase a se'. Qui l'autore del commento e' implicito (sei tu, un dispositivo
// a testa), a differenza dell'hotseat dove va scelto da un elenco.
function CouncilPanel({ messages, readyIds, myId, players, onSend, onSetReady }) {
  const [draft, setDraft] = useState('')
  const amReady = readyIds.includes(myId)
  return (
    <div className="card" style={{ margin: '10px 0' }}>
      <div className="eyebrow">Consiglio dei cavalieri</div>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', marginTop: 4 }}>Commenta le carte giocate finora, o dai un consiglio al possessore di Durindana per la scelta dei partecipanti.</p>
      {messages.length > 0 && (
        <div className="player-list" style={{ margin: '10px 0' }}>
          {messages.map((m, i) => (
            <div key={i} className="card" style={{ margin: 0, padding: '8px 12px' }}>
              <strong>{m.name}:</strong> {m.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Scrivi un commento..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={300}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button
          className="secondary"
          disabled={!draft.trim()}
          onClick={() => { onSend(draft.trim()); setDraft('') }}
        >
          Invia
        </button>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onSetReady(!amReady)}
          style={{
            background: amReady ? 'var(--saracen)' : 'var(--crimson)',
            color: '#fff', border: 'none'
          }}
        >
          {amReady ? '\u2713 Pronto per la Chiamata alle armi' : 'Ho finito: sono pronto'}
        </button>
      </div>
      <div className="player-list" style={{ marginTop: 10 }}>
        {players.map(p => {
          const isReady = readyIds.includes(p.id)
          return (
            <div key={p.id} className="card" style={{ margin: 0, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{p.name}{p.id === myId ? ' (tu)' : ''}</span>
              <span
                title={isReady ? 'Pronto' : 'Non ancora pronto'}
                style={{
                  display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                  background: isReady ? 'var(--saracen)' : 'var(--crimson)'
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LobbyScreen({ lobby, roomCode, onLeave, onSetVoiceLink }) {
  if (!lobby) {
    return (
      <div className="card">
        <p>Connessione alla stanza&hellip;</p>
        <button className="secondary" onClick={onLeave}>Annulla</button>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="eyebrow">Stanza {roomCode}</div>
      <h2>In attesa degli altri cavalieri&hellip;</h2>
      <p>{lobby.players.length} / {lobby.required} giocatori collegati</p>
      <div className="player-list">
        {lobby.players.map((p, i) => (
          <div key={i} className="card" style={{ margin: 0, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{p.name}</span>
            <span style={{ color: p.connected ? 'var(--saracen)' : 'var(--crimson)' }}>{p.connected ? '\u25CF online' : '\u25CB offline'}</span>
          </div>
        ))}
      </div>
      <VoiceLinkPanel voiceLink={lobby.voiceLink} onSetVoiceLink={onSetVoiceLink} compact />
      <button className="secondary" style={{ marginTop: 14 }} onClick={onLeave}>Lascia il tavolo</button>
    </div>
  )
}

function WaitingCard({ text }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="eyebrow">In attesa</div>
      <p>{text}</p>
    </div>
  )
}

// Avviso "X ha usato [carta] contro di te": appare in cima a qualunque schermata (anche
// durante una finestra di interruzione/reazione) e si chiude da solo dopo qualche secondo.
function TargetNoticeToast({ notice, onDismiss }) {
  if (!notice) return null
  const card = EQUIPMENT_BY_ID[notice.cardId]
  if (!card) return null
  return (
    <div className="card target-notice-toast">
      <div className="eyebrow">Sei stato bersagliato</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {EQUIPMENT_IMAGES[card.id] && <img className="card-art" style={{ width: 70, height: 'auto', flexShrink: 0 }} src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
        <p style={{ margin: 0, flex: 1 }}>
          <strong>{notice.attackerName || 'Qualcuno'}</strong> ha usato <strong>{card.name}</strong> contro di te.
        </p>
      </div>
      <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={onDismiss}>Chiudi</button>
    </div>
  )
}

function nameOf(state, id) {
  return state.players.find(p => p.id === id)?.name || '?'
}




// Come per l'hotseat, ma qui non serve uno "stage" locale: il server manda gia' la fase
// giusta (phase1-reveal solo se 8+ giocatori, altrimenti si parte direttamente da phase2-*).
function transitionKeyForOnline(state) {
  if (!state) return null
  if (state.phase === 'gameover') return `vittoria_${state.winner}`
  if (state.phase === 'phase1-reveal') return 'rivelazione'
  if (['phase2-deal', 'phase2-instant', 'phase2-voluntary'].includes(state.phase)) return 'alavventura'
  if (state.phase === 'phase3-select') return 'chiamata'
  if (state.phase === 'phase3-ghost-block') return 'scontro'
  if (state.phase === 'phase3-reveal') {
    // Come per l'hotseat: una volta che tutti hanno rivelato il favore, passiamo gia' alla
    // schermata di Risoluzione mentre il server calcola in sottofondo (nessun cambiamento al
    // timer server-side). Il client non vede battle.reveals altrui per privacy, quindi usiamo
    // il conteggio aggregato battleRevealProgress.
    const progress = state.battleRevealProgress
    const allRevealed = progress && progress.done === progress.total
    return allRevealed ? 'risoluzione' : 'scontro'
  }
  if (state.phase === 'phase4') return 'risoluzione'
  return null
}

function GameScreen({ state, act, secretInfo, clearSecretInfo, onSetVoiceLink, onCloseRoom }) {
  const me = state.players.find(p => p.id === state.myId)
  const [showTable, setShowTable] = useState(true)
  const [showBoard, setShowBoard] = useState(false)
  // La schermata "Assegnazione Fazioni" si vede una volta sola, al primissimo ingresso in
  // partita di questo client (non esiste una fase dedicata lato server per questo momento).
  const [assegnazioneSeen, setAssegnazioneSeen] = useState(false)
  const transitionKey = transitionKeyForOnline(state)
  const { showTransition, dismiss } = usePhaseTransitionGate(transitionKey)

  // Avviso "X ha usato [carta] contro di te": si mostra una volta sola per ogni evento
  // (deduplicato tramite il numero progressivo "seq" mandato dal server) e sparisce da solo.
  const [seenNoticeSeq, setSeenNoticeSeq] = useState(0)
  const [visibleNotice, setVisibleNotice] = useState(null)
  React.useEffect(() => {
    if (state.targetNotice && state.targetNotice.seq > seenNoticeSeq) {
      setVisibleNotice(state.targetNotice)
      setSeenNoticeSeq(state.targetNotice.seq)
      const t = setTimeout(() => setVisibleNotice(null), 7000)
      return () => clearTimeout(t)
    }
  }, [state.targetNotice?.seq])

  if (!assegnazioneSeen) {
    return <PhaseTransition phaseKey="assegnazione" onContinue={() => setAssegnazioneSeen(true)} />
  }

  if (showTransition) {
    return <PhaseTransition phaseKey={transitionKey} onContinue={dismiss} />
  }

  if (state.phase === 'gameover') {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="eyebrow">Partita conclusa</div>
        <h1 className={state.winner === 'isabella' ? '' : `faction-${state.winner}`}>
          {state.winner === 'isabella' ? 'Vittoria di Isabella, in solitaria!' : `Vittoria ${state.winner === 'cristiana' ? 'Cristiana' : 'Saracena'}!`}
        </h1>
        <BoardView game={state} />
        <PhaseRulesButton phaseKey={`vittoria_${state.winner}`} />
        <button type="button" style={{ marginTop: 14 }} onClick={onCloseRoom}>
          Chiudi la partita e torna alla selezione modalita'
        </button>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.8em', marginTop: 8 }}>
          Chiude la stanza per tutti i giocatori.
        </p>
      </div>
    )
  }

  // La risposta a un'eliminazione (Parata/Orrilo) ha sempre priorita' su qualsiasi altra fase.
  if (state.pendingInterrupt) {
    const target = state.players.find(p => p.id === state.pendingInterrupt.targetId)
    return (
      <div>
        <TargetNoticeToast notice={visibleNotice} onDismiss={() => setVisibleNotice(null)} />
        {state.pendingInterrupt.actionableByMe
          ? <MyInterruptResponse me={me} act={act} deadline={state.pendingInterrupt.deadline} />
          : <WaitingCard text={`${target?.name} e' stato bersaglio di un'eliminazione e ha pochi secondi per decidere come rispondere…`} />}
        <HoldToPeekCharacter player={me} />
        <LogPanel log={state.log} />
      </div>
    )
  }

  // Idem per la finestra reattiva del Palazzo di Atlante. Non nominiamo mai chi la possiede
  // agli altri giocatori: lo rivelerebbe prima ancora che decida se attivarla.
  if (state.pendingReaction) {
    return (
      <div>
        <TargetNoticeToast notice={visibleNotice} onDismiss={() => setVisibleNotice(null)} />
        {state.pendingReaction.actionableByMe
          ? <MyReactionResponse state={state} me={me} act={act} deadline={state.pendingReaction.deadline} />
          : <WaitingCard text="Qualcuno ha pochi secondi per decidere se ridirigere l'ultimo effetto…" />}
        <HoldToPeekCharacter player={me} />
        <LogPanel log={state.log} />
      </div>
    )
  }

  let content = null
  if (state.phase === 'phase1-reveal') {
    content = <MyPhase1Info state={state} act={act} />
  } else if (state.phase === 'phase2-instant') {
    const isMyTurn = state.pendingInstantPlayerId === state.myId
    content = (
      <div>
        <MyHandCard me={me} />
        {isMyTurn
          ? <MyInstantCard me={me} act={act} others={state.players.filter(p => p.id !== me.id)} />
          : <WaitingCard text={`${nameOf(state, state.pendingInstantPlayerId)} sta risolvendo una carta istantanea…`} />}
      </div>
    )
  } else if (state.phase === 'phase2-voluntary') {
    const isMyTurn = state.pendingVoluntaryPlayerId === state.myId
    content = (
      <div>
        <MyHandCard me={me} />
        {isMyTurn
          ? <MyVoluntaryCard me={me} act={act} allPlayers={state.players} />
          : <WaitingCard text={`${nameOf(state, state.pendingVoluntaryPlayerId)} sta decidendo la propria carta…`} />}
      </div>
    )
  } else if (state.phase === 'phase3-select') {
    content = state.durindanaHolderId === state.myId
      ? <MyParticipantSelect state={state} act={act} />
      : <WaitingCard text={`${nameOf(state, state.durindanaHolderId)} (Durindana) sta scegliendo i partecipanti alla battaglia…`} />
  } else if (state.phase === 'phase3-ghost-block') {
    content = me.isGhost && state.pendingGhostBlocks.includes(state.myId)
      ? <MyGhostBlock state={state} act={act} />
      : <WaitingCard text="Un fantasma sta decidendo se bloccare un partecipante…" />
  } else if (state.phase === 'phase3-reveal') {
    const allDone = state.battleRevealProgress && state.battleRevealProgress.done === state.battleRevealProgress.total
    if (allDone) {
      content = <div className="card" style={{ textAlign: 'center' }}><div className="eyebrow">Tutti hanno scelto</div><h2>L'Ariosto calcola il risultato&hellip;</h2></div>
    } else if (state.canRevealFavor) {
      content = <MyBattleReveal me={me} act={act} allPlayers={state.players} participantIds={state.battle.participants} />
    } else if (state.battle.participants.includes(state.myId)) {
      content = <WaitingCard text={`In attesa che gli altri partecipanti mostrino il proprio favore…`} />
    } else {
      content = <WaitingCard text={`Battaglia in corso, in attesa che i partecipanti mostrino il favore…`} />
    }
  } else if (state.phase === 'phase4') {
    content = <ResultScreen state={state} act={act} secretInfo={secretInfo} clearSecretInfo={clearSecretInfo} />
  }

  return (
    <div>
      <TargetNoticeToast notice={visibleNotice} onDismiss={() => setVisibleNotice(null)} />
      {content}
      <PhaseRulesButton phaseKey={transitionKey} />
      <HoldToPeekCharacter player={me} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', fontSize: '0.85em', color: '#fff' }}>
        <input type="checkbox" checked={showTable} onChange={e => setShowTable(e.target.checked)} />
        Mostra tavolo e sospetti
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', fontSize: '0.85em', color: '#fff' }}>
        <input type="checkbox" checked={showBoard} onChange={e => setShowBoard(e.target.checked)} />
        Mostra tabellone e poteri sui tracciati
      </label>
      {showTable && <SuspicionBoard state={state} viewerId={state.myId} />}
      {showBoard && <BoardPowersPanel game={state} />}
      <VoiceLinkPanel voiceLink={state.voiceLink} onSetVoiceLink={onSetVoiceLink} compact />
      {(state.phase === 'phase2-instant' || state.phase === 'phase2-voluntary') && (
        <CouncilPanel
          messages={state.councilMessages}
          readyIds={state.councilReady}
          myId={state.myId}
          players={state.players}
          onSend={text => act('addCouncilMessage', { text })}
          onSetReady={ready => act('setCouncilReady', { ready })}
        />
      )}
      <LogPanel log={state.log} />
    </div>
  )
}

// Mostra sempre la propria carta in mano durante la Fase 2 (istantanee e volontarie),
// indipendentemente da chi sta giocando in questo momento: cosi' tutti i giocatori la vedono
// nello stesso istante in cui viene distribuita, non solo quando arriva il proprio turno.
function MyHandCard({ me }) {
  if (!me?.hand) {
    return (
      <div className="card">
        <div className="eyebrow">La tua carta equipaggiamento</div>
        <p>Non hai nessuna carta in mano questo round.</p>
      </div>
    )
  }
  const card = EQUIPMENT_BY_ID[me.hand]
  if (!card) return null
  return (
    <div className="card">
      <div className="eyebrow">La tua carta equipaggiamento</div>
      {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
      <h2>{card.name}</h2>
      <p>{card.description}</p>
    </div>
  )
}

function MyInstantCard({ me, act, others }) {
  const card = EQUIPMENT_BY_ID[me.hand]
  const [targetId, setTargetId] = useState('')
  const [targetId2, setTargetId2] = useState('')
  const needsTwoTargets = card.effect === 'swap_equipment'
  const needsOneTarget = card.effect === 'force_reveal_use'

  return (
    <div className="card">
      <div className="eyebrow">Tocca a te</div>
      {needsOneTarget && (
        <div className="player-list">
          <div className="eyebrow">Scegli un giocatore</div>
          {others.map(o => (
            <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
          ))}
        </div>
      )}
      {needsTwoTargets && (
        <>
          <div className="player-list">
            <div className="eyebrow">Primo giocatore</div>
            {others.map(o => (
              <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
            ))}
          </div>
          <div className="player-list">
            <div className="eyebrow">Secondo giocatore</div>
            {others.filter(o => o.id !== targetId).map(o => (
              <button key={o.id} className={targetId2 === o.id ? '' : 'secondary'} onClick={() => setTargetId2(o.id)}>{o.name}</button>
            ))}
          </div>
        </>
      )}

      <button
        disabled={(needsOneTarget && !targetId) || (needsTwoTargets && (!targetId || !targetId2))}
        onClick={() => act('resolveInstant', { targetId, targetId2 })}
      >
        Conferma effetto
      </button>
    </div>
  )
}

function MyVoluntaryCard({ me, act, allPlayers }) {
  const card = EQUIPMENT_BY_ID[me.hand]
  const others = allPlayers.filter(p => p.id !== me.id)
  const isPlayable = card.timing === 'voluntary'
  const needsTarget = ['eliminate_choice', 'eliminate_draw_on_success', 'steal_equipment', 'redirect_target'].includes(card.effect)
  const isAdjacent = card.effect === 'eliminate_adjacent'
  const [targetId, setTargetId] = useState('')

  const myIndex = allPlayers.findIndex(p => p.id === me.id)
  const adjacentTargets = isAdjacent
    ? [allPlayers[(myIndex - 1 + allPlayers.length) % allPlayers.length], allPlayers[(myIndex + 1) % allPlayers.length]]
    : []
  const targetList = isAdjacent ? adjacentTargets : others

  return (
    <div className="card">
      <div className="eyebrow">Tocca a te</div>
      {!isPlayable && (
        <p style={{ color: 'var(--ink-soft)' }}>
          {card.timing === 'battle' && 'Questa carta si attiva solo se parteciperai alla battaglia: la mostrerai in Fase 3.'}
          {card.timing === 'bluff' && 'Questa carta non ha effetto: puoi tenerla nascosta.'}
          {card.timing === 'passive' && 'Questa carta resta nascosta finche\' non sarai bersagliato.'}
          {card.timing === 'interrupt' && 'Questa carta si gioca solo in risposta a un\'eliminazione dalla battaglia.'}
          {card.timing === 'reactive' && 'Questa carta si attiva da sola, subito dopo un effetto compatibile: non ora.'}
        </p>
      )}

      {isPlayable && (needsTarget || isAdjacent) && (
        <div className="player-list">
          <div className="eyebrow">Scegli un giocatore</div>
          {targetList.map(o => (
            <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
          ))}
        </div>
      )}

      {isPlayable ? (
        <>
          <button disabled={(needsTarget || isAdjacent) && !targetId} onClick={() => act('playVoluntary', { targetId })}>
            Gioca la carta
          </button>
          <button className="secondary" onClick={() => act('passVoluntary')}>Non giocarla</button>
        </>
      ) : (
        <button onClick={() => act('passVoluntary')}>Continua</button>
      )}
    </div>
  )
}

function MyParticipantSelect({ state, act }) {
  const forced = state.forced
  const eligible = state.eligible
  const requiredTotal = Math.min(state.participantsBaseline + forced.length, eligible.length)
  const [selected, setSelected] = useState(forced)
  const [selfJoin, setSelfJoin] = useState(false)

  const toggle = (id) => {
    if (forced.includes(id)) return
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }
  const canConfirm = selected.length === requiredTotal

  return (
    <div className="card">
      <div className="eyebrow">Possiedi Durindana</div>
      <h2>Scegli i partecipanti alla battaglia</h2>
      <p>Servono <strong>{requiredTotal}</strong> partecipanti in totale.{forced.length > 0 && <> {forced.length} sono gia' obbligati.</>}</p>
      {requiredTotal < state.participantsBaseline + forced.length && (
        <p style={{ color: 'var(--crimson)', fontSize: '0.85em' }}>
          (Non ci sono abbastanza giocatori disponibili per il numero pieno richiesto: si partecipa con tutti quelli rimasti.)
        </p>
      )}
      <div className="player-list">
        {eligible.map(id => {
          const p = state.players.find(x => x.id === id)
          const isForced = forced.includes(id)
          const isSelected = selected.includes(id)
          return (
            <button key={id} className={isSelected ? '' : 'secondary'} disabled={isForced} onClick={() => toggle(id)}>
              {p.name}{isForced ? ' (obbligato)' : ''}
            </button>
          )
        })}
      </div>
      {state.canSecretlyJoin && (
        <div className="card" style={{ background: '#efe4c8' }}>
          <div className="eyebrow">Potere speciale</div>
          <p>Puoi aggiungerti di nascosto come partecipante extra, oltre ai {requiredTotal} scelti sopra. Nessun altro giocatore lo sapra'.</p>
          <button className={selfJoin ? '' : 'secondary'} onClick={() => setSelfJoin(true)}>Aggiungimi di nascosto</button>
          <button className={!selfJoin ? '' : 'secondary'} onClick={() => setSelfJoin(false)}>Non partecipo</button>
        </div>
      )}
      <button disabled={!canConfirm} onClick={() => act('chooseParticipants', { chosenIds: selected, secretSelfJoin: selfJoin })}>
        Conferma partecipanti ({selected.length}/{requiredTotal}{selfJoin ? ' + tu di nascosto' : ''})
      </button>
    </div>
  )
}

function MyBattleReveal({ me, act, allPlayers, participantIds }) {
  const dual = me.favorTiles.length === 2 && me.favorTiles[0].faction !== me.favorTiles[1].faction
  const options = dual ? me.favorTiles : [me.favorTiles[0]]
  const [faction, setFaction] = useState('')
  const [useOptional, setUseOptional] = useState(true)
  const [blockTargetId, setBlockTargetId] = useState('')
  const battleCard = me.hand && EQUIPMENT_BY_ID[me.hand]?.timing === 'battle' ? EQUIPMENT_BY_ID[me.hand] : null
  const isOptionalBattleCard = battleCard?.effect === 'battle_all_others_penalty'
  const needsBlockTarget = battleCard?.effect === 'battle_block_blind'
  const others = allPlayers.filter(p => p.id !== me.id)
  const blockCandidates = (participantIds || [])
    .filter(id => id !== me.id)
    .map(id => allPlayers.find(p => p.id === id))
    .filter(Boolean)
  const canConfirm = faction && (!needsBlockTarget || blockTargetId)

  return (
    <div className="card">
      <div className="eyebrow">Sei in battaglia</div>
      <h2>Scegli la tua tessera favore</h2>
      <div className="player-list">
        {options.map((t, i) => (
          <button key={i} className={faction === t.faction ? '' : 'secondary'} onClick={() => setFaction(t.faction)}>
            {t.faction === 'cristiana' ? 'Cristiana' : 'Saracena'} (valore {t.value})
          </button>
        ))}
      </div>

      {battleCard && (
        <div className="card" style={{ background: '#efe4c8' }}>
          <div className="eyebrow">Carta da battaglia</div>
          {EQUIPMENT_IMAGES[battleCard.id] && <img className="card-art" src={EQUIPMENT_IMAGES[battleCard.id]} alt={battleCard.name} />}
          <strong>{battleCard.name}</strong>
          <p>{battleCard.description}</p>
          {isOptionalBattleCard && (
            <>
              <button className={useOptional ? '' : 'secondary'} onClick={() => setUseOptional(true)}>Usala</button>
              <button className={!useOptional ? '' : 'secondary'} onClick={() => setUseOptional(false)}>Non usarla</button>
            </>
          )}
          {needsBlockTarget && (
            <div className="player-list">
              <div className="eyebrow">Blocca chi? (solo tra i partecipanti alla battaglia)</div>
              {blockCandidates.map(o => (
                <button key={o.id} className={blockTargetId === o.id ? '' : 'secondary'} onClick={() => setBlockTargetId(o.id)}>{o.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <button disabled={!canConfirm} onClick={() => act('revealParticipant', { faction, useOptionalCard: useOptional, blockTargetId })}>
        Conferma e nascondi
      </button>
    </div>
  )
}

function MyInterruptResponse({ me, act, deadline }) {
  const card = me.hand ? EQUIPMENT_BY_ID[me.hand] : null
  const hasInterruptCard = card && card.timing === 'interrupt'
  const [secondsLeft, setSecondsLeft] = useState(() => deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null)

  React.useEffect(() => {
    if (!deadline) { setSecondsLeft(null); return }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [deadline])

  const timeUp = secondsLeft === 0
  return (
    <div className="card">
      <div className="eyebrow">Sei stato bersaglio di un'eliminazione dalla battaglia</div>
      {secondsLeft !== null && (
        <p style={{ fontWeight: 'bold', color: timeUp ? 'var(--ink-soft)' : 'inherit' }}>
          {timeUp ? 'Tempo scaduto: in attesa che la partita prosegua…' : `Hai ${secondsLeft} second${secondsLeft === 1 ? 'o' : 'i'} per decidere.`}
        </p>
      )}
      {hasInterruptCard ? (
        <>
          <h2>Vuoi rispondere con {card.name}?</h2>
          {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
          <p>{card.description}</p>
          <button disabled={timeUp} onClick={() => act('resolveInterrupt', { playCard: true })}>Gioca {card.name}</button>
          <button disabled={timeUp} className="secondary" onClick={() => act('resolveInterrupt', { playCard: false })}>Non rispondere</button>
        </>
      ) : (
        <>
          <p>Non hai una carta con cui rispondere: l'eliminazione si applichera'.</p>
          <button disabled={timeUp} onClick={() => act('resolveInterrupt', { playCard: false })}>Continua</button>
        </>
      )}
    </div>
  )
}

function MyReactionResponse({ state, me, act, deadline }) {
  const card = me.hand ? EQUIPMENT_BY_ID[me.hand] : null
  const needsTarget = card?.effect === 'redirect_target'
  const eff = state.pendingReaction.eff
  const excludeId = eff?.effect === 'eliminate' ? eff.targetId : null
  const candidates = state.players.filter(p => p.id !== excludeId && p.id !== me.id)
  const [targetId, setTargetId] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(() => deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null)

  React.useEffect(() => {
    if (!deadline) { setSecondsLeft(null); return }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [deadline])

  const timeUp = secondsLeft === 0
  return (
    <div className="card">
      <div className="eyebrow">{needsTarget ? "Puoi ridirigere l'ultimo effetto" : "Puoi annullare l'ultimo effetto"}</div>
      {secondsLeft !== null && (
        <p style={{ fontWeight: 'bold', color: timeUp ? 'var(--ink-soft)' : 'inherit' }}>
          {timeUp ? 'Tempo scaduto: in attesa che la partita prosegua…' : `Hai ${secondsLeft} second${secondsLeft === 1 ? 'o' : 'i'} per decidere.`}
        </p>
      )}
      <h2>Vuoi attivare {card?.name}?</h2>
      {card && EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
      <p>{card?.description}</p>
      <p>Effetto in questione: <strong>{describeEffect(eff, state.players)}</strong>.</p>
      {needsTarget && (
        <div className="player-list">
          {candidates.map(o => (
            <button key={o.id} className={targetId === o.id ? '' : 'secondary'} disabled={timeUp} onClick={() => setTargetId(o.id)}>{o.name}</button>
          ))}
        </div>
      )}
      <button disabled={timeUp || (needsTarget && !targetId)} onClick={() => act('resolveReaction', { activate: true, targetId })}>
        {needsTarget ? 'Ridirigi su questo bersaglio' : 'Annulla questo effetto'}
      </button>
      <button disabled={timeUp} className="secondary" onClick={() => act('resolveReaction', { activate: false })}>Non attivare</button>
    </div>
  )
}

function MyPhase1Info({ state, act }) {
  const info = state.phase1Info
  return (
    <div className="card">
      <div className="eyebrow">Fase 1 &mdash; Rivelazione iniziale</div>
      {info?.type === 'allies' && (
        <>
          <h2>I tuoi alleati di fazione</h2>
          {info.allies.length > 0
            ? <ul>{info.allies.map((n, i) => <li key={i}>{n}</li>)}</ul>
            : <p>Nessun altro alleato di fazione oltre a te.</p>}
        </>
      )}
      {info?.type === 'lover' && (
        <>
          <h2>Il tuo amore segreto</h2>
          <p>{info.loverName} e' {info.loverCharacter}.</p>
        </>
      )}
      {!info && <p>Non hai informazioni private da vedere in questa fase.</p>}
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>Ricorda questa informazione e non mostrarla agli altri.</p>
      <button onClick={() => act('ackPhase1')}>Ho memorizzato, continua</button>
    </div>
  )
}

function MyGhostBlock({ state, act }) {
  const [targetId, setTargetId] = useState('')
  const participants = state.battle.participants.map(id => state.players.find(p => p.id === id))
  return (
    <div className="card">
      <div className="eyebrow">Sei un fantasma</div>
      <h2>Vuoi bloccare un partecipante alla battaglia?</h2>
      <p>Non vedrai il suo favore in battaglia; il suo contributo verra' semplicemente azzerato.</p>
      <div className="player-list">
        {participants.map(p => (
          <button key={p.id} className={targetId === p.id ? '' : 'secondary'} onClick={() => setTargetId(p.id)}>{p.name}</button>
        ))}
      </div>
      <button disabled={!targetId} onClick={() => act('ghostBlock', { targetId })}>Blocca questo partecipante</button>
      <button className="secondary" onClick={() => act('ghostBlock', { targetId: null })}>Non bloccare nessuno</button>
    </div>
  )
}


function ResultScreen({ state, act, secretInfo, clearSecretInfo }) {
  const durindanaIsMe = state.durindanaHolderId === state.myId
  const pending = state.pendingBoardPower

  if (pending?.type === 'spie_a_palazzo' && pending.actionableByMe && !secretInfo) {
    return <SpiePalazzoPicker state={state} act={act} />
  }
  if (secretInfo?.type === 'spie_a_palazzo') {
    return (
      <div className="card">
        <div className="eyebrow">Spie a palazzo</div>
        <p>{secretInfo.faction ? <>La Fazione del cavaliere scelto e': <FactionBadge faction={secretInfo.faction} /></> : 'Questo cavaliere non ha una fazione riconoscibile.'}</p>
        <button onClick={clearSecretInfo}>Continua</button>
      </div>
    )
  }
  if (pending?.type === 'cercare_amore' && pending.actionableByMe && !secretInfo) {
    return <CercareAmorePicker state={state} act={act} />
  }
  if (secretInfo?.type === 'cercare_amore') {
    return (
      <div className="card">
        <div className="eyebrow">Cercare l'amore</div>
        <p>{secretInfo.found ? 'Lo hai trovato! Le sue tessere favore sono state convertite in segreto.' : 'Non era lui/lei. Nessun effetto.'}</p>
        <button onClick={clearSecretInfo}>Continua</button>
      </div>
    )
  }
  if (pending?.type === 'fendente_mortale' && pending.actionableByMe) {
    return <FendenteMortalePicker state={state} act={act} />
  }
  if (pending && !pending.actionableByMe) {
    return <WaitingCard text="Il possessore di Durindana (o chi cerca il proprio amore) sta usando un potere segreto sul tabellone…" />
  }

  const result = state.battle.result
  return (
    <div className="card">
      <div className="eyebrow">Risultato battaglia &mdash; Round {state.round}</div>
      {result && <h2>{result.winner === 'pareggio' ? 'Pareggio' : <>Vince la fazione <FactionBadge faction={result.winner} /></>}</h2>}
      {result && result.winner === 'pareggio' && <p>Nessuna tessera assegnata questo round.</p>}
      <Divider />
      <BoardView game={state} />
      <button onClick={() => act('nextRound')}>Prossimo round</button>
    </div>
  )
}

function SpiePalazzoPicker({ state, act }) {
  const [targetId, setTargetId] = useState('')
  const others = state.players.filter(p => p.id !== state.myId)
  return (
    <div className="card">
      <div className="eyebrow">Potere del tabellone: Spie a palazzo</div>
      <h2>Guarda segretamente la Fazione di un altro cavaliere</h2>
      <div className="player-list">
        {others.map(o => (
          <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
        ))}
      </div>
      <button disabled={!targetId} onClick={() => act('resolveSpiePalazzo', { targetId })}>Rivela</button>
    </div>
  )
}

function CercareAmorePicker({ state, act }) {
  const [targetId, setTargetId] = useState('')
  const others = state.players.filter(p => p.id !== state.myId)
  return (
    <div className="card">
      <div className="eyebrow">Potere del tabellone: Cercare l'amore</div>
      <h2>Indica un cavaliere: se e' il tuo amore, verra' convertito</h2>
      <div className="player-list">
        {others.map(o => (
          <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
        ))}
      </div>
      <button disabled={!targetId} onClick={() => act('resolveCercareAmore', { targetId })}>Conferma</button>
    </div>
  )
}

function FendenteMortalePicker({ state, act }) {
  const [targetId, setTargetId] = useState('')
  const others = state.players.filter(p => p.id !== state.myId)
  return (
    <div className="card">
      <div className="eyebrow">Potere del tabellone: Fendente Mortale</div>
      <h2>Scegli un cavaliere da eliminare</h2>
      <p style={{ color: 'var(--crimson)' }}>Attenzione: se colpisci un capo fazione o Isabella, la partita puo' finire immediatamente.</p>
      <div className="player-list">
        {others.map(o => (
          <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
        ))}
      </div>
      <button disabled={!targetId} onClick={() => act('resolveFendenteMortale', { targetId })}>Colpisci</button>
    </div>
  )
}
