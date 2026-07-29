// Carica dinamicamente tutte le immagini delle cartelle assets/*, cosi' non serve
// scrivere un import manuale per ognuna delle ~50 immagini (personaggi + equipaggiamento + tabellone).

const characterModules = import.meta.glob('./characters/*.png', { eager: true, import: 'default' })
const characterFullModules = import.meta.glob('./characters_full/*.png', { eager: true, import: 'default' })
const equipmentModules = import.meta.glob('./equipment/*.png', { eager: true, import: 'default' })
const boardModules = import.meta.glob('./board/*.png', { eager: true, import: 'default' })
const phaseModules = import.meta.glob('./phases/*.png', { eager: true, import: 'default' })
const tableModules = import.meta.glob('./table/*.png', { eager: true, import: 'default' })
const backgroundModules = import.meta.glob('./background/*.{png,jpg,jpeg}', { eager: true, import: 'default' })

function toIdMap(modules) {
  const map = {}
  for (const path in modules) {
    const id = path.split('/').pop().replace(/\.(png|jpg|jpeg)$/, '')
    map[id] = modules[path]
  }
  return map
}

export const CHARACTER_IMAGES = toIdMap(characterModules) // es. CHARACTER_IMAGES.orlando
export const CHARACTER_FULL_IMAGES = toIdMap(characterFullModules) // es. CHARACTER_FULL_IMAGES.orlando (figura intera, usata nel "tieni premuto per rivedere")
export const EQUIPMENT_IMAGES = toIdMap(equipmentModules) // es. EQUIPMENT_IMAGES.durindana
export const BOARD_IMAGES = toIdMap(boardModules) // es. BOARD_IMAGES.board68_cristiana_3
export const PHASE_IMAGES = toIdMap(phaseModules) // es. PHASE_IMAGES.chiamata_alle_armi, PHASE_IMAGES.vittoria_cristiana
export const TABLE_IMAGES = toIdMap(tableModules) // TABLE_IMAGES.tavolo (sfondo della vista circolare del tavolo, opzionale)
export const BACKGROUND_IMAGES = toIdMap(backgroundModules) // BACKGROUND_IMAGES.battaglia (sfondo della pagina, opzionale)
