// Test di bilanciamento: confronta il roster ATTUALE per le partite 6-8 giocatori con una
// PROPOSTA che toglie le coppie angelica/ruggero e bradamante/medoro (i loro poteri speciali
// non si attivano mai in questa fascia: la Fase 1 esiste solo da 8 in su, e il potere
// "Cercare l'amore" esiste solo sul tabellone 9+) e mette al loro posto rinaldo/ferrau'
// (immuni in battaglia) e astolfo/rodomonte (favore raddoppiato) -- poteri che funzionano
// sempre, a qualunque numero di giocatori.
import * as engine from '../src/engine/gameEngine.js'
import { EQUIPMENT_BY_ID } from '../src/engine/equipment.js'

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
const NEEDS_TARGET_VOLUNTARY = ['eliminate_choice', 'eliminate_adjacent', 'eliminate_draw_on_success', 'steal_equipment']

const CURRENT_BASE = ['orlando', 'agramante', 'angelica', 'ruggero', 'bradamante', 'medoro']
const PROPOSED_BASE = ['orlando', 'agramante', 'rinaldo', 'ferrau', 'astolfo', 'rodomonte']

function rosterFor(base, n) {
  if (n === 6) return [...base]
  if (n === 7) return [...base, Math.random() < 0.5 ? 'gano' : 'marfisa']
  if (n === 8) return [...base, 'gano', 'marfisa']
  throw new Error('Questo script confronta solo 6, 7, 8 giocatori')
}

function playRound(state) {
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
  if (state.phase === 'phase2-instant' && engine.instantCardsPending(state).length === 0) {
    state.phase = 'phase2-voluntary'
  }

  let wasPareggio = false
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
  wasPareggio = state.battle.result.winner === 'pareggio'
  engine.applyBoardResult(state)

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
        state.pendingBoardPowers.shift()
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

function runOneGame(base, n) {
  const names = Array.from({ length: n }, (_, i) => `P${i + 1}`)
  const state = engine.createGame(names, { useEquipment: true, rosterOverride: rosterFor(base, n) })
  if (state.needsPhase1) {
    for (const p of state.players) engine.ackPhase1(state, p.id)
  }
  const SAFETY_CAP = 400
  let rounds = 0
  let pareggioRounds = 0
  let safetyHit = false
  while (state.phase !== 'gameover') {
    if (playRound(state)) pareggioRounds++
    rounds++
    if (rounds > SAFETY_CAP) { safetyHit = true; break }
  }
  const hadTraitor = state.players.some(p => p.isTraitor)
  return {
    winner: state.winner,
    rounds: state.round - 1,
    pareggioRounds,
    hadTraitor,
    ganoMarfisaSwitched: state.ganoMarfisaSwitched,
    switchRound: state.ganoMarfisaSwitchRound,
    safetyHit
  }
}

function runBatch(label, base, n, count) {
  const results = []
  for (let i = 0; i < count; i++) results.push(runOneGame(base, n))

  const roundsArr = results.map(r => r.rounds).sort((a, b) => a - b)
  const avg = roundsArr.reduce((a, b) => a + b, 0) / count
  const median = roundsArr[Math.floor(count / 2)]
  const min = roundsArr[0]
  const max = roundsArr[roundsArr.length - 1]
  const safetyHits = results.filter(r => r.safetyHit).length

  const totalRounds = results.reduce((a, r) => a + r.rounds, 0)
  const totalPareggi = results.reduce((a, r) => a + r.pareggioRounds, 0)
  const pareggioPct = totalRounds > 0 ? (totalPareggi / totalRounds) * 100 : 0

  const withTraitor = results.filter(r => r.hadTraitor)
  const switchRound = withTraitor[0]?.switchRound ?? 'n/d'
  const reachedThreshold = results.filter(r => r.rounds > (withTraitor[0]?.switchRound ?? 6)).length
  const traitorSwitchRate = withTraitor.length > 0
    ? (withTraitor.filter(r => r.ganoMarfisaSwitched).length / withTraitor.length) * 100
    : null

  const winners = {}
  for (const r of results) winners[r.winner] = (winners[r.winner] || 0) + 1

  console.log(`\n=== ${label} (${n} giocatori, ${count} partite) ===`)
  console.log(`Durata (round): media ${avg.toFixed(2)}, mediana ${median}, min ${min}, max ${max}`)
  console.log(`Pareggi: ${totalPareggi}/${totalRounds} round giocati in totale sono finiti in pareggio (${pareggioPct.toFixed(1)}%)`)
  if (withTraitor.length > 0) {
    console.log(`Partite con Gano o Marfisa nel roster: ${withTraitor.length}/${count} (${(withTraitor.length / count * 100).toFixed(1)}%), soglia cambio: turno ${switchRound}`)
    console.log(`Partite oltre soglia: ${reachedThreshold}/${count} (${(reachedThreshold / count * 100).toFixed(1)}%)`)
    console.log(`Di queste, cambio fazione scattato davvero: ${traitorSwitchRate.toFixed(1)}%`)
  } else {
    console.log(`Nessun Gano/Marfisa possibile a questo numero di giocatori.`)
  }
  console.log(`Vittorie per esito:`, winners)
  if (safetyHits > 0) console.log(`ATTENZIONE: ${safetyHits} partite non concluse entro ${400} round.`)

  return { label, n, avg, pareggioPct, reachedThreshold, count, traitorSwitchRate, withTraitorCount: withTraitor.length }
}

const N = Number(process.argv[2]) || 3000
console.log(`Test di bilanciamento roster 6-8 giocatori: ${N} partite per configurazione.`)

const summary = []
for (const n of [7, 8]) {
  summary.push(runBatch('Roster ATTUALE', CURRENT_BASE, n, N))
  summary.push(runBatch('Roster PROPOSTO (rinaldo/ferrau\' + astolfo/rodomonte)', PROPOSED_BASE, n, N))
}

console.log('\n=== RIEPILOGO ===')
for (const r of summary) {
  console.log(`${r.label} @ ${r.n}p: media ${r.avg.toFixed(2)} round, pareggi ${r.pareggioPct.toFixed(1)}%, cambio Gano/Marfisa (quando presenti) ${r.traitorSwitchRate?.toFixed(1) ?? 'n/d'}%`)
}
