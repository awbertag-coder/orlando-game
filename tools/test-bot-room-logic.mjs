// Verifica la logica dei bot della "stanza BOT" (copiata qui identica da server/index.js,
// che non la esporta) SENZA bisogno di socket.io: gioca N partite intere con tutti e 6 i posti
// marcati come fantasma, usando il motore vero, per stanare eventuali crash prima di provarla
// per davvero online. Non testa la parte di rete (join, lobby, timer) -- solo la logica di
// decisione dei bot fase per fase.
import * as engine from '../src/engine/gameEngine.js'
import { EQUIPMENT_BY_ID } from '../src/engine/equipment.js'

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
const NEEDS_TARGET_VOLUNTARY = ['eliminate_choice', 'eliminate_adjacent', 'eliminate_draw_on_success', 'steal_equipment']

function isBot() { return true } // in questo test TUTTI i posti sono fantasma

function stepBotAction(state, room) {
  if (!state || state.phase === 'gameover') return false

  // Stesso "ripulisci prima di decidere" che il vero server fa dopo OGNI azione: risolve le
  // istantanee automatiche rimaste in coda e fa avanzare la fase se e' il momento. Mancava
  // in questa catena di bot-su-bot (nel server normale lo fa il gestore dell'azione umana,
  // una volta sola in coda, dopo ogni singola azione).
  engine.resolveNextAutomaticInstants(state)
  if (state.phase === 'phase2-instant' && engine.instantCardsPending(state).length === 0) {
    state.phase = 'phase2-voluntary'
  }

  if (state.phase === 'phase1-reveal') {
    const notAcked = state.players.find(p => !state.phase1Acked.includes(p.id))
    if (notAcked) { engine.ackPhase1(state, notAcked.id); return true }
    return false
  }

  // Ricontrollato ad ogni passo, non solo dopo una decisione volontaria (vedi server/index.js
  // per la spiegazione completa: l'ultima carta a sbloccare "tutti pronti" puo' arrivare anche
  // dal giro delle istantanee).
  if (engine.voluntaryCardsPending(state).length === 0 && engine.allCouncilReady(state) && state.phase === 'phase2-voluntary') {
    engine.beginParticipantSelection(state)
  }

  if (state.pendingInterrupt) {
    engine.resolveInterrupt(state, false)
    if (engine.voluntaryCardsPending(state).length === 0 && engine.allCouncilReady(state)) engine.beginParticipantSelection(state)
    return true
  }
  if (state.pendingReaction) {
    engine.resolveReaction(state, false)
    if (engine.voluntaryCardsPending(state).length === 0 && engine.allCouncilReady(state)) engine.beginParticipantSelection(state)
    return true
  }

  if (state.phase === 'phase2-instant') {
    const player = engine.instantCardsPending(state)[0]
    if (player) {
      const card = EQUIPMENT_BY_ID[player.hand]
      let payload = {}
      if (card.needsTarget === 2) {
        const others = shuffle(state.players.filter(p => p.id !== player.id))
        payload = { targetId: others[0].id, targetId2: others[1].id }
      } else if (card.needsTarget === 1) {
        const others = state.players.filter(p => p.id !== player.id)
        payload = { targetId: pick(others).id }
      }
      engine.resolveInstantCard(state, player.id, payload)
      return true
    }
    return false
  }

  if (state.phase === 'phase2-voluntary') {
    const player = engine.voluntaryCardsPending(state)[0]
    if (player) {
      const card = EQUIPMENT_BY_ID[player.hand]
      const needsTarget = NEEDS_TARGET_VOLUNTARY.includes(card.effect)
      let played = false
      if (card.timing === 'voluntary' && Math.random() < 0.5) {
        if (needsTarget) {
          const others = state.players.filter(p => p.id !== player.id && !p.eliminatedPermanently)
          if (others.length) { engine.playVoluntaryCard(state, player.id, { targetId: pick(others).id }); played = true }
        } else {
          engine.playVoluntaryCard(state, player.id, {}); played = true
        }
      }
      if (!played) engine.passVoluntaryCard(state, player.id)
      engine.setCouncilReady(state, player.id, true)
      if (engine.voluntaryCardsPending(state).length === 0 && engine.allCouncilReady(state)) {
        engine.beginParticipantSelection(state)
      }
      return true
    }
    return false
  }

  if (state.phase === 'phase3-select') {
    const holder = state.players.find(p => p.hasDurindana)
    const forced = engine.forcedParticipants(state)
    const eligible = engine.eligibleParticipants(state)
    const requiredTotal = Math.min(state.participantsBaseline + forced.length, eligible.length)
    const selected = [...forced]
    const pool = shuffle(eligible.filter(id => !forced.includes(id)))
    while (selected.length < requiredTotal && pool.length) selected.push(pool.pop())
    engine.chooseParticipants(state, selected, engine.canSecretlyJoin(state) && Math.random() < 0.3)
    return true
  }

  if (state.phase === 'phase3-ghost-block') {
    const ghostId = (state.pendingGhostBlocks || [])[0]
    if (ghostId) { engine.ghostBlock(state, ghostId, null); return true }
    return false
  }

  if (state.phase === 'phase3-reveal') {
    const pendingId = state.battle.participants.find(id => !state.battle.reveals[id])
    if (pendingId) {
      const p = state.players.find(x => x.id === pendingId)
      const factions = [...new Set(p.favorTiles.map(t => t.faction))]
      engine.revealParticipant(state, pendingId, pick(factions), {})
      if (state.battle.participants.every(id => state.battle.reveals[id])) {
        // nel vero server c'e' un timeout di 5s; qui basta risolvere subito
        engine.resolveBattle(state)
        engine.applyBoardResult(state)
      }
      return true
    }
    return false
  }

  if (state.phase === 'phase4') {
    const power = engine.currentBoardPower(state)
    if (!power) {
      // nel vero server questo tocca sempre all'umano: qui, per completare la partita di test,
      // lo facciamo avanzare comunque (altrimenti nessuna partita finirebbe mai)
      engine.endRound(state)
      return true
    }
    const holder = state.players.find(p => p.hasDurindana)
    if (power.type === 'spie_a_palazzo') {
      const others = state.players.filter(p => p.id !== holder.id)
      engine.resolveSpiePalazzo(state, pick(others).id)
      return true
    }
    if (power.type === 'cercare_amore') {
      const info = engine.cercareAmoreInfo(state)
      if (!info) { state.pendingBoardPowers.shift(); return true }
      const targets = state.players.filter(p => p.id !== info.seekerPlayerId)
      engine.resolveCercareAmore(state, pick(targets).id)
      return true
    }
    if (power.type === 'fendente_mortale') {
      const others = state.players.filter(p => p.id !== holder.id)
      engine.resolveFendenteMortale(state, pick(others).id)
      return true
    }
    return false
  }

  return false
}

function runOneGame() {
  const names = ['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Umano (test)']
  const state = engine.createGame(names, { useEquipment: true })
  // Stesso bootstrap che fa startGameIfReady nel vero server: se non serve la Fase 1
  // (meno di 8 giocatori), il primo round va fatto partire a mano.
  if (!state.needsPhase1) {
    engine.startRound(state)
    engine.resolveNextAutomaticInstants(state)
    if (state.phase === 'phase2-instant' && engine.instantCardsPending(state).length === 0) {
      state.phase = 'phase2-voluntary'
    }
  }
  let guard = 0
  while (state.phase !== 'gameover' && guard < 2000) {
    stepBotAction(state)
    guard++
  }
  return { winner: state.winner, rounds: state.round - 1, guardHit: guard >= 2000 }
}

const N = Number(process.argv[2]) || 300
let crashes = 0
let guardHits = 0
const winners = {}
for (let i = 0; i < N; i++) {
  try {
    const r = runOneGame()
    winners[r.winner] = (winners[r.winner] || 0) + 1
    if (r.guardHit) guardHits++
  } catch (err) {
    crashes++
    console.error(`Partita ${i} in crash:`, err.message)
    if (crashes <= 3) console.error(err.stack)
  }
}
console.log(`\n${N} partite giocate con la logica della stanza BOT (tutti e 6 i posti fantasma).`)
console.log(`Crash: ${crashes}. Partite bloccate (limite di sicurezza): ${guardHits}.`)
console.log(`Vittorie:`, winners)
