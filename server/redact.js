// Data lo stato completo e vero della partita (che vive solo qui sul server),
// costruisce la versione "redatta" da mandare a un singolo dispositivo:
// ognuno vede le proprie informazioni segrete per intero, ma quelle degli altri
// solo nella misura in cui il regolamento le rende pubbliche.
import * as engine from '../src/engine/gameEngine.js'

// Vista "da supervisore": vede tutto lo stato, comprese le informazioni segrete di
// ogni giocatore. Pensata per un dispositivo di controllo/monitoraggio, non per un
// giocatore reale -- non va mai data a un client che partecipa alla partita.
export function redactForSupervisor(state) {
  const currentPower = engine.currentBoardPower(state)
  return {
    round: state.round,
    phase: state.phase,
    board: state.board,
    boardTrack: state.boardTrack,
    participantsBaseline: state.participantsBaseline,
    winner: state.winner,
    log: state.log.slice(-20),
    durindanaHolderId: state.players.find(p => p.hasDurindana)?.id || null,
    pendingBoardPower: currentPower,
    pendingInterrupt: state.pendingInterrupt,
    pendingReaction: state.pendingReaction,
    battle: state.battle,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      hasDurindana: p.hasDurindana,
      forcedIn: p.forcedIn,
      forcedOut: p.forcedOut,
      eliminatedFromBattle: p.eliminatedFromBattle,
      eliminatedPermanently: p.eliminatedPermanently,
      isGhost: p.isGhost,
      hand: p.hand,
      handPublic: !!p.handPublic,
      characterId: p.characterId,
      characterName: p.characterName,
      description: p.description,
      faction: p.faction,
      favorTiles: p.favorTiles
    }))
  }
}

export function redactForViewer(state, viewerId) {
  const durindanaHolder = state.players.find(p => p.hasDurindana)
  const viewerIsDurindana = durindanaHolder?.id === viewerId
  const currentPower = engine.currentBoardPower(state)
  const cercareInfo = currentPower?.type === 'cercare_amore' ? engine.cercareAmoreInfo(state) : null
  const viewerIsSeeker = cercareInfo?.seekerPlayerId === viewerId

  return {
    round: state.round,
    phase: state.phase,
    board: state.board,
    boardTrack: state.boardTrack,
    participantsBaseline: state.participantsBaseline,
    participantsDelta: state.participantsDelta,
    winner: state.winner,
    log: state.log.slice(-8),
    durindanaHolderId: durindanaHolder ? durindanaHolder.id : null,
    myId: viewerId,
    needsPhase1: state.needsPhase1,
    phase1Info: state.phase === 'phase1-reveal' ? engine.getPhase1Info(state, viewerId) : null,
    pendingInstantPlayerId: state.phase === 'phase2-instant' ? (engine.instantCardsPending(state)[0]?.id ?? null) : null,
    pendingVoluntaryPlayerId: state.phase === 'phase2-voluntary'
      ? (engine.voluntaryCardsPending(state)[0]?.id ?? null)
      : null,
    pendingGhostBlocks: state.phase === 'phase3-ghost-block' ? (state.pendingGhostBlocks || []) : [],
    pendingInterrupt: state.pendingInterrupt
      ? {
          attackerId: state.pendingInterrupt.attackerId,
          targetId: state.pendingInterrupt.targetId,
          actionableByMe: state.pendingInterrupt.targetId === viewerId,
          deadline: state.pendingInterrupt.deadline || null
        }
      : null,
    // Il possessore del Palazzo di Atlante NON viene rivelato agli altri: lo scoprirebbero
    // prima ancora che decida se attivarlo. Solo il bersaglio dell'effetto da ridirigere
    // (gia' pubblico, scelto dall'attaccante) e la scadenza sono condivisi con tutti.
    pendingReaction: state.pendingReaction
      ? {
          actionableByMe: state.pendingReaction.holderId === viewerId,
          effTargetId: state.pendingReaction.eff.targetId,
          deadline: state.pendingReaction.deadline || null
        }
      : null,
    pendingRevealPlayerId: state.phase === 'phase3-reveal'
      ? (state.battle.participants.find(id => !state.battle.reveals[id]) ?? null)
      : null,
    battleRevealProgress: state.phase === 'phase3-reveal' || (state.phase === 'phase4' && state.battle.participants.length)
      ? { done: state.battle.participants.filter(id => state.battle.reveals[id]).length, total: state.battle.participants.length }
      : null,
    // Solo il possessore di Durindana ha bisogno di sapere se puo' unirsi di nascosto
    canSecretlyJoin: viewerIsDurindana && state.phase === 'phase3-select' ? engine.canSecretlyJoin(state) : false,
    forced: state.phase === 'phase3-select' ? engine.forcedParticipants(state) : [],
    eligible: state.phase === 'phase3-select' ? engine.eligibleParticipants(state) : [],
    // Il tipo di potere del tabellone e' pubblico (si vede la casella); il bersaglio scelto
    // e l'esito restano privati di chi lo attiva (Durindana, o chi cerca l'amore).
    pendingBoardPower: currentPower
      ? {
          type: currentPower.type,
          faction: currentPower.faction,
          actionableByMe: currentPower.type === 'cercare_amore' ? viewerIsSeeker : viewerIsDurindana
        }
      : null,
    battle: {
      participants: state.battle.participants,
      // Solo l'esito e' pubblico -- i punteggi numerici (che rivelerebbero indirettamente
      // le tessere favore giocate) restano noti solo al server.
      result: state.battle.result ? { winner: state.battle.result.winner } : null,
      // Le tessere favore in battaglia le vede solo l'Ariosto (qui: il server) e il
      // giocatore stesso -- mai gli altri cavalieri, come da regolamento.
      reveals: Object.fromEntries(
        Object.entries(state.battle.reveals).filter(([pid]) => pid === viewerId)
      )
    },
    players: state.players.map(p => {
      const isSelf = p.id === viewerId
      return {
        id: p.id,
        name: p.name,
        hasDurindana: p.hasDurindana,
        forcedIn: p.forcedIn,
        forcedOut: p.forcedOut,
        eliminatedFromBattle: p.eliminatedFromBattle,
        eliminatedPermanently: p.eliminatedPermanently,
        isGhost: p.isGhost,
        hand: (isSelf || p.handPublic) ? p.hand : null,
        handPublic: !!p.handPublic,
        characterId: isSelf ? p.characterId : null,
        characterName: isSelf ? p.characterName : null,
        description: isSelf ? p.description : null,
        faction: isSelf ? p.faction : null,
        favorTiles: isSelf ? p.favorTiles : null
      }
    })
  }
}
