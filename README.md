# mario music

Un servizio di streaming musicale self-hosted per la propria libreria, scritto
per capire come funziona davvero un'app tipo Apple Music: indicizzazione dei
file, catalogo, HTTP Range, buffering, coda di riproduzione.

Non usa marchi, loghi o contenuti Apple: è un'app originale ispirata a quel
modello di prodotto.

## Avvio rapido

```bash
npm install
npm run seed     # genera 18 brani finti in media/library/ (opzionale)
npm run scan     # indicizza i file in data/library.db
npm run dev      # server su :4000, interfaccia su http://localhost:5173
npm test         # test delle regole HTTP Range, server e service worker
```

Serve **ffmpeg** nel PATH (`brew install ffmpeg`).

Per la versione compilata, che gira su un'unica porta:

```bash
npm run build && npm run dev:server   # tutto su http://localhost:4000
```

## Come aggiungere la tua musica

Metti i file in `media/library/`. Contano i tag dentro al file, non i nomi
delle cartelle; queste servono solo come ripiego per i file senza metadati:

```
media/library/
└── Nome Artista/
    └── Nome Album (2024)/
        ├── 01 - Titolo.mp3
        └── cover.jpg          ← usata se la copertina non è nei tag
```

Poi `npm run scan`. È idempotente: confronta dimensione e data di modifica e
rilegge solo i file cambiati. Le tracce i cui file sono spariti vengono tolte
dal database.

Non è però necessario lanciarlo a mano: **il server ripassa la libreria da solo
ogni 5 minuti**, e il pulsante ⟳ Aggiorna nella barra laterale lo forza subito.
Cambia l'intervallo con `SCAN_INTERVAL_MIN=15 npm start`, oppure disattivalo con
`SCAN_INTERVAL_MIN=0`.

Perché un ripasso periodico e non un watcher sul filesystem: copiare un file
genera decine di eventi, e il file va indicizzato *a copia finita*. Il ripasso
periodico si autoripara — se becca un file a metà copia, al giro dopo dimensione
e data sono cambiate e lo rilegge. Meno codice, meno casi limite.

Formati riconosciuti: mp3, m4a/aac, flac, ogg/opus, wav, aiff.

## Com'è fatto

```
scripts/seed.ts   genera una libreria finta con ffmpeg (accordi sintetizzati)
scripts/scan.ts   il comando `npm run scan`, un guscio sopra lo scanner
server/scanner.ts ffprobe → tag e durata → SQLite; estrae le copertine
server/db.ts      schema: artists → albums → tracks
server/stream.ts  invio dei file con HTTP Range (il cuore dello streaming)
server/index.ts   server node:http nudo: API JSON + streaming
web/public/sw.js    service worker: cache dell'app e dei brani scaricati
web/src/player.tsx  stato di riproduzione: un solo <audio> per tutta l'app
web/src/downloads.tsx  scaricamento dei brani nella Cache API
web/src/views.tsx   album, artisti, brani, ricerca, scaricati
```

### Il database è usa e getta

`data/library.db` è interamente ricostruibile da `npm run scan`: la sorgente
di verità restano i file audio sul disco. Cancellarlo non perde niente.

### Lo streaming, in concreto

Il browser non scarica il brano intero: chiede fette di byte.

```
→ GET /api/tracks/7/stream     Range: bytes=0-
← 206 Partial Content          Content-Range: bytes 0-869/870363
                               Accept-Ranges: bytes
```

Quando trascini la barra di avanzamento, il player abbandona la richiesta in
corso e ne apre una nuova a partire dal byte corrispondente. Il calcolo
byte ↔ secondi lo fa il browser leggendo l'intestazione del file.

Tre header fanno tutto il lavoro:

| header | senza di lui |
|---|---|
| `Accept-Ranges: bytes` | il browser non prova nemmeno a chiedere una fetta: barra non trascinabile |
| `Content-Range` | il browser non sa dove sta la fetta ricevuta |
| `ETag` / `Last-Modified` | niente cache e nessuna protezione da file cambiati a metà scaricamento |

`server/stream.ts` gestisce anche i casi meno ovvi: `bytes=-500` (gli ultimi N
byte, usato per leggere i tag in coda ai file), `416` quando l'intervallo cade
fuori dal file, `304` sulle richieste condizionali, e `If-Range` per non
incollare pezzi di due versioni diverse dello stesso file.

## Ascolto offline

Il pulsante ↓ su un album o su un brano lo salva nel browser. Da lì in poi
l'app si apre e suona **con il server spento**: provalo fermando `npm run dev`
e ricaricando la pagina.

Funziona solo sulla versione compilata (`npm run build && npm run dev:server`):
in sviluppo Vite serve i moduli uno a uno e l'app non si ricostruisce offline,
anche se i brani scaricati restano suonabili.

### Il problema che rende la cosa interessante

La Cache API sa memorizzare solo risposte **intere**: status 200, corpo tutto.
Ma `<audio>` chiede fette (`Range: bytes=200000-`). Restituirgli il file intero
con status 200 su Chrome passa; su Safari no, perché pretende un 206 — e senza
quello il seek smette di funzionare.

Quindi in `sw.js` il 206 va ricostruito a mano: si prende il blob dalla cache,
lo si affetta con `blob.slice()` e si riscrivono `Content-Range` e
`Content-Length`. È la stessa logica di `server/stream.ts`, dall'altro capo del
filo. `npm test` verifica che le due implementazioni si comportino allo stesso
modo, byte per byte.

### Due trappole già disinnescate

- **`sw.js` non va mai messo in cache HTTP a lungo.** Un service worker con
  `max-age` lungo non si aggiorna più, e non si torna indietro senza svuotare
  la cache a mano. Il server lo serve con `no-cache`.
- **La cache dei brani non porta il numero di versione** (`media`, non
  `media-v3`). Contiene roba dell'utente: legarla alla versione del codice
  vorrebbe dire cancellargli i download a ogni aggiornamento dell'app.

### Limiti

Lo spazio lo concede il browser e può revocarlo se il disco si riempie:
`navigator.storage.persist()` chiede di non farlo, ma può dire di no (la
schermata "Scaricati" mostra se la richiesta è stata accolta). I download sono
legati a quel browser su quel dispositivo: non è una libreria sincronizzata, e
non c'è nessun DRM.

## Verificare a mano

```bash
curl -s -D - -o /dev/null -H "Range: bytes=0-99" localhost:4000/api/tracks/1/stream
```

## Tappe

- [x] **1. Fondamenta** — indicizzazione, catalogo, streaming con Range, player
- [x] **2. Offline** — service worker, download dei brani, Range ricostruito dalla cache
- [ ] **3. Transcodifica** — FLAC e formati esotici convertiti al volo per i browser che non li leggono
- [ ] **4. Playlist e preferiti** — con riordino, e conteggio degli ascolti
- [ ] **5. Ricerca seria** — SQLite FTS5 al posto di `LIKE`
- [x] **6. Coda visibile** — pannello "in riproduzione", riordino, "riproduci dopo"
- [ ] **7. Utenti** — login, libreria per utente, streaming autenticato
