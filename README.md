# mario music

Un servizio di streaming musicale self-hosted per la propria libreria, scritto
per capire come funziona davvero un'app tipo Apple Music: indicizzazione dei
file, catalogo, HTTP Range, buffering, coda di riproduzione.

Non usa marchi, loghi o contenuti Apple: è un'app originale ispirata a quel
modello di prodotto.

## Su un server (Docker)

Per quando la libreria lascia il Mac: un mini PC, un NAS, qualunque cosa
faccia girare Linux.

```bash
git clone <questo repo> && cd mario-music
# nel docker-compose.yml, punta il primo volume alla tua musica
docker compose up -d --build
docker compose exec mario-music node scripts/scan.ts   # la prima indicizzazione
```

Poi `http://<server>:4000`. Lo scan successivo lo fa il server da solo ogni
cinque minuti.

**Due volumi, e fanno due lavori diversi.** `/music` è la tua musica, montata
**in sola lettura**: il server non deve poter scrivere sui tuoi file, nemmeno
per sbaglio, nemmeno con un bug — lo scanner legge e basta. `/data` è
database, copertine, conversioni e backup: è l'unica roba non ricostruibile,
ed è fuori dall'immagine apposta, così ricostruire il container non tocca
playlist e ascolti.

**L'immagine non ha un `node_modules`.** Il server usa `node:http` e
`node:sqlite`, che stanno dentro Node, e Node 25 esegue i `.ts` togliendo i
tipi al volo: React e Vite servono solo a compilare l'interfaccia, in un primo
stadio che poi viene buttato. Nell'immagine finale restano i sorgenti del
server, la cartella `dist/` e ffmpeg — che invece serve davvero, per leggere i
tag, estrarre le copertine e convertire in AAC.

**Non gira da root** e si controlla da solo: l'`HEALTHCHECK` interroga
`/api/stats`, perché un processo vivo che non risponde più è comunque un
servizio rotto.

### Se il server è x86 e tu sei su Mac

Il modo semplice è costruire sul server stesso (`docker compose up -d --build`
da lì). Se invece vuoi costruire qui e spedire l'immagine:

```bash
docker buildx build --platform linux/amd64 -t mario-music .
```

### I percorsi si spostano

Fuori da Docker valgono le stesse variabili: `MUSIC_DIR` dice dove sta la
musica, `DATA_DIR` dove vanno i dati. Sul Mac, senza impostarle, restano
`media/library` e `data/` dentro al progetto.

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

**Spostare o rinominare i file è sicuro.** Ogni traccia ha un'impronta del
contenuto (dimensione + primi e ultimi 512 KB): un file spostato viene
riconosciuto come la stessa traccia, tiene il suo id, e con lui playlist,
preferiti, ascolti e download sul telefono. Prima l'identità era il percorso,
e uno spostamento era una cancellazione più un file nuovo — con tutto ciò che
c'era attaccato perso in silenzio. Non si legge l'intero file: l'inizio da solo
non basterebbe, perché negli MP3 è spesso la copertina incorporata, identica
per tutto l'album; la coda invece è audio, e cambia.

**Lo scan si rifiuta di cancellare troppo in un colpo solo.** Se sparisce più
della metà delle tracce, non è la libreria a essere cambiata: è il disco
esterno a non essere montato, o una cartella a metà copia. Cancellare porterebbe
via a cascata playlist, preferiti e ascolti, che non tornano rimontando il
disco. Lo scan avvisa e non tocca nulla; se la rimozione è voluta,
`SCAN_MAX_REMOVAL=1 npm run scan` la esegue.

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
server/artists.ts pagina artista: top brani, discografia, copertina
server/home.ts    "Per te": recenti, novità, riscopri, mai ascoltati
server/backup.ts  copia di sicurezza e ripristino dei dati personali
server/stats.ts   il riepilogo degli ascolti (Ascolti → Riepilogo)
web/src/coda.ts   "riproduci dopo" e "aggiungi alla coda", come funzioni pure
web/src/gapless.ts quando parte il brano dopo, e con che volume
server/loudness.ts misura quanto suona forte un brano (EBU R128)
web/src/loudness.ts da quella misura al volume di riproduzione
scripts/backup.ts il comando `npm run backup`; scripts/restore.ts il ritorno
server/db.ts      schema: artists → albums → tracks
server/stream.ts  invio dei file con HTTP Range (il cuore dello streaming)
server/transcode.ts conversione in AAC con ffmpeg, cache per impronta
web/src/sorgente.ts quale URL chiedere: scaricato, originale o convertito
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

### Tre trappole già disinnescate

- **L'audio non deve passare dal service worker se non serve.** La prima
  versione inoltrava alla rete anche i brani non scaricati, dall'interno del
  worker (`respondWith(fetch(request))`). Sembrava innocuo, ma quella `fetch`
  passa dalla cache HTTP del browser, che per le richieste Range può tenere
  la copia parziale di un ascolto interrotto: il player riceveva un file che
  finiva a metà e lo prendeva per la fine del brano — sempre allo stesso
  secondo, ascolto dopo ascolto. Ora la pagina chiede i brani scaricati con
  `?offline`, il worker interviene solo su quelli, e per tutti gli altri non
  chiama `respondWith`: l'audio lo carica il browser da solo, con la sua
  gestione nativa di Range e cache, pensata apposta per i media. Il server
  ignora la query, quindi senza worker `?offline` funziona lo stesso.
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

## Qualità audio e transcodifica

Nella pagina "Scaricati" si sceglie tra **Originale** e **Risparmio dati**.
Con la seconda, FLAC e formati esotici arrivano convertiti in AAC 256 kbps:
un FLAC viaggia a ~900 kbps, l'AAC a 256 suona quasi uguale e pesa un terzo.
Sul telefono fuori casa è la differenza tra ascoltare e aspettare. La scelta
vale anche per i download: un album FLAC scaricato in risparmio dati occupa un
terzo. MP3 e AAC restano originali in ogni caso: ricomprimere un file già
compresso fa solo perdere qualità.

La conversione serve anche a chi non sceglie niente. Chrome non legge ALAC,
Safari non legge Ogg, WMA e APE non li legge nessuno: il client lo chiede al
browser (`audio.canPlayType`) e, se la risposta è no, chiede l'AAC da solo.
È il browser a sapere cosa legge, non il server.

### Un file, non un flusso

ffmpeg potrebbe scrivere direttamente nella risposta HTTP e la musica
partirebbe un attimo prima. Ma la lunghezza in byte si conosce solo alla
fine: niente `Content-Length`, niente Range, niente seek. Qui invece ffmpeg
scrive un file in `data/transcoded/`, e quello viene servito da `stream.ts`
come qualunque altro: fette, ETag, cache del browser. Costa qualche secondo
la prima volta (un brano di 4 minuti si converte in ~4 s, uno di 6 in ~8),
poi è istantaneo.

Per non farli sentire, il player chiede in anticipo il brano successivo
(`POST /api/tracks/:id/prepare`) appena parte quello corrente: quando tocca a
lui, il file c'è già. È lo stesso trucco dei servizi veri, che precaricano
sempre "quello dopo".

### Dettagli che contano

- **La cache è per impronta**, non per id o percorso: `<impronta>.m4a`. Un
  file spostato o rinominato non si riconverte; uno cambiato sì. La cartella
  si può cancellare quando si vuole: si ricostruisce da sola.
  `TRANSCODE_DIR=/altrove npm start` la mette altrove.
- **Scrittura provvisoria + rename.** ffmpeg scrive su `.tmp`, e solo alla
  fine il file prende il nome vero. Un `rename` è atomico: un `.m4a` o è
  completo o non esiste, e un server spento a metà conversione non lascia
  un file mozzo da servire come buono.
- **Due richieste, una conversione.** Se il player e il precaricamento
  chiedono lo stesso brano insieme, la seconda aspetta la prima invece di
  lanciare un altro ffmpeg. Al massimo due conversioni in parallelo.

## Riepilogo degli ascolti

In **Ascolti → Riepilogo**, sul modello di Apple Music Replay: minuti
ascoltati, riproduzioni, brani e artisti diversi, le tue classifiche, un
grafico mese per mese e uno delle ore della giornata. Il periodo si sceglie
in cima: sempre, ultimo anno, ultimo mese, ultima settimana.

Esce tutto da una tabella sola, `plays`: una riga per ascolto, con l'istante
in cui è avvenuto. Sembra poco e basta per tutto il resto.

**I minuti sono una stima, e lo diciamo.** Non misuriamo il tempo davvero
trascorso: sommiamo la durata dei brani ascoltati, quindi chi salta un pezzo
a tre quarti lo conta intero. Resta onesta perché un ascolto viene registrato
solo dopo metà brano (o quattro minuti): l'errore massimo è mezza canzone,
non un album sfiorato.

**`localtime` in ogni raggruppamento per data.** Senza, "a che ora ascolti"
sarebbe in UTC: le due di notte italiane finirebbero a mezzanotte e le ore
piccole sembrerebbero serate.

**Le 24 ore ci sono sempre tutte**, anche quelle a zero. Un grafico che salta
le ore vuote racconta una giornata che non esiste — e c'è un test che lo
impedisce.

Il grafico a barre è fatto di `div` con un'altezza in percentuale: niente
librerie, niente SVG. Ogni barra porta il suo valore nel `title` e l'intero
grafico un `aria-label` con tutti i numeri, così resta leggibile anche per
chi non lo vede.

## Backup

```bash
npm run backup                    # a mano, quando vuoi
npm run restore <cartella>        # rimette playlist, preferiti e ascolti
```

Il server ne fa uno da solo **ogni 24 ore** (`BACKUP_INTERVAL_H=0` lo
disattiva), tenendo gli ultimi 7 (`BACKUP_KEEP`). Non aspetta l'intervallo
guardando il proprio orologio interno: confronta la data dell'ultimo backup
con l'ora attuale. Un server che viene riavviato ogni mattina, con un timer
che riparte da zero ogni volta, non farebbe mai un backup.

### Cosa si salva, e perché non tutto

La regola è una: **si salva ciò che non si può ricostruire.**

| | nel backup | perché |
|---|---|---|
| `library.db` | sì | contiene tutto |
| `playlist-covers/` | sì | le hai caricate tu |
| `covers/` | no | si riestraggono dai file audio |
| `transcoded/` | no | si riconverte |
| `media/library/` | **no** | sono i tuoi 6 GB: vanno salvati a parte |

Il database si copia con `VACUUM INTO`, non con `cp`. In modalità WAL le
ultime scritture stanno ancora nel file `-wal`: copiare `library.db` mentre
il server gira darebbe una copia monca, e senza dirlo. `VACUUM INTO` scrive
una copia coerente e compatta a server acceso.

### Due formati, non uno

Accanto al `.db` ci sono tre JSON leggibili: playlist, preferiti, ascolti.
Servono al caso peggiore — database illeggibile, o libreria ricostruita da
zero dove gli id sono tutti diversi. Per questo **i brani non sono indicati
per id** ma per impronta del contenuto e percorso relativo: due riferimenti
che sopravvivono a una ricostruzione, mentre l'id no.

È la stessa impronta che riconosce gli spostamenti durante lo scan, e
`npm run restore` la usa allo stesso modo: ritrova i brani anche se nel
frattempo li hai rinominati o spostati di cartella.

### Un backup non verificato non è un backup

Appena scritta, la copia viene riaperta: `PRAGMA integrity_check` e conteggio
delle tracce confrontato con l'originale. Se non torna, il comando fallisce
invece di annunciare un successo.

E il ripristino è stato provato davvero, non solo pensato: c'è un test che
fa il backup, butta il database, ricostruisce la libreria con id e percorsi
diversi e verifica che playlist (ordine compreso), preferiti e ascolti
tornino al loro posto. Rieseguirlo due volte non duplica niente; una playlist
con un nome già in uso viene affiancata con "(ripristinata)" invece di
sovrascrivere quella su cui stavi lavorando.

### L'avvertenza che conta

Il backup predefinito finisce in `data/backups`, cioè **sullo stesso disco**
dell'originale: protegge da un errore tuo, non da un disco rotto. Per quello
serve un'altra destinazione:

```bash
BACKUP_DIR=/percorso/su/un/altro/disco npm run backup
```

Va bene un disco esterno, un NAS, o una cartella sincronizzata su un servizio
cloud. Lo stesso vale per il server: `BACKUP_DIR=... npm start`.

## "Per te", la schermata iniziale

Nessun consiglio intelligente, nessun modello: quattro domande a cui il
database sa già rispondere, messe in fila.

| scaffale | la domanda |
|---|---|
| Riprendi ad ascoltare | l'ultimo brano che è partito (riparte dal suo album, non da solo) |
| Ascoltati di recente | cosa avevo per le mani ieri |
| Aggiunti di recente | cosa è entrato in libreria ultimamente |
| I tuoi brani del mese | i più suonati delle ultime quattro settimane |
| Riscopri | ascoltato parecchio, poi più niente da due mesi |
| Mai ascoltati | in libreria e mai aperto |

Ogni sezione vuota sparisce. "Riscopri" chiede **due** condizioni insieme —
fermo da mesi *e* almeno tre ascolti — perché "fermo da mesi" da solo
pescherebbe quello che hai messo su una volta e abbandonato: non è una
riscoperta, è un errore. Su una libreria giovane resta vuota (gli ascolti
sono tutti di ieri) e al suo posto lavora "Mai ascoltati", che invece ha
sempre qualcosa da dire.

### Il database non sapeva quando una traccia era entrata

"Aggiunti di recente" ha richiesto una colonna nuova, `tracks.added_at`.
La data del file non basta: un album del 1973 copiato ieri è una novità per
te, e `mtime` direbbe 1973. Le tracce già in libreria sono state riempite con
`mtime` — il passato non si ricostruisce, e quella è la miglior
approssimazione disponibile; da lì in avanti il dato è vero. `added_at` non
compare nella parte `DO UPDATE` dell'upsert: un riscan aggiorna i metadati
ma non ringiovanisce la libreria.

### Una sottoquery invece di un JOIN

Contare le tracce di un album con `JOIN plays` e `COUNT(t.id)` conta le righe
del prodotto tracce × ascolti: un album di 10 brani ascoltato 30 volte
risulterebbe di 300 tracce. Le sottoquery contano quello che devono contare,
e c'è un test che veglia proprio su questo.

## La pagina di un artista

Sul modello di Apple Music: testata grande, un tasto che fa partire tutto in
ordine casuale, i brani più ascoltati e poi la discografia, divisa tra album e
singoli (un album con una traccia sola è un singolo — in questa libreria sono
i tre quarti, mescolarli alla discografia vera la seppellirebbe).

**"Top brani" sono i tuoi.** Senza altri utenti non esiste una classifica
globale: l'unico dato vero è la tabella `plays`. Per questo la sezione compare
solo se l'artista ha almeno un ascolto — riempirla con cinque brani qualunque
significherebbe spacciare un ordine arbitrario per una classifica, e sarebbe
una bugia che l'interfaccia racconta da sola. Artista mai suonato: niente
sezione, si va dritti agli album.

**La testata.** Non abbiamo foto degli artisti e non le scarichiamo da
nessuna parte: fa da ritratto la copertina del loro album più ascoltato,
ingrandita e sfocata. La sfocatura non è un vezzo — una copertina di 600 px
allargata a tutta pagina si vedrebbe sgranata, e lo sfocato nasconde proprio
quello.

**Due chiamate, non una.** `/api/artists/:id` porta cinque brani e la
discografia, quanto basta a disegnare la pagina. I brani per il tasto
Riproduci arrivano da `/api/artists/:id/tracks`, e solo quando lo si preme:
spedirne settanta per mostrarne cinque sarebbe sprecato.

## Volume uniforme

Un album del 1985 e la sua rimasterizzazione del 2015 hanno lo stesso
contenuto e due volumi diversi: in trent'anni di *loudness war* i dischi sono
stati masterizzati sempre più forti. In una playlist che li mescola, la mano
corre alla manopola a ogni traccia.

Nella libreria di prova la forbice è di **23 dB**: dal brano più sommesso
(-27,4 LUFS) a *Easily* dei Red Hot Chili Peppers (-4,2 LUFS). Con
"Scaricati → Riproduzione → Volume uniforme" attivo, quel brano viene
riprodotto al 20% del volume — misurato: 0,204, esattamente il valore
calcolato.

### Si misura il loudness, non il picco

Un colpo di rullante non dice quanto suona forte un brano. Si misura il
**loudness integrato** secondo lo standard EBU R128, in LUFS: una media su
tutto il brano pesata come la sente l'orecchio, più sensibile ai medi che ai
bassi. È lo stesso numero che usano Spotify, YouTube e Apple.

ffmpeg ha due filtri che lo calcolano. `loudnorm` impiega **9 secondi** per
brano, perché calcola anche come normalizzare; `ebur128` dà loudness e true
peak in **1,4 secondi**, ed è lo stesso numero (verificato sullo stesso file:
-22,8 LUFS da entrambi). Su 1600 brani è la differenza fra dieci minuti e
quattro ore.

### Si può solo abbassare

`audio.volume` va da 0 a 1: alzare non si può. Quindi non si porta ogni brano
al riferimento, si portano i brani **più forti** giù fino a lui. Il
riferimento è -18 LUFS, più basso dei -14 di Spotify e dei -16 di Apple,
proprio perché con un riferimento alto bisognerebbe amplificare — cosa che
non possiamo fare. Si perde un po' di volume assoluto (si alza la manopola
una volta) e si guadagna che la libreria suona allo stesso livello. Il 15%
dei brani, quelli già più sommessi del riferimento, resta com'è.

Il vantaggio collaterale: non amplificando mai, **nessun brano può
distorcere**. Per questo il picco si misura ma non serve a correggere nulla —
tornerà utile il giorno che il guadagno venisse applicato lato server, dove
amplificare si può.

### Quando si misura

Mai durante lo scan, che gira ogni cinque minuti e deve restare veloce. Il
server lavora in sottofondo, venticinque brani ogni due minuti, finché la
libreria non è tutta misurata; `npm run loudness` fa tutto subito. Un brano
non ancora misurato suona come ha sempre suonato: `NULL` significa "non
toccare", non "silenzio".

Come la dissolvenza, il livellamento ha bisogno di poter scrivere `volume`:
su iPhone non è possibile e l'interfaccia lo dice.

## Senza pause, e dissolvenza incrociata

Il brano successivo viene messo in carica **prima** che finisca quello in
ascolto, in un secondo elemento `<audio>`. Quando è il momento parte subito:
fra una traccia e l'altra non c'è più il silenzio che serviva per chiedere il
file alla rete e leggerne l'intestazione. Su un disco dal vivo o su un concept
album è la differenza tra ascoltare l'opera e ascoltare dei pezzi.

Misurato: su un brano di **8,951 s**, il passaggio è avvenuto dopo **8,955 s**
di riproduzione. Quattro millesimi di scarto, e nessuna richiesta di rete al
momento del cambio — il file era già lì.

In "Scaricati → Riproduzione" si sceglie anche una dissolvenza incrociata di
3, 6 o 12 secondi.

### Perché due `<audio>` e non Web Audio

`decodeAudioData` con `AudioBufferSourceNode` darebbe una transizione esatta
al singolo campione — il gapless "vero", quello che non lascia passare
nemmeno il silenzio interno di un MP3. Ma su iOS l'`AudioContext` viene
**sospeso quando l'app va in secondo piano**, e con lui si fermerebbe tutta la
riproduzione a schermo bloccato: in auto, sulle casse Bluetooth, in tasca.
Due elementi `<audio>` restano invece media nativi, e il sistema continua a
trattarli come musica.

Si rinuncia alla precisione al campione per non perdere la cosa che si usa
ogni giorno. Il risultato non è gapless al millesimo, è gapless *pratico*:
sparisce il buco vero, quello da mezzo secondo.

### La curva della dissolvenza non è una retta

Il volume che senti va con la **potenza** del segnale, che è il quadrato
dell'ampiezza. Con due rampe dritte, a metà transizione i due brani stanno a
0,5 di ampiezza ciascuno: 0,5² + 0,5² = 0,5, cioè metà della potenza di
partenza — si sente un avvallamento proprio in mezzo. Con coseno e seno,
invece, cos² + sin² = 1 a ogni istante.

Verificato dal vivo: a metà dissolvenza i due elementi stanno entrambi a
**0,71** di volume (√2/2), e il passaggio non ha buchi.

### Su iPhone la dissolvenza non c'è, e lo dice

Su iOS scrivere `volume` non ha effetto: il volume è solo quello dei tasti
fisici. Invece di indovinarlo dal nome del browser — che mente, e cambia a
ogni versione — si prova: si scrive un valore e si rilegge. Dove non risponde,
l'interfaccia spiega che la dissolvenza non è disponibile; il passaggio senza
pause funziona lo stesso, perché del volume non ha bisogno.

### Le interruzioni a metà strada

Mettere in pausa, o saltare al brano dopo, mentre due brani si stanno
sovrapponendo **chiude** la dissolvenza invece di congelarla: il brano in
uscita si ferma e i volumi tornano pieni. Senza, i volumi restavano a metà
strada e il brano successivo suonava per sempre al sessanta per cento, senza
che si capisse perché — è successo davvero, in prova.

## La coda

Nel menù ⋯ di ogni brano, album e playlist ci sono due voci:

- **Riproduci dopo** — subito dopo quello in ascolto. Se il brano era già in
  coda più avanti si sposta, non si duplica.
- **Aggiungi alla coda** — in fondo, quando è finito tutto il resto. Qui il
  doppione è ammesso: un album messo in coda due volte lo si vuole sentire
  due volte.

### Un blocco alla volta, non un brano alla volta

Le due operazioni prendono una **lista**, non un brano. Chiamare "riproduci
dopo" una volta per ogni traccia di un album le infila tutte subito dopo
quella in ascolto, una davanti all'altra: l'ultima inserita finisce per
prima, e l'album parte dalla fine. Era esattamente quello che succedeva
prima, e non si vedeva finché non si guardava la coda.

La logica sta in `web/src/coda.ts` come funzioni pure, fuori da `player.tsx`:
lì si può provare con dei test — un `.tsx` da Node non si importa — e i test
dicono nero su bianco che l'ordine si mantiene.

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

## Navigazione e tasto Indietro

Non c'è un router: la schermata corrente sta in `history.state` del browser,
come `{ view, depth }`. Aprire qualcosa dal contenuto (una copertina, una
riga, una voce del menù ⋯) fa `pushState` e scende di un livello; toccare una
sezione nella barra fa `replaceState` a livello 0, come le schede di iOS.

Il tasto Indietro in alto a sinistra compare solo a `depth > 0` e fa
semplicemente `history.back()`. Usando la cronologia vera del browser vengono
gratis tre cose: il gesto dal bordo sinistro di iOS, il pulsante Indietro di
Android, e il ricaricamento della pagina che resta sulla stessa schermata —
prima riportava sempre agli album.

## Cos'è "mobile"

Uno schermo stretto (≤ 700px) **oppure** un touchscreen basso (≤ 520px di
altezza). La seconda condizione serve per il telefono girato in orizzontale: un
iPhone in landscape è largo 852px e passava il limite, quindi l'app saltava al
layout desktop con la colonna laterale. Un iPad in orizzontale è alto 768 e
resta desktop.

La condizione è scritta due volte, identica: nel CSS (aspetto) e in
`useMediaQuery.ts` (cosa React monta). Se divergono, si monta la schermata
piena del telefono sopra il layout a colonne.

**La rotazione non si può bloccare su iPhone.** Il manifest dichiara
`"orientation": "portrait"`, che Android rispetta per le app installate; iOS lo
ignora, e non supporta nemmeno `screen.orientation.lock()`. Non esiste un modo
supportato per impedire a una web app di ruotare su iOS, installata o no. Il
blocco lo può fare solo l'utente, dal Centro di Controllo. Quello che si può
fare — ed è fatto — è che in orizzontale l'app resti mobile invece di passare
al layout desktop.

## Barra in fondo, su telefono

Una pillola con quattro schede — Album, Libreria, Playlist, Preferiti — e un
cerchio a parte per la ricerca, sul modello di Apple Music. Le sezioni che non
ci stanno (Artisti, Brani, Ascolti, Scaricati) sono dentro **Libreria**, che è
una pagina-elenco. Otto etichette in fila entravano nei 393px per un pelo, a
47px l'una: leggibili ma senza nessuna gerarchia.

## Ripresa dopo la chiusura

Coda, brano e posizione si salvano in `localStorage` mentre si ascolta: al
massimo ogni 5 secondi, più a ogni pausa e quando l'app va in secondo piano
(`visibilitychange`), che su iOS è l'ultimo momento affidabile prima che una
PWA venga chiusa senza preavviso.

Alla riapertura il brano torna nella barra **in pausa**, al secondo salvato.
Non parte da solo: il browser lo vieterebbe senza un tocco, e riaprire l'app
non vuol dire voler subito la musica. La posizione si applica a
`loadedmetadata`, non prima: impostare `currentTime` quando l'audio non
conosce ancora la propria durata non attacca su tutti i browser, iOS in testa.

L'ascolto non viene ricontato alla ripresa: era già stato conteggiato prima
della chiusura.

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
- [x] **7. Transcodifica** — AAC 256 kbps per risparmiare dati e per i formati che il browser non legge
- [x] **8. Preferiti e ascolti** — cuore sui brani, conteggio delle riproduzioni
- [ ] **9. Utenti** — login, libreria per utente, streaming autenticato
      (prerequisito se il server esce di casa; oggi lo usa una persona sola, quindi rimandato)
- [x] **10. Pagina artista e "Per te"** — top brani per ascolti, discografia,
      home con ripresa, recenti, novità, riscopri e mai ascoltati
- [x] **11. Backup** — copia automatica giornaliera, verificata, con ripristino provato
- [x] **12. Riepilogo ascolti** — minuti, classifiche, mese per mese, ore della giornata
- [x] **13. Docker** — immagine senza dipendenze, musica in sola lettura, percorsi montabili
- [x] **14. Senza pause** — due elementi audio, dissolvenza incrociata equal-power
- [x] **15. Volume uniforme** — loudness EBU R128 allo scan, livellamento in riproduzione
- [ ] **16. Karaoke** — testo a tutto schermo, riga corrente grande e centrata,
      colorata in proporzione alla sua durata (LRCLIB dà i tempi per riga, non
      per parola). Voce abbassata (ffmpeg o Demucs) solo se poi manca davvero.
