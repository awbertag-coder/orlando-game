// Tutti i 15 personaggi del gioco completo.
export const CHARACTERS_ALL = {
  orlando: {
    id: 'orlando', name: 'Orlando', faction: 'cristiana', isLeader: true,
    description: `All'inizio del gioco riconosci i tuoi compagni di fazione. Se colpito da "Fendente Mortale" i cristiani perdono. Se in possesso di Durindana vai in battaglia di nascosto.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  agramante: {
    id: 'agramante', name: 'Agramante', faction: 'saracena', isLeader: true,
    description: `All'inizio del gioco riconosci i tuoi compagni di fazione. Se colpito da "Fendente Mortale" i saraceni perdono. Se in possesso di Durindana vai in battaglia di nascosto.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  angelica: {
    id: 'angelica', name: 'Angelica', faction: 'cristiana', lover: 'medoro',
    description: `All'inizio del gioco riconosce Medoro. Se scoperta cambia le carte "Favore in battaglia" ma non la fazione.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'cristiana', value: 1 }]
  },
  ruggero: {
    id: 'ruggero', name: 'Ruggero', faction: 'saracena', lover: 'bradamante',
    description: `All'inizio del gioco riconosce Bradamante. Se scoperto cambia le carte "Favore in battaglia" ma non la fazione.`,
    favorTiles: [{ faction: 'saracena', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  bradamante: {
    id: 'bradamante', name: 'Bradamante', faction: 'cristiana', seeksLover: 'ruggero',
    description: `Quando si attiva il potere sul tracciato cerca Ruggero: se lo trova lo converte e gli cambia le carte "Favore in battaglia".`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'cristiana', value: 1 }]
  },
  medoro: {
    id: 'medoro', name: 'Medoro', faction: 'saracena', seeksLover: 'angelica',
    description: `Quando si attiva il potere sul tracciato cerca Angelica: se la trova la converte e le cambia le carte "Favore in battaglia".`,
    favorTiles: [{ faction: 'saracena', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  astolfo: {
    id: 'astolfo', name: 'Astolfo', faction: 'cristiana',
    description: `La tua carta "Favore in battaglia" ha valore 2.`,
    favorTiles: [{ faction: 'cristiana', value: 2 }, { faction: 'cristiana', value: 2 }]
  },
  rodomonte: {
    id: 'rodomonte', name: 'Rodomonte', faction: 'saracena',
    description: `La tua carta "Favore in battaglia" ha valore 2.`,
    favorTiles: [{ faction: 'saracena', value: 2 }, { faction: 'saracena', value: 2 }]
  },
  gano: {
    id: 'gano', name: 'Gano', faction: 'cristiana', isTraitor: true,
    description: `Se la partita non si e' conclusa entro il settimo turno, la tua fazione diventa saracena.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  marfisa: {
    id: 'marfisa', name: 'Marfisa', faction: 'saracena', isTraitor: true,
    description: `Se la partita non si e' conclusa entro il settimo turno, la tua fazione diventa cristiana.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  rinaldo: {
    id: 'rinaldo', name: 'Rinaldo', faction: 'cristiana', immuneInBattle: true,
    description: `Se sei in battaglia, durante la Fase 3, sei immune da qualsiasi effetto negativo, compreso il fantasma. Ti fai riconoscere dall'Ariosto.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'cristiana', value: 1 }]
  },
  ferrau: {
    id: 'ferrau', name: "Ferrau'", faction: 'saracena', immuneInBattle: true,
    description: `Se sei in battaglia, durante la Fase 3, sei immune da qualsiasi effetto negativo, compreso il fantasma. Ti fai riconoscere da Agramante.`,
    favorTiles: [{ faction: 'saracena', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  brandimarte: {
    id: 'brandimarte', name: 'Brandimarte', faction: 'cristiana', soleParticipantBonus: true,
    description: `Se la sua e' la sola carta "Favore in battaglia" cristiana giocata, allora vale 2. Ti fai riconoscere dall'Ariosto.`,
    favorTiles: [{ faction: 'cristiana', value: 1 }, { faction: 'cristiana', value: 1 }]
  },
  gradasso: {
    id: 'gradasso', name: 'Gradasso', faction: 'saracena', soleParticipantBonus: true,
    description: `Se la sua e' la sola carta "Favore in battaglia" saracena giocata, allora vale 2. Ti fai riconoscere da Agramante.`,
    favorTiles: [{ faction: 'saracena', value: 1 }, { faction: 'saracena', value: 1 }]
  },
  isabella: {
    id: 'isabella', name: 'Isabella', faction: null, isIsabella: true, // fazione assegnata a caso a inizio partita
    description: `Non ti fai riconoscere da nessuna delle due fazioni. Se viene uccisa da "Fendente Mortale" la partita termina e lei e' l'unica vincitrice.`,
    favorTiles: [{ faction: 'cristiana', value: 0 }, { faction: 'saracena', value: 0 }]
  }
}

// Manteniamo il vecchio nome per compatibilita' con il codice esistente
export const CHARACTERS_6 = CHARACTERS_ALL

// Configurazione del mazzo di personaggi da usare per 6 giocatori (roster fisso).
export const SIX_PLAYER_SETUP = ['orlando', 'agramante', 'angelica', 'ruggero', 'bradamante', 'medoro']

// Coppie di personaggi "speculari" (stessa coppia, fazioni opposte). Per 10+ giocatori
// si aggiungono sempre a coppie intere, mai un singolo senza il suo speculare.
const CHARACTER_PAIRS = [
  ['angelica', 'ruggero'],
  ['bradamante', 'medoro'],
  ['astolfo', 'rodomonte'],
  ['gano', 'marfisa'],
  ['rinaldo', 'ferrau'],
  ['brandimarte', 'gradasso']
]

// Dato un numero di giocatori, restituisce l'elenco di id-personaggio da usare.
// Segue la tabella del regolamento; dove e' prevista scelta libera/casuale, sceglie a caso
// mantenendo sempre intere le coppie speculari (mai un personaggio senza il suo opposto).
export function getRosterForPlayerCount(n) {
  const base = ['orlando', 'agramante', 'angelica', 'ruggero', 'bradamante', 'medoro']
  if (n === 6) return [...base]
  if (n === 7) return [...base, Math.random() < 0.5 ? 'gano' : 'marfisa']
  if (n === 8) return [...base, 'gano', 'marfisa']
  if (n === 9) return ['orlando', 'agramante', 'angelica', 'ruggero', 'bradamante', 'medoro', 'astolfo', 'rodomonte', 'isabella']

  // 10-13 (o piu'): Orlando/Agramante sempre presenti; Isabella se il numero e' dispari;
  // il resto si riempie con coppie speculari intere scelte a caso (una coppia esclusa
  // a caso se non tutte servono, mai un personaggio spaiato dal suo speculare).
  const mandatory = ['orlando', 'agramante']
  const isOdd = n % 2 !== 0
  if (isOdd) mandatory.push('isabella')
  const remainingSlots = n - mandatory.length
  const pairsNeeded = Math.floor(remainingSlots / 2)
  const shuffledPairs = [...CHARACTER_PAIRS].sort(() => Math.random() - 0.5)
  const chosenPairs = shuffledPairs.slice(0, pairsNeeded).flat()
  return [...mandatory, ...chosenPairs]
}

// Tabellone 6-8 giocatori: 5 caselle per fazione, nessun Fendente Mortale/Cercare l'amore.
export const BOARD_6_8 = [null, null, 'spie_a_palazzo', 'spie_a_palazzo', 'vittoria']

// Tabellone 9+ giocatori: le caselle 3 e 4 attivano due poteri insieme.
export const BOARD_9_PLUS = [
  'spie_a_palazzo',
  'spie_a_palazzo',
  ['spie_a_palazzo', 'cercare_amore'],
  ['fendente_mortale', 'cercare_amore'],
  'vittoria'
]

export function getBoardTrack(playerCount) {
  return playerCount >= 9 ? BOARD_9_PLUS : BOARD_6_8
}
