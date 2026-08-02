import React, { useState } from 'react'
import * as engine from './engine/gameEngine.js'
import { CHARACTERS_ALL } from './engine/characters.js'
import { EQUIPMENT_BY_ID } from './engine/equipment.js'
import { EQUIPMENT_IMAGES } from './assets/index.js'
import { Divider, FactionBadge, BoardView, PhaseTransition } from './shared/ui.jsx'

// ---------------------------------------------------------------------------
// Copione del tutorial guidato: una partita hotseat FINTA a 9 giocatori, con
// ruoli, mazzo e punteggio fissati a mano (nessuna casualita') cosi' possiamo
// garantire che succedano davvero tutte le cose che vogliamo insegnare
// (Fase 1, una carta giocata contro di te, una carta reattiva, i poteri rari
// del tabellone, Fendente Mortale). Ogni passo chiama le VERE funzioni del
// motore (src/engine/gameEngine.js): la messa in scena e' scriptata, le
// regole applicate sono quelle vere.
// ---------------------------------------------------------------------------

// Posti a sedere fissi. L'ordine conta: Chiara (Agramante) e' seduta subito
// dopo Luca (Orlando, il giocatore reale) cosi' i due sono vicini di tavolo
// (necessario per Spazzata) e Durindana, quando passa "al vicino di
// sinistra", arriva esattamente da Chiara a Luca a fine primo turno.
const SEAT_NAMES = ['Paolo', 'Giulia', 'Sara', 'Francesca', 'Davide', 'Elena', 'Marco', 'Luca', 'Chiara']
const SEAT_CHARACTERS = ['astolfo', 'angelica', 'bradamante', 'isabella', 'rodomonte', 'medoro', 'ruggero', 'orlando', 'agramante']

function applyFixedRoster(state) {
  state.players.forEach((p, i) => {
    const char = CHARACTERS_ALL[SEAT_CHARACTERS[i]]
    p.characterId = char.id
    p.characterName = char.name
    p.description = char.description || ''
    p.faction = char.faction
    p.favorTiles = char.favorTiles.map(t => ({ ...t }))
    p.isLeader = !!char.isLeader
    p.isIsabella = !!char.isIsabella
    p.isTraitor = !!char.isTraitor
    p.immuneInBattle = !!char.immuneInBattle
    p.soleParticipantBonus = !!char.soleParticipantBonus
    p.hasDurindana = false
  })
  state.players.find(p => p.characterId === 'agramante').hasDurindana = true
  // Si parte gia' avanzati: 3 vittorie Cristiana, 2 Saracena (il tutorial non
  // gioca i turni precedenti, li assume gia' avvenuti).
  state.board = { cristiana: 3, saracena: 2 }
  state.log = [`Tutorial: partita di prova con 9 giocatori. Punteggio di partenza Cristiana 3 - Saracena 2.`]
}

function buildTutorialState() {
  const state = engine.createGame(SEAT_NAMES, { useEquipment: true })
  applyFixedRoster(state)
  return state
}

// Forza la mano di ciascun giocatore per il round corrente (bypassando il
// pescaggio casuale, che e' gia' avvenuto e viene semplicemente sovrascritto).
// Chi non compare nella mappa riceve una carta "bluff" innocua, che nel
// tutorial nessuno gioca davvero.
function setFixedHands(state, byCharacterId) {
  for (const p of state.players) {
    p.hand = byCharacterId[p.characterId] || 'mama_o_non_mama'
    p.handPublic = false
  }
  // Nessuna delle carte usate nel tutorial e' istantanea: si passa subito
  // alle volontarie, come farebbe il server online dopo aver verificato che
  // non ci sono istantanee in sospeso.
  state.phase = 'phase2-voluntary'
}

function findByChar(state, charId) {
  return state.players.find(p => p.characterId === charId)
}

// ---------------------------------------------------------------------------
// Componenti di supporto per la messa in scena
// ---------------------------------------------------------------------------

function EquipmentCardBlock({ cardId }) {
  const card = EQUIPMENT_BY_ID[cardId]
  if (!card) return null
  return (
    <div style={{ margin: '10px 0' }}>
      {EQUIPMENT_IMAGES[card.id] && <img className="card-art" src={EQUIPMENT_IMAGES[card.id]} alt={card.name} />}
      <h3 style={{ margin: '6px 0 2px' }}>{card.name}</h3>
      <p style={{ margin: 0 }}>{card.description}</p>
    </div>
  )
}

// Barra fissa in alto: cosa fare adesso + avanzamento + uscita sempre disponibile.
function GuideBar({ stepIndex, totalSteps, guide, onExit }) {
  return (
    <div className="tutorial-guide-bar">
      <div>
        <div className="eyebrow">Tutorial guidato &mdash; passo {stepIndex + 1} di {totalSteps}</div>
        <p style={{ margin: '2px 0 0', fontWeight: 'bold' }}>{guide}</p>
      </div>
      <button type="button" className="secondary" onClick={onExit}>Esci dal tutorial</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principale
// ---------------------------------------------------------------------------

export default function TutorialApp({ onExit }) {
  const [state, setState] = useState(() => buildTutorialState())
  const [stepIndex, setStepIndex] = useState(0)

  // Le carte VOLONTARIE giocate da personaggi fittizi passano tutte da qui:
  // stessa funzione motore che userebbe un vero giocatore, solo che la
  // decisione e' gia' scritta nel copione invece di essere presa a mano.
  const update = (fn) => setState(s => { fn(s); return { ...s } })
  const next = () => setStepIndex(i => i + 1)

  const me = findByChar(state, 'orlando')
  const chiara = findByChar(state, 'agramante')
  const giulia = findByChar(state, 'angelica')
  const sara = findByChar(state, 'bradamante')
  const davide = findByChar(state, 'rodomonte')
  const elena = findByChar(state, 'medoro')
  const marco = findByChar(state, 'ruggero')
  const francesca = findByChar(state, 'isabella')

  const passBystanders = (s, excludeIds) => {
    for (const p of s.players) {
      if (!excludeIds.includes(p.id)) engine.passVoluntaryCard(s, p.id)
    }
  }

  // -------------------------------------------------------------------
  // Ogni voce e' un "passo": guida (barra fissa) + contenuto principale.
  // -------------------------------------------------------------------
  const steps = [
    // 0 --- Intro ---------------------------------------------------------
    {
      guide: "Benvenuto! Premi \"Inizia\" quando sei pronto.",
      render: () => (
        <div className="card">
          <div className="eyebrow">Tutorial guidato</div>
          <h1>Impari giocando davvero</h1>
          <p>
            In questo tutorial controllerai <strong>Luca</strong>, uno dei 9 cavalieri al tavolo. In segreto
            interpreta <strong>Orlando</strong>. Gli altri 8 posti sono occupati da giocatori di prova: le loro
            decisioni sono gia' scritte, cosi' possiamo mostrarti con certezza le fasi piu' rare del gioco (la
            Rivelazione iniziale, una carta giocata contro di te, una carta reattiva, i poteri sul tabellone e il
            Fendente Mortale). Le regole applicate sono sempre quelle vere: cambia solo che qui sappiamo gia' cosa
            succedera'.
          </p>
          <p>Partiamo gia' a un punto avanzato della partita: 3 vittorie per i Cristiani, 2 per i Saraceni.</p>
          <button onClick={next}>Inizia</button>
        </div>
      )
    },
    // 1 --- Flavor: schermata di assegnazione ------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="assegnazione" onContinue={next} />
    },
    // 2 --- Flavor: intro Fase 1 -------------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="rivelazione" onContinue={next} />
    },
    // 3 --- Fase 1 vera e propria (interattiva) -----------------------------
    {
      guide: 'Premi il pulsante evidenziato per continuare.',
      render: () => {
        const info = engine.getPhase1Info(state, me.id)
        return (
          <div className="card">
            <div className="eyebrow">Fase 1 &mdash; Rivelazione iniziale</div>
            <h2>I tuoi alleati di fazione</h2>
            <p>Come Orlando, scopri subito chi sono gli altri Cristiani al tavolo (a parte te):</p>
            <ul>{info.allies.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>
              Ricordatelo: in Fase 3, quando scegli chi manda in battaglia, tornera' utile.
            </p>
            <button
              className="tutorial-highlight"
              onClick={() => {
                update(s => {
                  s.players.filter(p => p.id !== me.id).forEach(p => engine.ackPhase1(s, p.id))
                  engine.ackPhase1(s, me.id) // l'ultimo ack fa partire il round (distribuzione carte)
                  setFixedHands(s, { orlando: 'cavallo_stanco', agramante: 'spazzata' })
                })
                next()
              }}
            >
              Ho memorizzato, continua
            </button>
          </div>
        )
      }
    },
    // 4 --- Flavor: intro Fase 2 --------------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="alavventura" onContinue={next} />
    },
    // 5 --- La tua carta di questo round ------------------------------------
    {
      guide: 'Guarda la tua carta, poi premi Avanti.',
      render: () => (
        <div className="card">
          <div className="eyebrow">La tua carta equipaggiamento</div>
          <p>Questo turno (il sesto della partita) hai pescato:</p>
          <EquipmentCardBlock cardId={me.hand} />
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>
            Questa carta la vedi solo tu: in una vera partita online resterebbe cosi' per tutta la Fase 2, non solo
            quando arriva il tuo turno.
          </p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 6 --- Turno di Chiara (l'attacco) -------------------------------------
    {
      guide: 'Osserva: nella vera partita aspetteresti in silenzio il turno di Chiara.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">In attesa</div>
          <p>Chiara (che possiede Durindana) e' la prima a decidere questo round&hellip;</p>
          <button
            onClick={() => {
              update(s => engine.playVoluntaryCard(s, chiara.id, { targetId: me.id }))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 7 --- Risultato dell'attacco --------------------------------------------
    {
      guide: "Cosi' avvisiamo il bersaglio quando una carta viene giocata contro di lui.",
      render: () => (
        <div className="card target-notice-toast">
          <div className="eyebrow">Sei stato bersagliato</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {EQUIPMENT_IMAGES.spazzata && <img className="card-art" style={{ width: 70, height: 'auto' }} src={EQUIPMENT_IMAGES.spazzata} alt="Spazzata" />}
            <p style={{ margin: 0, flex: 1 }}><strong>Chiara</strong> ha usato <strong>Spazzata</strong> contro di te.</p>
          </div>
          <p>
            Sei stato eliminato dalla battaglia per questo turno. Non hai potuto rispondere: Cavallo Stanco non e'
            una carta di interruzione (solo Parata e Orrilo lo sono).
          </p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 8 --- Gli altri passano -------------------------------------------------
    {
      guide: 'Osserva: gli altri giocatori decidono in fretta, nessuno gioca nulla di rilevante.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">In attesa</div>
          <p>Gli altri cavalieri decidono le proprie carte&hellip;</p>
          <button
            onClick={() => {
              update(s => passBystanders(s, [me.id, chiara.id]))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 9 --- Tocca a te (Cavallo Stanco) ----------------------------------------
    {
      guide: 'Premi il pulsante evidenziato per continuare.',
      render: () => (
        <div className="card">
          <div className="eyebrow">Tocca a te</div>
          <EquipmentCardBlock cardId="cavallo_stanco" />
          <p>Questa carta e' un bluff: non ha alcun effetto reale. Tienila pure coperta.</p>
          <button
            className="tutorial-highlight"
            onClick={() => {
              update(s => {
                engine.passVoluntaryCard(s, me.id)
                engine.beginParticipantSelection(s)
              })
              next()
            }}
          >
            Continua
          </button>
        </div>
      )
    },
    // 10 --- Flavor: intro Fase 3 ------------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="chiamata" onContinue={next} />
    },
    // 11 --- Chiara sceglie i partecipanti ----------------------------------
    {
      guide: 'Osserva: tu sei stato eliminato dalla battaglia, quindi questa scelta spetta a Chiara.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Possiede Durindana: Chiara</div>
          <p>Chiara sceglie chi mandare in battaglia: i suoi compagni saraceni, Davide ed Elena.</p>
          <button
            onClick={() => {
              update(s => engine.chooseParticipants(s, [davide.id, elena.id], false))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 12 --- Flavor: intro Fase 4 ------------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="scontro" onContinue={next} />
    },
    // 13 --- Rivelazione del favore (Saraceni) ------------------------------
    {
      guide: 'Osserva: il favore in battaglia resta privato anche a te, che non partecipi.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Battaglia in corso</div>
          <p>Davide ed Elena mostrano in segreto il proprio favore all'Ariosto&hellip;</p>
          <button
            onClick={() => {
              update(s => {
                engine.revealParticipant(s, davide.id, 'saracena', {})
                engine.revealParticipant(s, elena.id, 'saracena', {})
                engine.resolveBattle(s)
                engine.applyBoardResult(s)
              })
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 14 --- Flavor: intro Fase 5 ------------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="risoluzione" onContinue={next} />
    },
    // 15 --- Risultato --------------------------------------------------------
    {
      guide: 'Osserva il tabellone, poi premi Avanti.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Risultato battaglia</div>
          <h2>Vince la fazione <FactionBadge faction="saracena" /></h2>
          <Divider />
          <BoardView game={state} />
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 16 --- Potere: Spie a palazzo -----------------------------------------
    {
      guide: 'Osserva: questo potere si attiva da solo per chi possiede Durindana.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Potere del tabellone: Spie a palazzo</div>
          <p>La fazione Saracena arriva su una casella che attiva due poteri insieme. Il primo: Chiara, che possiede
            Durindana, sbircia in segreto la fazione di un cavaliere a sua scelta. Sceglie Francesca.</p>
          <button
            onClick={() => {
              update(s => engine.resolveSpiePalazzo(s, francesca.id))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 17 --- Esito Spie a palazzo ---------------------------------------------
    {
      guide: 'Osserva il risultato, poi premi Avanti.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Spie a palazzo</div>
          <p>Chiara scopre che Francesca non ha una fazione riconoscibile&hellip; perche' interpreta Isabella, che
            per definizione non appartiene a nessuna delle due fazioni.</p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 18 --- Potere: Cercare l'amore -----------------------------------------
    {
      guide: "Osserva: questo potere spetta a chi, nel poema, sta cercando il proprio amore.",
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Potere del tabellone: Cercare l'amore</div>
          <p>Si attiva anche il secondo potere della casella. Sara, che interpreta Bradamante, cerca in segreto il
            proprio amore tra i cavalieri al tavolo.</p>
          <button
            onClick={() => {
              update(s => engine.resolveCercareAmore(s, marco.id))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 19 --- Esito Cercare l'amore -------------------------------------------
    {
      guide: 'Osserva il risultato, poi premi Avanti.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Cercare l'amore</div>
          <p>Lo trova! E' Marco, che interpreta Ruggero. Le sue tessere favore cambiano fazione in segreto, come
            previsto dal potere &mdash; ma la sua vera fazione (quella che conta per la vittoria) resta invariata.</p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 20 --- Fine turno: Durindana passa a te -------------------------------
    {
      guide: 'Osserva: il turno finisce e Durindana passa al vicino di sinistra: te.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Fine turno</div>
          <p>Gli equipaggiamenti non giocati tornano tutti nel mazzo. Durindana passa al vicino di sinistra
            dell'attuale possessore: da Chiara arriva a <strong>te</strong>.</p>
          <button
            onClick={() => {
              update(s => {
                engine.endRound(s)
                setFixedHands(s, { orlando: 'atlante', agramante: 'spazzata' })
              })
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 21 --- Flavor: intro Fase 2 (round 2) ---------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="alavventura" onContinue={next} />
    },
    // 22 --- La tua carta (Atlante) ------------------------------------------
    {
      guide: 'Guarda la tua carta, poi premi Avanti.',
      render: () => (
        <div className="card">
          <div className="eyebrow">La tua carta equipaggiamento</div>
          <p>Ora possiedi Durindana <em>e</em> questa carta in mano:</p>
          <EquipmentCardBlock cardId="atlante" />
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>
            E' una carta passiva: non si gioca mai per scelta. Osserva cosa succede se ti attaccano di nuovo.
          </p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 23 --- Tocca a te per primo (possiedi Durindana) ------------------------
    {
      guide: 'Premi il pulsante evidenziato per continuare.',
      render: () => (
        <div className="card">
          <div className="eyebrow">Tocca a te per primo</div>
          <p>Questo round tocca a te per primo: possiedi Durindana, e in Fase 2 si parte sempre da chi la
            possiede. Atlante resta coperta finche' non sarai bersagliato: non c'e' nulla da scegliere ora.</p>
          <button className="tutorial-highlight" onClick={() => { update(s => engine.passVoluntaryCard(s, me.id)); next() }}>
            Continua
          </button>
        </div>
      )
    },
    // 24 --- Turno di Chiara (secondo attacco) --------------------------------
    {
      guide: 'Osserva: Chiara prova di nuovo la stessa carta.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">In attesa</div>
          <p>Tocca a Chiara&hellip;</p>
          <button
            onClick={() => {
              update(s => engine.playVoluntaryCard(s, chiara.id, { targetId: me.id }))
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 25 --- Esito: Atlante ti salva --------------------------------------------
    {
      guide: "Ecco perche' vale la pena conoscere le carte passive.",
      render: () => (
        <div className="card target-notice-toast">
          <div className="eyebrow">Sei stato bersagliato &mdash; ma sei immune</div>
          <p>Chiara ha usato di nuovo <strong>Spazzata</strong> contro di te. Questa volta pero' Atlante si rivela da
            sola: sei immune per sempre da qualsiasi effetto negativo, non solo per questo round.</p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 26 --- Gli altri passano (round 2) --------------------------------------
    {
      guide: 'Osserva: gli altri giocatori decidono in fretta.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">In attesa</div>
          <p>Gli altri cavalieri decidono le proprie carte&hellip;</p>
          <button
            onClick={() => {
              update(s => {
                passBystanders(s, [me.id, chiara.id])
                engine.beginParticipantSelection(s)
              })
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 27 --- Flavor: intro Fase 3 (round 2) -----------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="chiamata" onContinue={next} />
    },
    // 28 --- Tu scegli i partecipanti (interattivo) ---------------------------
    {
      guide: 'Scegli due dei tuoi alleati (evidenziati), poi conferma.',
      render: () => {
        const eligible = engine.eligibleParticipants(state)
        const suggested = [giulia.id, sara.id]
        return <ParticipantPicker state={state} eligibleIds={eligible} suggestedIds={suggested} onConfirm={(chosenIds) => {
          update(s => engine.chooseParticipants(s, chosenIds, false))
          next()
        }} />
      }
    },
    // 29 --- Flavor: intro Fase 4 (round 2) -----------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="scontro" onContinue={next} />
    },
    // 30 --- Rivelazione del favore (Cristiani) -------------------------------
    {
      guide: 'Osserva: come prima, il favore resta privato ai due partecipanti.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Battaglia in corso</div>
          <p>Giulia e Sara mostrano in segreto il proprio favore all'Ariosto&hellip;</p>
          <button
            onClick={() => {
              update(s => {
                engine.revealParticipant(s, giulia.id, 'cristiana', {})
                engine.revealParticipant(s, sara.id, 'cristiana', {})
                engine.resolveBattle(s)
                engine.applyBoardResult(s)
              })
              next()
            }}
          >
            Avanti
          </button>
        </div>
      )
    },
    // 31 --- Flavor: intro Fase 5 (round 2) -----------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="risoluzione" onContinue={next} />
    },
    // 32 --- Risultato: vince la Cristiana ------------------------------------
    {
      guide: 'Osserva il tabellone, poi premi Avanti.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Risultato battaglia</div>
          <h2>Vince la fazione <FactionBadge faction="cristiana" /></h2>
          <Divider />
          <BoardView game={state} />
          <p>Arrivate su una casella che attiva anche il Fendente Mortale.</p>
          <button onClick={next}>Avanti</button>
        </div>
      )
    },
    // 33 --- Fendente Mortale (interattivo, il momento clou) -------------------
    {
      guide: 'Scegli Chiara (evidenziata), poi colpisci.',
      render: () => <FendenteMortalePicker candidates={state.players.filter(p => p.id !== me.id)} highlightId={chiara.id} onConfirm={(targetId) => {
        update(s => engine.resolveFendenteMortale(s, targetId))
        next()
      }} />
    },
    // 34 --- Flavor: schermata di vittoria ------------------------------------
    {
      guide: 'Leggi la schermata, poi premi Continua.',
      render: () => <PhaseTransition phaseKey="vittoria_cristiana" onContinue={next} />
    },
    // 35 --- Schermata finale ---------------------------------------------------
    {
      guide: 'Il tutorial e\' concluso. Premi il pulsante per tornare al menu.',
      render: () => (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Tutorial concluso</div>
          <h1 className="faction-cristiana">Hai vinto!</h1>
          <p>
            Colpendo Chiara &mdash; che interpretava Agramante, il capofazione saraceno &mdash; ti sei vendicato del
            tentativo di rubarti Durindana, e la fazione Cristiana ha trionfato.
          </p>
          <p>
            Hai visto: Fase 1, una carta giocata contro di te, una carta passiva che ti salva, i poteri Spie a
            palazzo e Cercare l'amore, la scelta dei partecipanti e il Fendente Mortale. Sei pronto per una vera
            partita.
          </p>
          <button className="tutorial-highlight" onClick={onExit}>Torna alla selezione modalita'</button>
        </div>
      )
    }
  ]

  const current = steps[stepIndex]

  return (
    <div>
      <GuideBar stepIndex={stepIndex} totalSteps={steps.length} guide={current.guide} onExit={onExit} />
      {current.render()}
    </div>
  )
}

// Schermata di selezione partecipanti, semplificata rispetto a quella della
// modalita' online/hotseat: qui basta scegliere esattamente 2 alleati.
function ParticipantPicker({ state, eligibleIds, suggestedIds, onConfirm }) {
  const [selected, setSelected] = useState([])
  const toggle = (id) => setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  const required = 2
  const canConfirm = selected.length === required

  return (
    <div className="card">
      <div className="eyebrow">Possiedi Durindana</div>
      <h2>Scegli i partecipanti alla battaglia</h2>
      <p>Servono <strong>{required}</strong> partecipanti. Ti suggeriamo i due alleati evidenziati, visti in Fase 1.</p>
      <div className="player-list">
        {eligibleIds.map(id => {
          const p = state.players.find(x => x.id === id)
          const isSelected = selected.includes(id)
          const isSuggested = suggestedIds.includes(id)
          return (
            <button
              key={id}
              className={[isSelected ? '' : 'secondary', isSuggested && !isSelected ? 'tutorial-highlight' : ''].join(' ').trim()}
              onClick={() => toggle(id)}
            >
              {p.name}
            </button>
          )
        })}
      </div>
      <button
        className={canConfirm ? 'tutorial-highlight' : ''}
        disabled={!canConfirm}
        onClick={() => onConfirm(selected)}
      >
        Conferma partecipanti ({selected.length}/{required})
      </button>
    </div>
  )
}

// Schermata del Fendente Mortale, semplificata: il bersaglio "giusto" per il
// copione e' gia' evidenziato.
function FendenteMortalePicker({ candidates, highlightId, onConfirm }) {
  const [targetId, setTargetId] = useState('')
  return (
    <div className="card">
      <div className="eyebrow">Potere del tabellone: Fendente Mortale</div>
      <h2>Scegli un cavaliere da colpire</h2>
      <p style={{ color: 'var(--crimson)' }}>
        Attenzione: se colpisci un capofazione o Isabella, la partita puo' finire immediatamente &mdash; ed e'
        proprio quello che vuoi fare adesso.
      </p>
      <div className="player-list">
        {candidates.map(o => (
          <button
            key={o.id}
            className={[targetId === o.id ? '' : 'secondary', o.id === highlightId && targetId !== o.id ? 'tutorial-highlight' : ''].join(' ').trim()}
            onClick={() => setTargetId(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <button
        className={targetId ? 'tutorial-highlight' : ''}
        disabled={!targetId}
        onClick={() => onConfirm(targetId)}
      >
        Colpisci
      </button>
    </div>
  )
}
