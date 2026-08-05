// Le 30 carte equipaggiamento, raggruppate per momento di attivazione ("timing"):
// - instant: si rivelano e applicano subito a inizio Fase 2
// - voluntary: il possessore decide se giocarle durante la Fase 2
// - passive: restano nascoste finche' non si e' bersagliati
// - interrupt: giocabili solo in risposta a una carta di eliminazione dalla battaglia
// - bluff: nessun effetto
// - battle: si rivelano solo se il possessore e' in battaglia (Fase 3)

export const EQUIPMENT = [
  // ISTANTANEE
  {
    id: 'perdita_del_senno', name: 'Perdita del senno', timing: 'instant', effect: 'swap_equipment',
    needsTarget: 2,
    description: 'Rivela la carta quando la ricevi. Scegli due cavalieri: si scambiano la carta equipaggiamento (a meno che non siano istantanee).'
  },
  {
    id: 'ordine_perentorio', name: 'Ordine perentorio', timing: 'instant', effect: 'force_reveal_use',
    needsTarget: 1,
    description: 'Rivela la carta quando la ricevi. Scegli un giocatore: sara\' costretto a rivelare e usare la propria carta.'
  },
  {
    id: 'orca', name: 'Orca', timing: 'instant', effect: 'forced_out',
    description: 'Rivela la carta quando la ricevi. Non puoi partecipare alla battaglia, a meno che l\'effetto non venga annullato.'
  },
  {
    id: 'attacco_arpie', name: 'Attacco delle arpie', timing: 'instant', effect: 'forced_out',
    description: 'Rivela la carta quando la ricevi. Non puoi partecipare alla battaglia, a meno che l\'effetto non venga annullato.'
  },
  {
    id: 'rinforzo_inaspettato', name: 'Rinforzo lungamente atteso', timing: 'instant', effect: 'forced_in',
    description: 'Rivela la carta quando la ricevi. Devi partecipare alla battaglia, a meno che l\'effetto non venga annullato.'
  },
  {
    id: 'richiesta_di_aiuto', name: 'Richiesta di aiuto', timing: 'instant', effect: 'forced_in',
    description: 'Rivela la carta quando la ricevi. Devi partecipare alla battaglia, a meno che l\'effetto non venga annullato.'
  },
  {
    id: 'borsa_di_logistilla', name: 'Borsa di Logistilla', timing: 'instant', effect: 'draw_two',
    description: 'Rivela la carta quando la ricevi. Prendi altre due carte equipaggiamento.'
  },

  // VOLONTARIE
  {
    id: 'ippogrifo', name: 'Ippogrifo', timing: 'voluntary', effect: 'move_durindana',
    value: 2,
    description: 'Puoi scegliere se utilizzarla. Sposta Durindana di due spazi a sinistra.'
  },
  {
    id: 'rubicano', name: 'Rabicano', timing: 'voluntary', effect: 'move_durindana',
    value: 1,
    description: 'Puoi scegliere se utilizzarla. Sposta Durindana di uno spazio a sinistra.'
  },
  {
    id: 'fusberta', name: 'Fusberta', timing: 'voluntary', effect: 'eliminate_choice',
    description: 'Puoi scegliere se utilizzarla. Scegli un cavaliere: viene eliminato dalla battaglia.'
  },
  {
    id: 'gradasso_card', name: 'Gradasso', timing: 'voluntary', effect: 'faction_bonus',
    faction: 'saracena',
    description: 'Puoi scegliere se utilizzarla. Per questo turno i Saraceni partono con +1 nel favore in battaglia.'
  },
  {
    id: 'carlo_magno', name: 'Carlo Magno', timing: 'voluntary', effect: 'faction_bonus',
    faction: 'cristiana',
    description: 'Puoi scegliere se utilizzarla. Per questo turno i Cristiani partono con +1 nel favore in battaglia.'
  },
  {
    id: 'olifante', name: 'Olifante', timing: 'voluntary', effect: 'participants_delta',
    value: 1,
    description: 'Puoi scegliere se utilizzarla. Il possessore di Durindana deve scegliere un partecipante aggiuntivo.'
  },
  {
    id: 'argalia', name: 'Argalia', timing: 'voluntary', effect: 'participants_delta',
    value: -1,
    description: 'Puoi scegliere se utilizzarla. Il possessore di Durindana deve scegliere un partecipante in meno.'
  },
  {
    id: 'caligorante', name: 'Caligorante', timing: 'voluntary', effect: 'steal_equipment',
    description: 'Puoi scegliere se utilizzarla. Ruba una carta equipaggiamento non ancora giocata di un altro cavaliere.'
  },
  {
    id: 'spazzata', name: 'Spazzata', timing: 'voluntary', effect: 'eliminate_adjacent',
    description: 'Puoi scegliere se utilizzarla. Colpisci un cavaliere adiacente a te in ordine di turno: lo elimini dalla battaglia.'
  },
  {
    id: 'colpi_consecutivi', name: 'Colpi consecutivi', timing: 'voluntary', effect: 'eliminate_draw_on_success',
    description: 'Puoi scegliere se utilizzarla. Elimina un cavaliere dalla battaglia; se riesce, pesca una nuova carta equipaggiamento.'
  },
  {
    id: 'anello_di_angelica', name: 'Anello di Angelica', timing: 'reactive', effect: 'cancel_equipment_effect',
    description: 'Si attiva subito dopo che un effetto viene applicato: puoi scegliere se annullarlo (anche se non era diretto a te).'
  },
  {
    id: 'brunello_il_ladro', name: 'Brunello il ladro', timing: 'voluntary', effect: 'cancel_ring',
    description: 'Puoi scegliere se utilizzarla. Annulla l\'effetto dell\'Anello di Angelica, se e\' stato rivelato.'
  },
  {
    id: 'palazzo_di_atlante', name: 'Il Palazzo di Atlante', timing: 'reactive', effect: 'redirect_target',
    description: 'Si attiva subito dopo che un\'eliminazione va a segno: puoi scegliere se ridirigerla su un nuovo bersaglio (esclusi i movimenti di Durindana).'
  },

  // PASSIVA
  {
    id: 'atlante', name: 'Atlante', timing: 'passive', effect: 'immune_all',
    description: 'Immune da ogni effetto di equipaggiamento e del tabellone per il resto di questo turno. Si rivela solo se bersagliato.'
  },

  // INTERRUZIONE
  {
    id: 'parata', name: 'Parata', timing: 'interrupt', effect: 'interrupt_eliminate_attacker',
    description: 'Gioca questa carta se sei bersaglio di un\'eliminazione dalla battaglia. Elimina chi l\'ha giocata contro di te e vai automaticamente in battaglia.'
  },
  {
    id: 'orrilo', name: 'Orrilo', timing: 'interrupt', effect: 'interrupt_immune_elimination',
    description: 'Gioca questa carta se sei bersaglio di un\'eliminazione dalla battaglia. Sei immune, anche dal blocco del fantasma.'
  },

  // BLUFF
  {
    id: 'mama_o_non_mama', name: "M'ama o non m'ama", timing: 'bluff', effect: 'no_effect',
    description: 'Nessun effetto. Non rivelare la carta se non obbligato.'
  },
  {
    id: 'cavallo_stanco', name: 'Cavallo stanco', timing: 'bluff', effect: 'no_effect',
    description: 'Nessun effetto. Non rivelare la carta se non obbligato.'
  },

  // BATTAGLIA
  {
    id: 'lancia_spezzata', name: 'Lancia spezzata', timing: 'battle', effect: 'battle_modifier',
    value: -1,
    description: 'Rivela questa carta se sei in battaglia. Il tuo favore in battaglia diminuisce di 1.'
  },
  {
    id: 'forza_bruta', name: 'Forza bruta', timing: 'battle', effect: 'battle_modifier',
    value: 1,
    description: 'Rivela questa carta se sei in battaglia. Il tuo favore in battaglia aumenta di 1.'
  },
  {
    id: 'scudo_abbagliante', name: 'Scudo abbagliante', timing: 'battle', effect: 'battle_block_blind',
    description: 'Rivela questa carta se sei in battaglia. Blocca un altro cavaliere senza vederne il favore.'
  },
  {
    id: 'attacco_alle_spalle', name: 'Attacco alle spalle', timing: 'battle', effect: 'battle_self_join',
    description: 'Rivela questa carta solo all\'Ariosto durante la Fase 3. Sei anche tu in battaglia, se non eliminato.'
  },
  {
    id: 'corno_del_terrore', name: 'Corno del terrore', timing: 'battle', effect: 'battle_all_others_penalty',
    description: 'Rivela questa carta durante la Fase 3, se sei in battaglia. Puoi scegliere di giocarla: tutti gli altri cavalieri hanno -1 al favore in battaglia.'
  }
]

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map(c => [c.id, c]))

// Mazzo iniziale: un id ripetuto per ogni copia fisica (qui semplifichiamo con 1 copia ciascuna =
// 26 carte "normali" -- il regolamento parla di 30 carte totali; alcune ricorrono piu' volte nel
// mazzo fisico. Per il prototipo usiamo 1 copia per id e peschiamo con reinserimento se il mazzo finisce.
export function buildEquipmentDeck(excludeIds = []) {
  return EQUIPMENT.filter(c => !excludeIds.includes(c.id)).map(c => c.id)
}
