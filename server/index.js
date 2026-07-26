import { createServer } from 'http'
import { Server } from 'socket.io'
import crypto from 'crypto'
import * as engine from '../src/engine/gameEngine.js'
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
    rooms[roomCode] = { players: [], supervisors: [], requiredPlayers: requiredPlayers || 6, useEquipment: useEquipment !== false, game: null }
  }
  return rooms[roomCode]
}

function lobbyPayload(room) {
  return {
    players: room.players.map(p => ({ name: p.name, connected: p.connected })),
    required: room.requiredPlayers,
    useEquipment: room.useEquipment,
    started: !!room.game
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

function broadcastState(roomCode) {
  const room = rooms[roomCode]
  if (!room || !room.game) return
  for (const p of room.players) {
    if (!p.socketId) continue
    io.to(p.socketId).emit('state', redactForViewer(room.game, p.playerId))
  }
  for (const socketId of room.supervisors) {
    io.to(socketId).emit('supervisorState', redactForSupervisor(room.game))
  }
}

function findPlayerByToken(room, token) {
  return room.players.find(p => p.token === token)
}

const INTERRUPT_TIMEOUT_MS = 5000
// Password della modalita' amministratore (supervisore). Controllata solo lato server,
// cosi' non finisce in chiaro nel bundle JS mandato ai client.
const SUPERVISOR_PASSWORD = 'Admin!!!'

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

const REACTION_TIMEOUT_MS = 5000

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
          break
        }
        case 'resolveReaction': {
          if (!state.pendingReaction || state.pendingReaction.holderId !== myId) return
          clearReactionTimeout(room)
          engine.resolveReaction(state, !!payload.activate, payload.targetId)
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
          break
        }
        case 'playVoluntary': {
          const notDecided = engine.voluntaryCardsPending(state)
          if (notDecided[0]?.id !== myId) return
          engine.playVoluntaryCard(state, myId, payload)
          break
        }
        case 'passVoluntary': {
          const notDecided = engine.voluntaryCardsPending(state)
          if (notDecided[0]?.id !== myId) return
          engine.passVoluntaryCard(state, myId)
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
          const remaining = state.battle.participants.filter(id => !state.battle.reveals[id])
          if (remaining[0] !== myId) return
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
