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
delle cartelle; queste servono solo come ripiego per i file senza metadati.
Puoi buttare dentro i file sciolti o raggrupparli per album, come preferisci:

```
media/library/
├── canzone.mp3                    → nessun album: finisce in "Singoli"
├── Nome Album (2024)/
│   ├── 01 - Titolo.mp3
│   └── cover.jpg                  ← usata se la copertina non è nei tag
├── Cofanetto/
│   ├── CD1/ …                     → stesso album, disco 1
│   └── CD2/ …                     → stesso album, disco 2
└── Nome Artista/
    └── Nome Album/ …              → anche questa disposizione va bene
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
server/lyrics.ts  testi da LRCLIB, con ripiego sui tag del file
server/playlists.ts creazione e ordinamento delle playlist
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

## Preferiti e ascolti

Il cuore si mette dal menù ⋯ di un brano e compare nella riga solo se il brano
è preferito — la colonna però c'è sempre, anche vuota, o le righe si
disallineerebbero fra loro. La schermata **Preferiti** li raccoglie tutti.

**Un ascolto conta solo quando il brano è stato davvero ascoltato:** metà della
durata, oppure quattro minuti, quello che viene prima. È la convenzione dello
scrobbling. Contare all'avvio riempirebbe "i più ascoltati" di pezzi saltati
dopo tre secondi.

Gli ascolti sono **una riga per ascolto**, non un contatore sulla traccia:
costa qualche migliaio di righe l'anno — niente, per SQLite — e in cambio dà
gratis "di recente" e "più ascoltati nell'ultimo mese", che da un contatore non
si ricavano più.

Un limite noto: la soglia guarda la posizione nel brano, non il tempo
effettivamente ascoltato. Saltando avanti oltre metà, l'ascolto viene contato
lo stesso.

## Ricerca

Indice full-text FTS5, ricostruito da zero alla fine di ogni scan. Niente
trigger per tenerlo allineato: lo scanner è l'unico che modifica le tracce, e
un rebuild completo costa millisecondi e non può andare fuori sincrono.

Il tokenizer usa `remove_diacritics 2`, quindi "celine" trova "Céline Dion" e
"eternite" trova "Éternité". L'ordinamento è per punteggio bm25 con pesi
diversi per colonna: il titolo conta più dell'artista, che conta più dell'album.

**Il testo digitato non finisce mai grezzo dentro `MATCH`.** FTS5 ha una
sintassi con operatori (`AND`, `OR`, `NOT`, virgolette, `*`, `:`, `^`): una
virgoletta spaiata farebbe fallire l'intera query con un errore di sintassi. Si
estraggono solo lettere e numeri e ogni parola si racchiude fra virgolette, con
un `*` finale per la ricerca per prefisso mentre si scrive.

**Differenza rispetto a prima:** `LIKE '%testo%'` trovava le sottostringhe in
mezzo alle parole, FTS5 no. "onder" non trova più "Wonderwall". In cambio c'è
un indice vero al posto di una scansione completa a ogni tasto, l'ordinamento
per pertinenza e la tolleranza agli accenti.

## Playlist

Si creano dalla sezione Playlist o dal menù ⋯ di un brano o di un album, che
permette anche di crearne una nuova al volo. Dentro una playlist i brani si
riordinano con le frecce e si tolgono con la ✕.

Ogni playlist può avere una **copertina scelta da te**: "Scegli immagine"
nella sua pagina. L'immagine passa per ffmpeg, che la normalizza in un JPEG
quadrato da 640px e fa anche da controllo — se non riesce a decodificarla, non
era un'immagine e il caricamento viene rifiutato. Senza copertina si vede un
mosaico dei primi quattro album.

Il file è nominato con l'impronta del suo contenuto, non con l'id della
playlist: così cambiando immagine cambia anche l'URL, e nessuna cache può
servirti quella vecchia. Cambiando o togliendo la copertina, il file vecchio
viene cancellato — ma solo se nessun'altra playlist lo usa, perché due
playlist con la stessa immagine condividono lo stesso file.

L'ordine sta in una colonna `position` tenuta sempre contigua. Le riscritture
cancellano e reinseriscono le righe dentro una transazione invece di
aggiornarle una a una: la chiave primaria è `(playlist, posizione)`, quindi
aggiornare in sequenza colliderebbe a metà strada con una posizione ancora
occupata. La chiave *non* è `(playlist, brano)` apposta — lo stesso brano può
comparire due volte nella stessa playlist, ed è legittimo.

## Barra in fondo, su telefono

Una pillola con quattro schede — Album, Libreria, Playlist, Preferiti — e un
cerchio a parte per la ricerca, sul modello di Apple Music. Le sezioni che non
ci stanno (Artisti, Brani, Ascolti, Scaricati) sono dentro **Libreria**, che è
una pagina-elenco. Otto etichette in fila entravano nei 393px per un pelo, a
47px l'una: leggibili ma senza nessuna gerarchia.

## Testi

Il pannello dei testi li cerca su [LRCLIB](https://lrclib.net) alla prima
apertura e poi li tiene in database, compresi i tentativi a vuoto (altrimenti
ogni apertura rifarebbe la stessa richiesta di rete per una canzone che non
c'è). Se LRCLIB non ha nulla, si ripiega sul testo nei tag del file, che però
non è mai sincronizzato.

Su telefono il testo è una delle facce della schermata piena del player
(pulsante 📄); su desktop è una scheda della colonna di destra, accanto a
"In riproduzione" — si apre con il pulsante della coda nella barra.

Quando il testo ha i tempi, il verso in corso si evidenzia e toccarne uno salta
a quel punto del brano. La posizione si legge da due fonti: `requestAnimation-
Frame` per la fluidità, e l'evento `timeupdate` come rete di sicurezza, perché
il primo viene sospeso quando la pagina non è in primo piano.

Cosa esce dal tuo server: titolo, artista, album e durata del brano, verso
lrclib.net. Nient'altro.

## Verificare a mano

```bash
curl -s -D - -o /dev/null -H "Range: bytes=0-99" localhost:4000/api/tracks/1/stream
```

## Tappe

- [x] **1. Fondamenta** — indicizzazione, catalogo, streaming con Range, player
- [x] **2. Offline** — service worker, download dei brani, Range ricostruito dalla cache
- [x] **3. Testi** — sincronizzati da LRCLIB, evidenziati riga per riga
- [x] **4. Coda visibile** — pannello "in riproduzione", riordino, "riproduci dopo"
- [x] **5. Playlist** — creazione, riordino, rimozione, copertina personalizzata
- [x] **6. Ricerca** — indice full-text SQLite FTS5 al posto di `LIKE`
- [ ] **7. Transcodifica** — FLAC e formati esotici convertiti al volo per i browser che non li leggono
- [x] **8. Preferiti e ascolti** — cuore sui brani, conteggio delle riproduzioni
- [ ] **9. Utenti** — login, libreria per utente, streaming autenticato
      (prerequisito se il server esce di casa)
