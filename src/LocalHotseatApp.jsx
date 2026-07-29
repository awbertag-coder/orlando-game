import React, { useState, useMemo } from 'react'
import * as engine from './engine/gameEngine.js'
import { EQUIPMENT_BY_ID } from './engine/equipment.js'
import { CHARACTER_IMAGES, EQUIPMENT_IMAGES, BOARD_IMAGES } from './assets/index.js'
import { Divider, FactionBadge, IdentityBadge, HoldToPeekCharacter, BoardView, BoardPowersPanel, LogPanel, SuspicionBoard, FullPlayersTable, PhaseTransition, usePhaseTransitionGate, PhaseRulesButton, describeEffect } from './shared/ui.jsx'

// Stessa password della modalita' amministratore online. Qui e' per forza lato client
// (l'hotseat non ha un server): basta a scoraggiare un'occhiata rapida di un giocatore
// curioso, non e' una vera barriera di sicurezza (chi guarda nel codice la trova).
const SUPERVISOR_PASSWORD = 'Admin!!!'

// Schermata "passa il dispositivo": nasconde il contenuto finche' non si preme "Mostra",
// e si richiude automaticamente ogni volta che cambia il giocatore di turno (key).
function PassGate({ playerName, children }) {
  const [revealed, setRevealed] = useState(false)
  if (!revealed) {
    return (
      <div className="pass-screen card">
        <div className="icon">&#9876;</div>
        <div className="eyebrow">Passa il dispositivo a</div>
        <h2>{playerName}</h2>
        <p style={{ color: 'var(--ink-soft)' }}>Assicurati che solo {playerName} stia guardando lo schermo.</p>
        <button className="gold" onClick={() => setRevealed(true)}>Mostra</button>
      </div>
    )
  }
  return <div>{children}</div>
}

// --- Componenti di supporto ---

function SetupScreen({ onCreate }) {
  const [count, setCount] = useState(6)
  const [names, setNames] = useState(['', '', '', '', '', ''])
  const [useEquipment, setUseEquipment] = useState(true)

  const setCountAndResize = (n) => {
    setCount(n)
    setNames(prev => {
      const next = [...prev]
      while (next.length < n) next.push('')
      return next.slice(0, n)
    })
  }

  const canStart = names.every(n => n.trim().length > 0)
  return (
    <div className="card">
      <div className="eyebrow">Orlando alle Crociate</div>
      <h1>Nuova partita</h1>
      <Divider />
      <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Numero di giocatori</label>
      <select value={count} onChange={e => setCountAndResize(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', marginBottom: 14 }}>
        {[6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} giocatori</option>)}
      </select>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.8em', marginTop: -8, marginBottom: 14 }}>
        In hotseat il numero massimo e' 10: con piu' persone i passaggi del dispositivo diventano troppi. Per gruppi piu' grandi conviene la modalita' online.
      </p>
      <label style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>Modalita'</label>
      <select value={useEquipment ? 'esperti' : 'novizi'} onChange={e => setUseEquipment(e.target.value === 'esperti')} style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', marginBottom: 14 }}>
        <option value="esperti">Esperti (con carte equipaggiamento)</option>
        <option value="novizi">Novizi (senza carte equipaggiamento)</option>
      </select>
      {names.map((n, i) => (
        <input
          key={i}
          type="text"
          placeholder={`Nome giocatore ${i + 1}`}
          value={n}
          onChange={e => {
            const next = [...names]
            next[i] = e.target.value
            setNames(next)
          }}
        />
      ))}
      <button disabled={!canStart} onClick={() => onCreate(names, { useEquipment })}>Assegna i ruoli e inizia</button>
    </div>
  )
}

// --- Rivelazione segreta di ruolo/fazione/tessere favore a inizio partita ---

function RoleRevealFlow({ game, showTable, onDone }) {
  const [index, setIndex] = useState(0)
  const player = game.players[index]

  return (
    <PassGate key={player.id} playerName={player.name}>
      <div className="card">
        <div className="eyebrow">Il tuo personaggio segreto</div>
        {CHARACTER_IMAGES[player.characterId] && (
          <img className="character-portrait" src={CHARACTER_IMAGES[player.characterId]} alt={player.characterName} />
        )}
        <h1 className={player.faction ? `faction-${player.faction}` : ''}>{player.characterName}</h1>
        <IdentityBadge player={player} />
        {player.description && <p style={{ marginTop: 10 }}>{player.description}</p>}
        {player.hasDurindana && (
          <div style={{ textAlign: 'center' }}>
            {EQUIPMENT_IMAGES.durindana && <img className="card-art" style={{ maxWidth: '140px' }} src={EQUIPMENT_IMAGES.durindana} alt="Durindana" />}
            <p><strong>Impugni Durindana</strong>: sceglierai tu i partecipanti alla prima battaglia.</p>
          </div>
        )}
        <Divider symbol="&#9876;" />
        <div className="eyebrow">Tessere favore in battaglia</div>
        <ul>
          {player.favorTiles.map((t, i) => (
            <li key={i}><FactionBadge faction={t.faction} /> &nbsp; valore <span className="value-pill">{t.value}</span></li>
          ))}
        </ul>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Ricorda questa informazione e non mostrarla agli altri.</p>
        <button onClick={() => {
          if (index + 1 < game.players.length) setIndex(index + 1)
          else onDone()
        }}>Ho memorizzato, nascondi e continua</button>
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={player.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// --- Fase 2: risoluzione carte istantanee ---

function InstantCardFlow({ game, update, showTable }) {
  const [targetId, setTargetId] = useState('')
  const [targetId2, setTargetId2] = useState('')

  const pending = engine.instantCardsPending(game)
  if (pending.length === 0) {
    return null
  }
  const player = pending[0]
  const card = EQUIPMENT_BY_ID[player.hand]
  const others = game.players.filter(p => p.id !== player.id)

  const needsTwoTargets = card.effect === 'swap_equipment'
  const needsOneTarget = card.effect === 'force_reveal_use'

  return (
    <PassGate key={player.id + card.id} playerName={player.name}>
      <div className="card">
        <div className="eyebrow">Carta istantanea</div>
        {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
        <h2>{card.name}</h2>
        <p>{card.description}</p>

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
          onClick={() => update(s => engine.resolveInstantCard(s, player.id, { targetId, targetId2 }))}
        >
          Conferma effetto
        </button>
        <HoldToPeekCharacter player={player} />
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={player.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// --- Fase 2: carte volontarie (una alla volta, in ordine di posto) ---

function VoluntaryCardFlow({ game, update, showTable }) {
  const [targetId, setTargetId] = useState('')

  const notDecided = engine.voluntaryCardsPending(game)
  if (notDecided.length === 0) {
    return null
  }
  const player = notDecided[0]
  const card = EQUIPMENT_BY_ID[player.hand]
  const isPlayable = card.timing === 'voluntary'
  const needsTarget = ['eliminate_choice', 'eliminate_adjacent', 'eliminate_draw_on_success', 'steal_equipment', 'redirect_target'].includes(card.effect)
  const others = card.effect === 'eliminate_adjacent'
    ? engine.adjacentPlayers(game, player.id).map(id => game.players.find(p => p.id === id))
    : game.players.filter(p => p.id !== player.id)

  return (
    <PassGate key={player.id} playerName={player.name}>
      <div className="card">
        <div className="eyebrow">La tua carta equipaggiamento</div>
        {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
        <h2>{card.name}</h2>
        <p>{card.description}</p>

        {!isPlayable && (
          <p style={{ color: 'var(--ink-soft)' }}>
            {card.timing === 'battle' && 'Questa carta si attiva solo se parteciperai alla battaglia: la mostrerai in Fase 3.'}
            {card.timing === 'bluff' && 'Questa carta non ha effetto: puoi tenerla nascosta.'}
            {card.timing === 'passive' && 'Questa carta resta nascosta finche\' non sarai bersagliato.'}
            {card.timing === 'interrupt' && 'Questa carta si gioca solo in risposta a un\'eliminazione dalla battaglia.'}
            {card.timing === 'reactive' && 'Questa carta si attiva da sola, subito dopo un effetto compatibile: non ora.'}
          </p>
        )}

        {isPlayable && needsTarget && (
          <div className="player-list">
            <div className="eyebrow">Scegli un giocatore</div>
            {others.map(o => (
              <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
            ))}
          </div>
        )}

        {isPlayable ? (
          <>
            <button disabled={needsTarget && !targetId} onClick={() => update(s => engine.playVoluntaryCard(s, player.id, { targetId }))}>
              Gioca la carta
            </button>
            <button className="secondary" onClick={() => update(s => engine.passVoluntaryCard(s, player.id))}>
              Non giocarla
            </button>
          </>
        ) : (
          <button onClick={() => update(s => engine.passVoluntaryCard(s, player.id))}>Continua</button>
        )}
        <HoldToPeekCharacter player={player} />
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={player.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// --- Fase 3: selezione partecipanti da parte del possessore di Durindana ---

// Il "Consiglio dei cavalieri": pannello persistente, non una fase a se' -- resta visibile
// durante tutta la Fase 2 (istantanee + volontarie), cosi' chiunque puo' commentare le
// carte via via che vengono giocate, senza fermare il giro per farlo.
function CouncilPanel({ game, update }) {
  const [draft, setDraft] = useState('')
  const [authorId, setAuthorId] = useState(game.players[0]?.id || '')
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow">Consiglio dei cavalieri</div>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', marginTop: 4 }}>Commenta le carte giocate finora, o dai un consiglio al possessore di Durindana per la scelta dei partecipanti.</p>
      {game.councilMessages.length > 0 && (
        <div className="player-list" style={{ margin: '10px 0' }}>
          {game.councilMessages.map((m, i) => (
            <div key={i} className="card" style={{ margin: 0, padding: '8px 12px' }}>
              <strong>{m.name}:</strong> {m.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select value={authorId} onChange={e => setAuthorId(e.target.value)}>
          {game.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
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
          onClick={() => {
            update(s => engine.addCouncilMessage(s, authorId, draft))
            setDraft('')
          }}
        >
          Invia
        </button>
      </div>
    </div>
  )
}

function ParticipantSelectFlow({ game, update, showTable, onDone }) {
  const durindanaHolder = game.players.find(p => p.hasDurindana)
  const forced = engine.forcedParticipants(game)
  const eligible = engine.eligibleParticipants(game)
  const baseline = game.participantsBaseline
  const canSecretlyJoin = engine.canSecretlyJoin(game)
  const requiredTotal = Math.min(baseline + forced.length, eligible.length)
  const [selected, setSelected] = useState(forced)
  const [selfJoin, setSelfJoin] = useState(false)

  const toggle = (id) => {
    if (forced.includes(id)) return
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  const canConfirm = selected.length === requiredTotal

  return (
    <PassGate playerName={durindanaHolder.name}>
      <div className="card">
        <div className="eyebrow">Possessore di Durindana</div>
        <h2>Scegli i partecipanti alla battaglia</h2>
        <p>Servono <strong>{requiredTotal}</strong> partecipanti in totale.
          {forced.length > 0 && <> {forced.length} sono gia' obbligati a partecipare.</>}
        </p>
        {requiredTotal < baseline + forced.length && (
          <p style={{ color: 'var(--crimson)', fontSize: '0.85em' }}>
            (Non ci sono abbastanza giocatori disponibili per il numero pieno richiesto: si partecipa con tutti quelli rimasti.)
          </p>
        )}
        <div className="player-list">
          {eligible.map(id => {
            const p = game.players.find(x => x.id === id)
            const isForced = forced.includes(id)
            const isSelected = selected.includes(id)
            return (
              <button
                key={id}
                className={isSelected ? '' : 'secondary'}
                disabled={isForced}
                onClick={() => toggle(id)}
              >
                {p.name}{isForced ? ' (obbligato)' : ''}
              </button>
            )
          })}
        </div>

        {canSecretlyJoin && (
          <div className="card" style={{ background: '#efe4c8' }}>
            <div className="eyebrow">Potere speciale di {durindanaHolder.characterName}</div>
            <p>Puoi aggiungerti di nascosto come partecipante extra, oltre ai {requiredTotal} scelti sopra. Nessun altro giocatore lo sapra'.</p>
            <button className={selfJoin ? '' : 'secondary'} onClick={() => setSelfJoin(true)}>Aggiungimi di nascosto</button>
            <button className={!selfJoin ? '' : 'secondary'} onClick={() => setSelfJoin(false)}>Non partecipo</button>
          </div>
        )}

        <button disabled={!canConfirm} onClick={() => { update(s => engine.chooseParticipants(s, selected, selfJoin)); onDone() }}>
          Conferma partecipanti ({selected.length}/{requiredTotal}{selfJoin ? ' + tu di nascosto' : ''})
        </button>
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={durindanaHolder.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// --- Fase 3: rivelazione dei partecipanti, uno alla volta ---

function BattleRevealFlow({ game, update, showTable }) {
  const [faction, setFaction] = useState('')
  const [useOptional, setUseOptional] = useState(true)
  const [blockTargetId, setBlockTargetId] = useState('')

  const remaining = game.battle.participants.filter(id => !game.battle.reveals[id])

  if (remaining.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="eyebrow">Tutti i partecipanti hanno scelto</div>
        <h2>L'Ariosto calcola il risultato&hellip;</h2>
      </div>
    )
  }
  const player = game.players.find(p => p.id === remaining[0])
  const dual = player.favorTiles.length === 2 && player.favorTiles[0].faction !== player.favorTiles[1].faction
  const options = dual ? player.favorTiles : [player.favorTiles[0]]
  const battleCard = player.hand && EQUIPMENT_BY_ID[player.hand]?.timing === 'battle' ? EQUIPMENT_BY_ID[player.hand] : null
  const isOptionalBattleCard = battleCard?.effect === 'battle_all_others_penalty'
  const needsBlockTarget = battleCard?.effect === 'battle_block_blind'

  const others = game.players.filter(p => p.id !== player.id)
  const blockCandidates = game.battle.participants
    .filter(id => id !== player.id)
    .map(id => game.players.find(p => p.id === id))
  const canConfirm = faction && (!needsBlockTarget || blockTargetId)

  return (
    <PassGate key={player.id} playerName={player.name}>
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

        <button disabled={!canConfirm} onClick={() => update(s => engine.revealParticipant(s, player.id, faction, { useOptionalCard: useOptional, blockTargetId }))}>
          Conferma e nascondi
        </button>
        <HoldToPeekCharacter player={player} />
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={player.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// --- Fase 4: risultato, potere del tabellone, reset ---

function ResultScreen({ game, update, showTable, onNextRound }) {
  const result = game.battle.result
  const pending = engine.currentBoardPower(game)
  const durindanaHolder = game.players.find(p => p.hasDurindana)
  const [target, setTarget] = useState('')
  const [outcome, setOutcome] = useState(null)

  if (pending?.type === 'spie_a_palazzo' && !outcome) {
    return (
      <PassGate playerName={durindanaHolder.name}>
        <div className="card">
          <div className="eyebrow">Potere del tabellone: Spie a palazzo</div>
          <h2>Guarda segretamente la Fazione di un altro cavaliere</h2>
          <div className="player-list">
            {game.players.filter(p => p.id !== durindanaHolder.id).map(o => (
              <button key={o.id} className={target === o.id ? '' : 'secondary'} onClick={() => setTarget(o.id)}>{o.name}</button>
            ))}
          </div>
          <button disabled={!target} onClick={() => setOutcome({ type: 'spie', ...engine.resolveSpiePalazzo(game, target) })}>
            Rivela
          </button>
        </div>
        {showTable && <SuspicionBoard state={game} viewerId={durindanaHolder.id} storageKeySuffix="-hotseat" />}
      </PassGate>
    )
  }
  if (outcome?.type === 'spie') {
    return (
      <PassGate playerName={durindanaHolder.name}>
        <div className="card">
          <div className="eyebrow">Risultato: Spie a palazzo</div>
          <p>{outcome.faction ? <>La Fazione del cavaliere scelto e': <FactionBadge faction={outcome.faction} /></> : 'Questo cavaliere non ha una fazione riconoscibile.'}</p>
          <button onClick={() => { setOutcome(null); update(s => s) }}>Continua</button>
        </div>
      </PassGate>
    )
  }

  if (pending?.type === 'cercare_amore' && !outcome) {
    const info = engine.cercareAmoreInfo(game)
    const seeker = game.players.find(p => p.id === info.seekerPlayerId)
    return (
      <PassGate playerName={seeker.name}>
        <div className="card">
          <div className="eyebrow">Potere del tabellone: Cercare l'amore</div>
          <h2>Indica un cavaliere: se e' il tuo amore, verra' convertito</h2>
          <div className="player-list">
            {game.players.filter(p => p.id !== seeker.id).map(o => (
              <button key={o.id} className={target === o.id ? '' : 'secondary'} onClick={() => setTarget(o.id)}>{o.name}</button>
            ))}
          </div>
          <button disabled={!target} onClick={() => setOutcome({ type: 'cercare', ...engine.resolveCercareAmore(game, target) })}>Conferma</button>
        </div>
        {showTable && <SuspicionBoard state={game} viewerId={seeker.id} storageKeySuffix="-hotseat" />}
      </PassGate>
    )
  }
  if (outcome?.type === 'cercare') {
    return (
      <PassGate playerName="Chi ha usato il potere">
        <div className="card">
          <div className="eyebrow">Cercare l'amore</div>
          <p>{outcome.found ? 'Lo hai trovato! Le sue tessere favore sono state convertite in segreto.' : 'Non era lui/lei. Nessun effetto.'}</p>
          <button onClick={() => { setOutcome(null); update(s => s) }}>Continua</button>
        </div>
      </PassGate>
    )
  }

  if (pending?.type === 'fendente_mortale' && !outcome) {
    return (
      <PassGate playerName={durindanaHolder.name}>
        <div className="card">
          <div className="eyebrow">Potere del tabellone: Fendente Mortale</div>
          <h2>Scegli un cavaliere da eliminare</h2>
          <p style={{ color: 'var(--crimson)' }}>Attenzione: se colpisci un capo fazione o Isabella, la partita puo' finire immediatamente.</p>
          <div className="player-list">
            {game.players.filter(p => p.id !== durindanaHolder.id).map(o => (
              <button key={o.id} className={target === o.id ? '' : 'secondary'} onClick={() => setTarget(o.id)}>{o.name}</button>
            ))}
          </div>
          <button disabled={!target} onClick={() => { const r = engine.resolveFendenteMortale(game, target); setOutcome({ type: 'fendente', ...r }); update(s => s) }}>Colpisci</button>
        </div>
        {showTable && <SuspicionBoard state={game} viewerId={durindanaHolder.id} storageKeySuffix="-hotseat" />}
      </PassGate>
    )
  }
  if (outcome?.type === 'fendente' && game.phase !== 'gameover') {
    return (
      <PassGate playerName={durindanaHolder.name}>
        <div className="card">
          <div className="eyebrow">Risultato: Fendente Mortale</div>
          <p>Esito: {outcome.outcome === 'eliminated' ? 'il cavaliere e\' stato eliminato dal gioco.' : 'il cavaliere e\' diventato un fantasma vendicatore.'}</p>
          <button onClick={() => { setOutcome(null); update(s => s) }}>Continua</button>
        </div>
      </PassGate>
    )
  }

  return (
    <div className="card">
      <div className="eyebrow">Risultato battaglia &mdash; Round {game.round}</div>
      <h2>{result.winner === 'pareggio' ? 'Pareggio' : <>Vince la fazione <FactionBadge faction={result.winner} /></>}</h2>
      {result.winner === 'pareggio' && <p>Nessuna tessera assegnata questo round.</p>}
      <Divider />
      <BoardView game={game} />
      <button onClick={onNextRound}>Prossimo round</button>
    </div>
  )
}

function InterruptResponseFlow({ game, update, showTable }) {
  const target = game.players.find(p => p.id === game.pendingInterrupt.targetId)
  const card = target.hand ? EQUIPMENT_BY_ID[target.hand] : null
  const hasInterruptCard = card && card.timing === 'interrupt'
  return (
    <PassGate playerName={target.name}>
      <div className="card">
        <div className="eyebrow">Sei stato bersaglio di un'eliminazione dalla battaglia</div>
        {hasInterruptCard ? (
          <>
            <h2>Vuoi rispondere con {card.name}?</h2>
            {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
            <p>{card.description}</p>
            <button onClick={() => update(s => engine.resolveInterrupt(s, true))}>Gioca {card.name}</button>
            <button className="secondary" onClick={() => update(s => engine.resolveInterrupt(s, false))}>Non rispondere</button>
          </>
        ) : (
          <>
            <p>Non hai una carta con cui rispondere: l'eliminazione si applichera'.</p>
            <button onClick={() => update(s => engine.resolveInterrupt(s, false))}>Continua</button>
          </>
        )}
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={target.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

// Finestra reattiva del Palazzo di Atlante: si apre subito dopo che un'eliminazione e' andata
// a segno (che sia stata giocata direttamente o dopo un'interruzione rifiutata), a prescindere
// da quando cade il turno normale del suo possessore nel giro di attivazione.
function ReactionResponseFlow({ game, update, showTable }) {
  const pending = game.pendingReaction
  const holder = game.players.find(p => p.id === pending.holderId)
  const card = EQUIPMENT_BY_ID[holder.hand]
  const needsTarget = pending.cardId === 'palazzo_di_atlante'
  const [targetId, setTargetId] = useState('')
  const excludeId = pending.eff?.effect === 'eliminate' ? pending.eff.targetId : null
  const candidates = game.players.filter(p => p.id !== excludeId && p.id !== holder.id)
  return (
    <PassGate playerName={holder.name}>
      <div className="card">
        <div className="eyebrow">{needsTarget ? "Puoi ridirigere l'ultimo effetto" : "Puoi annullare l'ultimo effetto"}</div>
        <h2>Vuoi attivare {card.name}?</h2>
        {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
        <p>{card.description}</p>
        <p>Effetto in questione: <strong>{describeEffect(pending.eff, game.players)}</strong>.</p>
        {needsTarget && (
          <div className="player-list">
            {candidates.map(o => (
              <button key={o.id} className={targetId === o.id ? '' : 'secondary'} onClick={() => setTargetId(o.id)}>{o.name}</button>
            ))}
          </div>
        )}
        <button disabled={needsTarget && !targetId} onClick={() => update(s => engine.resolveReaction(s, true, targetId))}>
          {needsTarget ? 'Ridirigi su questo bersaglio' : 'Annulla questo effetto'}
        </button>
        <button className="secondary" onClick={() => update(s => engine.resolveReaction(s, false))}>Non attivare</button>
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={holder.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

function GhostBlockFlow({ game, update, showTable, onDone }) {
  const remaining = game.pendingGhostBlocks || []
  if (remaining.length === 0) { onDone(); return null }
  const ghost = game.players.find(p => p.id === remaining[0])
  const [targetId, setTargetId] = useState('')
  const participants = game.battle.participants.map(id => game.players.find(p => p.id === id))
  return (
    <PassGate key={ghost.id} playerName={ghost.name}>
      <div className="card">
        <div className="eyebrow">Sei un fantasma</div>
        <h2>Vuoi bloccare un partecipante alla battaglia?</h2>
        <p>Non vedrai il suo favore in battaglia; il suo contributo verra' semplicemente azzerato.</p>
        <div className="player-list">
          {participants.map(p => (
            <button key={p.id} className={targetId === p.id ? '' : 'secondary'} onClick={() => setTargetId(p.id)}>{p.name}</button>
          ))}
        </div>
        <button disabled={!targetId} onClick={() => update(s => engine.ghostBlock(s, ghost.id, targetId))}>Blocca questo partecipante</button>
        <button className="secondary" onClick={() => update(s => engine.ghostBlock(s, ghost.id, null))}>Non bloccare nessuno</button>
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={ghost.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

function Phase1Flow({ game, showTable, onDone }) {
  const [index, setIndex] = useState(0)
  const player = game.players[index]
  const info = engine.getPhase1Info(game, player.id)

  return (
    <PassGate key={player.id} playerName={player.name}>
      <div className="card">
        <div className="eyebrow">Fase 1 &mdash; Rivelazione iniziale</div>
        {info?.type === 'allies' && (
          <>
            <h2>I tuoi alleati di fazione</h2>
            {info.allies.length > 0 ? <ul>{info.allies.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p>Nessun altro alleato di fazione oltre a te.</p>}
          </>
        )}
        {info?.type === 'lover' && (
          <>
            <h2>Il tuo amore segreto</h2>
            <p>{info.loverName} e' {info.loverCharacter}.</p>
          </>
        )}
        {!info && <p>Non hai informazioni private da vedere in questa fase.</p>}
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Ricorda questa informazione e non mostrarla agli altri.</p>
        <button onClick={() => {
          if (index + 1 < game.players.length) setIndex(index + 1)
          else onDone()
        }}>Ho memorizzato, nascondi e continua</button>
      </div>
      {showTable && <SuspicionBoard state={game} viewerId={player.id} storageKeySuffix="-hotseat" />}
    </PassGate>
  )
}

function GameOverScreen({ game }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="eyebrow">Partita conclusa</div>
      <h1 className={game.winner === 'isabella' ? '' : `faction-${game.winner}`}>
        {game.winner === 'isabella' ? 'Vittoria di Isabella, in solitaria!' : `Vittoria ${game.winner === 'cristiana' ? 'Cristiana' : 'Saracena'}!`}
      </h1>
      <BoardView game={game} />
      <PhaseRulesButton phaseKey={`vittoria_${game.winner}`} />
    </div>
  )
}

// --- App principale ---

// Calcola quale schermata di transizione mostrare, in base allo stage locale (setup/roles/
// phase1/phase2) e alla fase del motore. Ogni round rientra in 'alavventura'/'scontro' una
// volta sola, perche' quelle chiavi restano invariate per tutta la durata del sotto-gruppo di
// fasi che rappresentano (vedi usePhaseTransitionGate).
function transitionKeyForHotseat(game, stage) {
  if (!game) return null
  if (game.phase === 'gameover') return `vittoria_${game.winner}`
  if (stage === 'roles') return 'assegnazione'
  if (stage === 'phase1') return 'rivelazione'
  if (['phase2-deal', 'phase2-instant', 'phase2-voluntary'].includes(game.phase)) return 'alavventura'
  if (game.phase === 'phase3-select') return 'chiamata'
  if (game.phase === 'phase3-ghost-block') return 'scontro'
  if (game.phase === 'phase3-reveal') {
    // Una volta che tutti i partecipanti hanno mostrato il favore, mostriamo gia' la
    // schermata di Risoluzione mentre l'Ariosto calcola in sottofondo (il timer esistente
    // non cambia), cosi' l'immagine appare PRIMA che il risultato venga rivelato.
    const allRevealed = game.battle.participants.every(id => game.battle.reveals[id])
    return allRevealed ? 'risoluzione' : 'scontro'
  }
  if (game.phase === 'phase4') return 'risoluzione'
  return null
}

export default function LocalHotseatApp() {
  const [game, setGame] = useState(null)
  const [stage, setStage] = useState('setup') // setup | roles | phase1 | phase2 | result
  const [showTable, setShowTable] = useState(false)
  const [showSupervisor, setShowSupervisor] = useState(false)
  const [showBoard, setShowBoard] = useState(false)

  const update = (fn) => {
    setGame(g => { fn(g); return { ...g } })
  }

  const instantAdvancedRef = React.useRef(false)
  const voluntaryAdvancedRef = React.useRef(false)
  const revealAdvancedRef = React.useRef(false)
  const revealTimerRef = React.useRef(null)

  // Fase 2 - istantanee: avanza automaticamente quando non ce ne sono piu' da risolvere.
  React.useEffect(() => {
    if (!game || game.phase !== 'phase2-instant' || game.pendingInterrupt || game.pendingReaction) { instantAdvancedRef.current = false; return }
    const pendingCount = engine.instantCardsPending(game).length
    if (pendingCount === 0 && !instantAdvancedRef.current) {
      instantAdvancedRef.current = true
      update(s => { s.phase = 'phase2-voluntary' })
    } else if (pendingCount > 0) {
      instantAdvancedRef.current = false
    }
  })

  // Fase 2 - volontarie: avanza automaticamente quando tutti hanno deciso.
  React.useEffect(() => {
    if (!game || game.phase !== 'phase2-voluntary' || game.pendingInterrupt || game.pendingReaction) { voluntaryAdvancedRef.current = false; return }
    const notDecided = engine.voluntaryCardsPending(game).length
    if (notDecided === 0 && !voluntaryAdvancedRef.current) {
      voluntaryAdvancedRef.current = true
      update(s => engine.beginParticipantSelection(s))
    } else if (notDecided > 0) {
      voluntaryAdvancedRef.current = false
    }
  })

  // Fase 3 - rivelazione battaglia: dopo l'ultima rivelazione, calcola il risultato
  // con 5 secondi di ritardo (tensione della battaglia).
  React.useEffect(() => {
    if (!game || game.phase !== 'phase3-reveal') {
      revealAdvancedRef.current = false
      if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null }
      return
    }
    const remaining = game.battle.participants.filter(id => !game.battle.reveals[id]).length
    if (remaining === 0 && !revealAdvancedRef.current) {
      revealAdvancedRef.current = true
      revealTimerRef.current = setTimeout(() => {
        update(s => { engine.resolveBattle(s); engine.applyBoardResult(s) })
      }, 5000)
    } else if (remaining > 0) {
      revealAdvancedRef.current = false
    }
  })

  React.useEffect(() => {
    return () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current) }
  }, [])

  // Calcolato SEMPRE (anche prima che esista una partita), per rispettare le regole degli
  // hook: usePhaseTransitionGate chiama useState internamente e deve essere invocato in
  // ogni render, non solo dopo che game esiste.
  const transitionKey = transitionKeyForHotseat(game, stage)
  const { showTransition, dismiss } = usePhaseTransitionGate(transitionKey)

  if (!game) {
    return (
      <div className="app-shell">
        <SetupScreen onCreate={(names, options) => {
          const g = engine.createGame(names, {
            ...options,
            maxPlayers: 10,
            excludeCardIds: ['anello_di_angelica', 'palazzo_di_atlante']
          })
          setGame(g)
          setStage('roles')
        }} />
      </div>
    )
  }

  if (showTransition) {
    return (
      <div className="app-shell">
        <PhaseTransition phaseKey={transitionKey} onContinue={dismiss} />
      </div>
    )
  }

  if (game.phase === 'gameover') {
    return <div className="app-shell"><GameOverScreen game={game} /></div>
  }

  if (game.pendingInterrupt) {
    return <div className="app-shell"><InterruptResponseFlow game={game} update={update} showTable={showTable} /></div>
  }

  if (game.pendingReaction) {
    return <div className="app-shell"><ReactionResponseFlow game={game} update={update} showTable={showTable} /></div>
  }

  let content = null

  if (stage === 'roles') {
    content = <RoleRevealFlow game={game} showTable={showTable} onDone={() => {
      if (game.needsPhase1) {
        setStage('phase1')
      } else {
        update(s => engine.startRound(s))
        setStage('phase2')
      }
    }} />
  } else if (stage === 'phase1') {
    content = <Phase1Flow game={game} showTable={showTable} onDone={() => { update(s => engine.startRound(s)); setStage('phase2') }} />
  } else if (game.phase === 'phase2-instant') {
    const nextPlayer = engine.instantCardsPending(game)[0]
    content = <InstantCardFlow key={nextPlayer?.id || 'instant-done'} game={game} update={update} showTable={showTable} />
  } else if (game.phase === 'phase2-voluntary') {
    const nextPlayer = engine.voluntaryCardsPending(game)[0]
    content = <VoluntaryCardFlow key={nextPlayer?.id || 'voluntary-done'} game={game} update={update} showTable={showTable} />
  } else if (game.phase === 'phase3-select') {
    content = <ParticipantSelectFlow game={game} update={update} showTable={showTable} onDone={() => {}} />
  } else if (game.phase === 'phase3-ghost-block') {
    content = <GhostBlockFlow game={game} update={update} showTable={showTable} onDone={() => {}} />
  } else if (game.phase === 'phase3-reveal') {
    const nextPlayer = game.battle.participants.find(id => !game.battle.reveals[id])
    content = <BattleRevealFlow key={nextPlayer || 'reveal-done'} game={game} update={update} showTable={showTable} />
  } else if (game.phase === 'phase4') {
    content = <ResultScreen game={game} update={update} showTable={showTable} onNextRound={() => update(s => engine.endRound(s))} />
  }

  return (
    <div className="app-shell">
      <div className="eyebrow">Orlando alle Crociate &mdash; prototipo hotseat</div>
      {content}
      <PhaseRulesButton phaseKey={transitionKey} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '14px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85em', color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={showTable} onChange={e => setShowTable(e.target.checked)} />
          Mostra tavolo e sospetti (privato per ciascun giocatore, dentro il proprio turno)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85em', color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={showSupervisor} onChange={e => {
            if (e.target.checked) {
              const pw = window.prompt('Password amministratore:')
              if (pw === null) return
              if (pw === SUPERVISOR_PASSWORD) setShowSupervisor(true)
              else window.alert('Password amministratore errata.')
            } else {
              setShowSupervisor(false)
            }
          }} />
          Modalita' supervisore (vedi tutto, per test) &mdash; richiede password amministratore
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85em', color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={showBoard} onChange={e => setShowBoard(e.target.checked)} />
          Mostra tabellone e poteri sui tracciati
        </label>
      </div>
      {showSupervisor && <FullPlayersTable players={game.players} equipmentById={EQUIPMENT_BY_ID} />}
      {showBoard && <BoardPowersPanel game={game} />}
      {(game.phase === 'phase2-instant' || game.phase === 'phase2-voluntary') && <CouncilPanel game={game} update={update} />}
      <LogPanel log={game.log} />
    </div>
  )
}
