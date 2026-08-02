import { createServer } from 'http'
import { Server } from 'socket.io'
import crypto from 'crypto'
import * as engine from '../src/engine/gameEngine.js'
import { EQUIPMENT_BY_ID } from '../src/engine/equipment.js'
import { redactForViewer, redactForSupervisor } from './redact.js'

const PORT = process.env.PORT || 3001

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Server di Orlando alle Crociate attivo.\n')
})
const io = new Server(httpServer, { cors: { origin: '*' } })

// rooms[roomCode] = { players: [...], supervisors: [socketId,...], requiredPlayers, useEquipment, game: null|stato }
const rooms = {}

function getOrCreateRoom(roomCode, requiredPlayers, useEquipment) {
  if (!rooms[roomCode]) {
    // Stanza speciale "BOT": per testare la modalita' online senza dover radunare 6 persone
    // vere. Si popola subito con 5 giocatori fantasma (nessun socket, decidono da soli) e
    // basta che una sola persona vera si unisca per far partire la partita.
    if (roomCode === 'BOT') {
      const bots = Array.from({ length: 5 }, (_, i) => ({
        token: crypto.randomUUID(), name: `Bot ${i + 1}`, socketId: null, connected: true, playerId: null, isBot: true
      }))
      rooms[roomCode] = { players: bots, supervisors: [], requiredPlayers: 6, useEquipment: true, game: null, voiceLink: null }
    } else {
      rooms[roomCode] = { players: [], supervisors: [], requiredPlayers: requiredPlayers || 6, useEquipment: useEquipment !== false, game: null, voiceLink: null }
    }
  }
  return rooms[roomCode]
}

function lobbyPayload(room) {
  return {
    players: room.players.map(p => ({ name: p.name, connected: p.connected })),
    required: room.requiredPlayers,
    useEquipment: room.useEquipment,
    started: !!room.game,
    voiceLink: room.voiceLink || null
  }
}

function broadcastLobby(roomCode) {
  io.to(roomCode).emit('lobby', lobbyPayload(rooms[roomCode]))
  broadcastOpenRooms()
}

// Elenco pubblico delle stanze ancora in attesa di giocatori (partita non iniziata),
// mandato a TUTTI i client connessi (anche a chi non e' ancora entrato in nessuna stanza),
// cosi' chi apre il gioco puo' vedere/scegliere una stanza aperta invece di dover
// conoscere gia' un codice.
function getOpenRoomsList() {
  return Object.entries(rooms)
    .filter(([, r]) => !r.game && r.players.length > 0)
    .map(([code, r]) => ({
      roomCode: code,
      playerCount: r.players.length,
      requiredPlayers: r.requiredPlayers,
      useEquipment: r.useEquipment
    }))
}

function broadcastOpenRooms() {
  io.emit('openRooms', getOpenRoomsList())
}

function _broadcastState(roomCode) {
  const room = rooms[roomCode]
  if (!room || !room.game) return
  for (const p of room.players) {
    if (!p.socketId) continue
    io.to(p.socketId).emit('state', { ...redactForViewer(room.game, p.playerId), voiceLink: room.voiceLink || null })
  }
  for (const socketId of room.supervisors) {
    io.to(socketId).emit('supervisorState', { ...redactForSupervisor(room.game), voiceLink: room.voiceLink || null })
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
const NEEDS_TARGET_VOLUNTARY = ['eliminate_choice', 'eliminate_adjacent', 'eliminate_draw_on_success', 'steal_equipment']

function isBot(room, playerId) {
  return !!room.players.find(p => p.playerId === playerId)?.isBot
}

// Compie UNA sola decisione per un giocatore fantasma, se in questo momento tocca proprio a
// uno di loro (istantanea, volontaria, bersaglio di un'interruzione/reazione, partecipanti,
// blocco fantasma, rivelazione favore, potere del tabellone). Ritorna true se ha agito (cosi'
// il chiamante puo' richiamarla per far avanzare la catena finche' non tocca a un umano).
// "Prossimo round" resta SEMPRE all'umano: i bot non lo premono mai, per non forzargli il
// ritmo sulle schermate di risultato.
function stepBotAction(room, roomCode) {
  const state = room.game
  if (!state || state.phase === 'gameover') return false

  if (state.phase === 'phase1-reveal') {
    const notAcked = state.players.find(p => !state.phase1Acked.includes(p.id) && isBot(room, p.id))
    if (notAcked) { engine.ackPhase1(state, notAcked.id); return true }
    return false
  }

  // Ricontrollato ad ogni passo (non solo dopo una decisione volontaria): l'ultima carta a
  // sbloccare "tutti pronti" puo' arrivare anche dal giro delle istantanee (es. una carta
  // extra pescata in coda), che altrimenti non lo ricontrollerebbe mai da solo.
  maybeAdvanceToSelection(state)

  // I fantasmi non attivano mai di propria iniziativa Parata/Orrilo/Anello/Palazzo: rispondono
  // sempre "no", subito, senza aspettare il timer (che resta solo per gli umani).
  if (state.pendingInterrupt && isBot(room, state.pendingInterrupt.targetId)) {
    clearInterruptTimeout(room)
    engine.resolveInterrupt(state, false)
    maybeAdvanceToSelection(state)
    return true
  }
  if (state.pendingReaction && isBot(room, state.pendingReaction.holderId)) {
    clearReactionTimeout(room)
    engine.resolveReaction(state, false)
    maybeAdvanceToSelection(state)
    return true
  }

  if (state.phase === 'phase2-instant') {
    const player = engine.instantCardsPending(state)[0]
    if (player && isBot(room, player.id)) {
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
    if (player && isBot(room, player.id)) {
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
      maybeAdvanceToSelection(state)
      return true
    }
    return false
  }

  if (state.phase === 'phase3-select') {
    const holder = state.players.find(p => p.hasDurindana)
    if (isBot(room, holder.id)) {
      const forced = engine.forcedParticipants(state)
      const eligible = engine.eligibleParticipants(state)
      const requiredTotal = Math.min(state.participantsBaseline + forced.length, eligible.length)
      const selected = [...forced]
      const pool = shuffle(eligible.filter(id => !forced.includes(id)))
      while (selected.length < requiredTotal && pool.length) selected.push(pool.pop())
      engine.chooseParticipants(state, selected, engine.canSecretlyJoin(state) && Math.random() < 0.3)
      return true
    }
    return false
  }

  if (state.phase === 'phase3-ghost-block') {
    const ghostId = (state.pendingGhostBlocks || [])[0]
    if (ghostId && isBot(room, ghostId)) { engine.ghostBlock(state, ghostId, null); return true }
    return false
  }

  if (state.phase === 'phase3-reveal') {
    const pendingId = state.battle.participants.find(id => !state.battle.reveals[id] && isBot(room, id))
    if (pendingId) {
      const p = state.players.find(x => x.id === pendingId)
      const factions = [...new Set(p.favorTiles.map(t => t.faction))]
      engine.revealParticipant(state, pendingId, pick(factions), {})
      if (state.battle.participants.every(id => state.battle.reveals[id]) && !room.battleResolveTimer) {
        room.battleResolveTimer = setTimeout(() => {
          room.battleResolveTimer = null
          engine.resolveBattle(state)
          engine.applyBoardResult(state)
          broadcastState(roomCode)
        }, 5000)
      }
      return true
    }
    return false
  }

  if (state.phase === 'phase4') {
    const power = engine.currentBoardPower(state)
    if (!power) return false // "prossimo round" resta sempre all'umano
    const holder = state.players.find(p => p.hasDurindana)
    if (power.type === 'spie_a_palazzo' && isBot(room, holder.id)) {
      const others = state.players.filter(p => p.id !== holder.id)
      engine.resolveSpiePalazzo(state, pick(others).id)
      return true
    }
    if (power.type === 'cercare_amore') {
      const info = engine.cercareAmoreInfo(state)
      if (!info) { state.pendingBoardPowers.shift(); return true }
      if (isBot(room, info.seekerPlayerId)) {
        const targets = state.players.filter(p => p.id !== info.seekerPlayerId)
        engine.resolveCercareAmore(state, pick(targets).id)
        return true
      }
    }
    if (power.type === 'fendente_mortale' && isBot(room, holder.id)) {
      const others = state.players.filter(p => p.id !== holder.id)
      engine.resolveFendenteMortale(state, pick(others).id)
      return true
    }
    return false
  }

  return false
}

function runBotActions(roomCode) {
  const room = rooms[roomCode]
  if (!room || !room.game) return
  let guard = 0
  while (stepBotAction(room, roomCode) && guard < 200) guard++
}

// Fa avanzare prima tutte le decisioni che spettano ai giocatori fantasma (se la stanza ne
// ha), poi manda lo stato come sempre. Cosi' l'unico punto di aggancio serve per tutti i punti
// del server che gia' chiamavano broadcastState (fine di un'azione, timer scaduti, ecc.).
function broadcastState(roomCode) {
  runBotActions(roomCode)
  _broadcastState(roomCode)
}

function findPlayerByToken(room, token) {
  return room.players.find(p => p.token === token)
}

const INTERRUPT_TIMEOUT_MS = 5000
// Password della modalita' amministratore (supervisore). Controllata solo lato server,
// cosi' non finisce in chiaro nel bundle JS mandato ai client.
const SUPERVISOR_PASSWORD = 'Admin!!!'

// Se tutte le carte volontarie sono state decise e non c'e' nessuna interruzione/reazione
// ancora pendente, apre il Consiglio di guerra. Va richiamata dopo ogni azione che potrebbe
// aver deciso l'ultima carta rimasta (giocarla, passare, o risolvere un'interruzione/reazione,
// anche quando si risolve da sola per timeout).
// FIX: in modalita' online mancava qualunque transizione automatica da "tutte le carte
// volontarie decise" a Fase 3 -- con le carte equipaggiamento attive il gioco sarebbe
// rimasto bloccato in Fase 2 per sempre. Va richiamata dopo ogni azione che potrebbe aver
// deciso l'ultima carta rimasta (giocarla, passare, risolvere un'interruzione/reazione,
// anche quando si risolve da sola per timeout).
// FIX: mancava completamente anche questa transizione online (fase2-instant -> fase2-voluntary):
// una volta risolte tutte le istantanee, nulla faceva mai avanzare la fase. In hotseat esiste
// gia' (il client la gestisce da solo); qui va fatta lato server.
function maybeAdvanceToVoluntary(state) {
  if (state.phase === 'phase2-instant' && engine.instantCardsPending(state).length === 0) {
    state.phase = 'phase2-voluntary'
  }
}

function maybeAdvanceToSelection(state) {
  if (state.phase === 'phase2-voluntary' && !state.pendingInterrupt && !state.pendingReaction &&
      engine.voluntaryCardsPending(state).length === 0 && engine.allCouncilReady(state)) {
    engine.beginParticipantSelection(state)
  }
}

// In modalita' online, la finestra di interruzione (Parata/Orrilo) non resta aperta
// a tempo indeterminato: il possessore ha 5 secondi per decidere, altrimenti la carta
// non si attiva (equivale a "non rispondere"). Il timer e' gestito lato server, che e'
// l'unica fonte di verita' temporale condivisa da tutti i client.
function scheduleInterruptTimeout(roomCode) {
  const room = rooms[roomCode]
  if (!room || !room.game || room.interruptTimer) return
  const state = room.game
  if (!state.pendingInterrupt) return
  state.pendingInterrupt.deadline = Date.now() + INTERRUPT_TIMEOUT_MS
  room.interruptTimer = setTimeout(() => {
    room.interruptTimer = null
    if (room.game && room.game.pendingInterrupt) {
      engine.resolveInterrupt(room.game, false)
      engine.resolveNextAutomaticInstants(room.game)
      if (room.game.pendingInterrupt) scheduleInterruptTimeout(roomCode)
      if (room.game.pendingReaction) scheduleReactionTimeout(roomCode)
      maybeAdvanceToSelection(room.game)
      broadcastState(roomCode)
    }
  }, INTERRUPT_TIMEOUT_MS)
}

function clearInterruptTimeout(room) {
  if (room.interruptTimer) {
    clearTimeout(room.interruptTimer)
    room.interruptTimer = null
  }
}

const REACTION_TIMEOUT_MS = 10000

// Stesso trattamento a tempo dell'interruzione, ma per la finestra reattiva del Palazzo di
// Atlante (che puo' aprirsi anche in seguito a un'interruzione rifiutata, non solo subito).
function scheduleReactionTimeout(roomCode) {
  const room = rooms[roomCode]
  if (!room || !room.game || room.reactionTimer) return
  const state = room.game
  if (!state.pendingReaction) return
  state.pendingReaction.deadline = Date.now() + REACTION_TIMEOUT_MS
  room.reactionTimer = setTimeout(() => {
    room.reactionTimer = null
    if (room.game && room.game.pendingReaction) {
      engine.resolveReaction(room.game, false)
      engine.resolveNextAutomaticInstants(room.game)
      if (room.game.pendingInterrupt) scheduleInterruptTimeout(roomCode)
      if (room.game.pendingReaction) scheduleReactionTimeout(roomCode)
      maybeAdvanceToSelection(room.game)
      broadcastState(roomCode)
    }
  }, REACTION_TIMEOUT_MS)
}

function clearReactionTimeout(room) {
  if (room.reactionTimer) {
    clearTimeout(room.reactionTimer)
    room.reactionTimer = null
  }
}

function startGameIfReady(roomCode) {
  const room = rooms[roomCode]
  if (!room.game && room.players.length === room.requiredPlayers) {
    const names = room.players.map(p => p.name)
    room.game = engine.createGame(names, { useEquipment: room.useEquipment })
    room.players.forEach((p, i) => { p.playerId = room.game.players[i].id })
    if (!room.game.needsPhase1) {
      engine.startRound(room.game)
      engine.resolveNextAutomaticInstants(room.game)
      maybeAdvanceToVoluntary(room.game)
    }
    broadcastLobby(roomCode)
    broadcastState(roomCode)
  }
}

io.on('connection', (socket) => {
  socket.emit('openRooms', getOpenRoomsList())

  socket.on('join', ({ roomCode, name, token, playerCount, useEquipment }) => {
    if (!roomCode || !name) return
    roomCode = roomCode.trim().toUpperCase()
    const room = getOrCreateRoom(roomCode, playerCount, useEquipment)
    socket.join(roomCode)
    socket.data.roomCode = roomCode

    let player = token ? findPlayerByToken(room, token) : null

    if (!player) {
      if (room.game) {
        socket.emit('joinError', 'La partita in questa stanza e\' gia\' iniziata.')
        return
      }
      if (room.players.length >= room.requiredPlayers) {
        socket.emit('joinError', `La stanza e\' gia\' piena (${room.requiredPlayers} giocatori).`)
        return
      }
      player = { token: crypto.randomUUID(), name, socketId: socket.id, connected: true, playerId: null }
      room.players.push(player)
    } else {
      player.socketId = socket.id
      player.connected = true
    }

    socket.data.token = player.token
    socket.emit('joined', { token: player.token, roomCode, name: player.name })
    broadcastLobby(roomCode)

    if (room.game && player.playerId) {
      socket.emit('state', redactForViewer(room.game, player.playerId))
    }

    startGameIfReady(roomCode)
  })

  // Un dispositivo puo' collegarsi come "supervisore": vede tutto, ma non e' un
  // giocatore e non occupa uno dei posti richiesti.
  socket.on('joinSupervisor', ({ roomCode, password }) => {
    if (!roomCode) return
    if (password !== SUPERVISOR_PASSWORD) {
      socket.emit('supervisorJoinError', 'Password amministratore errata.')
      return
    }
    roomCode = roomCode.trim().toUpperCase()
    const room = getOrCreateRoom(roomCode)
    socket.join(roomCode)
    socket.data.roomCode = roomCode
    socket.data.isSupervisor = true
    room.supervisors.push(socket.id)
    socket.emit('supervisorJoined', { roomCode })
    if (room.game) socket.emit('supervisorState', redactForSupervisor(room.game))
  })

  socket.on('action', ({ type, payload }) => {
    const roomCode = socket.data.roomCode
    const token = socket.data.token
    if (!roomCode || !token) return
    const room = rooms[roomCode]
    if (!room || !room.game) return
    const sender = findPlayerByToken(room, token)
    if (!sender || !sender.playerId) return
    const state = room.game
    const myId = sender.playerId

    try {
      switch (type) {
        case 'resolveInterrupt': {
          if (!state.pendingInterrupt || state.pendingInterrupt.targetId !== myId) return
          clearInterruptTimeout(room)
          engine.resolveInterrupt(state, !!payload.playCard)
          maybeAdvanceToSelection(state)
          break
        }
        case 'resolveReaction': {
          if (!state.pendingReaction || state.pendingReaction.holderId !== myId) return
          clearReactionTimeout(room)
          engine.resolveReaction(state, !!payload.activate, payload.targetId)
          maybeAdvanceToSelection(state)
          break
        }
        case 'ackPhase1': {
          if (state.phase !== 'phase1-reveal') return
          engine.ackPhase1(state, myId)
          break
        }
        case 'resolveInstant': {
          const pending = engine.instantCardsPending(state)
          if (pending[0]?.id !== myId) return
          engine.resolveInstantCard(state, myId, payload)
          maybeAdvanceToSelection(state)
          break
        }
        case 'playVoluntary': {
          const notDecided = engine.voluntaryCardsPending(state)
          if (notDecided[0]?.id !== myId) return
          engine.playVoluntaryCard(state, myId, payload)
          maybeAdvanceToSelection(state)
          break
        }
        case 'passVoluntary': {
          const notDecided = engine.voluntaryCardsPending(state)
          if (notDecided[0]?.id !== myId) return
          engine.passVoluntaryCard(state, myId)
          maybeAdvanceToSelection(state)
          break
        }
        case 'addCouncilMessage': {
          if (state.phase !== 'phase2-instant' && state.phase !== 'phase2-voluntary') return
          engine.addCouncilMessage(state, myId, payload.text)
          break
        }
        case 'setCouncilReady': {
          if (state.phase !== 'phase2-instant' && state.phase !== 'phase2-voluntary') return
          engine.setCouncilReady(state, myId, !!payload.ready)
          maybeAdvanceToSelection(state)
          break
        }
        case 'chooseParticipants': {
          const durindanaHolder = state.players.find(p => p.hasDurindana)
          if (state.phase !== 'phase3-select' || durindanaHolder.id !== myId) return
          engine.chooseParticipants(state, payload.chosenIds, !!payload.secretSelfJoin)
          break
        }
        case 'ghostBlock': {
          if (state.phase !== 'phase3-ghost-block') return
          if (!(state.pendingGhostBlocks || []).includes(myId)) return
          engine.ghostBlock(state, myId, payload.targetId || null)
          break
        }
        case 'revealParticipant': {
          if (state.phase !== 'phase3-reveal') return
          // Tutti i partecipanti possono rivelare il favore contemporaneamente (non piu' uno
          // alla volta in ordine di turno): basta essere in battaglia e non aver gia' rivelato.
          if (!state.battle.participants.includes(myId) || state.battle.reveals[myId]) return
          engine.revealParticipant(state, myId, payload.faction, payload)
          if (state.battle.participants.every(id => state.battle.reveals[id])) {
            setTimeout(() => {
              engine.resolveBattle(state)
              engine.applyBoardResult(state)
              broadcastState(roomCode)
            }, 5000)
          }
          break
        }
        case 'resolveSpiePalazzo': {
          const durindanaHolder = state.players.find(p => p.hasDurindana)
          const power = engine.currentBoardPower(state)
          if (power?.type !== 'spie_a_palazzo' || durindanaHolder.id !== myId) return
          const result = engine.resolveSpiePalazzo(state, payload.targetId)
          socket.emit('secretInfo', { type: 'spie_a_palazzo', ...result })
          break
        }
        case 'resolveCercareAmore': {
          const info = engine.cercareAmoreInfo(state)
          if (!info || info.seekerPlayerId !== myId) return
          const result = engine.resolveCercareAmore(state, payload.targetId)
          socket.emit('secretInfo', { type: 'cercare_amore', ...result })
          break
        }
        case 'resolveFendenteMortale': {
          const durindanaHolder = state.players.find(p => p.hasDurindana)
          const power = engine.currentBoardPower(state)
          if (power?.type !== 'fendente_mortale' || durindanaHolder.id !== myId) return
          engine.resolveFendenteMortale(state, payload.targetId)
          break
        }
        case 'nextRound': {
          if (state.phase !== 'phase4' || engine.currentBoardPower(state)) return
          engine.endRound(state)
          break
        }
        default:
          return
      }
      engine.resolveNextAutomaticInstants(state)
      maybeAdvanceToVoluntary(state)
      maybeAdvanceToSelection(state)
      if (state.pendingInterrupt) scheduleInterruptTimeout(roomCode)
      if (state.pendingReaction) scheduleReactionTimeout(roomCode)
      broadcastState(roomCode)
    } catch (err) {
      console.error('Errore azione', type, err)
    }
  })

  // Lascia il tavolo: permesso solo prima che la partita sia iniziata (a partita in corso
  // il posto non puo' essere richiuso senza rompere il gioco per gli altri; in quel caso
  // resta solo la disconnessione/riconnessione). Libera il posto e aggiorna l'elenco stanze.
  // Link facoltativo per una chat vocale (Google Meet, Discord, ecc.), condiviso in tempo
  // reale con tutti quelli nella stanza. Chiunque nella stanza puo' impostarlo/cambiarlo.
  socket.on('setVoiceLink', ({ url }) => {
    const roomCode = socket.data.roomCode
    if (!roomCode || !rooms[roomCode]) return
    const room = rooms[roomCode]
    const trimmed = (url || '').trim()
    if (trimmed && !/^https?:\/\//i.test(trimmed)) return
    room.voiceLink = trimmed || null
    broadcastLobby(roomCode)
    if (room.game) broadcastState(roomCode)
  })

  // Chiude definitivamente la stanza (solo a partita conclusa): usata dal pulsante
  // "Chiudi partita" nella schermata finale. Notifica tutti i client collegati (giocatori
  // e supervisori) cosi' tornano automaticamente alla schermata di selezione modalita'.
  socket.on('closeRoom', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode || !rooms[roomCode]) return
    const room = rooms[roomCode]
    if (!room.game || room.game.phase !== 'gameover') return
    clearInterruptTimeout(room)
    clearReactionTimeout(room)
    io.to(roomCode).emit('roomClosed')
    delete rooms[roomCode]
    broadcastOpenRooms()
  })

  socket.on('leaveRoom', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode || !rooms[roomCode]) return
    const room = rooms[roomCode]

    if (socket.data.isSupervisor) {
      room.supervisors = room.supervisors.filter(id => id !== socket.id)
    } else if (!room.game) {
      const token = socket.data.token
      room.players = room.players.filter(p => p.token !== token)
      broadcastLobby(roomCode)
    } else {
      return // partita gia' iniziata: non si puo' lasciare da qui
    }

    socket.leave(roomCode)
    socket.data.roomCode = null
    socket.data.token = null
    socket.data.isSupervisor = false

    if (room.players.length === 0 && room.supervisors.length === 0 && !room.game) {
      delete rooms[roomCode]
    }
    broadcastOpenRooms()
  })

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode
    if (!roomCode || !rooms[roomCode]) return
    if (socket.data.isSupervisor) {
      rooms[roomCode].supervisors = rooms[roomCode].supervisors.filter(id => id !== socket.id)
      return
    }
    const token = socket.data.token
    const player = findPlayerByToken(rooms[roomCode], token)
    if (player) player.connected = false
    broadcastLobby(roomCode)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Server di Orlando alle Crociate in ascolto sulla porta ${PORT}`)
})
