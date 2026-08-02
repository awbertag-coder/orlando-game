// Motore di gioco puro (nessuna dipendenza da React/UI/rete).
// Riceve uno "state" e restituisce un nuovo "state" aggiornato: e' scritto pensando
// che in futuro questo stesso file venga importato tale e quale dentro un server
// Socket.io, quindi non deve mai leggere input utente direttamente (quello lo fa la UI).

import { CHARACTERS_ALL, getRosterForPlayerCount, getBoardTrack } from './characters.js'
import { EQUIPMENT_BY_ID, buildEquipmentDeck } from './equipment.js'

// Registra che una carta e' stata giocata da attackerId contro targetId: la UI online la usa
// per mostrare al bersaglio un avviso dedicato ("X ha usato Y contro di te"), con l'immagine
// della carta. Non tocchiamo il possessore del Palazzo di Atlante (resta sempre segreto):
// questa funzione va chiamata solo per carte giocate apertamente, mai per ridirezioni.
function pushTargetNotice(state, targetId, attackerId, cardId) {
  if (!targetId || !cardId) return
  state.targetNotices = state.targetNotices || {}
  state.noticeSeq = (state.noticeSeq || 0) + 1
  state.targetNotices[targetId] = { attackerId: attackerId || null, cardId, seq: state.noticeSeq }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGame(playerNames, options = {}) {
  const n = playerNames.length
  const useEquipment = options.useEquipment !== false // default: true (modalita' esperti)
  const excludeCardIds = options.excludeCardIds || []
  const maxPlayers = options.maxPlayers || 15
  if (n < 6) {
    throw new Error('Servono almeno 6 giocatori')
  }
  if (n > maxPlayers) {
    throw new Error(`Con questa modalita\' si possono avere al massimo ${maxPlayers} giocatori`)
  }
  const charIds = shuffle(getRosterForPlayerCount(n))
  const players = playerNames.map((name, i) => {
    const char = CHARACTERS_ALL[charIds[i]]
    // Isabella non appartiene a nessuna delle due fazioni (resta sempre neutrale).
    const faction = char.faction
    return {
      id: `p${i}`,
      name,
      characterId: char.id,
      characterName: char.name,
      description: char.description || '',
      faction,
      favorTiles: char.favorTiles,
      hasDurindana: false,
      hand: null, // carta equipaggiamento corrente (id) o null
      handPublic: false, // true quando la carta e' stata mostrata/giocata pubblicamente (vs. tenuta nascosta)
      extraQueue: [], // altre carte da risolvere in coda (es. da Borsa di Logistilla)
      interruptCardsUsed: [], // carte di interruzione (Parata/Orrilo) gia' effettivamente giocate
      reactiveCardsUsed: [], // carte reattive (Palazzo di Atlante) gia' effettivamente attivate in questo round
      revealedThisRound: [], // id delle carte gia' rivelate in questo round
      forcedIn: false,
      forcedOut: false,
      immuneAll: false, // Atlante
      immuneInBattle: !!char.immuneInBattle, // Rinaldo/Ferrau'
      orriloImmune: false, // giocando Orrilo: immune anche dal blocco (Scudo abbagliante/Fantasma) per questo round
      soleParticipantBonus: !!char.soleParticipantBonus, // Brandimarte/Gradasso
      isTraitor: !!char.isTraitor, // Gano/Marfisa
      isLeader: !!char.isLeader, // Orlando/Agramante
      isIsabella: !!char.isIsabella,
      eliminatedFromBattle: false,
      eliminatedPermanently: false, // ucciso da Fendente Mortale, mai piu' selezionabile
      isGhost: false
    }
  })

  const durindanaIndex = Math.floor(Math.random() * players.length)
  players[durindanaIndex].hasDurindana = true

  return {
    players,
    playerCount: n,
    useEquipment, // modalita' esperti (true, con carte equipaggiamento) o novizi (false)
    needsPhase1: n >= 8,
    deck: shuffle(buildEquipmentDeck(excludeCardIds)),
    discard: [],
    board: { cristiana: 0, saracena: 0 },
    boardTrack: getBoardTrack(n),
    round: 1,
    ganoMarfisaSwitched: false,
    phase1Acked: [],
    pendingInterrupt: null,
    pendingReaction: null, // Palazzo di Atlante: offerta reattiva a ridirigere l'ultimo effetto
    councilMessages: [], // messaggi pubblici del "Consiglio dei cavalieri" durante la Fase 2
    councilReady: [], // id dei giocatori pronti a passare a Fase 3 (solo online)
    phase: n >= 8 ? 'phase1-reveal' : 'phase2-deal',
    participantsBaseline: 2,
    participantsDelta: 0,
    factionBonus: { cristiana: 0, saracena: 0 },
    battle: { participants: [], reveals: {}, result: null },
    pendingBoardPowers: [],
    winner: null,
    log: [`Partita creata con ${n} giocatori. Durindana assegnata a ${players[durindanaIndex].name}.`]
  }
}

// Fase 1 (solo 8+ giocatori): pura trasmissione di informazione, nessuna scelta.
// Restituisce le info private che un dato personaggio deve conoscere a inizio partita.
export function getPhase1Info(state, playerId) {
  const player = state.players.find(p => p.id === playerId)
  if (!player) return null
  if (player.characterId === 'orlando' || player.characterId === 'agramante') {
    const allies = state.players.filter(p => p.id !== playerId && p.faction === player.faction && !p.isIsabella)
    return { type: 'allies', allies: allies.map(a => a.name) }
  }
  if (player.characterId === 'angelica') {
    const medoro = state.players.find(p => p.characterId === 'medoro')
    return medoro ? { type: 'lover', loverName: medoro.name, loverCharacter: 'Medoro' } : null
  }
  if (player.characterId === 'ruggero') {
    const bradamante = state.players.find(p => p.characterId === 'bradamante')
    return bradamante ? { type: 'lover', loverName: bradamante.name, loverCharacter: 'Bradamante' } : null
  }
  return null // nessuna informazione privata per questo personaggio in Fase 1
}

export function finishPhase1(state) {
  state.phase = 'phase2-deal'
  return state
}

// Ogni giocatore conferma di aver visto le proprie informazioni di Fase 1; quando
// tutti hanno confermato, si passa automaticamente alla Fase 2.
export function ackPhase1(state, playerId) {
  if (!state.phase1Acked.includes(playerId)) state.phase1Acked.push(playerId)
  if (state.phase1Acked.length >= state.players.length) {
    finishPhase1(state)
    return startRound(state)
  }
  return state
}

function drawCard(state) {
  if (state.deck.length === 0) {
    state.deck = shuffle(state.discard)
    state.discard = []
  }
  return state.deck.pop()
}

function getPlayer(state, playerId) {
  return state.players.find(p => p.id === playerId)
}

function otherPlayers(state, playerId) {
  return state.players.filter(p => p.id !== playerId)
}

// I due vicini di turno di un giocatore (quello prima e quello dopo, in ordine di seduta).
// Usata da Spazzata: nel gioco fisico colpisce chi ha accanto al tavolo, qui usiamo
// l'ordine di turno come equivalente digitale piu' sensato.
export function adjacentPlayers(state, playerId) {
  const order = state.players
  const idx = order.findIndex(p => p.id === playerId)
  const prev = order[(idx - 1 + order.length) % order.length]
  const next = order[(idx + 1) % order.length]
  return [prev.id, next.id]
}

// Un cavaliere sta per essere eliminato dalla battaglia (da una carta istantanea come
// Orca/Attacco delle arpie, o volontaria come Fusberta/Spazzata/Colpi consecutivi).
// Se il bersaglio ha ancora in mano una carta di interruzione (Parata/Orrilo) non
// rivelata, l'eliminazione NON si applica subito: si apre una finestra di risposta.
// `field` indica quale flag impostare se l'eliminazione va a buon fine
// ('eliminatedFromBattle' per le carte volontarie, 'forcedOut' per quelle istantanee).
function attemptElimination(state, { attackerId = null, targetId, field, drawCardForAttacker = false }) {
  const target = getPlayer(state, targetId)
  if (target.immuneAll) {
    state.log.push(`${target.name} e' immune (Atlante): l'eliminazione non ha effetto.`)
    return
  }
  // Atlante si rivela automaticamente (e in modo permanente) la prima volta che il
  // possessore viene bersagliato da un effetto negativo. Non serve altra guardia:
  // una volta scattato, immuneAll=true e il controllo sopra intercetta tutto il resto.
  if (target.hand === 'atlante') {
    target.revealedThisRound.push('atlante')
    target.handPublic = true
    target.immuneAll = true
    state.log.push(`${target.name} rivela Atlante: e' immune da qualsiasi effetto, anche in futuro.`)
    return
  }
  const handCard = target.hand ? EQUIPMENT_BY_ID[target.hand] : null
  // Una carta di interruzione resta disponibile finche' non viene DAVVERO giocata in
  // risposta a qualcosa -- il semplice "passare" durante il proprio turno normale in
  // Fase 2 (che marca revealedThisRound per far avanzare il gioco) non la consuma.
  const canRespond = handCard && handCard.timing === 'interrupt' && !(target.interruptCardsUsed || []).includes(target.hand)
  if (canRespond) {
    state.pendingInterrupt = { attackerId, targetId, field, drawCardForAttacker }
    state.log.push(`${target.name} e' stato bersaglio di un'eliminazione: puo' rispondere con una carta.`)
  } else {
    target[field] = true
    state.log.push(`${target.name} viene eliminato dalla battaglia.`)
    if (drawCardForAttacker && attackerId) {
      const attacker = getPlayer(state, attackerId)
      attacker.extraQueue = [...(attacker.extraQueue || []), drawCard(state)]
    }
  }
}

// Il bersaglio decide se rispondere con la propria carta di interruzione (Parata/Orrilo)
// o lasciar passare l'eliminazione.
export function resolveInterrupt(state, playCard) {
  const pending = state.pendingInterrupt
  if (!pending) return state
  const target = getPlayer(state, pending.targetId)
  const attacker = pending.attackerId ? getPlayer(state, pending.attackerId) : null

  if (playCard && target.hand) {
    const card = EQUIPMENT_BY_ID[target.hand]
    target.revealedThisRound.push(target.hand)
    target.interruptCardsUsed = [...(target.interruptCardsUsed || []), target.hand]
    target.handPublic = true
    if (card.effect === 'interrupt_eliminate_attacker') {
      if (attacker && !attacker.immuneAll) {
        attacker.eliminatedFromBattle = true
        state.log.push(`${target.name} gioca ${card.name}: elimina ${attacker.name} ed entra automaticamente in battaglia.`)
      } else {
        state.log.push(`${target.name} gioca ${card.name} ed entra automaticamente in battaglia.`)
      }
      target.forcedIn = true
    } else if (card.effect === 'interrupt_immune_elimination') {
      target.orriloImmune = true
      state.log.push(`${target.name} gioca ${card.name}: e' immune, nessun effetto lo tocca (anche dal blocco del fantasma/Scudo abbagliante).`)
    }
  } else {
    target[pending.field] = true
    state.log.push(`${target.name} non risponde: viene eliminato dalla battaglia.`)
    if (pending.drawCardForAttacker && attacker) {
      attacker.extraQueue = [...(attacker.extraQueue || []), drawCard(state)]
    }
    // L'eliminazione e' andata a segno: registriamola come "ultimo effetto", cosi'
    // Anello di Angelica/Palazzo di Atlante possono ancora agire su di essa.
    state.lastEffect = { effect: 'eliminate', playerId: pending.attackerId, targetId: pending.targetId, field: pending.field }
  }
  state.pendingInterrupt = null
  const pausedIds = [pending.targetId, ...(pending.attackerId ? [pending.attackerId] : [])]
  const reactionOpened = offerReactiveRedirect(state, pausedIds)
  if (!reactionOpened) {
    advanceHandQueue(state, pending.targetId)
    // La coda dell'attaccante era stata volutamente NON avanzata in playVoluntaryCard mentre
    // l'interrupt era pendente (altrimenti la sua mano sarebbe cambiata prima di sapere se
    // l'eliminazione fosse davvero andata a segno); la avanziamo ora che e' stata risolta.
    if (pending.attackerId) advanceHandQueue(state, pending.attackerId)
  }
  return state
}

// --- FASE 2: distribuzione equipaggiamento ---

function resetRoundFlags(state) {
  for (const player of state.players) {
    player.hand = null
    player.handPublic = false
    player.extraQueue = []
    player.interruptCardsUsed = []
    player.reactiveCardsUsed = []
    player.revealedThisRound = []
    player.forcedIn = false
    player.forcedOut = false
    player.eliminatedFromBattle = false
    player.orriloImmune = false
  }
  state.participantsDelta = 0
  state.councilMessages = []
  state.councilReady = []
  state.factionBonus = { cristiana: 0, saracena: 0 }
}

export function dealEquipment(state) {
  resetRoundFlags(state)
  for (const player of state.players) {
    player.hand = drawCard(state)
  }
  state.phase = 'phase2-instant'
  state.log.push(`--- Round ${state.round}: carte equipaggiamento distribuite ---`)
  return state
}

// Fa partire un round: in modalita' esperti distribuisce le carte equipaggiamento
// (Fase 2), in modalita' novizi salta direttamente alla scelta dei partecipanti.
export function startRound(state) {
  if (state.useEquipment) {
    return dealEquipment(state)
  }
  resetRoundFlags(state)
  state.log.push(`--- Round ${state.round}: modalita' novizi, si passa direttamente alla battaglia ---`)
  return beginParticipantSelection(state)
}

// Ordine di turno del "giro di attivazione": il regolamento fisico prevede che le
// carte (sia istantanee che volontarie) si risolvano sempre in giro di tavolo A
// PARTIRE DAL POSSESSORE DI DURINDANA, non in un ordine fisso. L'array state.players
// rappresenta la disposizione fissa al tavolo (usata anche da adjacentPlayers e
// moveDurindana): qui la ruotiamo solo per decidere chi decide per primo nel giro.
export function turnOrder(state) {
  const order = state.players
  const idx = order.findIndex(p => p.hasDurindana)
  if (idx <= 0) return [...order]
  return [...order.slice(idx), ...order.slice(0, idx)]
}

export function instantCardsPending(state) {
  return turnOrder(state).filter(p => p.hand && EQUIPMENT_BY_ID[p.hand].timing === 'instant' && !p.revealedThisRound.includes(p.hand))
}

// Analogo di instantCardsPending ma per il giro delle carte volontarie: tutti i
// giocatori con una carta ancora da "decidere" (giocare o passare) in questo round,
// nell'ordine corretto a partire da Durindana.
export function voluntaryCardsPending(state) {
  return turnOrder(state).filter(p => p.hand && !p.revealedThisRound.includes(p.hand))
}

// Risolve la carta istantanea di un giocatore. `targets` contiene gli id necessari
// a seconda della carta (es. { targetId } oppure { targetId, targetId2 }).
export function resolveInstantCard(state, playerId, targets = {}) {
  const player = getPlayer(state, playerId)
  const card = EQUIPMENT_BY_ID[player.hand]
  player.revealedThisRound.push(card.id)
  player.handPublic = true
  state.log.push(`${player.name} rivela ${card.name}.`)

  switch (card.effect) {
    case 'swap_equipment': {
      const a = getPlayer(state, targets.targetId)
      const b = getPlayer(state, targets.targetId2)
      if (a && b && a.id !== b.id) {
        const aCardIsInstant = EQUIPMENT_BY_ID[a.hand]?.timing === 'instant'
        const bCardIsInstant = EQUIPMENT_BY_ID[b.hand]?.timing === 'instant'
        if (!aCardIsInstant && !bCardIsInstant) {
          ;[a.hand, b.hand] = [b.hand, a.hand]
          state.log.push(`${a.name} e ${b.name} si scambiano l'equipaggiamento.`)
          pushTargetNotice(state, a.id, player.id, card.id)
          pushTargetNotice(state, b.id, player.id, card.id)
        } else {
          state.log.push(`Scambio non valido: una delle due carte e' istantanea.`)
        }
      }
      break
    }
    case 'force_reveal_use': {
      const t = getPlayer(state, targets.targetId)
      if (t && t.hand) {
        state.log.push(`${t.name} e' costretto a rivelare e usare la propria carta.`)
        pushTargetNotice(state, t.id, player.id, card.id)
        // La UI dovra' poi far risolvere subito la carta forzata di t, se volontaria.
      }
      break
    }
    case 'forced_out': {
      attemptElimination(state, { attackerId: null, targetId: player.id, field: 'forcedOut' })
      break
    }
    case 'forced_in': {
      if (!player.immuneAll) player.forcedIn = true
      break
    }
    case 'draw_two': {
      // Le due carte pescate finiscono in coda: verranno mostrate e attivabili
      // subito dopo, una alla volta, esattamente come la mano normale.
      const extra1 = drawCard(state)
      const extra2 = drawCard(state)
      player.extraQueue = [...(player.extraQueue || []), extra1, extra2]
      state.log.push(`${player.name} pesca altre due carte equipaggiamento.`)
      break
    }
    default:
      break
  }
  advanceHandQueue(state, playerId)
  return state
}

// Se il giocatore ha carte extra in coda (da Borsa di Logistilla, Caligorante, o un
// pescaggio bonus), la prossima passa a essere la sua "mano corrente" da risolvere.
function advanceHandQueue(state, playerId) {
  const player = getPlayer(state, playerId)
  if (player.extraQueue && player.extraQueue.length > 0) {
    player.hand = player.extraQueue.shift()
    player.handPublic = false
  }
}

export function allInstantResolved(state) {
  return instantCardsPending(state).length === 0
}

// Risolve automaticamente, una alla volta e in ordine di turno, tutte le carte
// istantanee che NON richiedono la scelta di un bersaglio da parte del possessore
// (tutte tranne Perdita del senno e Ordine perentorio). Usata in modalita' online
// per far apparire queste attivazioni solo come righe di log, senza fermarsi ad
// aspettare conferma da nessuno. Si ferma non appena incontra una carta che invece
// richiede davvero una scelta (quella va comunque mostrata al possessore).
export function resolveNextAutomaticInstants(state) {
  let pending = instantCardsPending(state)
  while (pending.length > 0) {
    const player = pending[0]
    const card = EQUIPMENT_BY_ID[player.hand]
    if (card.needsTarget) break
    resolveInstantCard(state, player.id, {})
    pending = instantCardsPending(state)
  }
  return state
}

// Carte volontarie: la UI chiama questa funzione quando un giocatore decide di giocare
// (o di NON giocare) la propria carta volontaria/passiva.
export function playVoluntaryCard(state, playerId, targets = {}) {
  const player = getPlayer(state, playerId)
  const cardId = targets.cardId || player.hand
  const card = EQUIPMENT_BY_ID[cardId]
  if (!card) return state
  player.revealedThisRound.push(card.id)
  player.handPublic = true
  state.log.push(`${player.name} gioca ${card.name}.`)

  switch (card.effect) {
    case 'move_durindana': {
      moveDurindana(state, -card.value)
      state.lastEffect = { effect: 'move_durindana', playerId, value: card.value }
      offerReactiveRedirect(state, [playerId])
      break
    }
    case 'eliminate_choice':
    case 'eliminate_adjacent':
    case 'eliminate_draw_on_success': {
      const targetId = targets.targetId
      pushTargetNotice(state, targetId, player.id, card.id)
      attemptElimination(state, {
        attackerId: player.id,
        targetId,
        field: 'eliminatedFromBattle',
        drawCardForAttacker: card.effect === 'eliminate_draw_on_success'
      })
      // Se e' finita in una finestra di risposta (Parata/Orrilo), non e' ancora un
      // effetto "applicato" da annullare/ridirigere -- si annulla solo se e' andato a segno.
      if (!state.pendingInterrupt) {
        state.lastEffect = { effect: 'eliminate', playerId, targetId, field: 'eliminatedFromBattle' }
        offerReactiveRedirect(state, [playerId])
      }
      break
    }
    case 'faction_bonus': {
      state.factionBonus[card.faction] += 1
      state.lastEffect = { effect: 'faction_bonus', playerId, faction: card.faction }
      offerReactiveRedirect(state, [playerId])
      break
    }
    case 'participants_delta': {
      state.participantsDelta += card.value
      state.lastEffect = { effect: 'participants_delta', playerId, value: card.value }
      offerReactiveRedirect(state, [playerId])
      break
    }
    case 'steal_equipment': {
      const t = getPlayer(state, targets.targetId)
      if (t && t.hand && !t.revealedThisRound.includes(t.hand)) {
        const stolenCard = t.hand
        player.extraQueue = [...(player.extraQueue || []), stolenCard]
        t.hand = null
        state.lastEffect = { effect: 'steal_equipment', playerId, targetId: t.id, stolenCard }
        pushTargetNotice(state, t.id, player.id, card.id)
      }
      break
    }
    case 'cancel_equipment_effect': {
      // Anello di Angelica: annulla davvero l'ultimo effetto ancora in vigore.
      if (state.lastEffect) {
        const undone = undoEffect(state, state.lastEffect)
        if (undone) {
          state.lastAngelicaCancel = state.lastEffect
          state.log.push(`Anello di Angelica annulla l'ultimo effetto giocato.`)
        } else {
          state.log.push(`Anello di Angelica: l'ultimo effetto non e' annullabile.`)
        }
        state.lastEffect = null
      } else {
        state.log.push(`Anello di Angelica: non c'e' nessun effetto recente da annullare.`)
      }
      break
    }
    case 'cancel_ring': {
      // Brunello il ladro: ripristina l'effetto che l'Anello di Angelica aveva appena annullato.
      if (state.lastAngelicaCancel) {
        redoEffect(state, state.lastAngelicaCancel)
        state.log.push(`Brunello il ladro annulla l'Anello di Angelica: l'effetto originale torna valido.`)
        state.lastAngelicaCancel = null
      } else {
        state.log.push(`Brunello il ladro: nessun Anello di Angelica recente da annullare.`)
      }
      break
    }
    case 'redirect_target': {
      // Il Palazzo di Atlante: cambia il bersaglio dell'ultimo effetto (non un movimento di Durindana).
      if (state.lastEffect && state.lastEffect.effect !== 'move_durindana' && targets.targetId) {
        redirectEffect(state, state.lastEffect, targets.targetId)
      } else {
        state.log.push(`Il Palazzo di Atlante: nessun bersaglio valido da ridirigere.`)
      }
      break
    }
    case 'no_effect':
    default:
      break
  }
  // Se l'effetto ha aperto una finestra di interrupt (Parata/Orrilo), la mano dell'attaccante
  // non deve ancora avanzare alla prossima carta in coda: bisogna aspettare che il bersaglio
  // risponda (resolveInterrupt si occupera' di avanzarla a risoluzione avvenuta).
  // Idem se si e' appena aperta una finestra reattiva (Palazzo di Atlante): si aspetta
  // che chi lo possiede decida, poi resolveReaction fara' avanzare la coda.
  if (!state.pendingInterrupt && !state.pendingReaction) advanceHandQueue(state, playerId)
  return state
}

// Inverte un effetto precedentemente applicato (usato da Anello di Angelica).
// Restituisce true se e' riuscita ad annullarlo davvero.
function undoEffect(state, eff) {
  switch (eff.effect) {
    case 'move_durindana':
      moveDurindana(state, eff.value)
      return true
    case 'eliminate': {
      const t = getPlayer(state, eff.targetId)
      if (t) { t[eff.field] = false; return true }
      return false
    }
    case 'faction_bonus':
      state.factionBonus[eff.faction] = Math.max(0, state.factionBonus[eff.faction] - 1)
      return true
    case 'participants_delta':
      state.participantsDelta -= eff.value
      return true
    default:
      return false // steal_equipment e altri: non ancora supportato
  }
}

// Ripristina un effetto che era stato annullato dall'Anello di Angelica (usato da Brunello).
function redoEffect(state, eff) {
  switch (eff.effect) {
    case 'move_durindana':
      moveDurindana(state, -eff.value)
      return
    case 'eliminate': {
      const t = getPlayer(state, eff.targetId)
      if (t) t[eff.field] = true
      return
    }
    case 'faction_bonus':
      state.factionBonus[eff.faction] += 1
      return
    case 'participants_delta':
      state.participantsDelta += eff.value
      return
    default:
      return
  }
}

// Cambia il bersaglio di un effetto gia' applicato (usato dal Palazzo di Atlante):
// annulla l'effetto sul vecchio bersaglio e lo riapplica sul nuovo.
function redirectEffect(state, eff, newTargetId) {
  if (eff.effect === 'eliminate') {
    const oldTarget = getPlayer(state, eff.targetId)
    if (oldTarget) oldTarget[eff.field] = false
    attemptElimination(state, { attackerId: eff.playerId, targetId: newTargetId, field: eff.field })
    state.log.push(`Il Palazzo di Atlante ridirige l'effetto su un nuovo bersaglio.`)
    state.lastEffect = { ...eff, targetId: newTargetId }
  } else {
    state.log.push(`Il Palazzo di Atlante: questo tipo di effetto non si puo' ridirigere.`)
  }
}

// Apre una finestra reattiva per una specifica carta, se le condizioni sono giuste: la mano
// del possessore corrisponde alla carta, non e' gia' stata usata in questo round, e l'ultimo
// effetto e' del tipo che quella carta puo' davvero toccare.
function tryOfferReactive(state, cardId, pausedPlayerIds) {
  if (state.pendingReaction || state.pendingInterrupt) return false
  if (!state.lastEffect) return false
  if (cardId === 'anello_di_angelica') {
    // L'Anello annulla un ventaglio piu' ampio di effetti, non solo le eliminazioni.
    if (!['move_durindana', 'eliminate', 'faction_bonus', 'participants_delta'].includes(state.lastEffect.effect)) return false
  } else if (cardId === 'palazzo_di_atlante') {
    if (state.lastEffect.effect !== 'eliminate') return false
  } else {
    return false
  }
  const holder = state.players.find(p => p.hand === cardId && !(p.reactiveCardsUsed || []).includes(cardId))
  if (!holder) return false
  state.pendingReaction = { holderId: holder.id, cardId, eff: state.lastEffect, pausedPlayerIds }
  return true
}

// Dopo che un effetto e' stato confermato (non annullato da un'interruzione), offre prima
// una finestra reattiva all'Anello di Angelica se possibile; se non si apre (nessun
// possessore, o l'effetto non e' di un tipo che l'Anello puo' annullare), prova con Il
// Palazzo di Atlante (solo per le eliminazioni).
function offerReactiveRedirect(state, pausedPlayerIds = []) {
  return tryOfferReactive(state, 'anello_di_angelica', pausedPlayerIds) ||
         tryOfferReactive(state, 'palazzo_di_atlante', pausedPlayerIds)
}

// Risolve la finestra reattiva corrente (Anello di Angelica o Il Palazzo di Atlante).
// activate=true attiva l'effetto della carta (annullamento per l'Anello, che non richiede
// un bersaglio; ridirezione per il Palazzo, che invece lo richiede). Rifiutare non consuma
// la carta: resta disponibile per un effetto successivo nello stesso round.
export function resolveReaction(state, activate, targetId) {
  const pending = state.pendingReaction
  if (!pending) return state
  const holder = getPlayer(state, pending.holderId)

  if (activate && holder.hand === pending.cardId) {
    holder.reactiveCardsUsed = [...(holder.reactiveCardsUsed || []), holder.hand]
    if (pending.cardId === 'anello_di_angelica') {
      const undone = undoEffect(state, pending.eff)
      if (undone) {
        state.lastAngelicaCancel = pending.eff
        state.log.push(`${holder.name} gioca Anello di Angelica: annulla l'ultimo effetto giocato.`)
      } else {
        state.log.push(`${holder.name} gioca Anello di Angelica, ma l'ultimo effetto non era annullabile.`)
      }
      state.lastEffect = null
    } else if (pending.cardId === 'palazzo_di_atlante' && targetId) {
      redirectEffect(state, pending.eff, targetId)
    }
    holder.revealedThisRound.push(holder.hand)
    holder.handPublic = true
  } else {
    state.log.push(`${holder.name} non attiva ${EQUIPMENT_BY_ID[holder.hand]?.name || 'la propria carta'}.`)
  }
  state.pendingReaction = null
  advanceHandQueue(state, pending.holderId)

  // Se questo era il turno dell'Anello ed e' rimasta un'eliminazione ancora in piedi
  // (rifiutata, o l'Anello non c'entrava con quel tipo di effetto), diamo un'altra
  // possibilita' al Palazzo di Atlante PRIMA di riprendere le code messe in pausa.
  let chained = false
  if (pending.cardId === 'anello_di_angelica' && state.lastEffect && state.lastEffect.effect === 'eliminate') {
    chained = tryOfferReactive(state, 'palazzo_di_atlante', pending.pausedPlayerIds)
  }
  if (!chained) {
    for (const pid of pending.pausedPlayerIds || []) advanceHandQueue(state, pid)
  }
  return state
}

export function passVoluntaryCard(state, playerId) {
  const player = getPlayer(state, playerId)
  player.revealedThisRound.push(player.hand)
  state.log.push(`${player.name} non rivela la propria carta.`)
  advanceHandQueue(state, playerId)
  return state
}

function moveDurindana(state, delta) {
  const order = state.players
  const currentIndex = order.findIndex(p => p.hasDurindana)
  let newIndex = (currentIndex + delta) % order.length
  if (newIndex < 0) newIndex += order.length
  order[currentIndex].hasDurindana = false
  order[newIndex].hasDurindana = true
  state.log.push(`Durindana si sposta a ${order[newIndex].name}.`)
}

// --- FASE 3: battaglia ---

// Il "Consiglio dei cavalieri": non e' una fase a se', ma una bacheca di commenti pubblici
// visibile durante tutta la Fase 2 (istantanee + volontarie) mentre le carte vengono
// giocate, cosi' chi vuole puo' giustificare le proprie scelte o dare un consiglio al
// possessore di Durindana, senza fermare il gioco per farlo.
export function addCouncilMessage(state, playerId, text) {
  const player = getPlayer(state, playerId)
  const trimmed = (text || '').trim().slice(0, 300)
  if (!trimmed) return state
  state.councilMessages = [...(state.councilMessages || []), { playerId, name: player.name, text: trimmed }]
  return state
}

// Pulsante "pronto" (rosso/verde), solo modalita' online: ciascun giocatore lo preme quando
// ritiene di aver appreso/condiviso abbastanza informazioni. Si passa a Fase 3 solo quando
// tutti i giocatori sono pronti E tutte le carte volontarie sono state decise.
export function setCouncilReady(state, playerId, ready) {
  const set = new Set(state.councilReady || [])
  if (ready) set.add(playerId)
  else set.delete(playerId)
  state.councilReady = [...set]
  return state
}

export function allCouncilReady(state) {
  return state.players.length > 0 && state.players.every(p => (state.councilReady || []).includes(p.id))
}

export function beginParticipantSelection(state) {
  state.phase = 'phase3-select'
  state.participantsBaseline = Math.max(1, 2 + state.participantsDelta)
  return state
}

export function forcedParticipants(state) {
  return state.players.filter(p => p.forcedIn && !p.forcedOut && !p.eliminatedFromBattle && !p.eliminatedPermanently && !p.isGhost).map(p => p.id)
}

export function eligibleParticipants(state) {
  const durindanaHolder = state.players.find(p => p.hasDurindana)
  // Il possessore di Durindana e' quello che sceglie: non compare mai tra i selezionabili
  // per il numero di partecipanti richiesto. Orlando/Agramante hanno pero' un'aggiunta
  // segreta separata e opzionale (vedi canSecretlyJoin / chooseParticipants). I fantasmi e
  // gli eliminati permanentemente da Fendente Mortale non possono piu' partecipare.
  return state.players
    .filter(p => p.id !== durindanaHolder.id && !p.forcedOut && !p.eliminatedFromBattle && !p.eliminatedPermanently && !p.isGhost)
    .map(p => p.id)
}

// I fantasmi attivi (giocatori "uccisi" da un Fendente Mortale della fazione opposta),
// che restano nel gioco con il potere di bloccare un partecipante a battaglia.
export function activeGhosts(state) {
  return state.players.filter(p => p.isGhost).map(p => p.id)
}

// Orlando/Agramante, se possiedono Durindana, possono aggiungersi di nascosto alla battaglia
// come partecipante EXTRA, senza che questo cambi il numero di partecipanti da scegliere.
export function canSecretlyJoin(state) {
  const durindanaHolder = state.players.find(p => p.hasDurindana)
  return durindanaHolder.characterId === 'orlando' || durindanaHolder.characterId === 'agramante'
}

export function chooseParticipants(state, chosenIds, secretSelfJoin = false) {
  const durindanaHolder = state.players.find(p => p.hasDurindana)
  state.battle.participants = secretSelfJoin ? [...chosenIds, durindanaHolder.id] : chosenIds
  state.battle.reveals = {}
  state.battle.pendingBlocks = []
  const ghosts = activeGhosts(state)
  if (ghosts.length > 0) {
    state.pendingGhostBlocks = ghosts // coda di fantasmi che devono ancora decidere
    state.phase = 'phase3-ghost-block'
  } else {
    state.phase = 'phase3-reveal'
  }
  return state
}

// Un fantasma sceglie (o rinuncia a) bloccare un partecipante, senza vederne il favore.
export function ghostBlock(state, ghostId, targetId) {
  state.pendingGhostBlocks = (state.pendingGhostBlocks || []).filter(id => id !== ghostId)
  if (targetId) {
    state.battle.pendingBlocks = [...(state.battle.pendingBlocks || []), targetId]
    state.log.push(`Un fantasma ha bloccato in segreto un partecipante alla battaglia.`)
  }
  if (state.pendingGhostBlocks.length === 0) {
    state.phase = 'phase3-reveal'
  }
  return state
}

// Rivela la tessera favore (e le eventuali carte da battaglia) di un partecipante.
// `factionChoice` serve solo per Orlando/Agramante che hanno tessere di entrambe le fazioni.
// `options.useOptionalCard`: per Corno del terrore, che e' l'unica carta da battaglia il cui
// utilizzo resta a scelta del possessore anche dopo averla rivelata.
// `options.blockTargetId`: per Scudo abbagliante, l'avversario da bloccare (valore azzerato).
export function revealParticipant(state, playerId, factionChoice, options = {}) {
  const player = getPlayer(state, playerId)
  const tile = player.favorTiles.find(t => !factionChoice || t.faction === factionChoice) || player.favorTiles[0]
  let value = tile.value

  let battleCard = null
  if (player.hand && EQUIPMENT_BY_ID[player.hand]?.timing === 'battle') {
    battleCard = EQUIPMENT_BY_ID[player.hand]
    player.revealedThisRound.push(battleCard.id)
    player.handPublic = true
    const isOptional = battleCard.effect === 'battle_all_others_penalty'
    const shouldApply = !isOptional || options.useOptionalCard
    if (shouldApply) {
      if (battleCard.effect === 'battle_modifier') value += battleCard.value
      if (battleCard.effect === 'battle_block_blind' && options.blockTargetId) {
        state.battle.pendingBlocks = [...(state.battle.pendingBlocks || []), options.blockTargetId]
      }
    } else {
      battleCard = null // non giocata: resta come se non l'avesse rivelata ai fini dell'effetto
    }
  }

  state.battle.reveals[playerId] = { faction: tile.faction, value, battleCard: battleCard?.id || null }
  state.log.push(`${player.name} ha mostrato il proprio favore in segreto all'Ariosto.`)
  return state
}

export function resolveBattle(state) {
  let cristiana = 0
  let saracena = 0
  const reveals = state.battle.reveals

  // Scudo abbagliante / blocco del fantasma: il bersaglio bloccato ha il favore azzerato,
  // a meno che sia immune (Rinaldo/Ferrau').
  for (const blockedId of state.battle.pendingBlocks || []) {
    const blockedPlayer = state.players.find(p => p.id === blockedId)
    const isImmuneToBlock = blockedPlayer?.immuneInBattle || blockedPlayer?.immuneAll || blockedPlayer?.orriloImmune
    if (reveals[blockedId] && !isImmuneToBlock) reveals[blockedId].value = 0
  }

  // Brandimarte/Gradasso: se sono l'unico partecipante della propria fazione in questa
  // battaglia, il loro favore diventa 2.
  for (const pid of state.battle.participants) {
    const p = state.players.find(x => x.id === pid)
    if (p?.soleParticipantBonus && reveals[pid]) {
      const others = state.battle.participants.filter(id => id !== pid)
      const soleOfFaction = others.every(id => state.players.find(x => x.id === id)?.faction !== p.faction)
      if (soleOfFaction) reveals[pid].value = 2
    }
  }

  // applica "corno del terrore" come modificatore globale dopo la rivelazione base
  // (i personaggi immuni, Rinaldo/Ferrau', non subiscono la penalita')
  for (const pid of Object.keys(reveals)) {
    const card = state.players.find(p => p.id === pid)?.hand
    const cardDef = card ? EQUIPMENT_BY_ID[card] : null
    if (cardDef?.effect === 'battle_all_others_penalty' && reveals[pid].battleCard === cardDef.id) {
      for (const otherId of Object.keys(reveals)) {
        const otherPlayer = state.players.find(p => p.id === otherId)
        const isImmuneToEquipment = otherPlayer?.immuneInBattle || otherPlayer?.immuneAll
        if (otherId !== pid && !isImmuneToEquipment) reveals[otherId].value -= 1
      }
    }
  }

  for (const pid of Object.keys(reveals)) {
    if (reveals[pid].faction === 'cristiana') cristiana += reveals[pid].value
    else saracena += reveals[pid].value
  }

  cristiana += state.factionBonus.cristiana
  saracena += state.factionBonus.saracena

  let result = 'pareggio'
  if (cristiana > saracena) result = 'cristiana'
  else if (saracena > cristiana) result = 'saracena'

  state.battle.result = { cristiana, saracena, winner: result }
  state.phase = 'phase4'
  state.log.push(`Risultato battaglia: ${result === 'pareggio' ? 'Pareggio.' : `Vince la fazione ${result}.`}`)
  return state
}

// --- FASE 4: risultato e reset ---

function normalizePowers(power) {
  if (!power) return []
  return Array.isArray(power) ? power : [power]
}

export function applyBoardResult(state) {
  const { winner } = state.battle.result
  state.pendingBoardPowers = []
  if (winner === 'pareggio') return state

  const newPos = state.board[winner] + 1
  state.board[winner] = newPos
  const powers = normalizePowers(state.boardTrack[newPos - 1])
  state.log.push(`Tessera vittoria ${winner} posizionata in casella ${newPos}${powers.length ? ` (potere: ${powers.join(' + ')})` : ''}.`)

  if (powers.includes('vittoria')) {
    state.winner = winner
    state.phase = 'gameover'
    state.log.push(`*** La fazione ${winner} vince la partita! ***`)
    return state
  }
  state.pendingBoardPowers = powers.map(type => ({ type, faction: winner }))
  return state
}

export function currentBoardPower(state) {
  return state.pendingBoardPowers?.[0] || null
}

export function resolveSpiePalazzo(state, targetId) {
  const target = getPlayer(state, targetId)
  state.log.push(`Il possessore di Durindana ha usato in segreto il potere "Spie a palazzo".`)
  state.pendingBoardPowers.shift()
  return { faction: target.faction, isIsabella: target.isIsabella }
}

// Chi cerca chi, in base alla fazione che ha attivato il potere "Cercare l'amore"
// (vedi il tabellone: sulla riga cristiana e' Medoro a cercare Angelica, su quella
// saracena e' Bradamante a cercare Ruggero).
const CERCARE_AMORE_SEEKER = {
  cristiana: { seeker: 'medoro', lover: 'angelica' },
  saracena: { seeker: 'bradamante', lover: 'ruggero' }
}

export function cercareAmoreInfo(state) {
  const power = currentBoardPower(state)
  if (power?.type !== 'cercare_amore') return null
  const { seeker, lover } = CERCARE_AMORE_SEEKER[power.faction]
  const seekerPlayer = state.players.find(p => p.characterId === seeker)
  return seekerPlayer ? { seekerPlayerId: seekerPlayer.id, seekerCharacter: seeker, loverCharacter: lover } : null
}

export function resolveCercareAmore(state, targetId) {
  const info = cercareAmoreInfo(state)
  const target = getPlayer(state, targetId)
  const found = target && target.characterId === info.loverCharacter
  if (found) {
    // Conversione: cambiano le tessere favore (mostrera' da ora l'altra fazione),
    // ma la sua fazione "vera" (per la vittoria) resta invariata.
    target.favorTiles = target.favorTiles.map(t => ({ ...t, faction: t.faction === 'cristiana' ? 'saracena' : 'cristiana' }))
  }
  state.log.push(`${state.players.find(p => p.id === info.seekerPlayerId).name} ha usato in segreto il potere "Cercare l'amore".`)
  state.pendingBoardPowers.shift()
  return { found }
}

// Fendente Mortale: il possessore di Durindana "uccide" un cavaliere a sua scelta.
export function resolveFendenteMortale(state, targetId) {
  const durindanaHolder = state.players.find(p => p.hasDurindana)
  const target = getPlayer(state, targetId)
  state.pendingBoardPowers.shift()

  if (target.characterId === 'orlando') {
    state.winner = 'saracena'; state.phase = 'gameover'
    state.log.push(`Fendente Mortale ha colpito Orlando: *** vince la fazione saracena! ***`)
    return { outcome: 'leader_killed' }
  }
  if (target.characterId === 'agramante') {
    state.winner = 'cristiana'; state.phase = 'gameover'
    state.log.push(`Fendente Mortale ha colpito Agramante: *** vince la fazione cristiana! ***`)
    return { outcome: 'leader_killed' }
  }
  if (target.isIsabella) {
    state.winner = 'isabella'; state.phase = 'gameover'
    state.log.push(`Fendente Mortale ha colpito Isabella: *** partita conclusa, vince lei in solitaria! ***`)
    return { outcome: 'isabella_killed' }
  }
  target.eliminatedPermanently = true
  if (target.faction === durindanaHolder.faction) {
    state.log.push(`Fendente Mortale ha eliminato ${target.name} dal gioco.`)
    return { outcome: 'eliminated' }
  }
  target.isGhost = true
  state.log.push(`Fendente Mortale ha eliminato ${target.name} dalla battaglia: torna come fantasma vendicatore.`)
  return { outcome: 'ghost' }
}

export function endRound(state) {
  // equipaggiamenti tornano tutti indietro, anche se non usati
  for (const p of state.players) {
    if (p.hand) state.discard.push(p.hand)
    if (p.extraQueue && p.extraQueue.length) {
      state.discard.push(...p.extraQueue)
      p.extraQueue = []
    }
    p.hand = null
    p.eliminatedFromBattle = false
  }
  moveDurindana(state, -1) // passa al cavaliere alla sinistra dell'attuale possessore
  state.round += 1

  // Gano/Marfisa: se la partita non si e' conclusa entro il 7 turno, cambiano
  // fazione automaticamente e silenziosamente (una sola volta).
  if (state.round > 7 && !state.ganoMarfisaSwitched) {
    for (const p of state.players) {
      if (p.isTraitor) p.faction = p.faction === 'cristiana' ? 'saracena' : 'cristiana'
    }
    state.ganoMarfisaSwitched = true
  }

  state.battle = { participants: [], reveals: {}, result: null }
  return startRound(state) // fa partire subito il round successivo
}
