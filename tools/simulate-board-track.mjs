// Simulatore di partite con bot: usa il VERO motore (src/engine/gameEngine.js) per
// giocare partite intere in automatico, in modo da misurare statistiche (durata,
// frequenza del cambio fazione di Gano/Marfisa, ecc.) senza dover giocare a mano.
//
// Uso: node tools/simulate-board-track.mjs
// (nessuna dipendenza esterna, solo Node + i file del motore)

import * as engine from '../src/engine/gameEngine.js'
import { EQUIPMENT_BY_ID } from '../src/engine/equipment.js'

const NEEDS_TARGET_VOLUNTARY = ['eliminate_choice', 'eliminate_adjacent', 'eliminate_draw_on_success', 'steal_equipment']

// Nota: il tabellone e il punteggio di partenza sono ormai decisi dal motore stesso
// (createGame, in base al numero di giocatori) -- questo script testa quindi il
// comportamento REALE di gioco, senza piu' bisogno di forzare tracciati finti.

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }

function playRound(state) {
  // --- Fase 2: carte istantanee ---
  engine.resolveNextAutomaticInstants(state)
  while (engine.instantCardsPending(state).length > 0) {
    const player = engine.instantCardsPending(state)[0]
    const card = EQUIPMENT_BY_ID[player.hand]
    if (card.needsTarget === 2) {
      const others = shuffle(state.players.filter(p => p.id !== player.id))
      engine.resolveInstantCard(state, player.id, { targetId: others[0].id, targetId2: others[1].id })
    } else if (card.needsTarget === 1) {
      const others = state.players.filter(p => p.id !== player.id)
      engine.resolveInstantCard(state, player.id, { targetId: pick(others).id })
    } else {
      engine.resolveInstantCard(state, player.id, {})
    }
    engine.resolveNextAutomaticInstants(state)
  }
  state.phase = 'phase2-voluntary'

  // --- Fase 2: carte volontarie (+ eventuali finestre di interruzione/reazione) ---
  while (engine.voluntaryCardsPending(state).length > 0) {
    const player = engine.voluntaryCardsPending(state)[0]
    const card = EQUIPMENT_BY_ID[player.hand]
    const isPlayable = card.timing === 'voluntary'
    const needsTarget = NEEDS_TARGET_VOLUNTARY.includes(card.effect)
    let didPlay = false
    if (isPlayable && Math.random() < 0.55) {
      let targets = {}
      if (needsTarget) {
        const others = state.players.filter(p => p.id !== player.id && !p.eliminatedPermanently)
        if (others.length > 0) { targets = { targetId: pick(others).id }; didPlay = true }
      } else {
        didPlay = true
      }
      if (didPlay) engine.playVoluntaryCard(state, player.id, targets)
    }
    if (!didPlay) engine.passVoluntaryCard(state, player.id)

    while (state.pendingInterrupt) {
      engine.resolveInterrupt(state, Math.random() < 0.6)
    }
    while (state.pendingReaction) {
      const activate = Math.random() < 0.5
      let targetId = null
      if (activate && state.pendingReaction.cardId === 'palazzo_di_atlante') {
        const holder = state.players.find(p => p.id === state.pendingReaction.holderId)
        const others = state.players.filter(p => p.id !== holder.id)
        targetId = others.length ? pick(others).id : null
      }
      engine.resolveReaction(state, activate, targetId)
    }
  }

  engine.beginParticipantSelection(state)

  // --- Fase 3: selezione partecipanti ---
  const forced = engine.forcedParticipants(state)
  const eligible = engine.eligibleParticipants(state)
  const requiredTotal = Math.min(state.participantsBaseline + forced.length, eligible.length)
  const selected = [...forced]
  const pool = shuffle(eligible.filter(id => !forced.includes(id)))
  while (selected.length < requiredTotal && pool.length > 0) selected.push(pool.pop())
  const selfJoin = engine.canSecretlyJoin(state) && Math.random() < 0.3
  engine.chooseParticipants(state, selected, selfJoin)

  while (state.phase === 'phase3-ghost-block' && state.pendingGhostBlocks?.length) {
    const ghostId = state.pendingGhostBlocks[0]
    let targetId = null
    if (Math.random() < 0.5) {
      const targets = state.battle.participants.filter(id => id !== ghostId)
      if (targets.length) targetId = pick(targets)
    }
    engine.ghostBlock(state, ghostId, targetId)
  }

  // --- Fase 3/4: rivelazione favore ---
  for (const pid of state.battle.participants) {
    const p = state.players.find(x => x.id === pid)
    if (!p) continue
    const factions = [...new Set(p.favorTiles.map(t => t.faction))]
    const chosenFaction = pick(factions)
    const options = {}
    const handCard = p.hand ? EQUIPMENT_BY_ID[p.hand] : null
    if (handCard?.timing === 'battle') {
      if (handCard.effect === 'battle_all_others_penalty') options.useOptionalCard = Math.random() < 0.6
      if (handCard.effect === 'battle_block_blind') {
        const others = state.battle.participants.filter(id => id !== pid)
        if (others.length) options.blockTargetId = pick(others)
      }
    }
    engine.revealParticipant(state, pid, chosenFaction, options)
  }

  engine.resolveBattle(state)
  const wasPareggio = state.battle.result.winner === 'pareggio'
  engine.applyBoardResult(state)

  // --- Poteri del tabellone ---
  while (state.pendingBoardPowers.length > 0 && state.phase !== 'gameover') {
    const power = engine.currentBoardPower(state)
    const durindanaHolder = state.players.find(p => p.hasDurindana)
    if (power.type === 'spie_a_palazzo') {
      const others = state.players.filter(p => p.id !== durindanaHolder.id)
      engine.resolveSpiePalazzo(state, pick(others).id)
    } else if (power.type === 'cercare_amore') {
      const info = engine.cercareAmoreInfo(state)
      if (info) {
        const targets = state.players.filter(p => p.id !== info.seekerPlayerId)
        engine.resolveCercareAmore(state, pick(targets).id)
      } else {
        state.pendingBoardPowers.shift() // il seeker di questa fazione non e' nella partita
      }
    } else if (power.type === 'fendente_mortale') {
      const others = state.players.filter(p => p.id !== durindanaHolder.id)
      engine.resolveFendenteMortale(state, pick(others).id)
    } else {
      state.pendingBoardPowers.shift()
    }
  }

  if (state.phase !== 'gameover') engine.endRound(state)
  return wasPareggio
}

function runOneGame(playerCount, { boardTrackOverride = null, switchRound = null } = {}) {
  const names = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`)
  const createOptions = { useEquipment: true }
  if (switchRound) createOptions.ganoMarfisaSwitchRound = switchRound
  const state = engine.createGame(names, createOptions)
  if (boardTrackOverride) state.boardTrack = boardTrackOverride

  if (state.needsPhase1) {
    for (const p of state.players) engine.ackPhase1(state, p.id)
  }

  const SAFETY_CAP = 400
  let rounds = 0
  let pareggioRounds = 0
  let safetyHit = false
  while (state.phase !== 'gameover') {
    const wasPareggio = playRound(state)
    if (wasPareggio) pareggioRounds++
    rounds++
    if (rounds > SAFETY_CAP) { safetyHit = true; break }
  }

  const hadTraitor = state.players.some(p => p.isTraitor)
  return {
    winner: state.winner,
    rounds: state.round - 1, // state.round e' gia' stato incrementato per il round successivo
    pareggioRounds,
    hadTraitor,
    ganoMarfisaSwitched: state.ganoMarfisaSwitched,
    safetyHit
  }
}

function runBatch(label, playerCount, n, opts = {}) {
  const results = []
  for (let i = 0; i < n; i++) {
    results.push(runOneGame(playerCount, opts))
  }
  const switchRound = opts.switchRound || (playerCount < 9 ? 6 : 7)

  const roundsArr = results.map(r => r.rounds).sort((a, b) => a - b)
  const avg = roundsArr.reduce((a, b) => a + b, 0) / n
  const median = roundsArr[Math.floor(n / 2)]
  const min = roundsArr[0]
  const max = roundsArr[roundsArr.length - 1]
  const safetyHits = results.filter(r => r.safetyHit).length

  const withTraitor = results.filter(r => r.hadTraitor)
  const traitorSwitchRate = withTraitor.length > 0
    ? (withTraitor.filter(r => r.ganoMarfisaSwitched).length / withTraitor.length) * 100
    : null

  const winners = {}
  for (const r of results) winners[r.winner] = (winners[r.winner] || 0) + 1

  const totalRounds = results.reduce((a, r) => a + r.rounds, 0)
  const totalPareggi = results.reduce((a, r) => a + r.pareggioRounds, 0)
  const pareggioPct = totalRounds > 0 ? (totalPareggi / totalRounds) * 100 : 0
  const gamesWithAtLeastOnePareggio = results.filter(r => r.pareggioRounds > 0).length

  // Quante partite arrivano davvero oltre la soglia di cambio (l'unico momento in cui
  // Gano/Marfisa potrebbero cambiare fazione, dato che il cambio scatta solo se la
  // partita non finisce entro quel turno).
  const reachedRound8 = results.filter(r => r.rounds > switchRound).length

  console.log(`\n=== ${label} (${playerCount} giocatori, ${n} partite, soglia cambio: turno ${switchRound}) ===`)
  console.log(`Durata (round): media ${avg.toFixed(2)}, mediana ${median}, min ${min}, max ${max}`)
  console.log(`Pareggi: ${totalPareggi}/${totalRounds} round giocati in totale sono finiti in pareggio (${pareggioPct.toFixed(1)}%)`)
  console.log(`Partite con almeno un pareggio durante il percorso: ${gamesWithAtLeastOnePareggio}/${n} (${(gamesWithAtLeastOnePareggio / n * 100).toFixed(1)}%)`)
  console.log(`Partite che superano il turno ${switchRound} (unico caso in cui Gano/Marfisa POTREBBERO cambiare): ${reachedRound8}/${n} (${(reachedRound8 / n * 100).toFixed(1)}%)`)
  console.log(`Partite con Gano o Marfisa nel roster: ${withTraitor.length}/${n} (${(withTraitor.length / n * 100).toFixed(1)}%)`)
  if (traitorSwitchRate !== null) {
    console.log(`Di queste, quante hanno visto il cambio fazione scattare davvero: ${traitorSwitchRate.toFixed(1)}%`)
  }
  console.log(`Vittorie per esito:`, winners)
  if (safetyHits > 0) console.log(`ATTENZIONE: ${safetyHits} partite hanno superato il limite di sicurezza di ${400} round senza concludersi.`)

  return { label, playerCount, n, avg, median, min, max, reachedRound8, withTraitorCount: withTraitor.length, traitorSwitchRate, pareggioPct, gamesWithAtLeastOnePareggio, winners, safetyHits }
}

const N = Number(process.argv[2]) || 1000
console.log(`Simulazione di ${N} partite per configurazione (motore reale, decisioni bot casuali con probabilita\u0300 ragionevoli).`)

const results = []
results.push(runBatch('Config. attuale (6-8 giocatori)', 7, N))
results.push(runBatch('Config. attuale (9+ giocatori)', 11, N))

console.log('\n=== RIEPILOGO ===')
for (const r of results) {
  console.log(`${r.label} @ ${r.playerCount}p: media ${r.avg.toFixed(2)} round, oltre soglia ${(r.reachedRound8 / r.n * 100).toFixed(1)}%, cambio Gano/Marfisa (quando presenti) ${r.traitorSwitchRate?.toFixed(1) ?? 'n/d'}%`)
}
