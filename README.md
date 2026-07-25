# Orlando alle Crociate — Prototipo (v0.3)

Due modalita' di gioco: **hotseat** (un solo dispositivo, passandoselo a turno) e **online** (un dispositivo a testa, sulla stessa rete WiFi o via Tailscale). Supporta da **6 a 12 giocatori**, con tutti e 15 i personaggi del regolamento completo.

Vedi `Orlando_alle_Crociate_Specifica_Tecnica.md` per tutte le regole formalizzate su cui si basa questo codice.

## Novita' di questa versione (v0.3)

- **Numero di giocatori variabile** (6-12) scelto a inizio partita, sia in hotseat che online: il roster dei personaggi e il tabellone (6-8 vs 9+) si adattano automaticamente.
- **Tutti i 15 personaggi**: Astolfo, Rodomonte, Gano, Marfisa, Rinaldo, Ferrau', Brandimarte, Gradasso, Isabella, oltre ai 6 gia' presenti.
- **Fase 1** (8+ giocatori): schermata informativa privata a inizio partita (alleati di fazione per i capi, identita' dell'amore per Angelica/Ruggero).
- **Fantasma**: chi viene colpito da Fendente Mortale della fazione opposta torna come fantasma, con il potere di bloccare un partecipante a battaglia senza vederne il favore.
- **Fendente Mortale** (tabellone 9+): elimina un cavaliere; casi speciali per Orlando/Agramante (vittoria immediata dell'avversario) e Isabella (vittoria immediata in solitaria).
- **Cercare l'amore** (tabellone 9+): Bradamante/Medoro possono convertire in segreto le tessere favore del proprio amore, se lo indovinano.
- **Gano/Marfisa**: cambio di fazione automatico e silenzioso se la partita supera il 7° turno.
- **Tavolo opzionale** (online): interruttore per mostrare/nascondere il tavolo con nomi e sospetti personali.
- **Modalita' supervisore** (online): un dispositivo puo' collegarsi come osservatore, senza occupare un posto da giocatore, vedendo tutti i personaggi, fazioni ed equipaggiamenti in tempo reale — utile per monitorare/testare la partita.

**Nota su due valori non confermati**: Rinaldo/Ferrau' e Brandimarte/Gradasso hanno tessere favore assunte a valore 1 (come i cavalieri "normali"), perche' non mi hai mai confermato il loro valore esatto. Se e' sbagliato, dimmelo e correggo `src/engine/characters.js` (i valori sono commentati con "NOTA" nel file).

## Come avviarlo (hotseat)

Serve [Node.js](https://nodejs.org) installato (versione 18 o superiore va bene).

```bash
cd orlando-game
npm install
npm run dev
```

Il terminale mostrerà un indirizzo tipo `http://localhost:5173` — aprilo nel browser, scegli "Hotseat locale" e giocate passandovi il dispositivo a ogni turno.

## Giocare con amici fuori casa (Tailscale)

Per estendere la modalità online oltre la rete WiFi di casa, senza aprire porte sul router: [Tailscale](https://tailscale.com) crea una rete privata virtuale tra i dispositivi che la installano — una volta collegati, è come se fossero tutti sulla stessa rete locale, ovunque si trovino. **Non serve modificare nulla del codice**: il client calcola già l'indirizzo del server in base a come viene raggiunto, quindi funziona automaticamente.

**Sul PC host (quello che fa girare server + interfaccia):**
1. Installa Tailscale da [tailscale.com/download](https://tailscale.com/download) e accedi (gratuito per uso personale, puoi accedere con Google/Microsoft/GitHub).
2. Avvia normalmente `npm run server` e `npm run dev` come al solito.
3. Trova il tuo indirizzo Tailscale: apri l'icona di Tailscale nella barra delle applicazioni, oppure da terminale `tailscale ip -4` — è un indirizzo tipo `100.x.y.z`.

**Per condividere solo il tuo PC con gli amici (senza dargli accesso a tutta la tua rete):**
1. Vai su [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines), trova il tuo PC nella lista.
2. Clicca sui tre puntini accanto al dispositivo → **Share** → genera un link di condivisione.
3. Manda quel link a ciascun amico: cliccandolo, gli verrà chiesto di installare Tailscale (se non ce l'ha già) e il tuo PC comparirà nella sua rete, senza dargli accesso al resto della tua rete di casa.

**Ogni amico**, una volta condiviso il dispositivo:
- apre il browser e va su `http://100.x.y.z:5173` (il tuo indirizzo Tailscale, non quello WiFi locale)
- sceglie "Online", stesso nome-stanza concordato con gli altri

Tutto il resto (redazione delle informazioni segrete, riconnessione, ecc.) funziona esattamente come in LAN.

## Modalita' online (dispositivi diversi)

Un dispositivo a testa, collegati alla stessa rete WiFi.

**Sul PC che fa da server (host):**
```bash
cd orlando-game
npm install
npm run server    # avvia il server di gioco (porta 3001)
```
In un **secondo terminale**, sempre nella stessa cartella:
```bash
npm run dev        # avvia l'interfaccia (porta 5173)
```
Il terminale di `npm run dev` mostra un indirizzo tipo `http://192.168.x.x:5173/` — quello e' il link da aprire su **tutti e 6 i dispositivi** (incluso quello host), tutti sulla stessa rete WiFi.

Dalla schermata iniziale, scegliere "Online" invece di "Hotseat locale". Ogni giocatore inserisce il proprio nome e un **codice stanza a piacere** (uguale per tutti e 6, es. "CROCIATA"). La partita parte automaticamente non appena il sesto giocatore entra nella stanza.

**Come funziona dietro le quinte:** il server tiene l'unica copia "vera" della partita e manda a ciascun dispositivo solo le informazioni che gli spettano — le tessere favore in battaglia, per esempio, non vengono mai mandate agli altri giocatori (esattamente come nel gioco fisico, dove le vede solo l'Ariosto).

**Riconnessione:** se un giocatore chiude la scheda o perde la connessione, la partita prosegue; quando riapre lo stesso link sullo stesso dispositivo, rientra automaticamente al suo posto (il browser ricorda un token salvato). Se pero' tocca proprio a lui agire mentre e' disconnesso (es. deve rivelare il favore in battaglia), il gioco resta in attesa del suo ritorno — l'auto-risoluzione per i disconnessi (prevista nella specifica tecnica) non e' ancora implementata in questa prima versione online.

**Limite attuale:** una sola partita alla volta per codice stanza; se la stanza e' gia' piena o la partita e' gia' iniziata, un settimo giocatore che prova a entrare riceve un messaggio di errore.

## Struttura del codice

- `src/engine/` — tutta la logica di gioco (personaggi, equipaggiamenti, motore delle regole). **Nessuna dipendenza da React**: usata sia dall'hotseat sia importata direttamente dal server online, senza modifiche.
- `src/shared/ui.jsx` — componenti di interfaccia condivisi tra le due modalita' (tabellone, badge di fazione, pulsante "tieni premuto", pannello log).
- `src/LocalHotseatApp.jsx` — interfaccia hotseat, con il flusso "passa il dispositivo".
- `src/OnlineApp.jsx` — interfaccia online: si collega al server via Socket.io, mostra solo le proprie informazioni segrete.
- `server/index.js` — il server Node.js + Socket.io: tiene lo stato vero della partita.
- `server/redact.js` — decide cosa ciascun dispositivo puo' vedere dello stato di gioco.
- `src/styles.css` — tema visivo (a richiamare l'estetica cristiani/saraceni delle grafiche del gioco).

## Versione Android (PWA)

Non ho un ambiente con Android Studio/SDK per compilare un vero file `.apk` installabile — non è qualcosa che posso costruire da qui. Quello che *ho* fatto è rendere il gioco una **PWA (Progressive Web App)**: un sito che si comporta come un'app quando lo apri da telefono.

**Cosa funziona già, senza fare nulla di speciale:** apri il gioco nel browser Android (Chrome), tocca il menu (⋮) → "Aggiungi a schermata Home". Compare un'icona dedicata (quella a tema pergamena/croce/mezzaluna che ho creato) che apre il gioco a schermo intero, senza barra degli indirizzi — già un'esperienza molto simile a un'app vera, e funziona anche sulla LAN/Tailscale come ora.

**Un limite tecnico onesto da sapere:** ho aggiunto anche un service worker (per la cache e un minimo di funzionamento offline), ma i browser lo attivano solo in un "contesto sicuro" — cioè HTTPS, oppure `localhost`. Sul tuo PC in LAN state usando `http://192.168.x.x:5173` (HTTP semplice, non HTTPS), quindi il service worker resta silenziosamente inattivo: l'icona sulla home funziona comunque, ma senza la cache offline vera e propria. Se in futuro volete anche quella, servirebbe mettere HTTPS davanti al server (fattibile con Tailscale o un proxy con certificato) — ditemi se vi interessa e lo approfondiamo.

**Se in futuro volete un vero .apk**, la strada più diretta è [Capacitor](https://capacitorjs.com): prende il progetto React/Vite che già c'è (senza riscritture) e lo impacchetta come app Android nativa. Serve però Android Studio installato sul vostro PC — è un passo che *voi* potete fare seguendo la loro guida, io non posso generare il file compilato da questo ambiente.

## Modalita' Esperti / Novizi

Ora, sia in hotseat che online, si sceglie a inizio partita:
- **Esperti**: con le carte equipaggiamento (Fase 2 completa, come finora).
- **Novizi**: salta del tutto la Fase 2 — si passa direttamente alla scelta dei partecipanti a ogni round, per una partita più semplice e veloce.

## Correzioni recenti (sesta iterazione)

- **Bug serio corretto — il gioco si bloccava ai passaggi di fase (risultato battaglia, cambio giocatore)**: la logica che faceva avanzare automaticamente il gioco (es. da "tutti hanno rivelato" al risultato, o da un giocatore al successivo) viveva dentro componenti che React "rimonta" (ricrea da zero) proprio nei momenti di passaggio — perdendo cosi' la propria memoria e non scattando mai. Corretto spostando questa logica in un punto stabile dell'app che non viene mai ricreato, valido sia in modalita' esperti che novizi. Anche questo era difficile da vedere senza giocarci per bene: grazie per la segnalazione precisa.

## Correzioni recenti (quinta iterazione)

- **Bug serio corretto — Parata/Orrilo/Atlante non rispondevano se il turno normale del possessore era gia' passato**: se un giocatore con Parata (o Orrilo, o Atlante) aveva gia' visto la propria schermata normale in Fase 2 prima di essere attaccato, la carta veniva erroneamente considerata "gia' usata" e non poteva piu' rispondere. Ora il gioco tiene traccia separatamente di "il turno normale e' passato" (per far avanzare la fase) e "la carta e' stata davvero giocata" (per l'idoneita' a rispondere) — Parata/Orrilo/Atlante restano disponibili finche' non vengono davvero attivate.
- **Anello di Angelica e Palazzo di Atlante ora funzionano davvero**: prima si limitavano a scrivere una nota nel registro. Ora annullano/ridirigono realmente l'ultimo effetto applicato (spostamento di Durindana, eliminazione dalla battaglia, bonus di fazione, variazione partecipanti). Brunello il ladro ripristina l'effetto che Anello di Angelica aveva appena annullato. Il furto di equipaggiamento (Caligorante) resta l'unico caso non ancora annullabile.
- **Borsa di Logistilla**: corretto un bug di React che, in alcuni casi, impediva alla fase di avanzare dopo la seconda carta pescata (funzionava per la prima, si bloccava sulla seconda). Lo stesso bug poteva capitare anche con altre catene di carte extra (Caligorante, Colpi consecutivi); corretto per tutte.
- **Partecipanti obbligati**: ora si sommano ai 2 partecipanti richiesti invece di sostituirne uno — se sei costretto a partecipare, il possessore di Durindana deve comunque scegliere 2 partecipanti liberi in piu' a te.
- **Punteggio della battaglia nascosto**: quando si annuncia la fazione vincente, non si vede piu' il punteggio numerico (es. "Cristiani 3 - Saraceni 2"), solo chi ha vinto — coerente con la regola che le tessere favore restano segrete. Anche lato server, i punteggi numerici non vengono proprio piu' mandati ai client (prima erano solo nascosti nell'interfaccia, ma tecnicamente presenti nei dati).

## Correzioni recenti (quarta iterazione)

- **Borsa di Logistilla**: ora funziona davvero — le due carte pescate entrano in una coda e vengono mostrate e attivate una alla volta, esattamente come la mano normale (prima restavano inutilizzate fino a fine round). La stessa coda gestisce anche le carte rubate con Caligorante e il pescaggio bonus di Colpi consecutivi.

## Correzioni recenti (terza iterazione)

- **Tabellone 9+**: ora viene mostrata davvero la grafica del tabellone giusto in base al numero di giocatori (prima veniva sempre mostrato quello 6-8 per errore). Per il tabellone 9+ sto usando temporaneamente l'immagine originale non ritagliata (non ho ancora una versione allineata come quella che mi hai mandato per il 6-8) — se vuoi che sia precisa quanto l'altra, mandami una versione ritagliata allo stesso modo.
- **Isabella**: non le viene piu' assegnata una fazione casuale (cristiana/saracena) all'inizio partita — resta sempre "nessuna fazione", coerente con la sua carta ("non ti fai riconoscere da nessuna delle due fazioni"). Dove viene mostrata la sua identita' (schermata "tieni premuto", modalita' supervisore), appare ora un'etichetta verde dedicata "Suora di clausura" invece di un colore di fazione errato.
- **Finestra di risposta per Parata/Orrilo**: bug importante corretto. Prima, le carte di eliminazione (Fusberta, Spazzata, Colpi consecutivi, Orca, Attacco delle arpie) applicavano l'eliminazione subito, ignorando completamente se il bersaglio possedeva Parata o Orrilo. Ora, se il bersaglio ha una di queste due carte non ancora rivelata, il gioco si ferma e gli da' la possibilita' di giocarla prima di applicare l'eliminazione — testato con script automatici per entrambe le carte.
- **Atlante**: stesso tipo di correzione — prima l'immunita' non si attivava mai. Ora, la prima volta che il possessore di Atlante viene bersagliato da un'eliminazione, la carta si rivela automaticamente e lo rende immune (in modo permanente) da quel momento in poi.
- **Roster per 10-13 giocatori**: corretto per rispettare la regola "sempre a coppie speculari" — prima venivano scelti singoli personaggi a caso, col rischio di avere es. Astolfo senza Rodomonte. Ora si scelgono sempre coppie intere (Angelica/Ruggero, Bradamante/Medoro, Astolfo/Rodomonte, Gano/Marfisa, Rinaldo/Ferrau', Brandimarte/Gradasso), lasciando fuori una coppia intera se non tutte servono. Portato anche il numero massimo di giocatori selezionabile a 13.

**Nota importante ancora aperta**: Anello di Angelica, Brunello il ladro e Il Palazzo di Atlante (che annullano/ridirigono l'effetto di un'altra carta gia' giocata) restano ancora semplificate come prima — si limitano a scrivere una nota nel registro, senza annullare/ridirigere davvero l'effetto. A differenza di Parata/Orrilo (che rispondono a un evento preciso e circoscritto: un'eliminazione), queste tre richiederebbero un vero e proprio storico degli effetti applicati con possibilita' di "disfarli" — un lavoro via' ampio che non ho ancora affrontato. Se ci giocate spesso, ditemelo e lo mettiamo in cima alla lista.

## Correzioni recenti (seconda iterazione)

- **Ritaglio grafiche**: personaggi, equipaggiamento e tabellone ora usano un rilevamento automatico del bordo/riquadro invece di un taglio a griglia fissa, per centrare meglio ogni immagine.
- **Tabellone più grande**: le caselle del percorso sono ora molto più visibili (proporzioni reali delle immagini, altezza minima aumentata).
- **Orlando/Agramante e Durindana**: l'aggiunta segreta alla battaglia è ora un'opzione a parte che si somma al numero di partecipanti richiesto, invece di sostituirne uno.
- **Spazzata**: limitata correttamente ai due vicini di turno (chi gioca subito prima e subito dopo), non a un cavaliere qualsiasi — adattamento della meccanica fisica "il vicino al tavolo" alla versione digitale.
- **Bug del round 2 mancante**: risolto — la fine di un round ora fa partire correttamente la distribuzione delle carte del round successivo.

## Cosa funziona in questa prima versione

- Assegnazione segreta dei personaggi e delle tessere favore in battaglia, con **ritratto grafico** del personaggio
- Distribuzione ed effetti delle carte equipaggiamento istantanee, mostrate con la **grafica reale della carta** (Perdita del senno, Ordine perentorio, Orca, Attacco delle arpie, Rinforzo lungamente atteso, Richiesta di aiuto, Borsa di Logistilla)
- Carte volontarie, sempre con grafica reale: sposta Durindana, elimina un partecipante, bonus di fazione, +1/-1 partecipanti, ruba equipaggiamento
- Selezione dei partecipanti alla battaglia (rispettando obblighi e numero minimo/modificato)
- Rivelazione delle tessere favore, incluse le carte da battaglia (Lancia spezzata, Forza bruta, Scudo abbagliante, Corno del terrore)
- Calcolo del risultato, avanzamento sul **tabellone illustrato reale** "Percorso verso la Gloria" (le caselle si riempiono visivamente man mano che si vincono le battaglie), potere "Spie a palazzo", condizione di vittoria a 5

## Note sulle grafiche

Le immagini in `src/assets/` sono state ritagliate automaticamente dai fogli che mi hai fornito (personaggi, equipaggiamento, tabelloni), assumendo una griglia regolare 5 colonne x 2 righe per ciascun foglio. Se noti un ritratto o una carta associata al personaggio/effetto sbagliato, è quasi certamente un disallineamento nel ritaglio — segnalamelo con il nome della carta/personaggio coinvolto e lo correggo.

Corrette anche due piccole discrepanze di nome tra il regolamento originale e la grafica reale della carta (la grafica stampata è la fonte più affidabile): "Rinforzo inaspettato" → "Rinforzo lungamente atteso", "Rubicano" → "Rabicano".


## Semplificazioni note di questa versione (da estendere più avanti)

- **Anello di Angelica / Brunello il ladro / Il Palazzo di Atlante**: l'annullamento e il cambio bersaglio vengono segnalati nel registro di gioco, ma la risoluzione esatta (quale effetto viene davvero annullato/ridiretto) va ancora concordata manualmente dal gruppo finché non implementiamo uno storico di effetti "reversibili" più completo.
- **Attacco alle spalle**: attualmente si comporta come una normale carta da battaglia; non implementa ancora la possibilità per chi la possiede di unirsi segretamente alla battaglia pur non essendo stato scelto come partecipante.
- **Borsa di Logistilla**: le due carte pescate extra vengono aggiunte "in riserva" ma non è ancora possibile giocarle dall'interfaccia in questa versione — tornano allo scarto a fine round.
- Nessun timer di risposta (non serve nell'hotseat: essendo sullo stesso dispositivo, si decide "dal vivo" senza fretta). Verrà introdotto quando costruiremo la versione in rete.
- Solo configurazione a 6 giocatori: Fase 1 di rivelazione, Fantasma, Gano/Marfisa, Isabella non sono ancora implementati (verranno aggiunti quando estenderemo a 7+ giocatori).

## Prossimi passi possibili

1. Giocare qualche partita di prova e segnalare bug o regole che si comportano diversamente da come vi aspettavate.
2. Completare le semplificazioni sopra elencate.
3. Estendere a 7-8-9+ giocatori (Fase 1, Fantasma, Gano/Marfisa, Isabella).
4. Solo dopo: aggiungere la versione in rete (server Node.js + Socket.io), riusando il codice in `src/engine/` quasi senza modifiche.
